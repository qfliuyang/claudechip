import { randomUUID } from 'crypto';
import { getTerminalSessionManager } from '../TerminalSessionManager.js';

export async function terminalToolReadTail(
  opts?: { bytes?: number; lines?: number },
): Promise<string> {
  const manager = getTerminalSessionManager();
  await manager.ensureStarted();
  return manager.readTail(opts);
}

export async function terminalToolWrite(input: string): Promise<void> {
  const manager = getTerminalSessionManager();
  await manager.ensureStarted();
  manager.write(input, {
    source: 'tool',
    intent: 'interactive',
    requestId: randomUUID(),
  });
}

export async function terminalToolExec(
  command: string,
  opts?: { timeoutMs?: number; leaseMs?: number },
) {
  const manager = getTerminalSessionManager();
  await manager.ensureStarted();
  return manager.exec(command, opts);
}

export async function terminalToolStatus() {
  const manager = getTerminalSessionManager();
  await manager.ensureStarted();
  return manager.getStatus();
}

export async function terminalToolRestart(reason?: string): Promise<void> {
  const manager = getTerminalSessionManager();
  await manager.restart(reason);
}

export async function terminalToolSignal(kind: 'sigint' | 'sigterm'): Promise<void> {
  const manager = getTerminalSessionManager();
  await manager.ensureStarted();
  manager.signal(kind);
}
