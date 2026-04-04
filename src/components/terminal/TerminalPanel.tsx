import { Box, Text, useInput } from '../../ink.js';
import { useAppState, useSetAppState } from '../../state/AppState.js';
import { useEffect, useRef, useState } from 'react';
import { terminalWriteRef } from '../../tools/TerminalWriteTool/TerminalWriteTool.js';
import { Ansi } from '../../ink.js';
import ScrollBox, { type ScrollBoxHandle } from '../../ink/components/ScrollBox.js';
import { useTerminalSize } from '../../hooks/useTerminalSize.js';
import { usePaneWidth } from '../TwoPaneLayout.js';
import { setTerminalPanelFocused } from '../../utils/terminalPanelFocus.js';
import {
  getTerminalPanelManager,
  terminalPanelWrite,
} from '../../terminal/adapters/TerminalPanelAdapter.js';

const OUTPUT_BUFFER_CEILING = 64 * 1024;

export interface TerminalPanelProps {
  visible?: boolean;
  focused?: boolean;
  onRequestFocus?: () => void;
  onRequestBlur?: () => void;
}

export function TerminalPanel({
  visible = true,
  focused,
  onRequestFocus,
  onRequestBlur,
}: TerminalPanelProps) {
  const session = useAppState(s => s.terminalSession);
  const setAppState = useSetAppState();
  const [lines, setLines] = useState<string[]>([]);
  const scrollRef = useRef<ScrollBoxHandle>(null);
  const managerRef = useRef(getTerminalPanelManager());
  const { columns, rows } = useTerminalSize();
  const paneWidth = usePaneWidth();
  const [isFocused, setIsFocused] = useState(false);
  const isControlledFocus = focused !== undefined;
  const panelFocused = isControlledFocus ? focused : isFocused;

  const availableCols = paneWidth?.rightPaneWidth ?? columns;
  const availableRows = Math.max(rows - 1, 1);

  useEffect(() => {
    const manager = managerRef.current;
    void manager.ensureStarted();
    const unsubscribe = manager.subscribe(event => {
      if (event.type === 'terminal.output') {
        setAppState(prev => {
          const merged = (prev.terminalSession.outputBuffer + event.data).slice(
            -OUTPUT_BUFFER_CEILING,
          );
          terminalWriteRef.outputBuffer = merged;
          return {
            ...prev,
            terminalSession: {
              ...prev.terminalSession,
              outputBuffer: merged,
              lastOutputAt: Date.now(),
              status: 'running' as const,
            },
          };
        });

        setLines(prevLines => {
          const merged = (prevLines.join('\n') + event.data).slice(
            -OUTPUT_BUFFER_CEILING,
          );
          return merged.split('\n');
        });
        scrollRef.current?.scrollToBottom();
      } else if (event.type === 'terminal.spawned') {
        terminalWriteRef.status = 'running';
        setAppState(prev => ({
          ...prev,
          terminalSession: {
            ...prev.terminalSession,
            ptyPid: event.pid,
            status: 'running' as const,
          },
        }));
      } else if (event.type === 'terminal.exited') {
        terminalWriteRef.status = 'idle';
        setAppState(prev => ({
          ...prev,
          terminalSession: {
            ...prev.terminalSession,
            status: 'idle' as const,
          },
        }));
        setLines(prev => [
          ...prev,
          `[Terminal exited (code: ${event.exitCode}, signal: ${event.signal})]`,
        ]);
      } else if (event.type === 'terminal.health') {
        const status = event.health === 'running' ? 'running' : 'idle';
        terminalWriteRef.status = status;
        setAppState(prev => ({
          ...prev,
          terminalSession: {
            ...prev.terminalSession,
            status,
          },
        }));
      }
    });

    return () => {
      unsubscribe();
      setTerminalPanelFocused(false);
      terminalWriteRef.status = 'idle';
    };
  }, [setAppState]);

  useEffect(() => {
    const manager = managerRef.current;
    manager.resize(Math.max(availableCols, 1), Math.max(availableRows, 1));
  }, [availableCols, availableRows]);

  useEffect(() => {
    if (!visible) {
      setIsFocused(false);
      setTerminalPanelFocused(false);
    }
  }, [visible]);

  useEffect(() => {
    setTerminalPanelFocused(panelFocused);
    return () => {
      setTerminalPanelFocused(false);
    };
  }, [panelFocused]);

  useInput((input, key, event) => {
    if (!panelFocused) return;
    event.stopImmediatePropagation();
    if (key.return) {
      void terminalPanelWrite('\r');
    } else if (key.tab) {
      if (isControlledFocus) {
        onRequestBlur?.();
      } else {
        void terminalPanelWrite('\t');
      }
    } else if (key.backspace || key.delete) {
      void terminalPanelWrite('\x7f');
    } else if (key.escape) {
      void terminalPanelWrite('\x1b');
    } else if (key.upArrow) {
      void terminalPanelWrite('\x1b[A');
    } else if (key.downArrow) {
      void terminalPanelWrite('\x1b[B');
    } else if (key.leftArrow) {
      void terminalPanelWrite('\x1b[D');
    } else if (key.rightArrow) {
      void terminalPanelWrite('\x1b[C');
    } else if (input) {
      void terminalPanelWrite(input);
    }
  }, { allowWhenTerminalPanelFocused: true });

  if (!visible) {
    return null;
  }

  return (
    <Box
      flexDirection="column"
      height="100%"
      width="100%"
      onFocus={() => {
        if (isControlledFocus) {
          onRequestFocus?.();
          return;
        }
        setIsFocused(true);
      }}
      onBlur={() => {
        if (isControlledFocus) return;
        setIsFocused(false);
      }}
      tabIndex={0}
      data-testid="terminal-panel"
    >
      <ScrollBox
        ref={scrollRef}
        stickyScroll
        flexGrow={1}
        flexDirection="column"
        paddingX={0}
        overflowX="hidden"
      >
        {lines.length > 0 ? <Ansi>{lines.join('\n')}</Ansi> : <Text dimColor>Waiting for shell...</Text>}
      </ScrollBox>
      <Box height={1} paddingX={1} borderTop borderColor="comment" data-testid="terminal-status">
        <Text dimColor>
          {panelFocused ? 'tab to switch' : 'tab to focus'} | pid {session.ptyPid ?? '-'} |{' '}
          {session.status}
        </Text>
      </Box>
    </Box>
  );
}
