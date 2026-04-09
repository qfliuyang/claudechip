import { describe, expect, test } from 'bun:test'
import { buildEffectiveSystemPrompt } from '../src/utils/systemPrompt.js'

describe('buildEffectiveSystemPrompt terminal mode addendum', () => {
  test('adds Innovus-aware terminal context to the effective prompt', () => {
    const prompt = buildEffectiveSystemPrompt({
      mainThreadAgentDefinition: undefined,
      toolUseContext: { options: {} } as any,
      customSystemPrompt: undefined,
      defaultSystemPrompt: ['BASE PROMPT'],
      appendSystemPrompt: undefined,
      terminalContext: {
        mode: 'innovus',
        transport: 'ssh',
        app: 'innovus',
        host: 'eda01',
        promptReady: true,
        confidence: 0.98,
        summary: 'ssh:eda01 · innovus · ready',
        recentCommand: 'innovus',
        lastHumanInputAt: null,
        lastToolInputAt: null,
      },
    })

    const joined = prompt.join('\n\n')
    expect(joined).toContain('# Right Pane Terminal Context')
    expect(joined).toContain('Current classified mode: `innovus`')
    expect(joined).toContain('working inside Innovus')
    expect(joined).toContain('generate commands that make sense inside Innovus')
  })

  test('adds terminal control guidance for plain local shell context', () => {
    const prompt = buildEffectiveSystemPrompt({
      mainThreadAgentDefinition: undefined,
      toolUseContext: { options: {} } as any,
      customSystemPrompt: undefined,
      defaultSystemPrompt: ['BASE PROMPT'],
      appendSystemPrompt: undefined,
      terminalContext: {
        mode: 'shell',
        transport: 'local',
        app: 'shell',
        host: null,
        promptReady: true,
        confidence: 0.35,
        summary: 'local · shell · ready',
        recentCommand: null,
        lastHumanInputAt: null,
        lastToolInputAt: null,
      },
    })

    const joined = prompt.join('\n\n')
    expect(joined).toContain('# Right Pane Terminal Context')
    expect(joined).toContain('Current classified mode: `shell`')
    expect(joined).toContain('TerminalReadTool')
    expect(joined).toContain('TerminalWriteTool')
    expect(joined).toContain('TerminalBashTool')
  })
})
