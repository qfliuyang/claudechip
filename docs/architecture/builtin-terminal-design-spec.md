# Builtin Terminal Design Specification

- Status: Proposed
- Date: 2026-04-04
- Scope: ClaudeChip integrated terminal (non-tmux primary architecture)

## 0) Product Goal

ClaudeChip ships a first-class builtin terminal that is:

1. Persistent for the whole ClaudeChip session.
2. Shared by human and Claude tools.
3. Visually isolated from Claude UI in a two-pane TUI layout.
4. Scriptable via a dedicated `/term` command family.
5. Terminal-general: behaves like a normal POSIX terminal for shells and terminal apps.

This spec defines architecture and infra first. UI details follow these contracts.

## 1) Connection and Communication

## 1.1 Process model

- Main runtime: ClaudeChip process (Bun/Node app layer).
- Worker runtime: dedicated Node PTY worker process (owns `node-pty`).
- PTY backend: one shell process (`zsh` default, configurable) with pseudo-terminal.

Topology:

`ClaudeChip Main` <-> `PTY Worker IPC` <-> `node-pty` <-> `shell`

Main never directly owns PTY internals; worker is the isolation boundary.

## 1.2 Session owner

Create `TerminalSessionManager` as singleton service.

Responsibilities:

- start/stop/restart worker
- route input writes
- route resize updates
- aggregate output into bounded ring buffer
- emit terminal events to all clients
- expose health and stats

Non-responsibilities:

- rendering terminal UI
- tool policy prompting UI
- Claude transcript formatting

## 1.3 IPC protocol

Transport: line-delimited JSON (`NDJSON`) with explicit message type and request id.

Command messages (`main -> worker`):

- `spawn { shell, cwd, cols, rows, envSubset }`
- `write { dataBase64, source, requestId }`
- `resize { cols, rows }`
- `signal { kind: "sigint" | "sigterm" }`
- `shutdown {}`
- `ping { id }`

Event messages (`worker -> main`):

- `spawned { pid }`
- `output { dataBase64, ts }`
- `exit { exitCode, signal }`
- `error { code, message }`
- `pong { id }`

Protocol requirements:

- parse must handle chunk fragmentation and concatenation
- unknown message types are logged and ignored
- all parse errors are surfaced with payload tails for debugging

## 1.4 Output model

- `TerminalSessionManager` maintains:
  - raw output ring buffer (bytes capped, default 1-4 MB configurable)
  - event stream index (`eventId`, monotonic)
  - `lastOutputAt`
- Consumers request:
  - tail by bytes
  - tail by lines
  - events since `eventId`

## 1.5 Health and recovery

Health states:

- `starting`
- `running`
- `degraded` (worker alive but protocol failures/restart backoff)
- `stopped`

Recovery policy:

- exponential restart backoff (e.g. 0.5s, 1s, 2s, 4s, cap 30s)
- no hard respawn count cap that permanently disables terminal
- explicit `restart()` allowed from `/term` command

Observability:

- counters: `spawn_failures`, `restarts`, `output_drops`, `ipc_parse_errors`
- gauges: `buffer_bytes`, `health_state`
- timers: `write_to_output_latency`

## 2) Shared Control and Shared View (Claude + Human)

## 2.1 Single shared terminal session

- There is exactly one active terminal session per ClaudeChip process by default.
- Human pane and Claude tools interact with the same session.

## 2.2 Input arbitration

All writes include metadata:

- `source`: `human` or `tool`
- `requestId`
- `intent`: `interactive` or `exec`

Modes:

- default cooperative mode: human and tools may interleave
- optional short lease mode for `/term run`:
  - lease has timeout
  - human input still allowed, but `/term run` returns `interleaved=true` when contamination detected

## 2.3 Shared view semantics

- Right pane displays live stream from session manager.
- Left pane tools read same stream tail/events.
- No separate hidden tool terminal.

## 2.4 Interrupt semantics

- If terminal pane focused:
  - `Ctrl+C` sends `SIGINT` to terminal foreground process.
  - App does not exit.
- If terminal pane not focused:
  - existing global app behavior remains.

## 2.5 Exec result framing

`/term run` and `TerminalExecTool` use marker framing with command ids and structured results:

- `exitCode`
- `stdout`
- `stderr`
- `interleaved` (boolean)
- `tail` (fallback when framing incomplete)

This is required for reliable Claude assistance while humans also use the terminal.

## 3) TUI Layout Design (Left Claude, Right Terminal)

## 3.1 Layout principles

- Claude pane remains primary and unchanged in behavior.
- Terminal pane is isolated container with own focus and scroll state.
- Session lifecycle is independent from pane mount/visibility.

## 3.2 Layout controller

Use a `PaneLayoutController` with:

- right pane width ratio (default ~35%)
- minimums (`leftMinCols`, `rightMinCols`)
- collapse threshold
- `keepMountedRightPane=true` invariant

Collapse behavior:

- if terminal hidden or narrow viewport, right pane view may be hidden
- terminal session must remain running

## 3.3 Focus and key routing

- Focus owner: `left` or `right`.
- `Tab` switches pane focus.
- Key events route only to active pane.
- Right pane consumes terminal keys and stops propagation where needed.

## 3.4 Rendering

- Right pane uses ANSI-capable renderer with scrollback.
- Resize events come from layout controller, forwarded to session manager.
- Header/footer rows are accounted for in PTY row calculations.

## 4) Dedicated `/term` Command Family

Implement `/term` as first-class command surface in Claude pane.

Subcommands:

- `/term run <cmd>`: execute framed command and return structured result.
- `/term send <text>`: send raw input to terminal.
- `/term read [--lines N | --bytes N]`: read tail output.
- `/term status`: health, pid, cwd, buffer stats.
- `/term focus`: focus right pane.
- `/term restart`: restart terminal session.

Permissions:

- `/term run` and `/term send` follow shell permission policy.
- `/term read` is read-only.

Output format for `/term run`:

```json
{
  "exitCode": 0,
  "stdout": "...",
  "stderr": "",
  "interleaved": false
}
```

## 5) Terminal Generality Requirements

## 5.1 What must work

- shells: `zsh`, `bash`, `sh`, `fish` (user-configurable)
- interactive TUIs: `vim`, `less`, `htop`, `top`, build UIs, simulators
- color + Unicode + cursor movement + alternate screen
- standard POSIX job control behavior expected from PTY + shell

## 5.2 Compatibility targets

- TERM default: `xterm-256color`
- optional truecolor support (`COLORTERM=truecolor` where valid)
- preserve user shell init semantics as much as possible

## 5.3 Clarification on terminal emulators

Builtin terminal is itself the terminal emulator surface inside ClaudeChip.
GUI terminal apps such as Ghostty, iTerm2, and Termius are external emulators and are not expected to run inside the pane as GUI apps. Their CLI tools/ssh workflows should still be operable from the builtin terminal shell.

## 6) Security and Policy Boundary

Enforce at `TerminalSessionManager` boundary:

- command authorization hooks
- max command timeout
- optional denylist/allowlist policies
- audit events for tool-originated writes

Never enforce policy only in UI layer.

## 7) Testing Strategy

## 7.1 Protocol tests

- fragmented/combined NDJSON parsing
- malformed message handling
- ping/pong liveness

## 7.2 Session tests

- hide/show pane does not stop terminal
- layout collapse does not stop terminal
- restart on worker crash with backoff

## 7.3 Shared-control tests

- concurrent human input and `/term run`
- interleaving detection
- `Ctrl+C` routes to terminal when focused

## 7.4 Long-run workload tests

- multi-hour chip build/sim session
- sustained output stress (buffer drop metrics)
- repeated resize events under load

## 8) Rollout Plan

Phase 1:

- land manager interface and worker protocol contracts
- adapt existing pane/tools through compatibility layer

Phase 2:

- switch all terminal operations to manager-owned session
- add `/term` command family

Phase 3:

- harden metrics/recovery/concurrency handling
- add soak tests and production toggles

## 9) Acceptance Criteria

System is accepted when all are true:

1. Terminal survives all pane visibility/layout changes.
2. Human and Claude tools act on the same session with attributable writes.
3. `/term run` returns structured results reliably under normal and interleaved use.
4. Terminal supports real interactive workloads comparable to standard terminal usage.
5. Health/restart/metrics provide sufficient operational debugging signal.

