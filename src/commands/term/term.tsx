import type { LocalJSXCommandCall } from '../../types/command.js';
import { terminalWriteRef } from '../../tools/TerminalWriteTool/TerminalWriteTool.js';
import { useAppStateStore } from '../../state/AppState.js';

const MAX_RETRIES = 10;
const RETRY_DELAY_MS = 100;

export const call: LocalJSXCommandCall = async (onDone, _ctx, args) => {
  const store = useAppStateStore.getState();

  // Wait for terminal to be ready with retry
  let retries = 0;
  while (retries < MAX_RETRIES) {
    if (terminalWriteRef.status === 'running') {
      break;
    }
    await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
    retries++;
  }

  if (terminalWriteRef.status !== 'running') {
    onDone('Terminal is not running. Please wait for terminal to initialize.', { display: 'system' });
    return null;
  }

  terminalWriteRef.write(args + '\n');
  onDone(`Sent to terminal: ${args}`, { display: 'system' });
  return null;
};
