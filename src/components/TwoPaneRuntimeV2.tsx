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
import { setTerminalPanelFocused } from '../utils/terminalPanelFocus.js';
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
// Each pane box with borderStyle="round" consumes 2 rows (top + bottom border)
const PANE_BORDER_ROWS = 2;
// Single bottom statusbar row
const STATUSBAR_ROWS = 1;

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

  useInput((input, key, event) => {
    if (!showRightPane) return;
    if (!key.ctrl || input !== 'b') return;
    const next = onCtrlBToggle(focusState);
    setFocusState(next);
    setTerminalPanelFocused(next.owner === 'right');
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
    leftPaneWidth: geometry.leftCols,
    rightPaneWidth: geometry.rightCols,
  };

  // Rows available to pane content after borders and statusbar
  const innerRows = Math.max(1, geometry.rows - PANE_BORDER_ROWS - STATUSBAR_ROWS);

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
            borderStyle="round"
            borderColor={leftActive ? 'success' : undefined}
            borderDimColor={!leftActive}
            borderText={{
              content: leftActive ? '● claudechip' : '○ claudechip',
              position: 'top',
              align: 'start',
              offset: 1,
            }}
            data-testid="left-pane-v2"
          >
            <TerminalSizeContext.Provider value={{ columns: geometry.leftCols - 2, rows: innerRows }}>
              <Box width="100%" height="100%" overflow="hidden">
                {leftPane}
              </Box>
            </TerminalSizeContext.Provider>
          </Box>

          {/* Vertical divider */}
          <Box
            width={geometry.dividerCols}
            height="100%"
            flexShrink={0}
            data-testid="pane-divider-v2"
          >
            <Box width={1} height="100%" borderLeft borderColor={rightActive ? 'success' : 'comment'} borderDimColor={leftActive} />
          </Box>

          {/* Right pane — terminal */}
          <Box
            width={geometry.rightCols}
            height="100%"
            flexShrink={0}
            borderStyle="round"
            borderColor={rightActive ? 'success' : undefined}
            borderDimColor={!rightActive}
            borderText={{
              content: rightActive ? '● terminal' : '○ terminal',
              position: 'top',
              align: 'start',
              offset: 1,
            }}
            data-testid="right-pane-v2"
          >
            <TerminalSizeContext.Provider value={{ columns: geometry.rightCols - 2, rows: innerRows }}>
              <Box width="100%" height="100%" overflow="hidden">
                {React.isValidElement(rightPane)
                  ? React.cloneElement(rightPane as React.ReactElement<any>, {
                      focused: rightActive,
                      onRequestFocus: () => {
                        const next = onCtrlBToggle({ ...focusState, owner: 'left' });
                        setFocusState(next);
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
        data-testid="statusbar-v2"
      >
        <Text dimColor>
          {leftActive ? '● chat' : '○ chat'}
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
