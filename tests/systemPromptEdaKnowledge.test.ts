import { describe, expect, test } from 'bun:test'
import { buildEffectiveSystemPrompt } from '../src/utils/systemPrompt.js'

describe('buildEffectiveSystemPrompt EDA knowledge addendum', () => {
  test('appends retrieved EDA knowledge block to the effective prompt', () => {
    const prompt = buildEffectiveSystemPrompt({
      mainThreadAgentDefinition: undefined,
      toolUseContext: { options: {} } as any,
      customSystemPrompt: undefined,
      defaultSystemPrompt: ['BASE PROMPT'],
      appendSystemPrompt: undefined,
      terminalContext: {
        mode: 'pt_shell',
        transport: 'ssh',
        app: 'pt_shell',
        host: 'eda01',
        promptReady: true,
        confidence: 0.98,
        summary: 'ssh:eda01 · pt_shell · ready',
        recentCommand: 'pt_shell',
        lastHumanInputAt: null,
        lastToolInputAt: null,
      },
      edaKnowledgeContext: {
        route: {
          shouldRetrieve: true,
          namespace: {
            vendor: 'synopsys',
            tool: 'pt',
            version: '2023.06',
            mode: 'pt_shell',
            transport: 'ssh',
            source: 'terminal_mode',
          },
          intent: {
            primary: 'command_lookup',
            confidence: 0.95,
            reason: 'test',
            strategy: 'rule-only',
          },
          tier: 'hot',
          reason: 'test',
        },
        evidence: null,
        promptBlock: '# EDA Knowledge Context\n- Tool: `pt`\n- Intent: `command_lookup`',
      },
    })

    const joined = prompt.join('\n\n')
    expect(joined).toContain('# EDA Knowledge Context')
    expect(joined).toContain('Tool: `pt`')
  })
})
