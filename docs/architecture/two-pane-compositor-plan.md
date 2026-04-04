# Two-Pane Compositor Plan

## Problem Summary

Current two-pane rendering is vulnerable to cross-pane layout interactions:

- left prompt/footer can visually drift toward the divider under load,
- right terminal output and left pane chrome can appear as a "third pane",
- fullscreen sticky-bottom/overlay logic adds extra positioning complexity.

The root issue is architectural: left and right panes are still influenced by shared layout behavior instead of being rendered as hard-isolated surfaces.

## Design Goal

Treat the screen as **two hard fences concatenated**:

- left pane has local coordinates `[0..leftCols-1]`,
- right pane has local coordinates `[0..rightCols-1]`,
- composition happens once at the frame boundary.

No child component should depend on global terminal coordinates when terminal pane mode is active.

## Proposed Architecture

## 1) Pane Geometry Controller

Single source of truth:

- input: full terminal `columns, rows`, requested split ratio,
- output: `leftCols`, `dividerCols`, `rightCols`, `rows`.

Rules:

- enforce min pane widths,
- collapse to single pane below threshold,
- emit stable geometry change events for resize handling.

## 2) Pane-Local Render Surfaces

Define a pane render contract:

- `renderLeft(localSize) -> leftFrame`,
- `renderRight(localSize) -> rightFrame`.

Each frame is rendered in local pane space only.

Important:

- left pane gets `TerminalSizeContext(leftCols, rows)`,
- right pane gets `TerminalSizeContext(rightCols, rows)`,
- no fullscreen sticky prompt chrome when terminal pane is visible.

## 3) Frame Compositor

For each row:

- `composedRow = leftRow + divider + rightRow`.

Composition guarantees:

- right pane cannot overwrite left pane,
- left pane cannot overrun right pane,
- divider is always exactly one visual boundary.

## 4) Input Arbiter (Shared Control)

Use focus as the only routing key:

- focus `left`: key events go to Claude pane,
- focus `right`: key events go to terminal PTY pane.

No coordinate-based key routing.

Focus transitions:

- `Tab` toggles focused pane,
- explicit commands can set pane focus,
- both panes always visible; only one receives keyboard input.

## 5) Terminal Session Model

Keep current long-lived PTY model:

- one persistent terminal session for human + Claude tools,
- `/term` and terminal tool calls write to same PTY,
- pane visibility/layout changes never restart PTY.

## Migration Plan

## Phase A: Stabilize current two-pane mode

- keep local size providers per pane,
- disable fullscreen sticky/pill overlay path while terminal pane visible,
- enforce explicit width/align constraints on prompt/footer roots.

## Phase B: Introduce compositor runtime

- add `PaneGeometryController`,
- add pane frame interfaces,
- implement row-wise compositor with divider.

## Phase C: Switch terminal-pane mode to compositor path

- terminal-pane mode uses compositor by default,
- keep legacy fullscreen path only for single-pane mode.

## Phase D: Remove legacy coupling

- delete terminal-pane-specific branches from legacy fullscreen sticky code,
- reduce shared layout side effects.

## Validation Strategy

## Required real-run checks (not synthetic-only)

Use `tmux` fixed sizes and capture before/after input:

- `170x44` (wide),
- `120x40` (medium),
- `90x40` (collapse behavior).

Assertions:

- divider remains one boundary line,
- left prompt starts near left edge of left pane (no right drift),
- right shell prompt remains strictly inside right pane,
- typing during streaming does not change pane boundaries.

## Automated tests

- geometry unit tests (split constraints/collapse),
- focus routing tests (left/right key dispatch),
- persistent PTY tests (same session ID across layout changes),
- snapshot tests for composed frame boundaries.

## External References

- Ink repo/docs (terminal React renderer): https://github.com/vadimdemedes/ink
- node-pty API (`spawn`, `write`, `resize`): https://github.com/microsoft/node-pty
- tmux panes model: https://linuxcommand.org/lc3_man_pages/tmux1.html
- notcurses planes (parent-relative surfaces/composition): https://notcurses.com/notcurses_plane.3.html
