import { Box, RawAnsi, Text, useInput } from '../../ink.js';
import { useAppState, useSetAppState } from '../../state/AppState.js';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { terminalWriteRef } from '../../tools/TerminalWriteTool/TerminalWriteTool.js';
import ScrollBox, { type ScrollBoxHandle } from '../../ink/components/ScrollBox.js';
import { useTerminalSize } from '../../hooks/useTerminalSize.js';
import { usePaneWidth } from '../TwoPaneLayout.js';
import { setTerminalPanelFocused } from '../../utils/terminalPanelFocus.js';
import {
  getTerminalPanelManager,
  terminalPanelWrite,
} from '../../terminal/adapters/TerminalPanelAdapter.js';
import {
  TerminalSurface,
} from '../../terminal/TerminalSurface.js';
import type { Key } from '../../ink/events/input-event.js';

const OUTPUT_BUFFER_CEILING = 64 * 1024;

/**
 * Strip OSC sequences from PTY output before handing the rest to the headless
 * emulator. OSC title updates are not display content and would otherwise end
 * up in the cell buffer.
 *
 *   - OSC title (drop them):    \x1b]...\x07 or \x1b]...\x1b\\
 */
function stripOscSequences(data: string): string {
  return data.replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '');
}

export type TerminalPanelAction =
  | { type: 'blur' }
  | { type: 'scroll'; delta: number }
  | { type: 'signal'; kind: 'sigint' | 'sigstop' }
  | { type: 'write'; data: string }
  | { type: 'noop' };

export function getTerminalPanelAction(input: string, key: Key): TerminalPanelAction {
  if (key.ctrl && input === 'b') {
    return { type: 'blur' };
  }
  if (key.wheelUp) {
    return { type: 'scroll', delta: -3 };
  }
  if (key.wheelDown) {
    return { type: 'scroll', delta: 3 };
  }
  if (key.ctrl && input === 'c') {
    return { type: 'signal', kind: 'sigint' };
  }
  if (key.ctrl && input === 'd') {
    return { type: 'write', data: '\x04' };
  }
  if (key.ctrl && input === 'z') {
    return { type: 'signal', kind: 'sigstop' };
  }
  if (key.return) {
    return { type: 'write', data: '\r' };
  }
  if (key.tab) {
    return { type: 'write', data: '\t' };
  }
  if (key.backspace || key.delete) {
    return { type: 'write', data: '\x7f' };
  }
  if (key.escape) {
    return { type: 'write', data: '\x1b' };
  }
  if (key.upArrow) {
    return { type: 'write', data: '\x1b[A' };
  }
  if (key.downArrow) {
    return { type: 'write', data: '\x1b[B' };
  }
  if (key.leftArrow) {
    return { type: 'write', data: '\x1b[D' };
  }
  if (key.rightArrow) {
    return { type: 'write', data: '\x1b[C' };
  }
  if (input) {
    return { type: 'write', data: input };
  }
  return { type: 'noop' };
}

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
  const [ansiLines, setAnsiLines] = useState<string[]>(['Waiting for shell...']);
  const scrollRef = useRef<ScrollBoxHandle>(null);
  const managerRef = useRef(getTerminalPanelManager());
  const surfaceRef = useRef(new TerminalSurface(120, 40));
  const { columns, rows } = useTerminalSize();
  const paneWidth = usePaneWidth();
  const [isFocused, setIsFocused] = useState(false);
  const isControlledFocus = focused !== undefined;
  const panelFocused = isControlledFocus ? focused : isFocused;
  const panelFocusedRef = useRef(panelFocused);

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

        const surface = surfaceRef.current;
        const writePromise =
          event.raw.byteLength > 0
            ? surface.writeBytes(event.raw)
            : surface.write(stripOscSequences(event.data));
        void writePromise.then(() => {
          if (surfaceRef.current !== surface) return;
          setAnsiLines(surface.getAnsiLines({ showCursor: panelFocusedRef.current }));
          scrollRef.current?.scrollToBottom();
        });
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
        setAnsiLines(prev => [
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
    surfaceRef.current.resize(Math.max(availableCols, 1), Math.max(availableRows, 1));
    setAnsiLines(surfaceRef.current.getAnsiLines({ showCursor: panelFocused }));
  }, [availableCols, availableRows]);

  useEffect(() => {
    if (!visible) {
      setIsFocused(false);
      setTerminalPanelFocused(false);
    }
  }, [visible]);

  useLayoutEffect(() => {
    panelFocusedRef.current = panelFocused;
    setTerminalPanelFocused(panelFocused);
  }, [panelFocused]);

  useEffect(() => {
    panelFocusedRef.current = panelFocused;
    setAnsiLines(surfaceRef.current.getAnsiLines({ showCursor: panelFocused }));
  }, [panelFocused]);

  useEffect(() => {
    return () => {
      setTerminalPanelFocused(false);
    };
  }, []);

  useInput((input, key, event) => {
    if (!panelFocused) return;
    event.stopImmediatePropagation();
    const action = getTerminalPanelAction(input, key);
    if (action.type === 'blur') {
      onRequestBlur?.();
    } else if (action.type === 'scroll') {
      scrollRef.current?.scrollBy(action.delta);
    } else if (action.type === 'signal') {
      managerRef.current.signal(action.kind);
    } else if (action.type === 'write') {
      void terminalPanelWrite(action.data);
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
      opaque
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
        {ansiLines.length > 0 ? (
          <RawAnsi lines={ansiLines} width={Math.max(availableCols, 1)} />
        ) : <Text dimColor>Waiting for shell...</Text>}
      </ScrollBox>
      <Box height={1} paddingX={1} borderTop borderColor="comment" data-testid="terminal-status">
        <Text dimColor wrap="truncate">
          {panelFocused
            ? `tty:active | pid:${session.ptyPid ?? '-'} | ${session.status}`
            : `tty:idle | press Ctrl+B to focus terminal | pid:${session.ptyPid ?? '-'} | ${session.status}`}
        </Text>
      </Box>
    </Box>
  );
}
