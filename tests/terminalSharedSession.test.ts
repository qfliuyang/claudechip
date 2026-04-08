import { afterEach, expect, test } from 'bun:test'
import {
  terminalToolExec,
  terminalToolReadTail,
  terminalToolWrite,
} from '../src/terminal/adapters/TerminalToolsAdapter.js'
import { terminalPanelWrite } from '../src/terminal/adapters/TerminalPanelAdapter.js'
import { getTerminalSessionManager } from '../src/terminal/TerminalSessionManager.js'
import { call as termCommandCall } from '../src/commands/term/term.js'

async function waitFor(
  predicate: () => Promise<boolean> | boolean,
  timeoutMs = 8000,
  intervalMs = 80,
): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (await predicate()) return
    await new Promise(resolve => setTimeout(resolve, intervalMs))
  }
  throw new Error(`Timed out after ${timeoutMs}ms`)
}

afterEach(async () => {
  await getTerminalSessionManager().shutdown()
})

test('tool and human share the same long-lived terminal session', async () => {
  const toolMarker = `tool-shared-${Date.now()}`
  const humanMarker = `human-shared-${Date.now()}`

  let execResult = await terminalToolExec(`printf '${toolMarker}\\n'`, {
    timeoutMs: 12000,
  })
  if (execResult.timedOut) {
    execResult = await terminalToolExec(`printf '${toolMarker}\\n'`, {
      timeoutMs: 12000,
    })
  }
  expect(execResult.timedOut).toBe(false)

  await terminalPanelWrite(`printf '${humanMarker}\\n'\r`)

  await waitFor(async () => {
    const tail = await terminalToolReadTail({ lines: 200 })
    return tail.includes(toolMarker) && tail.includes(humanMarker)
  })
})

test('human backspace and enter behave like normal interactive shell editing', async () => {
  const marker = `human-edit-${Date.now()}`

  await terminalPanelWrite(`echo ${marker}-ab`)
  await terminalPanelWrite('\x7f')
  await terminalPanelWrite(`c\r`)

  await waitFor(async () => {
    const tail = await terminalToolReadTail({ lines: 200 })
    return tail.includes(`${marker}-ac`)
  })
})

test('manager emits distinct write events for human and Claude control paths', async () => {
  const manager = getTerminalSessionManager()
  await manager.ensureStarted()

  const writes: Array<'human' | 'tool'> = []
  const unsubscribe = manager.subscribe(event => {
    if (event.type === 'terminal.write') {
      writes.push(event.source)
    }
  })

  try {
    await terminalPanelWrite(`printf 'human-write-check\\n'\r`)
    await terminalToolWrite(`printf 'tool-write-check\\n'\r`)

    await waitFor(() => writes.includes('human') && writes.includes('tool'))
  } finally {
    unsubscribe()
  }
})

test('terminal exec reports interleaving when human writes during run', async () => {
  const humanMarker = `human-interleave-${Date.now()}`

  const execPromise = terminalToolExec("sleep 0.4; printf 'tool-done\\n'", {
    timeoutMs: 10000,
  })

  setTimeout(() => {
    void terminalPanelWrite(`printf '${humanMarker}\\n'\r`)
  }, 120)

  const result = await execPromise
  expect(result.timedOut).toBe(false)
  expect(result.interleaved).toBe(true)
})

test('terminal session pid remains stable across resize and repeated ensureStarted', async () => {
  const manager = getTerminalSessionManager()
  await manager.ensureStarted()
  const pid0 = manager.getPid()
  expect(typeof pid0).toBe('number')

  manager.resize(140, 42)
  await waitFor(() => manager.getPid() === pid0)

  await manager.ensureStarted()
  const pid1 = manager.getPid()
  expect(pid1).toBe(pid0)
})

test('/term command family controls the integrated terminal session', async () => {
  const outputs: string[] = []
  const ctx = {
    setAppState(updater: (prev: { terminalPanelVisible: boolean }) => { terminalPanelVisible: boolean }) {
      const next = updater({ terminalPanelVisible: false })
      expect(next.terminalPanelVisible).toBe(true)
      return next
    },
  } as any

  await termCommandCall(message => {
    outputs.push(message ?? '')
  }, ctx, 'focus')

  await termCommandCall(message => {
    outputs.push(message ?? '')
  }, ctx, "run printf 'term-command-ok\\n'")

  const runResult = outputs.at(-1) ?? ''
  expect(runResult).toContain('term-command-ok')

  outputs.length = 0
  await termCommandCall(message => {
    outputs.push(message ?? '')
  }, ctx, 'send echo context-aware')

  const sendResult = outputs.at(-1) ?? ''
  expect(sendResult).toContain('Sent to terminal (')
})

test('/term natural-language terminal tasks hand off to the model instead of typing immediately', async () => {
  const outputs: string[] = []
  const optionsSeen: Array<{
    shouldQuery?: boolean
    metaMessages?: string[]
  }> = []
  const manager = getTerminalSessionManager()
  await manager.ensureStarted()

  const writes: string[] = []
  const unsubscribe = manager.subscribe(event => {
    if (event.type === 'terminal.write') {
      writes.push(event.requestId)
    }
  })

  try {
    await termCommandCall(
      (message, options) => {
        outputs.push(message ?? '')
        optionsSeen.push({
          shouldQuery: options?.shouldQuery,
          metaMessages: options?.metaMessages,
        })
      },
      {
        setAppState(updater: (prev: { terminalPanelVisible: boolean }) => {
          terminalPanelVisible: boolean
        }) {
          return updater({ terminalPanelVisible: false })
        },
      } as any,
      'kill all process with name "dc_shell"',
    )
  } finally {
    unsubscribe()
  }

  expect(outputs.at(-1)).toContain('Interpreting /term input as a terminal task')
  expect(optionsSeen.at(-1)?.shouldQuery).toBe(true)
  expect(optionsSeen.at(-1)?.metaMessages?.[0]).toContain('<terminal-task-request>')
  expect(writes.length).toBe(0)
})
