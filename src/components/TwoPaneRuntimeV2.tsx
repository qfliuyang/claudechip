import React from 'react';
import { Box } from '../ink.js';
import { Text } from '../ink.js';
import { useInput } from '../ink.js';
import { useTerminalSize } from '../hooks/useTerminalSize.js';
import { TerminalSizeContext } from '../ink/components/TerminalSizeContext.js';
import { computeTwoPaneGeometry } from '../layout/PaneGeometryController.js';
import {
  createTwoPaneFocusState,
  onTabFromLeft,
  onTabFromRight,
  withRightPaneVisibility,
} from '../layout/TwoPaneFocusArbiter.js';
import { PaneWidthContext, type TwoPaneLayoutProps } from './TwoPaneLayout.js';
import { isTerminalPanelFocused, setTerminalPanelFocused } from '../utils/terminalPanelFocus.js';

export interface TwoPaneRuntimeV2Props extends TwoPaneLayoutProps {
  /**
   * Phase A scaffold for the isolated two-pane compositor runtime.
   * In this phase, behavior intentionally mirrors TwoPaneLayout while
   * we establish a dedicated runtime boundary and migration toggle.
   */
  enableLegacyCompat?: boolean;
}

const MIN_TWO_PANE_COLUMNS = 100;
const MIN_PANE_COLS = 32;
const BORDER_COLS = 1;
const PANE_HEADER_ROWS = 1;

export function TwoPaneRuntimeV2({
  leftPane,
  rightPane,
  showRightPane,
  rightPaneWidth = 50,
  keepMountedRightPane = true,
}: TwoPaneRuntimeV2Props) {
  const [focusState, setFocusState] = React.useState(() =>
    createTwoPaneFocusState(showRightPane, 'left'),
  );
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

  React.useEffect(() => {
    setFocusState(prev => withRightPaneVisibility(prev, showRightPane));
    if (!showRightPane) setTerminalPanelFocused(false);
  }, [showRightPane]);

  useInput((_, key, event) => {
    if (!showRightPane) return;
    if (!key.tab) return;
    if (isTerminalPanelFocused()) return;
    setFocusState(prev => onTabFromLeft(prev));
    setTerminalPanelFocused(true);
    event.stopImmediatePropagation();
  });

  if (geometry.mode === 'single') {
    return (
      <Box data-testid="two-pane-runtime-v2">
        {leftPane}
        {keepMountedRightPane && (
          <Box width={0} height={0} overflow="hidden" data-testid="right-pane-hidden-v2">
            {rightPane}
          </Box>
        )}
      </Box>
    );
  }

  const paneWidthContext = {
    leftPaneWidth: geometry.leftCols,
    rightPaneWidth: geometry.rightCols,
  };
  const innerRows = Math.max(1, geometry.rows - PANE_HEADER_ROWS);
  const leftActive = focusState.owner === 'left';
  const rightActive = focusState.owner === 'right';

  return (
    <Box
      flexDirection="row"
      width="100%"
      height="100%"
      overflow="hidden"
      data-testid="two-pane-runtime-v2"
    >
      <PaneWidthContext.Provider value={paneWidthContext}>
        <Box
          width={geometry.leftCols}
          height="100%"
          overflow="hidden"
          flexShrink={0}
          data-testid="left-pane-v2"
        >
          <Box
            width="100%"
            height={1}
            borderBottom
            borderColor={leftActive ? 'success' : 'comment'}
            paddingX={2}
            data-testid="left-pane-header-v2"
          >
            <Text bold={leftActive} color={leftActive ? 'success' : 'comment'}>
              {leftActive ? '[ Claude:active ]' : '[ Claude ]'}
            </Text>
          </Box>
          <TerminalSizeContext.Provider value={{ columns: geometry.leftCols, rows: innerRows }}>
            <Box width="100%" height="100%" overflow="hidden" flexShrink={0}>
              {leftPane}
            </Box>
          </TerminalSizeContext.Provider>
        </Box>
        <Box width={geometry.dividerCols} height="100%" justifyContent="center" flexShrink={0} data-testid="pane-divider-v2">
          <Box width={1} height="100%" borderLeft borderColor="comment" />
        </Box>
        <Box
          width={geometry.rightCols}
          height="100%"
          overflow="hidden"
          flexShrink={0}
          data-testid="right-pane-v2"
        >
          <Box
            width="100%"
            height={1}
            borderBottom
            borderColor={rightActive ? 'success' : 'comment'}
            paddingX={2}
            data-testid="right-pane-header-v2"
          >
            <Text bold={rightActive} color={rightActive ? 'success' : 'comment'}>
              {rightActive ? '[ Terminal:active ]' : '[ Terminal ]'}
            </Text>
          </Box>
          <TerminalSizeContext.Provider value={{ columns: geometry.rightCols, rows: innerRows }}>
            <Box width="100%" height="100%" overflow="hidden" flexShrink={0}>
              {React.isValidElement(rightPane) ? React.cloneElement(rightPane as React.ReactElement<any>, {
                focused: focusState.owner === 'right',
                onRequestFocus: () => {
                  setFocusState(prev => onTabFromLeft(prev));
                  setTerminalPanelFocused(true);
                },
                onRequestBlur: () => {
                  setFocusState(prev => onTabFromRight(prev));
                  setTerminalPanelFocused(false);
                },
              }) : rightPane}
            </Box>
          </TerminalSizeContext.Provider>
        </Box>
      </PaneWidthContext.Provider>
    </Box>
  );
}
