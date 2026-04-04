# Builtin Terminal Implementation Plan

- Status: Proposed
- Date: 2026-04-04
- Depends on: `docs/architecture/builtin-terminal-design-spec.md`

## 1) Objective

Translate the builtin terminal architecture into concrete implementation units with:

- explicit ownership boundaries
- stable interfaces
- low-risk migration from current code
- clear test and rollout gates

## 2) Target Module Map

## 2.1 New Core Modules

Create under `src/terminal/`:

- `src/terminal/TerminalSessionManager.ts`
- `src/terminal/TerminalSessionStore.ts`
- `src/terminal/TerminalProtocol.ts`
- `src/terminal/TerminalWorkerClient.ts`
- `src/terminal/TerminalExecFraming.ts`
- `src/terminal/TerminalMetrics.ts`

## 2.2 Worker Modules

Create under `src/terminal/worker/`:

- `src/terminal/worker/TerminalWorkerMain.ts`
- `src/terminal/worker/WorkerProtocolHandler.ts`
- `src/terminal/worker/PtyBackend.ts`

## 2.3 Adapter Modules (compatibility layer)

Create under `src/terminal/adapters/`:

- `src/terminal/adapters/TerminalToolsAdapter.ts`
- `src/terminal/adapters/TerminalPanelAdapter.ts`

## 2.4 Existing Files to Migrate

- `src/utils/terminalPty.ts` -> absorbed into `TerminalWorkerClient`
- `src/utils/terminalPtyNode.ts` -> absorbed into `worker/PtyBackend`
- `src/components/terminal/TerminalPanel.tsx` -> depends on `TerminalPanelAdapter`
- `src/tools/TerminalReadTool/TerminalReadTool.ts` -> manager-backed read
- `src/tools/TerminalWriteTool/TerminalWriteTool.ts` -> manager-backed write
- `src/tools/TerminalBashTool/TerminalBashTool.ts` -> replace with manager-backed `TerminalExec`

## 3) Canonical Interfaces

## 3.1 Protocol Types

File: `src/terminal/TerminalProtocol.ts`

```ts
export type TerminalInputSource = 'human' | 'tool'
export type TerminalIntent = 'interactive' | 'exec'
export type TerminalHealth = 'starting' | 'running' | 'degraded' | 'stopped'

export type WorkerCommand =
  | { type: 'spawn'; shell: string; cwd: string; cols: number; rows: number; envSubset?: Record<string, string> }
  | { type: 'write'; dataBase64: string; source: TerminalInputSource; requestId: string; intent: TerminalIntent }
  | { type: 'resize'; cols: number; rows: number }
  | { type: 'signal'; kind: 'sigint' | 'sigterm' }
  | { type: 'shutdown' }
  | { type: 'ping'; id: string }

export type WorkerEvent =
  | { type: 'spawned'; pid: number }
  | { type: 'output'; dataBase64: string; ts: number }
  | { type: 'exit'; exitCode: number; signal?: number }
  | { type: 'error'; code: string; message: string }
  | { type: 'pong'; id: string }
```

## 3.2 Session Manager Contract

File: `src/terminal/TerminalSessionManager.ts`

```ts
export interface TerminalExecResult {
  requestId: string
  exitCode: number | null
  stdout: string
  stderr: string
  interleaved: boolean
  timedOut: boolean
  tail?: string
}

export interface TerminalSessionManager {
  ensureStarted(): Promise<void>
  shutdown(): Promise<void>
  restart(reason?: string): Promise<void>
  getHealth(): TerminalHealth
  getPid(): number | null
  resize(cols: number, rows: number): void
  write(input: string, meta: { source: TerminalInputSource; intent: TerminalIntent; requestId: string }): void
  readTail(opts?: { bytes?: number; lines?: number }): string
  exec(command: string, opts?: { timeoutMs?: number; leaseMs?: number }): Promise<TerminalExecResult>
  subscribe(listener: (event: TerminalEvent) => void): () => void
}
```

## 3.3 Store Contract

File: `src/terminal/TerminalSessionStore.ts`

- bounded ring buffer
- line index for fast tail-by-lines
- event id monotonic counter
- buffer drop accounting

## 4) Ownership Rules

1. `TerminalSessionManager` is singleton and is the only module allowed to:
   - start/stop worker
   - send protocol commands
2. UI and tools must never talk to worker directly.
3. No global mutable refs for terminal I/O in tools.
4. AppState stores terminal view state and snapshots, not PTY ownership.

## 5) Migration Sequence

## Phase A: Introduce Manager Without Behavior Change

- Add manager, protocol types, worker client.
- Keep existing `terminalPty` paths behind adapter wrappers.
- Add manager singleton accessor `getTerminalSessionManager()`.

Exit gate:

- app boots with no behavior regressions
- existing PTY smoke test still passes

## Phase B: Rewire UI and Tools to Manager

- `TerminalPanel` subscribes to manager output stream.
- `TerminalRead/Write/Bash` route through `TerminalToolsAdapter`.
- Remove `terminalWriteRef` dependency from tools.

Exit gate:

- hide/show/collapse never kills terminal session
- structured `/term run` result path stable

## Phase C: Worker Consolidation

- Move `terminalPtyNode` logic into worker module tree.
- Enforce protocol validation at boundary.
- Add ping/pong liveness and restart backoff.

Exit gate:

- forced worker crash recovers automatically
- health transitions visible through `/term status`

## Phase D: Cleanup and Hardening

- remove deprecated PTY utility code
- finalize metrics wiring
- finalize soak and concurrency tests

Exit gate:

- all acceptance tests pass
- no unresolved TODOs in terminal infra modules

## 6) `/term` Command Integration Plan

Create new command handler:

- `src/commands/term/index.ts`
- `src/commands/term/term.tsx`

Subcommands mapping:

- `/term run` -> `manager.exec()`
- `/term send` -> `manager.write(... intent='interactive')`
- `/term read` -> `manager.readTail()`
- `/term status` -> `manager.getHealth()/pid/stats`
- `/term focus` -> set right-pane focus
- `/term restart` -> `manager.restart()`

Deprecation:

- keep existing terminal tools as compatibility aliases until command path is stable.

## 7) Layout Integration Plan

Files:

- `src/components/TwoPaneLayout.tsx`
- `src/components/terminal/TerminalPanel.tsx`
- `src/screens/REPL.tsx`

Implementation notes:

- keep `keepMountedRightPane=true` invariant
- terminal pane `visible=false` must only disable rendering, never session
- pane focus state lives in focused-pane controller, not terminal lifecycle
- resize path:
  - layout computes usable cols/rows
  - panel sends to manager
  - manager throttles resize to worker

## 8) Test Plan (Concrete)

## 8.1 Unit Tests

- `TerminalProtocol` parser: fragmented and combined messages
- `TerminalSessionStore`: ring cap, line tail, drop counters
- `TerminalExecFraming`: parse success/failure/interleaving

## 8.2 Integration Tests

- session survives pane hide/show and collapse/expand
- concurrent human write + exec command marks `interleaved=true`
- `Ctrl+C` routes to terminal when right pane focused

## 8.3 Fault Injection

- kill worker process mid-command
- malformed protocol frames
- rapid resize storm

## 8.4 Soak Tests

- long-running compile/sim workflow for hours
- sustained output throughput and memory cap verification

## 9) Rollout Controls

- feature flag: `builtin_terminal_manager_v1`
- staged rollout:
  1. local/dev only
  2. dogfood
  3. default on

Fallback:

- if manager initialization fails, expose degraded status and disable `/term run` while preserving read-only tail when possible.

## 10) Definition of Done

Done when:

1. PTY ownership only exists in `TerminalSessionManager`.
2. UI and tools both use manager APIs (no direct refs).
3. `/term` command family is available and stable.
4. session persists through all pane/layout transitions.
5. protocol, concurrency, fault-injection, and soak tests pass.

