# Right Pane Terminal Control Verification

## Goal

Verify that the right pane behaves like a real shared terminal:

- terminal output renders with normal shell semantics
- human input controls the shared PTY directly
- Claude `/term` and terminal tools control the same PTY
- interleaving is detected instead of silently corrupting tool results

## Automated Checks

Run these targeted suites:

```sh
bun test tests/terminalSurface.test.ts tests/terminalPanelControl.test.ts tests/terminalSharedSession.test.ts
```

Coverage:

- `tests/terminalSurface.test.ts`
  - carriage return overwrites current line
  - `CSI K` clears trailing content
  - cursor movement rewrites visible cells
  - alternate screen does not destroy main buffer
- `tests/terminalPanelControl.test.ts`
  - right-pane human keymap emits terminal actions
  - pane escape (`Ctrl+B`) stays in focus-routing path
  - terminal control keys map to PTY input or signals
- `tests/terminalSharedSession.test.ts`
  - human and tool writes land in one long-lived session
  - manager emits distinct `human` and `tool` write events
  - `/term run` reports `interleaved=true` when human input contaminates a run
  - session PID stays stable across resize and repeated `ensureStarted`
  - `/term` command family controls the integrated terminal

## Manual Gate

Run the app in a real terminal multiplexer session:

```sh
bun run dev
```

Use tmux literal sends for deterministic repro:

```sh
tmux send-keys -t <pane> -l 'echo LEFT_ONE'
tmux send-keys -t <pane> Enter
tmux send-keys -t <pane> C-b
tmux send-keys -t <pane> -l 'echo RIGHT_ONE'
tmux send-keys -t <pane> Enter
tmux send-keys -t <pane> C-b
tmux send-keys -t <pane> -l 'pwd'
tmux send-keys -t <pane> Enter
```

Pass criteria:

- right pane does not duplicate first characters (`eecho`, `ppwd`)
- left pane transcript stays readable after repeated focus switches
- arrow keys, backspace, tab, `Ctrl+C`, and `Ctrl+Z` behave like a normal shell session
- commands typed by the human are visible to `/term read`
- `/term run` against a busy shared pane either succeeds cleanly or reports interleaving

## Nice-to-Have Follow-Up

The current renderer is a pragmatic terminal surface, not a full VT emulator. If we need better app compatibility for `vim`, `less`, or richer full-screen TUIs, the next verification tier should add snapshot-based tests for:

- save/restore cursor edge cases
- more erase modes
- scroll regions
- styled cell state instead of plain text lines
