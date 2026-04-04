import { Box } from '../ink.js';
import { useTerminalSize } from '../hooks/useTerminalSize.js';
import React, { createContext, useContext } from 'react';

export interface PaneWidthContextValue {
  leftPaneWidth: number;
  rightPaneWidth: number;
}

export const PaneWidthContext = createContext<PaneWidthContextValue | null>(null);

export function usePaneWidth(): PaneWidthContextValue | null {
  return useContext(PaneWidthContext);
}

export interface TwoPaneLayoutProps {
  leftPane: React.ReactNode;
  rightPane: React.ReactNode;
  showRightPane: boolean;
  rightPaneWidth?: number;
}

// Minimum terminal width before collapsing to single pane
const MIN_TWO_PANE_COLUMNS = 60;
// Minimum columns for each pane to be usable
const MIN_PANE_COLS = 12;
// Border separator column count
const BORDER_COLS = 1;

export function TwoPaneLayout({ leftPane, rightPane, showRightPane, rightPaneWidth = 35 }: TwoPaneLayoutProps) {
  const { columns, rows } = useTerminalSize();

  // Collapse to single pane if not enough space or explicitly hidden
  if (!showRightPane || columns < MIN_TWO_PANE_COLUMNS) {
    return <Box data-testid="two-pane-layout">{leftPane}</Box>;
  }

  // Constraint-based width calculation
  // 1. Calculate desired right pane width (default 35%, not 50%)
  const desiredRightCols = Math.floor(columns * (rightPaneWidth / 100));

  // 2. Apply minimum constraints while ensuring we don't exceed total columns
  const maxRightCols = columns - MIN_PANE_COLS - BORDER_COLS;
  const rightCols = Math.max(MIN_PANE_COLS, Math.min(desiredRightCols, maxRightCols));

  // 3. Calculate left pane from remaining space
  let leftCols = columns - rightCols - BORDER_COLS;

  // 4. Final safety clamp - ensure left pane also meets minimum
  if (leftCols < MIN_PANE_COLS) {
    leftCols = MIN_PANE_COLS;
    // Recalculate right pane if left was clamped
    const remainingCols = columns - leftCols - BORDER_COLS;
    if (remainingCols < MIN_PANE_COLS) {
      // Not enough space even with minimums - collapse to single pane
      return <Box data-testid="two-pane-layout">{leftPane}</Box>;
    }
  }

  // 5. Final sanity check
  if (leftCols + BORDER_COLS + rightCols > columns) {
    // Overflow protection - collapse to single pane
    return <Box data-testid="two-pane-layout">{leftPane}</Box>;
  }

  const paneWidthContext: PaneWidthContextValue = { leftPaneWidth: leftCols, rightPaneWidth: rightCols };

  return (
    <Box flexDirection="row" width="100%" height="100%" data-testid="two-pane-layout">
      <PaneWidthContext.Provider value={paneWidthContext}>
        <Box width={leftCols} height="100%" overflow="hidden" data-testid="left-pane">
          {leftPane}
        </Box>
        <Box width={BORDER_COLS} height="100%" borderStyle="single" borderLeft />
        <Box width={rightCols} height="100%" overflow="hidden" data-testid="right-pane">
          {rightPane}
        </Box>
      </PaneWidthContext.Provider>
    </Box>
  );
}
