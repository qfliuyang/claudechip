import React from 'react';
import { Box, Text, useInput } from '../ink.js';
import { useTerminalSize } from '../hooks/useTerminalSize.js';
import { TerminalSizeContext } from '../ink/components/TerminalSizeContext.js';
import { computeTwoPaneGeometry } from '../layout/PaneGeometryController.js';
import {
  createTwoPaneFocusState,
  onCtrlBToggle,
  withRightPaneVisibility,
} from '../layout/TwoPaneFocusArbiter.js';
import { PaneWidthContext, type TwoPaneLayoutProps } from './TwoPaneLayout.js';
import {
  consumeTerminalPanelFocusRequest,
  setTerminalPanelFocused,
} from '../utils/terminalPanelFocus.js';
import { getOriginalCwd, getTotalCostUSD } from '../bootstrap/state.js';
import path from 'path';

export interface TwoPaneRuntimeV2Props extends TwoPaneLayoutProps {
  enableLegacyCompat?: boolean;
  /** Override cwd shown in statusbar (used in tests). Defaults to getOriginalCwd(). */
  statusCwd?: string;
  /** Override cost shown in statusbar (used in tests). Defaults to getTotalCostUSD(). */
  statusCostUSD?: number;
}

const MIN_TWO_PANE_COLUMNS = 100;
const MIN_PANE_COLS = 32;
const BORDER_COLS = 1;
const PANE_HEADER_ROWS = 1;
// Single bottom statusbar row
const STATUSBAR_ROWS = 1;
const LEFT_PANE_ACCENT = 'suggestion' as const;
const RIGHT_PANE_ACCENT = 'background' as const;

export function formatCost(usd: number): string {
  if (usd < 0.01) return '<$0.01';
  return `$${usd.toFixed(2)}`;
}

export function abbreviateCwd(cwd: string): string {
  const home = process.env.HOME ?? '';
  const relative = home && cwd.startsWith(home) ? `~${cwd.slice(home.length)}` : cwd;
  const parts = relative.split(path.sep);
  if (parts.length <= 3) return relative;
  return `…${path.sep}${parts.slice(-2).join(path.sep)}`;
}

export function TwoPaneRuntimeV2({
  leftPane,
  rightPane,
  showRightPane,
  rightPaneWidth = 50,
  keepMountedRightPane = true,
  statusCwd,
  statusCostUSD,
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

  React.useLayoutEffect(() => {
    if (!showRightPane) return;
    if (!consumeTerminalPanelFocusRequest()) return;
    setFocusState(prev => ({ ...prev, owner: 'right' }));
    setTerminalPanelFocused(true);
  });

  useInput((input, key, event) => {
    if (!showRightPane) return;
    if (!key.ctrl || input !== 'b') return;
    setFocusState(prev => {
      const next = onCtrlBToggle(prev);
      setTerminalPanelFocused(next.owner === 'right');
      return next;
    });
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

  const leftActive = focusState.owner === 'left';
  const rightActive = focusState.owner === 'right';

  const paneWidthContext = {
    leftPaneWidth: Math.max(1, geometry.leftCols),
    rightPaneWidth: Math.max(1, geometry.rightCols),
  };

  const innerRows = Math.max(1, geometry.rows - PANE_HEADER_ROWS - STATUSBAR_ROWS);
  const leftInnerCols = Math.max(1, geometry.leftCols);
  const rightInnerCols = Math.max(1, geometry.rightCols);

  // Status bar content
  const cwd = abbreviateCwd(statusCwd ?? getOriginalCwd());
  const cost = formatCost(statusCostUSD ?? getTotalCostUSD());

  return (
    <Box
      flexDirection="column"
      width="100%"
      height="100%"
      overflow="hidden"
      data-testid="two-pane-runtime-v2"
    >
      {/* Main pane row */}
      <Box flexDirection="row" width="100%" flexGrow={1} overflow="hidden">
        <PaneWidthContext.Provider value={paneWidthContext}>
          {/* Left pane — chat */}
          <Box
            width={geometry.leftCols}
            height="100%"
            flexShrink={0}
            opaque
            data-testid="left-pane-v2"
            flexDirection="column"
          >
            <Box height={PANE_HEADER_ROWS} paddingX={1} flexShrink={0} opaque>
              <Text color={LEFT_PANE_ACCENT} dimColor={!leftActive} bold={leftActive}>
                {leftActive ? '●' : '○'} claudechip
              </Text>
            </Box>
            <TerminalSizeContext.Provider value={{ columns: leftInnerCols, rows: innerRows }}>
              <Box
                width={leftInnerCols}
                height={innerRows}
                overflow="hidden"
                opaque
              >
                {leftPane}
              </Box>
            </TerminalSizeContext.Provider>
          </Box>

          {/* Vertical divider */}
          <Box
            width={geometry.dividerCols}
            height="100%"
            flexShrink={0}
            opaque
            data-testid="pane-divider-v2"
            justifyContent="center"
          >
            <Text color={rightActive ? RIGHT_PANE_ACCENT : LEFT_PANE_ACCENT} dimColor={!rightActive && !leftActive}>
              |
            </Text>
          </Box>

          {/* Right pane — terminal */}
          <Box
            width={geometry.rightCols}
            height="100%"
            flexShrink={0}
            opaque
            data-testid="right-pane-v2"
            flexDirection="column"
          >
            <Box height={PANE_HEADER_ROWS} paddingX={1} flexShrink={0} opaque>
              <Text color={RIGHT_PANE_ACCENT} dimColor={!rightActive} bold={rightActive}>
                {rightActive ? '●' : '○'} terminal
              </Text>
            </Box>
            <TerminalSizeContext.Provider value={{ columns: rightInnerCols, rows: innerRows }}>
              <Box
                width={rightInnerCols}
                height={innerRows}
                overflow="hidden"
                opaque
              >
                {React.isValidElement(rightPane)
                  ? React.cloneElement(rightPane as React.ReactElement<any>, {
                      focused: rightActive,
                      onRequestFocus: () => {
                        setFocusState(prev => ({ ...prev, owner: 'right' }));
                        setTerminalPanelFocused(true);
                      },
                      onRequestBlur: () => {
                        setFocusState(prev => ({ ...prev, owner: 'left' }));
                        setTerminalPanelFocused(false);
                      },
                    })
                  : rightPane}
              </Box>
            </TerminalSizeContext.Provider>
          </Box>
        </PaneWidthContext.Provider>
      </Box>

      {/* Bottom statusbar — 1 row, full width */}
      <Box
        width="100%"
        height={STATUSBAR_ROWS}
        flexShrink={0}
        paddingX={1}
        opaque
        data-testid="statusbar-v2"
      >
        <Text dimColor>
          <Text color={LEFT_PANE_ACCENT}>{leftActive ? '●' : '○'} chat</Text>
          {'  '}
          {cwd}
          {'  '}
          {cost}
        </Text>
        <Box flexGrow={1} />
        <Text dimColor>[^B] switch  [^C] interrupt</Text>
      </Box>
    </Box>
  );
}
