import { randomUUID } from 'crypto';
import {
  getTerminalSessionManager,
  type TerminalSessionManager,
} from '../TerminalSessionManager.js';

export function getTerminalPanelManager(): TerminalSessionManager {
  return getTerminalSessionManager();
}

export async function terminalPanelWrite(input: string): Promise<void> {
  const manager = getTerminalSessionManager();
  await manager.ensureStarted();
  manager.write(input, {
    source: 'human',
    intent: 'interactive',
    requestId: randomUUID(),
  });
}

