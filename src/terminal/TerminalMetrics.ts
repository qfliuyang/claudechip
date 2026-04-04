export interface TerminalMetricsSnapshot {
  spawnFailures: number;
  restartCount: number;
  outputDrops: number;
  ipcParseErrors: number;
  writeCount: number;
}

export class TerminalMetrics {
  private spawnFailures = 0;
  private restartCount = 0;
  private outputDrops = 0;
  private ipcParseErrors = 0;
  private writeCount = 0;

  incSpawnFailures(): void {
    this.spawnFailures += 1;
  }

  incRestartCount(): void {
    this.restartCount += 1;
  }

  addOutputDrops(count: number): void {
    if (count > 0) this.outputDrops += count;
  }

  incIpcParseErrors(): void {
    this.ipcParseErrors += 1;
  }

  incWriteCount(): void {
    this.writeCount += 1;
  }

  snapshot(): TerminalMetricsSnapshot {
    return {
      spawnFailures: this.spawnFailures,
      restartCount: this.restartCount,
      outputDrops: this.outputDrops,
      ipcParseErrors: this.ipcParseErrors,
      writeCount: this.writeCount,
    };
  }
}

