import type { WorkerCommand, WorkerEvent } from '../TerminalProtocol.js';
import { PtyBackend } from './PtyBackend.js';

export class WorkerProtocolHandler {
  private readonly backend = new PtyBackend();
  private unsubscribePty: (() => void) | null = null;
  private readonly emit: (event: WorkerEvent) => void;
  private outputPaused = false;

  constructor(emit: (event: WorkerEvent) => void) {
    this.emit = emit;
  }

  handle(command: WorkerCommand): void {
    switch (command.type) {
      case 'spawn': {
        const pty = this.backend.spawn(
          command.shell,
          command.cwd,
          command.cols,
          command.rows,
        );
        this.unsubscribePty?.();
        const onData = (data: string | Uint8Array) => {
          const bytes =
            typeof data === 'string' ? Buffer.from(data, 'utf-8') : Buffer.from(data)
          this.emit({
            type: 'output',
            dataBase64: bytes.toString('base64'),
            ts: Date.now(),
          });
        };
        const onExit = ({
          exitCode,
          signal,
        }: {
          exitCode: number;
          signal?: number;
        }) => {
          this.emit({ type: 'exit', exitCode, signal });
        };
        pty.onData(onData);
        pty.onExit(onExit);
        this.unsubscribePty = () => {
          // node-pty typings do not expose disposable handles for callbacks.
          // backend.kill() tears down the whole PTY, so explicit listener
          // cleanup is not needed for the single-PTY worker process.
        };
        this.emit({ type: 'spawned', pid: pty.pid });
        break;
      }
      case 'write': {
        const decoded = Buffer.from(command.dataBase64, 'base64').toString('utf-8');
        this.backend.write(decoded);
        break;
      }
      case 'resize': {
        this.backend.resize(command.cols, command.rows);
        break;
      }
      case 'signal': {
        this.backend.signal(command.kind);
        break;
      }
      case 'ping': {
        this.emit({ type: 'pong', id: command.id });
        break;
      }
      case 'shutdown': {
        this.backend.kill();
        process.exit(0);
        break;
      }
      default: {
        this.emit({
          type: 'error',
          code: 'unknown_command',
          message: `Unsupported command: ${(command as WorkerCommand).type}`,
        });
      }
    }
  }

  shutdown(): void {
    this.backend.kill();
  }

  pauseOutput(): void {
    if (this.outputPaused) return;
    this.outputPaused = true;
    this.backend.pause();
  }

  resumeOutput(): void {
    if (!this.outputPaused) return;
    this.outputPaused = false;
    this.backend.resume();
  }
}
