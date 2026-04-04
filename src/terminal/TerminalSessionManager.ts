import { EventEmitter } from 'events';
import {
  type TerminalEvent,
  type TerminalHealth,
  type TerminalInputSource,
  type TerminalIntent,
  type WorkerEvent,
} from './TerminalProtocol.js';
import { TerminalSessionStore } from './TerminalSessionStore.js';
import {
  buildWrappedCommand,
  createExecMarkers,
  parseFramedResult,
} from './TerminalExecFraming.js';
import { TerminalWorkerClient } from './TerminalWorkerClient.js';
import { TerminalMetrics, type TerminalMetricsSnapshot } from './TerminalMetrics.js';

const START_TIMEOUT_MS = 4000;
const POLL_INTERVAL_MS = 200;
const SETTLE_THRESHOLD_MS = 800;
const PING_INTERVAL_MS = 10000;
const PING_TIMEOUT_MS = 15000;

export interface TerminalExecResult {
  requestId: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  interleaved: boolean;
  timedOut: boolean;
  tail?: string;
}

export interface TerminalStatusSnapshot {
  health: TerminalHealth;
  pid: number | null;
  shell: string;
  cwd: string;
  cols: number;
  rows: number;
  store: ReturnType<TerminalSessionStore['stats']>;
  metrics: TerminalMetricsSnapshot;
}

export interface TerminalSessionManager {
  ensureStarted(): Promise<void>;
  shutdown(): Promise<void>;
  restart(reason?: string): Promise<void>;
  getHealth(): TerminalHealth;
  getPid(): number | null;
  getStatus(): TerminalStatusSnapshot;
  signal(kind: 'sigint' | 'sigterm'): void;
  resize(cols: number, rows: number): void;
  write(
    input: string,
    meta: { source: TerminalInputSource; intent: TerminalIntent; requestId: string },
  ): void;
  readTail(opts?: { bytes?: number; lines?: number }): string;
  exec(
    command: string,
    opts?: { timeoutMs?: number; leaseMs?: number },
  ): Promise<TerminalExecResult>;
  subscribe(listener: (event: TerminalEvent) => void): () => void;
}

class DefaultTerminalSessionManager implements TerminalSessionManager {
  private readonly emitter = new EventEmitter();
  private readonly store = new TerminalSessionStore();
  private readonly metrics = new TerminalMetrics();
  private health: TerminalHealth = 'stopped';
  private worker: TerminalWorkerClient | null = null;
  private pid: number | null = null;
  private shell = process.env.SHELL || '/bin/bash';
  private cwd = process.cwd();
  private cols = 120;
  private rows = 40;
  private startPromise: Promise<void> | null = null;
  private shuttingDown = false;
  private restartAttempt = 0;
  private restartTimer: NodeJS.Timeout | null = null;
  private pingTimer: NodeJS.Timeout | null = null;
  private pendingPingId: string | null = null;
  private pendingPingAt = 0;

  async ensureStarted(): Promise<void> {
    if (this.health === 'running' && this.worker?.isRunning()) return;
    if (this.startPromise) return this.startPromise;

    this.clearRestartTimer();
    this.shuttingDown = false;
    this.setHealth('starting');

    this.startPromise = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.metrics.incSpawnFailures();
        this.setHealth('degraded', 'start timeout');
        this.scheduleRestart('start timeout');
        this.startPromise = null;
        reject(new Error('Terminal worker spawn timeout'));
      }, START_TIMEOUT_MS);

      this.ensureWorker();
      if (!this.worker) {
        this.startPromise = null;
        clearTimeout(timeout);
        reject(new Error('Terminal worker unavailable'));
        return;
      }

      const onSpawned = (event: TerminalEvent) => {
        if (event.type !== 'terminal.spawned') return;
        cleanup();
        this.restartAttempt = 0;
        this.setHealth('running');
        this.startPingLoop();
        resolve();
      };

      const unsubscribe = this.subscribe(onSpawned);

      const cleanup = () => {
        clearTimeout(timeout);
        unsubscribe();
        this.startPromise = null;
      };

      try {
        this.worker.start();
        this.worker.send({
          type: 'spawn',
          shell: this.shell,
          cwd: this.cwd,
          cols: this.cols,
          rows: this.rows,
        });
      } catch (error) {
        cleanup();
        this.metrics.incSpawnFailures();
        this.setHealth('degraded', 'spawn error');
        this.scheduleRestart('spawn error');
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });

    return this.startPromise;
  }

  async shutdown(): Promise<void> {
    this.shuttingDown = true;
    this.clearRestartTimer();
    this.stopPingLoop();
    if (this.worker) {
      this.worker.stop();
      this.worker = null;
    }
    this.pid = null;
    this.setHealth('stopped');
  }

  async restart(reason?: string): Promise<void> {
    await this.shutdown();
    this.shuttingDown = false;
    this.setHealth('starting', reason ?? 'restart requested');
    await this.ensureStarted();
  }

  getHealth(): TerminalHealth {
    return this.health;
  }

  getPid(): number | null {
    return this.pid;
  }

  getStatus(): TerminalStatusSnapshot {
    return {
      health: this.health,
      pid: this.pid,
      shell: this.shell,
      cwd: this.cwd,
      cols: this.cols,
      rows: this.rows,
      store: this.store.stats(),
      metrics: this.metrics.snapshot(),
    };
  }

  signal(kind: 'sigint' | 'sigterm'): void {
    if (!this.worker?.isRunning()) return;
    try {
      this.worker.send({ type: 'signal', kind });
    } catch (error) {
      this.handleWorkerFailure(
        `signal failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  resize(cols: number, rows: number): void {
    this.cols = Math.max(1, cols);
    this.rows = Math.max(1, rows);
    if (!this.worker?.isRunning()) return;
    try {
      this.worker.send({ type: 'resize', cols: this.cols, rows: this.rows });
    } catch (error) {
      this.handleWorkerFailure(
        `resize failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  write(
    input: string,
    meta: { source: TerminalInputSource; intent: TerminalIntent; requestId: string },
  ): void {
    if (!this.worker?.isRunning()) {
      void this.ensureStarted()
        .then(() => this.write(input, meta))
        .catch(() => {});
      return;
    }

    try {
      this.worker.send({
        type: 'write',
        dataBase64: Buffer.from(input, 'utf-8').toString('base64'),
        source: meta.source,
        requestId: meta.requestId,
        intent: meta.intent,
      });
      this.metrics.incWriteCount();
      this.emit({
        type: 'terminal.write',
        source: meta.source,
        requestId: meta.requestId,
        bytes: input.length,
        ts: Date.now(),
      });
    } catch (error) {
      this.handleWorkerFailure(
        `write failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  readTail(opts?: { bytes?: number; lines?: number }): string {
    if (opts?.lines !== undefined) return this.store.readTailByLines(opts.lines);
    return this.store.readTailByBytes(opts?.bytes);
  }

  async exec(
    command: string,
    opts?: { timeoutMs?: number; leaseMs?: number },
  ): Promise<TerminalExecResult> {
    await this.ensureStarted();
    const timeoutMs = opts?.timeoutMs ?? 5000;
    const requestId = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    const markers = createExecMarkers(requestId);
    const wrapped = buildWrappedCommand(command, markers);

    let interleaved = false;
    let settled = false;
    let elapsed = 0;
    let lastTail = this.readTail({ bytes: 256 * 1024 });
    let lastChangeAt = Date.now();

    const unsubscribe = this.subscribe(event => {
      if (
        event.type === 'terminal.write' &&
        event.requestId !== requestId &&
        event.source === 'human'
      ) {
        interleaved = true;
      }
    });

    this.write(wrapped, {
      source: 'tool',
      intent: 'exec',
      requestId,
    });

    try {
      while (elapsed < timeoutMs) {
        await sleep(POLL_INTERVAL_MS);
        elapsed += POLL_INTERVAL_MS;

        const tail = this.readTail({ bytes: 512 * 1024 });
        if (tail !== lastTail) {
          lastTail = tail;
          lastChangeAt = Date.now();
        } else if (Date.now() - lastChangeAt >= SETTLE_THRESHOLD_MS) {
          settled = true;
        }

        if (tail.includes(markers.endMarker)) {
          const parsed = parseFramedResult(tail, markers);
          if (parsed) {
            return {
              requestId,
              exitCode: parsed.exitCode,
              stdout: parsed.stdout,
              stderr: parsed.stderr,
              interleaved,
              timedOut: false,
            };
          }
        }

        if (settled) break;
      }

      return {
        requestId,
        exitCode: null,
        stdout: '',
        stderr: '',
        interleaved: true,
        timedOut: true,
        tail: this.readTail({ bytes: 2000 }),
      };
    } finally {
      unsubscribe();
    }
  }

  subscribe(listener: (event: TerminalEvent) => void): () => void {
    this.emitter.on('terminal_event', listener);
    return () => this.emitter.off('terminal_event', listener);
  }

  private ensureWorker(): void {
    if (this.worker) return;
    const worker = new TerminalWorkerClient();
    worker.on('event', (event: WorkerEvent) => {
      this.handleWorkerEvent(event);
    });
    worker.on('parse_error', (line: string) => {
      this.metrics.incIpcParseErrors();
      this.emit({
        type: 'terminal.error',
        code: 'ipc_parse_error',
        message: line,
        ts: Date.now(),
      });
    });
    worker.on('stderr', (line: string) => {
      this.emit({
        type: 'terminal.error',
        code: 'worker_stderr',
        message: line,
        ts: Date.now(),
      });
    });
    worker.on('closed', () => {
      this.pid = null;
      if (this.shuttingDown) return;
      this.setHealth('degraded', 'worker closed');
      this.scheduleRestart('worker closed');
    });
    this.worker = worker;
  }

  private handleWorkerEvent(event: WorkerEvent): void {
    if (event.type === 'spawned') {
      this.pid = event.pid;
      this.emit({ type: 'terminal.spawned', pid: event.pid, ts: Date.now() });
      return;
    }

    if (event.type === 'output') {
      const data = Buffer.from(event.dataBase64, 'base64').toString('utf-8');
      const before = this.store.stats().droppedBytes;
      this.store.appendOutput(data);
      const after = this.store.stats().droppedBytes;
      this.metrics.addOutputDrops(after - before);
      this.emit({
        type: 'terminal.output',
        data,
        bytes: data.length,
        ts: event.ts ?? Date.now(),
      });
      return;
    }

    if (event.type === 'exit') {
      this.pid = null;
      this.emit({
        type: 'terminal.exited',
        exitCode: event.exitCode,
        signal: event.signal,
        ts: Date.now(),
      });
      if (!this.shuttingDown) {
        this.setHealth('degraded', 'pty exited');
        this.scheduleRestart('pty exited');
      }
      return;
    }

    if (event.type === 'pong') {
      if (event.id === this.pendingPingId) {
        this.pendingPingId = null;
        this.pendingPingAt = 0;
      }
      return;
    }

    if (event.type === 'error') {
      this.emit({
        type: 'terminal.error',
        code: event.code,
        message: event.message,
        ts: Date.now(),
      });
    }
  }

  private scheduleRestart(reason: string): void {
    if (this.shuttingDown || this.restartTimer) return;
    const delay = Math.min(30000, 500 * 2 ** this.restartAttempt);
    this.restartAttempt += 1;
    this.metrics.incRestartCount();
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      void this.ensureStarted().catch(() => {
        this.scheduleRestart(`restart failed after ${reason}`);
      });
    }, delay);
  }

  private clearRestartTimer(): void {
    if (!this.restartTimer) return;
    clearTimeout(this.restartTimer);
    this.restartTimer = null;
  }

  private startPingLoop(): void {
    this.stopPingLoop();
    this.pingTimer = setInterval(() => {
      if (!this.worker?.isRunning()) return;
      const now = Date.now();
      if (
        this.pendingPingId &&
        this.pendingPingAt > 0 &&
        now - this.pendingPingAt > PING_TIMEOUT_MS
      ) {
        this.handleWorkerFailure('ping timeout');
        return;
      }
      const id = `ping_${now}_${Math.random().toString(36).slice(2, 8)}`;
      this.pendingPingId = id;
      this.pendingPingAt = now;
      try {
        this.worker.send({ type: 'ping', id });
      } catch (error) {
        this.handleWorkerFailure(
          `ping failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }, PING_INTERVAL_MS);
  }

  private stopPingLoop(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    this.pendingPingId = null;
    this.pendingPingAt = 0;
  }

  private handleWorkerFailure(reason: string): void {
    this.metrics.incSpawnFailures();
    this.setHealth('degraded', reason);
    this.scheduleRestart(reason);
  }

  private setHealth(health: TerminalHealth, reason?: string): void {
    this.health = health;
    this.emit({ type: 'terminal.health', health, reason, ts: Date.now() });
  }

  private emit(event: TerminalEvent): void {
    this.store.recordEvent(event);
    this.emitter.emit('terminal_event', event);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

let singleton: TerminalSessionManager | null = null;

export function getTerminalSessionManager(): TerminalSessionManager {
  if (!singleton) singleton = new DefaultTerminalSessionManager();
  return singleton;
}
