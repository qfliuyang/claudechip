export type TerminalInputSource = 'human' | 'tool';
export type TerminalIntent = 'interactive' | 'exec';
export type TerminalHealth = 'starting' | 'running' | 'degraded' | 'stopped';

export type WorkerCommand =
  | {
      type: 'spawn';
      shell: string;
      cwd: string;
      cols: number;
      rows: number;
      envSubset?: Record<string, string>;
    }
  | {
      type: 'write';
      dataBase64: string;
      source: TerminalInputSource;
      requestId: string;
      intent: TerminalIntent;
    }
  | { type: 'resize'; cols: number; rows: number }
  | { type: 'signal'; kind: 'sigint' | 'sigterm' }
  | { type: 'shutdown' }
  | { type: 'ping'; id: string };

export type WorkerEvent =
  | { type: 'spawned'; pid: number }
  | { type: 'output'; dataBase64: string; ts: number }
  | { type: 'exit'; exitCode: number; signal?: number }
  | { type: 'error'; code: string; message: string }
  | { type: 'pong'; id: string };

export type TerminalEvent =
  | { type: 'terminal.health'; health: TerminalHealth; reason?: string; ts: number }
  | { type: 'terminal.spawned'; pid: number; ts: number }
  | { type: 'terminal.output'; data: string; bytes: number; ts: number }
  | { type: 'terminal.exited'; exitCode: number; signal?: number; ts: number }
  | { type: 'terminal.write'; source: TerminalInputSource; requestId: string; bytes: number; ts: number }
  | { type: 'terminal.error'; code: string; message: string; ts: number };

export function encodeNdjsonMessage<T extends object>(message: T): string {
  return `${JSON.stringify(message)}\n`;
}

export class NdjsonStreamParser<T = unknown> {
  private buffer = '';

  push(chunk: string | Buffer): { messages: T[]; errors: string[] } {
    this.buffer += typeof chunk === 'string' ? chunk : chunk.toString('utf-8');
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() ?? '';

    const messages: T[] = [];
    const errors: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        messages.push(JSON.parse(trimmed) as T);
      } catch {
        errors.push(trimmed);
      }
    }

    return { messages, errors };
  }

  flushRemainder(): string {
    const rest = this.buffer;
    this.buffer = '';
    return rest;
  }
}

