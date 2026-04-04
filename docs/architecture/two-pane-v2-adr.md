# ADR: Two-Pane Runtime V2 (Isolated Fence Compositor)

## Status

Accepted (Phase A started)

## Context

The current two-pane mode still exhibits cross-pane rendering artifacts:

- left prompt/footer appears to drift toward the divider,
- post-input frames can look like a third pane,
- legacy fullscreen/sticky/overlay behavior leaks into two-pane mode.

Incremental fixes have reduced specific symptoms but not removed the root cause: two-pane mode is still coupled to legacy global layout behavior.

## Decision

Introduce a dedicated `TwoPaneRuntimeV2` with hard isolation semantics:

1. The frame is always composed as `LeftFence + Divider + RightFence`.
2. Left and right panes render in local coordinate systems only.
3. Two-pane mode does not use legacy fullscreen sticky/pill/float paths.
4. Input routing is explicit by focus owner (`left` or `right`), never by incidental component behavior.
5. Terminal session lifetime is independent of pane visibility/layout mode.

Single-pane mode remains on the existing path.

## Consequences

Positive:

- deterministic layout boundaries under streaming/input load,
- cleaner architecture for shared human/Claude terminal interaction,
- simpler failure analysis and regression testing.

Tradeoffs:

- temporary duplication while V2 coexists with legacy path,
- migration effort to move left-pane and modal behavior to V2-specific contracts.

## Phase Plan

### Phase A (current)

- Create `TwoPaneRuntimeV2` scaffold component.
- Add feature flag `CLAUDECHIP_TWO_PANE_V2` in REPL routing.
- Keep runtime behavior equivalent to current `TwoPaneLayout` while establishing migration boundary.

### Phase B

- Add explicit geometry and compositor contracts.
- Move right terminal pane to V2-managed render lifecycle and focus arbitration.

### Phase C

- Move left pane render to V2 surface model with strict `scroll band` + `input band` partition.
- Disable legacy fullscreen chrome for V2 path.

### Phase D

- Remove two-pane-specific branching from legacy fullscreen pipeline.

### Phase E

- Flip V2 on by default after real-run layout validation matrix passes.

## Validation Requirements

- Unit: geometry constraints, focus routing, fence clipping.
- Integration: PTY persistence across resize/show/hide/focus changes.
- Real-run tmux captures: `170x44`, `120x40`, `90x40` before and after input while streaming.
- Screenshot diff gates for divider integrity and no-cross-fence rendering.

