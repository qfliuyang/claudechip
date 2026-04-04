import { z } from 'zod/v4';
import type { Tool } from '../../Tool.js';
import { terminalToolWrite } from '../../terminal/adapters/TerminalToolsAdapter.js';

const InputSchema = z.object({
  text: z.string().describe('Text or command to send to the integrated terminal panel.'),
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
  inputJSONSchema: zodToJsonSchema(InputSchema),
  async call(args) {
    const text = args.text;
    await terminalToolWrite(text);
    return `Sent: ${text}`;
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
    },
    required: ['text'],
    additionalProperties: false,
  };
}
