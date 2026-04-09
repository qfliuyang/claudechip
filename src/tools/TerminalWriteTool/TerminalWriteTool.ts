import { z } from 'zod/v4';
import type { Tool } from '../../Tool.js';
import { terminalToolWrite } from '../../terminal/adapters/TerminalToolsAdapter.js';

const InputSchema = z.object({
  text: z.string().describe('Text or command to send to the integrated terminal panel.'),
  pressEnter: z
    .boolean()
    .optional()
    .describe('Whether to press Enter after sending text. Defaults to true for shell-like commands, false for raw keystrokes.'),
});

// Hold a reference to the current PTY stdin and state. Populated by TerminalPanel on mount.
export const terminalWriteRef = {
  write: (_data: string) => { /* no-op until registered */ },
  status: 'idle' as 'idle' | 'running',
  outputBuffer: '',
};

export const TerminalWriteTool: Tool = {
  name: 'TerminalWriteTool',
  description: 'Send text or a command to the integrated terminal panel.',
  inputSchema: InputSchema,
  inputJSONSchema: zodToJsonSchema(InputSchema),
  async call(args) {
    const text = normalizeTerminalWriteInput(args.text, args.pressEnter);
    await terminalToolWrite(text);
    return text.endsWith('\n') || text.endsWith('\r')
      ? `Sent and pressed Enter: ${args.text}`
      : `Sent raw text without pressing Enter: ${args.text}`;
  },
  isEnabled: () => true,
  prompt: async () => 'Send text or a command to the integrated terminal panel.',
  maxResultSizeChars: 10000,
  userFacingName: () => 'TerminalWriteTool',
  isConcurrencySafe: () => true,
  isReadOnly: () => false,
  checkPermissions: async () => ({ behavior: 'allow' }),
  mapToolResultToToolResultBlockParam: (content, toolUseID) => ({
    type: 'tool_result',
    tool_use_id: toolUseID,
    content: typeof content === 'string' ? content : JSON.stringify(content),
  }),
  toAutoClassifierInput: () => '',
  renderToolUseMessage: () => null,
};

function zodToJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  return {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'Text or command to send to the integrated terminal panel.' },
      pressEnter: {
        type: 'boolean',
        description:
          'Whether to press Enter after sending text. Defaults to true for shell-like commands, false for raw keystrokes.',
      },
    },
    required: ['text'],
    additionalProperties: false,
  };
}

export function normalizeTerminalWriteInput(
  text: string,
  pressEnter?: boolean,
): string {
  if (text.endsWith('\n') || text.endsWith('\r')) return text;
  const shouldPressEnter = pressEnter ?? looksLikeShellCommand(text);
  return shouldPressEnter ? `${text}\n` : text;
}

function looksLikeShellCommand(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed || trimmed !== text) return false;
  if (/[|&;<>()`$]/.test(trimmed)) return true;
  if (/\s/.test(trimmed)) {
    return /^(?:ssh|scp|rsync|ls|cd|pwd|cat|grep|rg|find|which|echo|printf|df|du|ps|top|kill|chmod|mkdir|rm|cp|mv|tar|gzip|gunzip|python|python3|perl|bash|zsh|sh|make|cmake|git|sed|awk|head|tail|sort|uniq|wc|source|module)\b/.test(trimmed);
  }
  return /^(?:pwd|ls|date|whoami|hostname|exit|logout|clear|ssh|vim|vi|nvim|innovus|icc2_shell|pt_shell)$/.test(trimmed);
}
