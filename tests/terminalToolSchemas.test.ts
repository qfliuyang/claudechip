import { describe, expect, test } from 'bun:test'
import { TerminalBashTool } from '../src/tools/TerminalBashTool/TerminalBashTool.js'
import {
  normalizeTerminalWriteInput,
  TerminalWriteTool,
} from '../src/tools/TerminalWriteTool/TerminalWriteTool.js'
import { TerminalReadTool } from '../src/tools/TerminalReadTool/TerminalReadTool.js'

describe('integrated terminal tool schemas', () => {
  test('terminal tools expose runtime zod input schemas', () => {
    expect(TerminalReadTool.inputSchema.safeParse({ limit: 10 }).success).toBe(true)
    expect(TerminalWriteTool.inputSchema.safeParse({ text: 'pwd\n' }).success).toBe(true)
    expect(TerminalWriteTool.inputSchema.safeParse({ text: 'pwd', pressEnter: true }).success).toBe(true)
    expect(TerminalBashTool.inputSchema.safeParse({ command: 'pwd' }).success).toBe(true)
  })

  test('terminal write command normalization does not leave shell commands unsubmitted', () => {
    expect(normalizeTerminalWriteInput('ssh EDA@192.168.112.163')).toBe('ssh EDA@192.168.112.163\n')
    expect(normalizeTerminalWriteInput('eda2020')).toBe('eda2020')
    expect(normalizeTerminalWriteInput('eda2020', true)).toBe('eda2020\n')
  })
})
