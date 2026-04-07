import { afterEach, expect, test } from 'bun:test'
import { execFileSync, spawnSync } from 'child_process'

const REPO_ROOT = '/Users/luzi/code/cx-claudechip'
const LAUNCH_SCRIPT = `${REPO_ROOT}/launch-claudechip.sh`

const activeSockets = new Set<string>()

function tmux(socketPath: string, args: string[]): string {
  return execFileSync('tmux', ['-S', socketPath, ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  })
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

function hasTmux(): boolean {
  const result = spawnSync('tmux', ['-V'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  })
  return result.status === 0
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

afterEach(() => {
  for (const socketPath of activeSockets) {
    try {
      execFileSync('tmux', ['-S', socketPath, 'kill-server'], {
        cwd: REPO_ROOT,
        stdio: 'ignore',
      })
    } catch {}
  }
  activeSockets.clear()
})

test('tmux e2e: human can drive the builtin right pane without duplicated input', async () => {
  if (!hasTmux()) {
    return
  }

  const socketPath = `/tmp/claudechip-e2e-${process.pid}-${Date.now()}.sock`
  const session = `claudechip-e2e-${Date.now()}`
  activeSockets.add(socketPath)

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
