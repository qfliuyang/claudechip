import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import { EventEmitter } from 'events';
import {
  type WorkerCommand,
  type WorkerEvent,
  NdjsonStreamParser,
  encodeNdjsonMessage,
} from './TerminalProtocol.js';

export interface TerminalWorkerClientOptions {
  nodePath?: string;
  scriptPath?: string;
  cwd?: string;
}

export class TerminalWorkerClient extends EventEmitter {
  private child: ChildProcessWithoutNullStreams | null = null;
  private readonly parser = new NdjsonStreamParser<WorkerEvent>();
  private readonly options: Required<TerminalWorkerClientOptions>;

  constructor(options?: TerminalWorkerClientOptions) {
    super();
    this.options = {
      nodePath: options?.nodePath ?? process.env.CLAUDECHIP_NODE_PATH ?? 'node',
      scriptPath:
        options?.scriptPath ??
        new URL('./worker/TerminalWorkerMain.ts', import.meta.url).pathname,
      cwd: options?.cwd ?? process.cwd(),
    };
  }

  start(): void {
    if (this.child) return;

    this.child = spawn(
      this.options.nodePath,
      ['--import', 'tsx/esm', this.options.scriptPath],
      {
        cwd: this.options.cwd,
        env: process.env,
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    );

    this.child.stdout.on('data', chunk => {
      const parsed = this.parser.push(chunk);
      for (const event of parsed.messages) {
        this.emit('event', event);
      }
      for (const bad of parsed.errors) {
        this.emit('parse_error', bad);
      }
    });

    this.child.stderr.on('data', chunk => {
      const msg = chunk.toString('utf-8').trim();
      if (msg) this.emit('stderr', msg);
    });

    this.child.on('exit', (code, signal) => {
      this.emit('closed', { code: code ?? 0, signal: signal ?? null });
      this.child = null;
    });
  }

  stop(): void {
    if (!this.child) return;
    try {
      this.send({ type: 'shutdown' });
    } catch {}
    try {
      this.child.kill();
    } catch {}
    this.child = null;
  }

  send(command: WorkerCommand): void {
    if (!this.child || !this.child.stdin.writable) {
      throw new Error('Terminal worker is not running');
    }
    this.child.stdin.write(encodeNdjsonMessage(command));
  }

  isRunning(): boolean {
    return !!this.child;
  }
}
