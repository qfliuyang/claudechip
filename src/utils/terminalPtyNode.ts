import * as nodePty from 'node-pty'
import * as fs from 'fs'
import * as path from 'path'

export function createTerminalPty(
  shell: string,
  cwd: string,
  cols: number,
  rows: number,
): nodePty.IPty {
  // Verify shell exists, fallback to /bin/sh if not
  let effectiveShell = shell
  if (!fs.existsSync(effectiveShell)) {
    effectiveShell = '/bin/zsh'
  }
  if (!fs.existsSync(effectiveShell)) {
    effectiveShell = '/bin/bash'
  }
  if (!fs.existsSync(effectiveShell)) {
    effectiveShell = '/bin/sh'
  }

  // Start shell as interactive
  const args: string[] = []

  // Ensure cwd exists and is accessible
  let effectiveCwd = cwd
  if (!fs.existsSync(effectiveCwd)) {
    effectiveCwd = process.cwd()
  }
  effectiveCwd = path.resolve(effectiveCwd)

  return nodePty.spawn(effectiveShell, args, {
    cwd: effectiveCwd,
    env: process.env as { [key: string]: string },
    cols,
    rows,
    name: 'xterm-256color',
  })
}

// If this file is run directly as a subprocess, start IPC mode
if (import.meta.url === `file://${process.argv[1]}`) {
  let pty: nodePty.IPty | null = null

  process.stdin.on('data', (data: Buffer) => {
    const message = data.toString()

    // Handle multiple messages that might be buffered together
    const lines = message.split('\n').filter(l => l.trim())

    for (const line of lines) {
      try {
        const cmd = JSON.parse(line)

        switch (cmd.type) {
          case 'spawn': {
            if (pty) {
              pty.kill()
            }
            pty = createTerminalPty(cmd.shell, cmd.cwd, cmd.cols, cmd.rows)

            pty.onData((data) => {
              // Use base64 to safely encode any data including control chars
              const encoded = Buffer.from(data).toString('base64')
              process.stdout.write(JSON.stringify({ type: 'data', data: encoded }) + '\n')
            })

            pty.onExit(({ exitCode, signal }) => {
              process.stdout.write(JSON.stringify({ type: 'exit', exitCode, signal }) + '\n')
              pty = null
            })

            process.stdout.write(JSON.stringify({ type: 'spawned', pid: pty.pid }) + '\n')
            break
          }

          case 'write': {
            if (pty) {
              // Decode base64 data
              const decoded = Buffer.from(cmd.data, 'base64').toString('utf-8')
              pty.write(decoded)
            }
            break
          }

          case 'resize': {
            if (pty) {
              pty.resize(cmd.cols, cmd.rows)
            }
            break
          }

          case 'kill': {
            if (pty) {
              pty.kill()
              pty = null
            }
            process.exit(0)
            break
          }
        }
      } catch (err) {
        process.stdout.write(JSON.stringify({ type: 'error', error: String(err) }) + '\n')
      }
    }
  })

  process.stdin.on('end', () => {
    if (pty) {
      pty.kill()
    }
    process.exit(0)
  })
}
