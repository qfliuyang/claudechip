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
import { truncateToWidth } from '../utils/truncate.js';
import { stringWidth } from '../ink/stringWidth.js';

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
const PANE_HEADER_ROWS = 3;

function buildTopBorderLine(width: number, title: string): string {
  if (width <= 2) return ' '.repeat(Math.max(0, width));
  const innerWidth = width - 2;
  const titleToken = ` ${title} `;
  const clampedTitle = truncateToWidth(titleToken, innerWidth);
  const trailing = Math.max(0, innerWidth - stringWidth(clampedTitle));
  return `╭${clampedTitle}${'─'.repeat(trailing)}╮`;
}

function buildMiddleLine(width: number, left: string, right: string): string {
  if (width <= 2) return ' '.repeat(Math.max(0, width));
  const innerWidth = width - 2;
  const rightClamped = truncateToWidth(right, Math.max(0, Math.min(20, innerWidth)));
  const rightWidth = stringWidth(rightClamped);
  const leftBudget = Math.max(0, innerWidth - rightWidth - 1);
  const leftClamped = truncateToWidth(left, leftBudget);
  const leftWidth = stringWidth(leftClamped);
  const spacer = Math.max(1, innerWidth - leftWidth - rightWidth);
  return `│${leftClamped}${' '.repeat(spacer)}${rightClamped}│`;
}

function buildBottomBorderLine(width: number): string {
  if (width <= 2) return ' '.repeat(Math.max(0, width));
  return `╰${'─'.repeat(width - 2)}╯`;
}

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
  const dividerColor = rightActive ? 'success' : 'comment';
  const leftTop = buildTopBorderLine(geometry.leftCols, '[o-o-o] CLAUDECHIP CONTROL');
  const leftStatus = buildMiddleLine(
    geometry.leftCols,
    leftActive ? '[L:ACTIVE] wafer-map online' : '[L:IDLE] wafer-map standby',
    '[TAB→TERM]',
  );
  const leftBottom = buildBottomBorderLine(geometry.leftCols);
  const rightTop = buildTopBorderLine(geometry.rightCols, 'TERMINAL FABRIC');
  const rightStatus = buildMiddleLine(
    geometry.rightCols,
    rightActive ? '[R:ACTIVE] shared tty attached' : '[R:IDLE] shared tty ready',
    rightActive ? '[TAB→CHAT]' : '[TAB FOCUS]',
  );
  const rightBottom = buildBottomBorderLine(geometry.rightCols);

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
            height={3}
            paddingX={0}
            flexDirection="column"
            data-testid="left-pane-header-v2"
          >
            <Text color={leftActive ? 'success' : 'comment'}>{leftTop}</Text>
            <Text color={leftActive ? 'success' : 'comment'}>{leftStatus}</Text>
            <Text color={leftActive ? 'success' : 'comment'}>{leftBottom}</Text>
          </Box>
          <TerminalSizeContext.Provider value={{ columns: geometry.leftCols, rows: innerRows }}>
            <Box width="100%" height="100%" overflow="hidden" flexShrink={0}>
              {leftPane}
            </Box>
          </TerminalSizeContext.Provider>
        </Box>
        <Box width={geometry.dividerCols} height="100%" justifyContent="center" flexShrink={0} data-testid="pane-divider-v2">
          <Box width={1} height="100%" borderLeft borderColor={dividerColor} />
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
            height={3}
            paddingX={0}
            flexDirection="column"
            data-testid="right-pane-header-v2"
          >
            <Text color={rightActive ? 'success' : 'comment'}>{rightTop}</Text>
            <Text color={rightActive ? 'success' : 'comment'}>{rightStatus}</Text>
            <Text color={rightActive ? 'success' : 'comment'}>{rightBottom}</Text>
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
