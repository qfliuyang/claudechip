import * as fs from 'fs';
import * as path from 'path';
import * as nodePty from 'node-pty';

function resolveShell(shell: string): string {
  const candidates = [shell, '/bin/zsh', '/bin/bash', '/bin/sh'];
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) return candidate;
  }
  return '/bin/sh';
}

function resolveCwd(cwd: string): string {
  const target = cwd && fs.existsSync(cwd) ? cwd : process.cwd();
  return path.resolve(target);
}

export class PtyBackend {
  private pty: nodePty.IPty | null = null;

  spawn(shell: string, cwd: string, cols: number, rows: number): nodePty.IPty {
    this.kill();
    this.pty = nodePty.spawn(resolveShell(shell), [], {
      cwd: resolveCwd(cwd),
      env: process.env as Record<string, string>,
      cols: Math.max(1, cols),
      rows: Math.max(1, rows),
      name: 'xterm-256color',
    });
    return this.pty;
  }

  write(data: string): void {
    this.pty?.write(data);
  }

  resize(cols: number, rows: number): void {
    this.pty?.resize(Math.max(1, cols), Math.max(1, rows));
  }

  kill(): void {
    if (!this.pty) return;
    try {
      this.pty.kill();
    } catch {}
    this.pty = null;
  }

  signal(kind: 'sigint' | 'sigterm'): void {
    if (!this.pty) return;
    try {
      if (kind === 'sigint') {
        this.pty.write('\x03');
      } else {
        this.pty.kill();
      }
    } catch {}
  }

  getPid(): number | null {
    return this.pty?.pid ?? null;
  }
}

