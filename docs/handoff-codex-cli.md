# Codex CLI Handoff

## Repository State

- Local branch: `main`
- Local HEAD: `2caad5ed2af0d777d96a9783a10bd354165bfaac`
- Remote `origin/main`: `2caad5ed2af0d777d96a9783a10bd354165bfaac`
- Status: local `main` matches latest `origin/main`

## Current Outcome

- Two-pane frame geometry is stable.
- Pane content and input behavior are still broken under real dual-pane interaction.

## Reproduced Issues (Real tmux E2E)

- Left pane transcript text becomes shredded/interleaved after alternating input between panes.
- Right pane terminal shows first-character duplication:
  - `echo RIGHT_ONE` appears as `eecho RIGHT_ONE`
  - `pwd` appears as `ppwd`
  - `echo RIGHT_TWO` appears as `eecho RIGHT_TWO`

Evidence capture:

- `/tmp/claudechip_e2e_dual.txt`

## Files Currently Modified (Uncommitted)

- `src/commands/term/term.tsx`
- `src/components/FullscreenLayout.tsx`
- `src/components/Messages.tsx`
- `src/components/MessageResponse.tsx`
- `src/components/ScrollKeybindingHandler.tsx`
- `src/components/TwoPaneRuntimeV2.tsx`
- `src/components/messages/UserLocalCommandOutputMessage.tsx`
- `src/components/terminal/TerminalPanel.tsx`
- `src/utils/terminalPanelFocus.ts`

## Likely Remaining Root Causes

- Input event arbitration between left and right panes (duplicate keystroke path into terminal).
- Left transcript rendering pipeline under two-pane constraints (likely stale render/row composition around command/system messages).
- Possible wrapper interaction under constrained layout (`MessageResponse` / `Ratchet` / `OffscreenFreeze`).

## Minimal Next Debug Path

1. Instrument terminal write path and input dispatch to find duplication source.
   - `src/components/terminal/TerminalPanel.tsx`
   - `src/ink/hooks/use-input.ts`
   - `src/components/ScrollKeybindingHandler.tsx`
   - `src/screens/REPL.tsx`

2. Isolate left-pane shredding with minimal message set in two-pane mode.
   - command + local command output + API error blocks
   - trace: `Messages -> MessageRow -> Message -> UserTextMessage / UserCommandMessage / UserLocalCommandOutputMessage`

3. Keep real tmux E2E as release gate.
   - alternate typing left/right
   - verify: no interleave + no double chars
   - for scripted text, use literal tmux send: `tmux send-keys -l`

