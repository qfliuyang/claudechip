import { Box } from '../ink.js';
import { useTerminalSize } from '../hooks/useTerminalSize.js';
import React, { createContext, useContext } from 'react';
import { TerminalSizeContext } from '../ink/components/TerminalSizeContext.js';
import { computeTwoPaneGeometry } from '../layout/PaneGeometryController.js';

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
  keepMountedRightPane?: boolean;
}

// Minimum terminal width before collapsing to single pane
const MIN_TWO_PANE_COLUMNS = 80;
// Minimum columns for each pane to be usable
const MIN_PANE_COLS = 32;
// Visual gutter between panes
const BORDER_COLS = 1;

export function TwoPaneLayout({
  leftPane,
  rightPane,
  showRightPane,
  rightPaneWidth = 50,
  keepMountedRightPane = false,
}: TwoPaneLayoutProps) {
  const { columns, rows } = useTerminalSize();
  const geometry = computeTwoPaneGeometry({
    columns,
    rows,
    showRightPane,
    rightPaneWidthPercent: rightPaneWidth,
    minTwoPaneColumns: MIN_TWO_PANE_COLUMNS,
    minPaneCols: MIN_PANE_COLS,
    dividerCols: BORDER_COLS,
  });
  const shouldCollapse = geometry.mode === 'single';

  // Collapse to single pane if not enough space or explicitly hidden
  if (shouldCollapse) {
    return (
      <Box data-testid="two-pane-layout">
        {leftPane}
        {keepMountedRightPane && (
          <Box width={0} height={0} overflow="hidden" data-testid="right-pane-hidden">
            {rightPane}
          </Box>
        )}
      </Box>
    );
  }

  const leftCols = geometry.leftCols;
  const rightCols = geometry.rightCols;
  const dividerCols = geometry.dividerCols;

  const paneWidthContext: PaneWidthContextValue = { leftPaneWidth: leftCols, rightPaneWidth: rightCols };

  return (
    <Box flexDirection="row" width="100%" height="100%" data-testid="two-pane-layout">
      <PaneWidthContext.Provider value={paneWidthContext}>
        <TerminalSizeContext.Provider value={{ columns: leftCols, rows }}>
        <Box width={leftCols} height="100%" overflow="hidden" flexShrink={0} data-testid="left-pane">
          {leftPane}
        </Box>
        </TerminalSizeContext.Provider>
        <Box width={dividerCols} height="100%" justifyContent="center" flexShrink={0} data-testid="pane-divider">
          <Box width={1} height="100%" borderLeft borderColor="comment" />
        </Box>
        <TerminalSizeContext.Provider value={{ columns: rightCols, rows }}>
          <Box width={rightCols} height="100%" overflow="hidden" flexShrink={0} data-testid="right-pane">
            {rightPane}
          </Box>
        </TerminalSizeContext.Provider>
      </PaneWidthContext.Provider>
    </Box>
  );
}
