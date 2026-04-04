import { z } from 'zod/v4';
import type { Tool } from '../../Tool.js';
import { terminalWriteRef } from '../TerminalWriteTool/TerminalWriteTool.js';

const InputSchema = z.object({
  command: z.string().describe('Command to execute in the integrated terminal panel.'),
  timeout: z.number().optional().describe('Maximum time to wait for output in milliseconds (default 5000).'),
});

const POLL_INTERVAL_MS = 200;
const SETTLE_THRESHOLD_MS = 800;

export const TerminalBashTool: Tool = {
  name: 'TerminalBashTool',
  description: 'Execute a command in the integrated terminal panel and return the captured output.',
  inputJSONSchema: zodToJsonSchema(InputSchema),
  async call(args) {
    const command = args.command;
    const timeout = args.timeout ?? 5000;

    if (terminalWriteRef.status !== 'running') {
      return 'Terminal is not running.';
    }

    const startBuffer = terminalWriteRef.outputBuffer;
    const startTime = Date.now();

    terminalWriteRef.write(command + '\n');

    let lastBuffer = startBuffer;
    let lastChangeTime = startTime;
    let elapsed = 0;

    while (elapsed < timeout) {
      await sleep(POLL_INTERVAL_MS);
      elapsed += POLL_INTERVAL_MS;

      const currentBuffer = terminalWriteRef.outputBuffer;
      if (currentBuffer !== lastBuffer) {
        lastBuffer = currentBuffer;
        lastChangeTime = Date.now();
      } else if (Date.now() - lastChangeTime >= SETTLE_THRESHOLD_MS) {
        break;
      }
    }

    const finalBuffer = terminalWriteRef.outputBuffer;
    // Return only the new output since the command was sent
    if (finalBuffer.length >= startBuffer.length && finalBuffer.startsWith(startBuffer)) {
      const delta = finalBuffer.slice(startBuffer.length);
      return delta.trim() || '(no output)';
    }

    // Fallback if buffer was trimmed/rotated
    const lines = finalBuffer.split('\n').filter(l => l.length > 0);
    return lines.slice(-50).join('\n') || '(no output)';
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

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

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
