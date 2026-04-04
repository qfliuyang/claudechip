# ADR: Shared Integrated Terminal Architecture

- Status: Proposed
- Date: 2026-04-04
- Owner: ClaudeChip

## Context

ClaudeChip needs a built-in terminal that behaves like an always-on shared workspace:

1. The human can watch, type, and operate it directly.
2. Claude (left pane) can observe it and use it via tools.
3. The terminal must not be tied to temporary UI layout state (show/hide/collapse).
4. The design must scale to long-running chip-design workflows where Claude assists while jobs run.

Current implementation proves feasibility but mixes UI and terminal lifecycle concerns, which increases fragility under resizing, focus changes, and concurrent human/tool interactions.

## Decision

Adopt a service-first architecture with a single terminal session owner.

### 1) Terminal Session Owner

Introduce `TerminalSessionManager` as the only owner of PTY lifecycle.

Responsibilities:

- spawn/restart/stop PTY process
- resize terminal
- write input to PTY
- stream output events
- hold bounded output history ring buffer
- expose health state (`starting`, `running`, `degraded`, `stopped`)

Non-responsibilities:

- UI rendering
- tool-specific business logic
- keybinding policy outside terminal semantics

### 2) Client Model

All participants are clients of the same manager-backed session:

- `HumanClient` (right pane)
- `ToolClient` (`TerminalRead`, `TerminalWrite`, `TerminalExec`)
- optional future observers (logger, remote session mirror)

Each write must include metadata:

- `source`: `human | tool`
- `requestId`
- `ts`

### 3) Event-Sourced Stream

Manager emits append-only events:

- `terminal.spawned`
- `terminal.output`
- `terminal.input`
- `terminal.resized`
- `terminal.exited`
- `terminal.health_changed`

UI and tools consume projections from this stream. The stream is the source of truth for observability and replay windows.

### 4) Concurrency Semantics

- Shared terminal remains one shell/PTY session.
- `TerminalExec` uses command framing markers and returns structured result:
  - `exitCode`
  - `stdout`
  - `stderr`
- Manager supports optional short lease for `TerminalExec` to reduce command/result interleaving risk.
- Human input is never blocked by default; blocking is explicit and short-lived if enabled.

### 5) Lifecycle Invariants

- Hiding/collapsing right pane MUST NOT stop PTY.
- PTY stops only on explicit manager shutdown or process exit.
- `Ctrl+C` behavior depends on terminal focus:
  - terminal focused: send interrupt to PTY foreground job
  - terminal not focused: app-level existing behavior

## API Contract (High Level)

```ts
type TerminalHealth = 'starting' | 'running' | 'degraded' | 'stopped'

interface TerminalSessionManager {
  ensureStarted(): Promise<void>
  shutdown(): Promise<void>
  resize(cols: number, rows: number): void
  write(input: string, meta: { source: 'human' | 'tool'; requestId: string }): void
  readTail(limitBytes?: number): string
  subscribe(listener: (event: TerminalEvent) => void): () => void
  getHealth(): TerminalHealth
}
```

## Reliability and Observability Requirements

- bounded output ring buffer with drop counters
- restart backoff with cap
- structured logs for all lifecycle transitions
- metrics:
  - spawn failures
  - restarts
  - write latency
  - output drops
  - exec timeout rate

## Security and Policy Boundary

All terminal tool operations are authorized at manager boundary, not inside UI components.

Policy checks include:

- allow/deny command policy hooks
- max execution timeout bounds
- optional protected command prompts

## Migration Plan

### Phase 0: Contract

- land this ADR
- freeze external behavior assumptions

### Phase 1: Manager Extraction

- move PTY lifecycle and buffers to `TerminalSessionManager`
- keep existing UI and tools but route through manager adapter

### Phase 2: Tool Hardening

- unify `TerminalRead`, `TerminalWrite`, `TerminalExec` on manager API
- add request-scoped tracing and structured command result schema

### Phase 3: Operational Readiness

- add failure-injection tests
- add concurrency tests (human input + tool exec overlap)
- add long-run soak test profile for chip-design workloads

## Acceptance Criteria

Architecture is accepted when:

1. Terminal session survives pane hide/show, split collapse, and view switches.
2. Human and Claude tools operate on the same PTY session without lifecycle resets.
3. `TerminalExec` returns structured and attributable results under concurrent activity.
4. System provides clear health and restart telemetry.

## Out of Scope (for this ADR)

- visual styling of the pane
- advanced multi-terminal tabs
- remote multiplexing protocols

