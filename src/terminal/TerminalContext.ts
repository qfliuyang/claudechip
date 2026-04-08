import type { TerminalInputSource } from './TerminalProtocol.js';

export type TerminalMode =
  | 'shell'
  | 'ssh'
  | 'tmux'
  | 'vim'
  | 'innovus'
  | 'icc2_shell'
  | 'pt_shell'
  | 'eda'
  | 'unknown';

export interface TerminalContextSnapshot {
  mode: TerminalMode;
  transport: 'local' | 'ssh';
  app: string | null;
  host: string | null;
  promptReady: boolean;
  confidence: number;
  summary: string;
  recentCommand: string | null;
  lastHumanInputAt: number | null;
  lastToolInputAt: number | null;
}

function buildSummary(snapshot: Omit<TerminalContextSnapshot, 'summary'>): string {
  const location =
    snapshot.transport === 'ssh'
      ? `ssh${snapshot.host ? `:${snapshot.host}` : ''}`
      : 'local';
  const app = snapshot.app ?? snapshot.mode;
  const ready = snapshot.promptReady ? 'ready' : 'busy';
  return `${location} · ${app} · ${ready}`;
}

function makeSnapshot(
  next: Omit<TerminalContextSnapshot, 'summary'>,
): TerminalContextSnapshot {
  return {
    ...next,
    summary: buildSummary(next),
  };
}

function normalizeCommand(command: string): string {
  return command.replace(/\s+/g, ' ').trim();
}

function parseSshHost(command: string): string | null {
  const tokens = command.split(/\s+/).filter(Boolean);
  if (tokens[0] !== 'ssh') return null;
  const target = tokens.find(token => !token.startsWith('-') && token !== 'ssh');
  return target ?? null;
}

function parsePromptHost(lastLine: string): string | null {
  const match = lastLine.match(/(?:^|\s)(?:[\w.-]+@)?([\w.-]+)(?::[^\s]*)?[$#%]\s*$/);
  return match?.[1] ?? null;
}

export class TerminalContextTracker {
  private snapshot = makeSnapshot({
    mode: 'shell',
    transport: 'local',
    app: 'shell',
    host: null,
    promptReady: true,
    confidence: 0.35,
    recentCommand: null,
    lastHumanInputAt: null,
    lastToolInputAt: null,
  });

  private readonly inputBuffers: Record<TerminalInputSource, string> = {
    human: '',
    tool: '',
  };

  reset(): TerminalContextSnapshot {
    this.inputBuffers.human = '';
    this.inputBuffers.tool = '';
    this.snapshot = makeSnapshot({
      mode: 'shell',
      transport: 'local',
      app: 'shell',
      host: null,
      promptReady: true,
      confidence: 0.35,
      recentCommand: null,
      lastHumanInputAt: null,
      lastToolInputAt: null,
    });
    return this.snapshot;
  }

  getSnapshot(): TerminalContextSnapshot {
    return this.snapshot;
  }

  recordWrite(input: string, source: TerminalInputSource): TerminalContextSnapshot {
    const now = Date.now();
    const next = this.copySnapshot();
    if (source === 'human') {
      next.lastHumanInputAt = now;
    } else {
      next.lastToolInputAt = now;
    }

    const buffer = this.inputBuffers[source];
    let working = buffer;

    for (const char of input) {
      if (char === '\r' || char === '\n') {
        const command = normalizeCommand(working);
        if (command) {
          this.applyCommittedCommand(next, command);
        }
        working = '';
        next.promptReady = false;
      } else if (char === '\x7f') {
        working = working.slice(0, -1);
      } else if (char >= ' ' || char === '\t') {
        working += char;
      }
    }

    this.inputBuffers[source] = working;
    this.snapshot = makeSnapshot(next);
    return this.snapshot;
  }

  recordOutput(text: string): TerminalContextSnapshot {
    const next = this.copySnapshot();
    const lines = text.split(/\r?\n/);
    const lastLine = lines.at(-1) ?? '';
    const trimmedLastLine = lastLine.trimEnd();

    if (/innovus(?:\s+\d+)?[>#]\s*$/i.test(trimmedLastLine) || /\bencounter>\s*$/i.test(trimmedLastLine)) {
      next.mode = 'innovus';
      next.transport = next.transport;
      next.app = 'innovus';
      next.promptReady = true;
      next.confidence = 0.95;
    } else if (/\bicc2_shell[>#]\s*$/i.test(trimmedLastLine) || /\bicc2_shell>\s*$/i.test(trimmedLastLine)) {
      next.mode = 'icc2_shell';
      next.app = 'icc2_shell';
      next.promptReady = true;
      next.confidence = 0.95;
    } else if (/\bpt_shell[>#]\s*$/i.test(trimmedLastLine) || /\bpt_shell>\s*$/i.test(trimmedLastLine)) {
      next.mode = 'pt_shell';
      next.app = 'pt_shell';
      next.promptReady = true;
      next.confidence = 0.95;
    } else if (/(?:^|[\n\r])[^\n\r]{0,120}[$#%]\s*$/.test(text)) {
      next.promptReady = true;
      if (next.mode === 'unknown') {
        next.mode = next.transport === 'ssh' ? 'ssh' : 'shell';
      }
      if (!next.app || next.app === 'unknown') {
        next.app = 'shell';
      }
      if (next.transport === 'ssh' && !next.host) {
        next.host = parsePromptHost(trimmedLastLine);
      }
      next.confidence = Math.max(next.confidence, 0.75);
    }

    if (/\bLast login:\b/.test(text) || /\bAre you sure you want to continue connecting\b/.test(text)) {
      next.transport = 'ssh';
      next.mode = 'ssh';
      next.app = 'shell';
      next.confidence = Math.max(next.confidence, 0.8);
    }

    if (/\b(NORMAL|INSERT|VISUAL LINE|VISUAL BLOCK)\b/.test(text) || /(?:^|\n)~(?:\n|$)/.test(text)) {
      if (next.mode !== 'innovus') {
        next.mode = 'vim';
        next.app = 'vim';
        next.promptReady = false;
        next.confidence = Math.max(next.confidence, 0.75);
      }
    }

    this.snapshot = makeSnapshot(next);
    return this.snapshot;
  }

  private applyCommittedCommand(
    next: Omit<TerminalContextSnapshot, 'summary'>,
    command: string,
  ): void {
    next.recentCommand = command;
    const base = command.split(/\s+/)[0]?.toLowerCase() ?? '';

    if (base === 'ssh') {
      next.mode = 'ssh';
      next.transport = 'ssh';
      next.app = 'shell';
      next.host = parseSshHost(command);
      next.confidence = 0.95;
      return;
    }

    if (base === 'tmux') {
      next.mode = 'tmux';
      next.app = 'tmux';
      next.confidence = 0.9;
      return;
    }

    if (base === 'vim' || base === 'nvim' || base === 'vi' || base === 'view') {
      next.mode = 'vim';
      next.app = 'vim';
      next.confidence = 0.95;
      return;
    }

    if (base === 'innovus') {
      next.mode = 'innovus';
      next.app = 'innovus';
      next.confidence = 0.98;
      return;
    }

    if (base === 'icc2_shell') {
      next.mode = 'icc2_shell';
      next.app = 'icc2_shell';
      next.confidence = 0.98;
      return;
    }

    if (base === 'pt_shell') {
      next.mode = 'pt_shell';
      next.app = 'pt_shell';
      next.confidence = 0.98;
      return;
    }

    if (base === 'exit' || base === 'logout') {
      if (next.mode === 'ssh') {
        next.transport = 'local';
        next.host = null;
      }
      next.mode = next.transport === 'ssh' ? 'ssh' : 'shell';
      next.app = 'shell';
      next.confidence = 0.7;
      return;
    }

    if (base === 'q' || base === ':q' || base === ':qa' || base === ':wq' || base === ':x') {
      if (next.mode === 'vim') {
        next.mode = next.transport === 'ssh' ? 'ssh' : 'shell';
        next.app = 'shell';
        next.confidence = 0.6;
      }
      return;
    }

    if (base === 'source' || base.endsWith('.tcl')) {
      if (next.mode === 'innovus') {
        next.app = 'innovus';
        next.confidence = Math.max(next.confidence, 0.8);
        return;
      }
    }

    if (next.mode === 'unknown') {
      next.mode = next.transport === 'ssh' ? 'ssh' : 'shell';
      next.app = 'shell';
      next.confidence = 0.5;
    }
  }

  private copySnapshot(): Omit<TerminalContextSnapshot, 'summary'> {
    const {
      summary: _summary,
      ...rest
    } = this.snapshot;
    return rest;
  }
}

export function terminalContextEquals(
  a: TerminalContextSnapshot,
  b: TerminalContextSnapshot,
): boolean {
  return (
    a.mode === b.mode &&
    a.transport === b.transport &&
    a.app === b.app &&
    a.host === b.host &&
    a.promptReady === b.promptReady &&
    a.confidence === b.confidence &&
    a.summary === b.summary &&
    a.recentCommand === b.recentCommand &&
    a.lastHumanInputAt === b.lastHumanInputAt &&
    a.lastToolInputAt === b.lastToolInputAt
  );
}
