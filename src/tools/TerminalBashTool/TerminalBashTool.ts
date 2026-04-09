import { z } from 'zod/v4';
import type { Tool } from '../../Tool.js';
import { terminalToolExec } from '../../terminal/adapters/TerminalToolsAdapter.js';
export {
  buildWrappedCommand,
  parseFramedResult,
} from '../../terminal/TerminalExecFraming.js';

const InputSchema = z.object({
  command: z.string().describe('Command to execute in the integrated terminal panel.'),
  timeout: z.number().optional().describe('Maximum time to wait for output in milliseconds (default 5000).'),
});

export const TerminalBashTool: Tool = {
  name: 'TerminalBashTool',
  description: 'Execute a command in the integrated terminal panel and return the captured output.',
  inputSchema: InputSchema,
  inputJSONSchema: zodToJsonSchema(InputSchema),
  async call(args) {
    return terminalToolExec(args.command, { timeoutMs: args.timeout ?? 5000 });
  },
  isEnabled: () => true,
  prompt: async () => 'Execute a command in the integrated terminal panel and return the captured output.',
  maxResultSizeChars: 100000,
  userFacingName: () => 'TerminalBashTool',
  isConcurrencySafe: () => false,
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
      command: { type: 'string', description: 'Command to execute in the integrated terminal panel.' },
      timeout: { type: 'number', description: 'Maximum time to wait for output in milliseconds (default 5000).' },
    },
    required: ['command'],
    additionalProperties: false,
  };
}
