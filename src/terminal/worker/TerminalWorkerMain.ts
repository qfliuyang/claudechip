import {
  type WorkerCommand,
  type WorkerEvent,
  NdjsonStreamParser,
  encodeNdjsonMessage,
} from '../TerminalProtocol.js';
import { WorkerProtocolHandler } from './WorkerProtocolHandler.js';

function writeEvent(event: WorkerEvent): void {
  process.stdout.write(encodeNdjsonMessage(event));
}

function runWorker(): void {
  const parser = new NdjsonStreamParser<WorkerCommand>();
  const handler = new WorkerProtocolHandler(writeEvent);

  process.stdin.on('data', (chunk: Buffer) => {
    const parsed = parser.push(chunk);
    for (const cmd of parsed.messages) {
      try {
        handler.handle(cmd);
      } catch (error) {
        writeEvent({
          type: 'error',
          code: 'worker_handle_error',
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
    for (const bad of parsed.errors) {
      writeEvent({
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

