import {
  type WorkerCommand,
  type WorkerEvent,
  NdjsonStreamParser,
  encodeNdjsonMessage,
} from '../TerminalProtocol.js';
import { WorkerProtocolHandler } from './WorkerProtocolHandler.js';

function runWorker(): void {
  const parser = new NdjsonStreamParser<WorkerCommand>();
  let stdoutBackpressured = false;

  let handler: WorkerProtocolHandler;
  const emitEvent = (event: WorkerEvent): void => {
    const writable = process.stdout.write(encodeNdjsonMessage(event));
    if (!writable && !stdoutBackpressured) {
      stdoutBackpressured = true;
      handler.pauseOutput();
    }
  };
  handler = new WorkerProtocolHandler(emitEvent);

  process.stdout.on('drain', () => {
    if (!stdoutBackpressured) return;
    stdoutBackpressured = false;
    handler.resumeOutput();
  });

  process.stdin.on('data', (chunk: Buffer) => {
    const parsed = parser.push(chunk);
    for (const cmd of parsed.messages) {
      try {
        handler.handle(cmd);
      } catch (error) {
        emitEvent({
          type: 'error',
          code: 'worker_handle_error',
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
    for (const bad of parsed.errors) {
      emitEvent({
        type: 'error',
        code: 'worker_parse_error',
        message: bad,
      });
    }
  });

  process.stdin.on('end', () => {
    handler.shutdown();
    process.exit(0);
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runWorker();
}
