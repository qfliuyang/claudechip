import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'fs'

describe('ClaudeChip launchers', () => {
  test('do not force SIMPLE mode for normal startup', () => {
    const packageLauncher = readFileSync('bin/claudechip', 'utf8')
    const sourceLauncher = readFileSync('launch-claudechip.sh', 'utf8')

    expect(packageLauncher).not.toContain('CLAUDE_CODE_SIMPLE="${CLAUDE_CODE_SIMPLE:-1}"')
    expect(sourceLauncher).not.toContain('export CLAUDE_CODE_SIMPLE=1')
  })
})
