import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'fs'

describe('ClaudeChip launchers', () => {
  test('do not force SIMPLE mode for normal startup', () => {
    const packageLauncher = readFileSync('bin/claudechip', 'utf8')
    const sourceLauncher = readFileSync('launch-claudechip.sh', 'utf8')

    expect(packageLauncher).not.toContain('CLAUDE_CODE_SIMPLE="${CLAUDE_CODE_SIMPLE:-1}"')
    expect(sourceLauncher).not.toContain('export CLAUDE_CODE_SIMPLE=1')
  })

  test('disable upstream updater traffic without disabling ClaudeChip memory mode', () => {
    const packageLauncher = readFileSync('bin/claudechip', 'utf8')
    const sourceLauncher = readFileSync('launch-claudechip.sh', 'utf8')

    for (const launcher of [packageLauncher, sourceLauncher]) {
      expect(launcher).toContain('DISABLE_AUTOUPDATER')
      expect(launcher).toContain('CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC')
      expect(launcher).toContain('CLAUDECHIP_SKIP_UPSTREAM_VERSION_CHECK')
    }
  })
})
