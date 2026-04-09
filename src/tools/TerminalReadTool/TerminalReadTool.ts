import { z } from 'zod/v4';
import type { Tool } from '../../Tool.js';
import { terminalToolReadTail } from '../../terminal/adapters/TerminalToolsAdapter.js';

const InputSchema = z.object({
  limit: z.number().optional().describe('Number of recent lines to return (default 50)'),
});

export const TerminalReadTool: Tool = {
  name: 'TerminalReadTool',
  description: 'Read recent output from the integrated terminal panel.',
  inputSchema: InputSchema,
  inputJSONSchema: zodToJsonSchema(InputSchema),
  async call(args) {
    const limit = args.limit ?? 50;
    return (await terminalToolReadTail({ lines: limit })) || '(no terminal output yet)';
  },
  isEnabled: () => true,
  prompt: async () => 'Read recent output from the integrated terminal panel.',
  maxResultSizeChars: 10000,
  userFacingName: () => 'TerminalReadTool',
  isConcurrencySafe: () => true,
  isReadOnly: () => true,
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
  // Minimal zod-to-json-schema for the simple shape above
  return {
    type: 'object',
    properties: {
      limit: { type: 'number', description: 'Number of recent lines to return (default 50)' },
    },
    additionalProperties: false,
  };
}
