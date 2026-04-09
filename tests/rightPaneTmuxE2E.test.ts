import { afterEach, expect, test } from 'bun:test'
import { execFileSync, spawnSync } from 'child_process'

const REPO_ROOT = '/Users/luzi/code/cx-claudechip'
const LAUNCH_SCRIPT = `${REPO_ROOT}/launch-claudechip.sh`

type ActiveTmuxSession = {
  socketPath: string
  session: string
}

const activeSessions = new Set<string>()

type EdaServerConfig = {
  sshHost: string
  sshPassword?: string
  remoteReadyPattern: string
  remoteHostPattern: string
  remoteCwdPattern?: string
  edaLaunchCommand?: string
  edaReadyPattern?: string
}

function getEdaServerConfig(): EdaServerConfig | null {
  const sshHost = process.env.CLAUDECHIP_E2E_SSH_HOST?.trim()
  if (!sshHost) return null

  return {
    sshHost,
    sshPassword: process.env.CLAUDECHIP_E2E_SSH_PASSWORD?.trim(),
    remoteReadyPattern:
      process.env.CLAUDECHIP_E2E_REMOTE_READY_PATTERN?.trim() ??
      '__CLAUDECHIP_REMOTE_READY__',
    remoteHostPattern:
      process.env.CLAUDECHIP_E2E_REMOTE_HOST_PATTERN?.trim() ?? sshHost,
    remoteCwdPattern: process.env.CLAUDECHIP_E2E_REMOTE_CWD_PATTERN?.trim(),
    edaLaunchCommand: process.env.CLAUDECHIP_E2E_EDA_LAUNCH?.trim(),
    edaReadyPattern: process.env.CLAUDECHIP_E2E_EDA_READY_PATTERN?.trim(),
  }
}

function tmux(socketPath: string, args: string[]): string {
  return execFileSync('tmux', ['-S', socketPath, ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  })
}

function killProcessTree(pid: number): void {
  if (!Number.isFinite(pid) || pid <= 1) {
    return
  }

  const childList = spawnSync('pgrep', ['-P', String(pid)], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  })

  if (childList.status === 0) {
    for (const child of childList.stdout.split(/\s+/).filter(Boolean)) {
      killProcessTree(Number(child))
    }
  }

  spawnSync('kill', ['-TERM', String(pid)], {
    cwd: REPO_ROOT,
    stdio: 'ignore',
  })
}

function registerSession(session: ActiveTmuxSession): void {
  activeSessions.add(JSON.stringify(session))
}

function cleanupSession(session: ActiveTmuxSession): void {
  try {
    const panePids = tmux(session.socketPath, [
      'list-panes',
      '-t',
      `${session.session}:0`,
      '-F',
      '#{pane_pid}',
    ])
      .split('\n')
      .map(value => value.trim())
      .filter(Boolean)
      .map(value => Number(value))

    for (const pid of panePids) {
      killProcessTree(pid)
    }
  } catch {}

  try {
    execFileSync('tmux', ['-S', session.socketPath, 'kill-server'], {
      cwd: REPO_ROOT,
      stdio: 'ignore',
    })
  } catch {}
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function waitFor(
  predicate: () => boolean,
  timeoutMs = 15000,
  intervalMs = 150,
): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return
    await sleep(intervalMs)
  }
  throw new Error(`Timed out after ${timeoutMs}ms`)
}

function capture(socketPath: string, session: string): string {
  const output = tmux(socketPath, ['capture-pane', '-pt', `${session}:0.0`])
  const artifact = `/tmp/${session}.txt`
  Bun.write(artifact, output)
  return output
}

function sendLiteral(socketPath: string, session: string, text: string): void {
  tmux(socketPath, ['send-keys', '-t', `${session}:0.0`, '-l', text])
}

function sendKey(socketPath: string, session: string, key: string): void {
  tmux(socketPath, ['send-keys', '-t', `${session}:0.0`, key])
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0

  let count = 0
  let index = 0
  while (true) {
    const found = haystack.indexOf(needle, index)
    if (found === -1) return count
    count += 1
    index = found + needle.length
  }
}

function hasTmux(): boolean {
  const result = spawnSync('tmux', ['-V'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  })
  if (result.status !== 0) {
    return false
  }

  const ptyCheck = spawnSync(
    'python',
    [
      '-c',
      'import os, pty; m,s=pty.openpty(); os.close(m); os.close(s); print("ok")',
    ],
    {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    },
  )

  return ptyCheck.status === 0
}

async function advanceToRuntime(socketPath: string, session: string): Promise<void> {
  await waitFor(() => {
    const pane = capture(socketPath, session)

    if (pane.includes('Choose the text style that looks best with your terminal')) {
      tmux(socketPath, ['send-keys', '-t', `${session}:0.0`, 'Enter'])
      return false
    }

    if (pane.includes('Detected a custom API key in your environment')) {
      tmux(socketPath, ['send-keys', '-t', `${session}:0.0`, 'Up'])
      tmux(socketPath, ['send-keys', '-t', `${session}:0.0`, 'Enter'])
      return false
    }

    if (pane.includes('Press Enter to continue…')) {
      tmux(socketPath, ['send-keys', '-t', `${session}:0.0`, 'Enter'])
      return false
    }

    if (pane.includes('Yes, I trust this folder')) {
      tmux(socketPath, ['send-keys', '-t', `${session}:0.0`, 'Enter'])
      return false
    }

    return (
      pane.includes('● claudechip') &&
      pane.includes('terminal') &&
      pane.includes('cx-claudechip %')
    )
  }, 30000, 250)
}

async function waitForPaneText(
  socketPath: string,
  session: string,
  pattern: string,
  timeoutMs = 20000,
): Promise<string> {
  let lastPane = ''
  await waitFor(() => {
    lastPane = capture(socketPath, session)
    return lastPane.includes(pattern)
  }, timeoutMs, 250)
  return lastPane
}

async function connectToRemoteShell(
  socketPath: string,
  session: string,
  config: EdaServerConfig,
): Promise<void> {
  if (config.sshPassword) {
    sendLiteral(
      socketPath,
      session,
      `ssh -o StrictHostKeyChecking=accept-new -o PreferredAuthentications=password -o PubkeyAuthentication=no ${config.sshHost}`,
    )
  } else {
    sendLiteral(
      socketPath,
      session,
      `ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new ${config.sshHost}`,
    )
  }
  sendKey(socketPath, session, 'Enter')

  if (config.sshPassword) {
    let passwordPromptCount = 0
    let passwordSent = false

    await waitFor(() => {
      const pane = capture(socketPath, session)

      if (pane.includes('yes/no')) {
        sendLiteral(socketPath, session, 'yes')
        sendKey(socketPath, session, 'Enter')
        return false
      }

      const nextCount = countOccurrences(pane, 'password:')
      if (nextCount > passwordPromptCount) {
        passwordPromptCount = nextCount
        if (!passwordSent) {
          sendLiteral(socketPath, session, config.sshPassword!)
          sendKey(socketPath, session, 'Enter')
          passwordSent = true
          return false
        }
        throw new Error('SSH password was rejected in interactive tmux login')
      }

      if (pane.includes('Permission denied')) {
        throw new Error('SSH password was rejected in interactive tmux login')
      }

      return (
        pane.includes(config.remoteHostPattern) ||
        pane.includes('/home/EDA') ||
        pane.includes('[EDA@') ||
        pane.includes('Last login:')
      )
    }, 40000, 300)
  } else {
    await waitFor(() => {
      const pane = capture(socketPath, session)
      return (
        pane.includes(config.remoteHostPattern) ||
        pane.includes('@') ||
        pane.includes('$') ||
        pane.includes('#')
      )
    }, 40000, 300)
  }

  sendLiteral(socketPath, session, 'hostname')
  sendKey(socketPath, session, 'Enter')
  sendLiteral(socketPath, session, 'pwd')
  sendKey(socketPath, session, 'Enter')
  sendLiteral(socketPath, session, `printf '${config.remoteReadyPattern}\\n'`)
  sendKey(socketPath, session, 'Enter')

  await waitFor(() => {
    const pane = capture(socketPath, session)
    return (
      pane.includes(config.remoteReadyPattern) &&
      pane.includes(config.remoteHostPattern) &&
      (!config.remoteCwdPattern || pane.includes(config.remoteCwdPattern))
    )
  }, 40000, 300)
}

async function launchEdaToolIfConfigured(
  socketPath: string,
  session: string,
  config: EdaServerConfig,
): Promise<void> {
  if (!config.edaLaunchCommand || !config.edaReadyPattern) {
    return
  }

  sendLiteral(socketPath, session, config.edaLaunchCommand)
  sendKey(socketPath, session, 'Enter')
  await waitForPaneText(socketPath, session, config.edaReadyPattern, 60000)
}

afterEach(() => {
  for (const encoded of activeSessions) {
    cleanupSession(JSON.parse(encoded) as ActiveTmuxSession)
  }
  activeSessions.clear()
})

test('tmux e2e: human can drive the builtin right pane without duplicated input', async () => {
  if (!hasTmux()) {
    return
  }

  const socketPath = `/tmp/claudechip-e2e-${process.pid}-${Date.now()}.sock`
  const session = `claudechip-e2e-${Date.now()}`
  registerSession({ socketPath, session })

  tmux(socketPath, [
    'new-session',
    '-d',
    '-s',
    session,
    '-x',
    '170',
    '-y',
    '44',
    `cd ${REPO_ROOT} && ${LAUNCH_SCRIPT}`,
  ])

  await advanceToRuntime(socketPath, session)

  tmux(socketPath, ['send-keys', '-t', `${session}:0.0`, 'C-b'])
  await sleep(500)
  tmux(socketPath, ['send-keys', '-t', `${session}:0.0`, '-l', 'echo RIGHT_ONE'])
  tmux(socketPath, ['send-keys', '-t', `${session}:0.0`, 'Enter'])
  await sleep(600)
  tmux(socketPath, ['send-keys', '-t', `${session}:0.0`, '-l', 'pwd'])
  tmux(socketPath, ['send-keys', '-t', `${session}:0.0`, 'Enter'])

  await waitFor(() => {
    const pane = capture(socketPath, session)
    return pane.includes('RIGHT_ONE') && pane.includes('/Users/luzi/code/cx-claudechip')
  }, 12000)

  const pane = capture(socketPath, session)

  expect(pane).toContain('○ claudechip')
  expect(pane).toContain('● terminal')
  expect(pane).toContain('echo RIGHT_ONE')
  expect(pane).toContain('RIGHT_ONE')
  expect(pane).toContain('% pwd')
  expect(pane).toContain('/Users/luzi/code/cx-claudechip')
  expect(pane).not.toContain('eecho RIGHT_ONE')
  expect(pane).not.toContain('ppwd')
})

test('tmux e2e: right pane can drive an SSH-accessible EDA server when configured', async () => {
  if (!hasTmux()) {
    return
  }

  const edaConfig = getEdaServerConfig()
  if (!edaConfig) {
    return
  }

  const socketPath = `/tmp/claudechip-eda-e2e-${process.pid}-${Date.now()}.sock`
  const session = `claudechip-eda-e2e-${Date.now()}`
  registerSession({ socketPath, session })

  tmux(socketPath, [
    'new-session',
    '-d',
    '-s',
    session,
    '-x',
    '170',
    '-y',
    '44',
    `cd ${REPO_ROOT} && ${LAUNCH_SCRIPT}`,
  ])

  await advanceToRuntime(socketPath, session)

  sendKey(socketPath, session, 'C-b')
  await sleep(500)

  await connectToRemoteShell(socketPath, session, edaConfig)
  await launchEdaToolIfConfigured(socketPath, session, edaConfig)

  const pane = capture(socketPath, session)

  expect(pane).toContain('○ claudechip')
  expect(pane).toContain('● terminal')
  expect(pane).toContain(edaConfig.remoteReadyPattern)
  expect(pane).toContain(edaConfig.remoteHostPattern)

  if (edaConfig.remoteCwdPattern) {
    expect(pane).toContain(edaConfig.remoteCwdPattern)
  }

  if (edaConfig.edaReadyPattern) {
    expect(pane).toContain(edaConfig.edaReadyPattern)
  }
})
