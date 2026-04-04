import { spawn } from 'child_process'
import { EventEmitter } from 'events'

export interface IPty {
  pid: number
  write(data: string): void
  resize(cols: number, rows: number): void
  kill(signal?: string): void
  onData(callback: (data: string) => void): void
  onExit(callback: (event: { exitCode: number; signal?: number }) => void): void
  on(event: string, callback: (...args: any[]) => void): void
}

export function createTerminalPty(
  shell: string,
  cwd: string,
  cols: number,
  rows: number,
): IPty {
  // Spawn a real Node.js subprocess to manage the PTY. When the app runs under
  // Bun, process.execPath points at Bun, which cannot host node-pty reliably.
  const nodePath = process.env.CLAUDECHIP_NODE_PATH || 'node'
  const scriptPath = new URL('./terminalPtyNode.ts', import.meta.url).pathname

  const child = spawn(nodePath, ['--import', 'tsx/esm', scriptPath], {
    cwd: process.cwd(),
    env: process.env,
    stdio: ['pipe', 'pipe', 'pipe'],
  })

  const emitter = new EventEmitter()
  let pid = 0
  let exited = false
  let stdoutBuffer = ''

  // Handle data from subprocess
  child.stdout.on('data', (data: Buffer) => {
    stdoutBuffer += data.toString('utf-8')
    const lines = stdoutBuffer.split('\n')
    stdoutBuffer = lines.pop() ?? ''

    for (const line of lines) {
      if (!line.trim()) continue
      try {
        const msg = JSON.parse(line)
        if (msg.type === 'data') {
          // Decode base64 data
          const decoded = Buffer.from(msg.data, 'base64').toString('utf-8')
          emitter.emit('data', decoded)
        } else if (msg.type === 'exit') {
          exited = true
          emitter.emit('exit', { exitCode: msg.exitCode, signal: msg.signal })
        } else if (msg.type === 'spawned') {
          pid = msg.pid
          emitter.emit('spawned', pid)
        } else if (msg.type === 'error') {
          console.error('[PTY Subprocess Error]', msg.error)
        }
      } catch {
        console.error('[PTY Subprocess Parse Error]', line)
      }
    }
  })

  child.stderr.on('data', (data: Buffer) => {
    const text = data.toString('utf-8').trim()
    if (text) {
      console.error('[PTY Subprocess STDERR]', text)
    }
  })

  child.on('exit', (code) => {
    if (!exited) {
      exited = true
      emitter.emit('exit', { exitCode: code ?? 0, signal: 0 })
    }
  })

  // Send spawn command
  setTimeout(() => {
    if (child.stdin.writable) {
      child.stdin.write(JSON.stringify({ type: 'spawn', shell, cwd, cols, rows }) + '\n')
    }
  }, 100)

  return {
    get pid() { return pid },
    write: (data: string) => {
      if (!exited && child.stdin.writable) {
        // Encode data as base64 to safely transmit control characters
        const encoded = Buffer.from(data).toString('base64')
        child.stdin.write(JSON.stringify({ type: 'write', data: encoded }) + '\n')
      }
    },
    resize: (cols: number, rows: number) => {
      if (!exited && child.stdin.writable) {
        child.stdin.write(JSON.stringify({ type: 'resize', cols, rows }) + '\n')
      }
    },
    kill: (signal?: string) => {
      if (!exited && child.stdin.writable) {
        child.stdin.write(JSON.stringify({ type: 'kill' }) + '\n')
      }
      try { child.kill(signal as any) } catch {}
    },
    onData: (callback: (data: string) => void) => emitter.on('data', callback),
    onExit: (callback: (event: { exitCode: number; signal?: number }) => void) => emitter.on('exit', callback),
    on: (event: string, callback: (...args: any[]) => void) => emitter.on(event, callback),
  }
}
