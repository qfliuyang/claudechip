import { EventEmitter } from 'events'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { spawn, spawnSync } from 'child_process'
import { logForDebugging } from '../utils/debug.js'
import type { TerminalContextSnapshot } from '../terminal/TerminalContext.js'

export type RemoteTunnelStatus =
  | {
      status: 'disconnected'
      target: null
      detail?: string
      lastConnectedAt: null
    }
  | {
      status: 'connecting' | 'connected' | 'error'
      target: string
      detail?: string
      lastConnectedAt: number | null
    }

type RemoteTunnelEvent = {
  type: 'remote-tunnel.status'
  state: RemoteTunnelStatus
}

const READY_TIMEOUT_MS = 15000
const READY_POLL_MS = 250

function disconnected(detail?: string): RemoteTunnelStatus {
  return {
    status: 'disconnected',
    target: null,
    detail,
    lastConnectedAt: null,
  }
}

function parseTunnelTarget(context: TerminalContextSnapshot): string | null {
  return context.sshTarget ?? context.host
}

export class RemoteTunnelManager {
  private readonly emitter = new EventEmitter()
  private state: RemoteTunnelStatus = disconnected()
  private currentTarget: string | null = null
  private controlPath: string | null = null
  private askpassDir: string | null = null
  private masterProcess: ReturnType<typeof spawn> | null = null
  private connectingPromise: Promise<void> | null = null

  getState(): RemoteTunnelStatus {
    return this.state
  }

  subscribe(listener: (event: RemoteTunnelEvent) => void): () => void {
    this.emitter.on('event', listener)
    return () => this.emitter.off('event', listener)
  }

  async ensureForContext(context: TerminalContextSnapshot): Promise<void> {
    const target =
      context.transport === 'ssh' && context.mode !== 'local'
        ? parseTunnelTarget(context)
        : null

    if (!target) {
      this.disconnect('terminal left ssh mode')
      return
    }

    if (this.state.status === 'connected' && this.currentTarget === target) {
      return
    }

    if (this.connectingPromise && this.currentTarget === target) {
      return this.connectingPromise
    }

    this.connectingPromise = this.connect(target)
    try {
      await this.connectingPromise
    } finally {
      this.connectingPromise = null
    }
  }

  disconnect(detail?: string): void {
    if (this.currentTarget && this.controlPath) {
      spawnSync(
        'ssh',
        ['-S', this.controlPath, '-O', 'exit', this.currentTarget],
        { stdio: 'ignore' },
      )
    }

    this.masterProcess?.kill()
    this.masterProcess = null
    this.currentTarget = null
    this.controlPath = null

    if (this.askpassDir) {
      rmSync(this.askpassDir, { recursive: true, force: true })
      this.askpassDir = null
    }

    this.setState(disconnected(detail))
  }

  async exec(command: string, timeoutMs = 10000): Promise<{
    ok: boolean
    stdout: string
    stderr: string
    exitCode: number | null
  }> {
    if (this.state.status !== 'connected' || !this.currentTarget || !this.controlPath) {
      return {
        ok: false,
        stdout: '',
        stderr: 'Remote tunnel is not connected',
        exitCode: null,
      }
    }

    return new Promise(resolve => {
      const proc = spawn(
        'ssh',
        ['-S', this.controlPath, this.currentTarget, command],
        { stdio: ['ignore', 'pipe', 'pipe'] },
      )

      let stdout = ''
      let stderr = ''
      const timer = setTimeout(() => {
        proc.kill('SIGTERM')
        resolve({
          ok: false,
          stdout,
          stderr: stderr || 'Remote command timed out',
          exitCode: null,
        })
      }, timeoutMs)

      proc.stdout.on('data', chunk => {
        stdout += chunk.toString('utf8')
      })
      proc.stderr.on('data', chunk => {
        stderr += chunk.toString('utf8')
      })
      proc.on('exit', code => {
        clearTimeout(timer)
        resolve({
          ok: code === 0,
          stdout,
          stderr,
          exitCode: code,
        })
      })
    })
  }

  private async connect(target: string): Promise<void> {
    if (this.currentTarget && this.currentTarget !== target) {
      this.disconnect('switching remote target')
    }

    this.currentTarget = target
    this.setState({
      status: 'connecting',
      target,
      detail: 'Opening secondary SSH tunnel',
      lastConnectedAt: this.state.status === 'connected' ? this.state.lastConnectedAt : null,
    })

    const socketDir = mkdtempSync(join(tmpdir(), 'claudechip-ssh-'))
    this.controlPath = join(socketDir, 'cm.sock')

    const env = { ...process.env }
    const password = process.env.CLAUDECHIP_REMOTE_TUNNEL_PASSWORD?.trim()
    if (password) {
      this.askpassDir = socketDir
      const askpassPath = join(socketDir, 'askpass.sh')
      writeFileSync(askpassPath, `#!/bin/sh\necho '${password.replace(/'/g, `'\"'\"'`)}'\n`, {
        mode: 0o700,
      })
      env.DISPLAY = env.DISPLAY || '1'
      env.SSH_ASKPASS = askpassPath
      env.SSH_ASKPASS_REQUIRE = 'force'
    } else {
      this.askpassDir = null
    }

    const args = [
      '-MN',
      '-o',
      'ControlMaster=yes',
      '-o',
      'ControlPersist=yes',
      '-o',
      `ControlPath=${this.controlPath}`,
      '-o',
      'StrictHostKeyChecking=accept-new',
      '-o',
      'ServerAliveInterval=15',
      '-o',
      'ServerAliveCountMax=3',
      '-o',
      'PreferredAuthentications=publickey,password',
      target,
    ]

    this.masterProcess = spawn('ssh', args, {
      env,
      stdio: ['ignore', 'ignore', 'pipe'],
    })

    let stderr = ''
    this.masterProcess.stderr?.on('data', chunk => {
      stderr += chunk.toString('utf8')
    })
    this.masterProcess.on('exit', code => {
      if (this.state.status === 'connecting') {
        this.setState({
          status: 'error',
          target,
          detail: stderr.trim() || `ssh exited with code ${code ?? 'unknown'}`,
          lastConnectedAt: null,
        })
      } else if (this.state.status === 'connected') {
        this.setState({
          status: 'error',
          target,
          detail: stderr.trim() || 'ssh control master exited unexpectedly',
          lastConnectedAt: this.state.lastConnectedAt,
        })
      }
    })

    await this.waitForReady(target)
    this.setState({
      status: 'connected',
      target,
      detail: 'Secondary SSH tunnel attached',
      lastConnectedAt: Date.now(),
    })
  }

  private async waitForReady(target: string): Promise<void> {
    const startedAt = Date.now()
    while (Date.now() - startedAt < READY_TIMEOUT_MS) {
      if (!this.controlPath) {
        throw new Error('Missing control path')
      }

      const check = spawnSync(
        'ssh',
        ['-S', this.controlPath, '-O', 'check', target],
        { stdio: 'ignore' },
      )

      if (check.status === 0) {
        return
      }

      await new Promise(resolve => setTimeout(resolve, READY_POLL_MS))
    }

    throw new Error('Timed out waiting for secondary SSH tunnel')
  }

  private setState(state: RemoteTunnelStatus): void {
    this.state = state
    logForDebugging(
      `[RemoteTunnel] ${state.status} ${state.target ?? '-'}${state.detail ? ` | ${state.detail}` : ''}`,
      { level: 'debug' },
    )
    this.emitter.emit('event', {
      type: 'remote-tunnel.status',
      state,
    } satisfies RemoteTunnelEvent)
  }
}

let singleton: RemoteTunnelManager | null = null

export function getRemoteTunnelManager(): RemoteTunnelManager {
  if (!singleton) {
    singleton = new RemoteTunnelManager()
  }
  return singleton
}
