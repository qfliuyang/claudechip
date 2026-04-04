# Two-Pane Runtime V2 Implementation Checklist

## Phase A: Runtime Boundary (In Progress)

- [x] Add `TwoPaneRuntimeV2` scaffold component.
- [x] Add `CLAUDECHIP_TWO_PANE_V2` feature-flag switch in REPL.
- [x] Keep behavior backward-compatible while creating migration boundary.
- [x] Add focused unit test for feature-flag routing path.

## Phase B: Geometry + Compositor Contracts

- [x] Define `PaneGeometry` contract (`leftCols/rightCols/dividerCols/rows`).
- [x] Define pane surface contract (`renderLeft`, `renderRight`).
- [x] Implement row-wise compositor contract and clipping tests.
- [x] Add collapse behavior contract for narrow terminals.

## Phase C: Left/Right Isolation Runtime

- [x] Move right terminal pane lifecycle ownership fully into V2.
- [x] Add explicit focus arbiter (`left`/`right`) with key routing tests.
- [x] Enforce left pane vertical partition (`scroll band` + `input band`).
- [x] Remove sticky/pill/bottomFloat from V2 path.
- [x] Keep modal behavior local and bounded to left pane.

## Phase D: Shared Terminal Control Robustness

- [x] Assert PTY identity stable across pane visibility toggles.
- [x] Assert PTY identity stable across resize events.
- [x] Verify `/term run` + human typing interleaving behavior in V2 path.
- [x] Verify terminal focus transitions (`Tab`, `/term focus`) are deterministic.

## Phase E: Validation + Rollout

- [x] Real-run tmux validation at `170x44`, `120x40`, `90x40`.
- [x] Capture before/after screenshots during input and streaming.
- [ ] Add regression snapshots for divider integrity and no third-pane artifact.
- [x] Flip V2 default on.
- [ ] Remove legacy two-pane fallback path after bake period.

## Gate Criteria for Default Enablement

- [ ] No cross-pane artifact in the full tmux matrix.
- [ ] Left prompt/input never visually overlaps right pane.
- [ ] Right terminal output never appears in left fence.
- [ ] Existing `/term` tests and shared session tests remain green.
