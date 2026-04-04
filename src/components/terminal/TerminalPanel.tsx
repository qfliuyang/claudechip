import { Box, Text, useInput, useFocus } from '../../ink.js';
import { useAppState, useSetAppState } from '../../state/AppState.js';
import { useEffect, useRef, useState } from 'react';
import { createTerminalPty } from '../../utils/terminalPty.js';
import { terminalWriteRef } from '../../tools/TerminalWriteTool/TerminalWriteTool.js';
import type { IPty } from 'node-pty';
import { Ansi } from '../../ink.js';
import ScrollBox, { type ScrollBoxHandle } from '../../ink/components/ScrollBox.js';
import { useTerminalSize } from '../../hooks/useTerminalSize.js';
import { usePaneWidth } from '../TwoPaneLayout.js';

const MAX_LINES = 500;
const OUTPUT_BUFFER_CEILING = 64 * 1024;
const MAX_RESPAWNS = 10;

export function TerminalPanel() {
  const session = useAppState(s => s.terminalSession);
  const setAppState = useSetAppState();
  const ptyRef = useRef<IPty | null>(null);
  const respawnCountRef = useRef(0);
  const unmountingRef = useRef(false);
  const [lines, setLines] = useState<string[]>(['Terminal initialized']);
  const scrollRef = useRef<ScrollBoxHandle>(null);
  const { columns, rows } = useTerminalSize();
  const paneWidth = usePaneWidth();

  // Use pane width if available, otherwise fall back to terminal size
  const availableCols = paneWidth?.rightPaneWidth ?? columns;
  const availableRows = rows;

  // Add focus management
  const { isFocused } = useFocus({ autoFocus: false });

  // Spawn PTY only once on mount
  useEffect(() => {
    // Detect available shell
    const shell = process.env.SHELL || '/bin/bash';

    // Prevent double-spawn in React StrictMode
    if (ptyRef.current) {
      return;
    }

    const spawnPty = () => {
      if (unmountingRef.current) return;
      if (respawnCountRef.current >= MAX_RESPAWNS) {
        setLines(prev => [...prev, 'Max respawns reached. Terminal is idle.']);
        terminalWriteRef.status = 'idle';
        setAppState(prev => ({
          ...prev,
          terminalSession: {
            ...prev.terminalSession,
            status: 'idle' as const,
            ptyPid: null,
          },
        }));
        return;
      }

      // Ensure minimum viable terminal size
      const cols = Math.max(availableCols, 20);
      const rows = Math.max(availableRows, 10);

      // Don't spawn if dimensions are invalid - wait for layout to stabilize
      if (cols <= 0 || rows <= 0 || availableCols === undefined) {
        setLines(prev => [...prev, `[Waiting for valid terminal dimensions (current: ${availableCols}x${availableRows})...]`]);
        setTimeout(spawnPty, 200);
        return;
      }

      respawnCountRef.current += 1;
      setLines(prev => [...prev, `[Starting terminal: ${shell} (${cols}x${rows})...]`]);

      try {
        const pty = createTerminalPty(shell, session.cwd, cols, rows);
        ptyRef.current = pty;

        terminalWriteRef.write = (data: string) => {
          if (ptyRef.current) {
            ptyRef.current.write(data);
          }
        };
        terminalWriteRef.status = 'running';

        setAppState(prev => ({
          ...prev,
          terminalSession: {
            ...prev.terminalSession,
            ptyPid: pty.pid ?? null,
            status: 'running' as const,
          },
        }));

        const onData = (data: string) => {
          setAppState(prev => {
            const buffer = prev.terminalSession.outputBuffer + data;
            const trimmed = buffer.length > OUTPUT_BUFFER_CEILING
              ? buffer.slice(buffer.length - OUTPUT_BUFFER_CEILING)
              : buffer;
            terminalWriteRef.outputBuffer = trimmed;
            return {
              ...prev,
              terminalSession: {
                ...prev.terminalSession,
                outputBuffer: trimmed,
                lastOutputAt: Date.now(),
              },
            };
          });

          setLines(prevLines => {
            const next = [...prevLines, ...data.split(/\r?\n/).filter(l => l.length > 0)];
            if (next.length > MAX_LINES) return next.slice(next.length - MAX_LINES);
            return next;
          });

          scrollRef.current?.scrollToBottom();
        };

        pty.onData(onData);

        pty.on('spawned', (pid: number) => {
          setAppState(prev => ({
            ...prev,
            terminalSession: {
              ...prev.terminalSession,
              ptyPid: pid,
            },
          }));
        });

        pty.onExit(({ exitCode, signal }) => {
          if (unmountingRef.current) return;
          terminalWriteRef.status = 'idle';
          setAppState(prev => ({
            ...prev,
            terminalSession: {
              ...prev.terminalSession,
              status: 'idle' as const,
            },
          }));
          setLines(prevLines => [...prevLines, `[Terminal exited (code: ${exitCode}, signal: ${signal})]`]);
          // Respawn after a delay
          setTimeout(spawnPty, 500);
        });
      } catch (err) {
        setLines(prev => [...prev, `[Failed to start terminal: ${err}]`]);
        setAppState(prev => ({
          ...prev,
          terminalSession: { ...prev.terminalSession, status: 'error' as const },
        }));
      }
    };

    spawnPty();

    return () => {
      unmountingRef.current = true;
      terminalWriteRef.write = () => {};
      terminalWriteRef.status = 'idle';
      terminalWriteRef.outputBuffer = '';
      const pty = ptyRef.current;
      ptyRef.current = null;
      if (pty) {
        try { pty.kill(); } catch {}
      }
    };
    // Only spawn on mount - cwd changes shouldn't respawn the terminal
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (ptyRef.current) {
      ptyRef.current.resize(Math.max(availableCols, 1), Math.max(availableRows, 1));
    }
  }, [availableCols, availableRows]);

  // Only handle input when focused
  useInput((input, key) => {
    if (!isFocused || !ptyRef.current) return;
    if (key.return) {
      ptyRef.current.write('\r');
    } else if (key.tab) {
      ptyRef.current.write('\t');
    } else if (key.backspace || key.delete) {
      ptyRef.current.write('\x7f');
    } else if (key.escape) {
      ptyRef.current.write('\x1b');
    } else if (key.upArrow) {
      ptyRef.current.write('\x1b[A');
    } else if (key.downArrow) {
      ptyRef.current.write('\x1b[B');
    } else if (key.leftArrow) {
      ptyRef.current.write('\x1b[D');
    } else if (key.rightArrow) {
      ptyRef.current.write('\x1b[C');
    } else if (input) {
      ptyRef.current.write(input);
    }
  });

  return (
    <Box
      flexDirection="column"
      height="100%"
      width="100%"
      borderStyle={isFocused ? "double" : "single"}
      borderColor={isFocused ? "green" : undefined}
      data-testid="terminal-panel"
    >
      <Box height={1} paddingX={1}>
        <Text bold color={isFocused ? "green" : undefined}>
          {isFocused ? "● Terminal (FOCUSED)" : "○ Terminal"}
        </Text>
      </Box>
      <ScrollBox ref={scrollRef} stickyScroll flexGrow={1} flexDirection="column" paddingX={1} overflowX="hidden">
        {lines.map((line, i) => (
          <Ansi key={i}>{line}</Ansi>
        ))}
      </ScrollBox>
      <Box height={1} paddingX={1} data-testid="terminal-status">
        <Text dimColor>
          PID: {session.ptyPid ?? '-'} | CWD: {session.cwd} | {session.status}
        </Text>
      </Box>
    </Box>
  );
}
