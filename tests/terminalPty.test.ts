import { afterEach, expect, test } from 'bun:test'
import { createTerminalPty } from '../src/utils/terminalPty.ts'

type TerminalExit = { exitCode: number; signal?: number }

const activePtys = new Set<ReturnType<typeof createTerminalPty>>()

afterEach(() => {
  for (const pty of activePtys) {
    try {
      pty.kill()
    } catch {}
  }
  activePtys.clear()
})

test('terminal PTY bridge spawns and returns command output', async () => {
  const shell = process.env.SHELL || '/bin/zsh'
  const marker = `pty-bridge-${Date.now()}`
  const pty = createTerminalPty(shell, process.cwd(), 80, 24)
  activePtys.add(pty)

  const output = await new Promise<string>((resolve, reject) => {
    let buffer = ''
    let spawned = false
    let exited = false

    const timeout = setTimeout(() => {
      reject(new Error(`Timed out waiting for PTY output. Last output:\n${buffer.slice(-500)}`))
    }, 8000)

    const finish = (fn: () => void) => {
      clearTimeout(timeout)
      fn()
    }

    pty.on('spawned', () => {
      spawned = true
      setTimeout(() => {
        pty.write(`printf '${marker}\\n'\r`)
      }, 250)
    })

    pty.onData(data => {
      buffer += data
      if (buffer.includes(marker)) {
        finish(() => resolve(buffer))
      }
    })

    pty.onExit((event: TerminalExit) => {
      exited = true
      finish(() =>
        reject(
          new Error(
            `PTY exited before returning marker: ${JSON.stringify(event)}\n${buffer.slice(-500)}`,
          ),
        ),
      )
    })

    setTimeout(() => {
      if (!spawned && !exited) {
        finish(() => reject(new Error('PTY never emitted spawned event')))
      }
    }, 2000)
  })

  expect(output).toContain(marker)

  activePtys.delete(pty)
  pty.kill()
})
