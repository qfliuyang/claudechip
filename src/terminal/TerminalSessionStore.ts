import type { TerminalEvent } from './TerminalProtocol.js';

export interface TerminalStoreStats {
  bufferBytes: number;
  droppedBytes: number;
  totalEvents: number;
  nextEventId: number;
}

export interface StoredTerminalEvent {
  id: number;
  event: TerminalEvent;
}

export class TerminalSessionStore {
  private readonly maxBufferBytes: number;
  private readonly maxEvents: number;
  private buffer = '';
  private droppedBytes = 0;
  private nextEventId = 1;
  private events: StoredTerminalEvent[] = [];

  constructor(opts?: { maxBufferBytes?: number; maxEvents?: number }) {
    this.maxBufferBytes = opts?.maxBufferBytes ?? 1024 * 1024;
    this.maxEvents = opts?.maxEvents ?? 2000;
  }

  appendOutput(text: string): void {
    this.buffer += text;
    if (this.buffer.length > this.maxBufferBytes) {
      const cut = this.buffer.length - this.maxBufferBytes;
      this.droppedBytes += cut;
      this.buffer = this.buffer.slice(cut);
    }
  }

  readTailByBytes(bytes = 64 * 1024): string {
    if (bytes <= 0) return '';
    return this.buffer.slice(Math.max(0, this.buffer.length - bytes));
  }

  readTailByLines(lines = 200): string {
    if (lines <= 0) return '';
    const chunks = this.buffer.split('\n');
    return chunks.slice(-lines).join('\n');
  }

  recordEvent(event: TerminalEvent): number {
    const id = this.nextEventId++;
    this.events.push({ id, event });
    if (this.events.length > this.maxEvents) {
      this.events.splice(0, this.events.length - this.maxEvents);
    }
    return id;
  }

  eventsSince(eventId: number): StoredTerminalEvent[] {
    return this.events.filter(item => item.id > eventId);
  }

  stats(): TerminalStoreStats {
    return {
      bufferBytes: this.buffer.length,
      droppedBytes: this.droppedBytes,
      totalEvents: this.events.length,
      nextEventId: this.nextEventId,
    };
  }
}

