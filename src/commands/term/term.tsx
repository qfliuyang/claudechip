import type { LocalJSXCommandCall } from '../../types/command.js';
import {
  terminalToolExec,
  terminalToolReadTail,
  terminalToolRestart,
  terminalToolSignal,
  terminalToolStatus,
  terminalToolWrite,
} from '../../terminal/adapters/TerminalToolsAdapter.js';

const HELP_TEXT = [
  'Usage:',
  '  /term run <command>',
  '  /term send <text>',
  '  /term read [--lines N] [--bytes N]',
  '  /term status',
  '  /term focus',
  '  /term restart',
  '  /term interrupt',
  '  /term <command>  (compatibility alias of /term send <command>)',
].join('\n');

export const call: LocalJSXCommandCall = async (onDone, context, args) => {
  const text = (args ?? '').trim();
  if (!text) {
    onDone(HELP_TEXT, { display: 'system' });
    return null;
  }

  const [subcommand, ...restTokens] = text.split(/\s+/);
  const rest = restTokens.join(' ').trim();

  try {
    if (subcommand === 'run') {
      if (!rest) {
        onDone('Usage: /term run <command>', { display: 'system' });
        return null;
      }
      const result = await terminalToolExec(rest);
      onDone(JSON.stringify(result, null, 2), { display: 'system' });
      return null;
    }

    if (subcommand === 'send') {
      if (!rest) {
        onDone('Usage: /term send <text>', { display: 'system' });
        return null;
      }
      await terminalToolWrite(rest);
      onDone(`Sent to terminal: ${rest}`, { display: 'system' });
      return null;
    }

    if (subcommand === 'read') {
      const lines = extractNumericFlag(restTokens, '--lines');
      const bytes = extractNumericFlag(restTokens, '--bytes');
      const output = await terminalToolReadTail({
        ...(lines !== undefined ? { lines } : {}),
        ...(bytes !== undefined ? { bytes } : {}),
      });
      onDone(output || '(no terminal output yet)', { display: 'system' });
      return null;
    }

    if (subcommand === 'status') {
      const status = await terminalToolStatus();
      onDone(JSON.stringify(status, null, 2), { display: 'system' });
      return null;
    }

    if (subcommand === 'focus') {
      context.setAppState(prev => ({
        ...prev,
        terminalPanelVisible: true,
      }));
      onDone('Terminal pane is visible. Press Tab to move focus to terminal.', {
        display: 'system',
      });
      return null;
    }

    if (subcommand === 'restart') {
      await terminalToolRestart('/term restart');
      onDone('Terminal session restarted.', { display: 'system' });
      return null;
    }

    if (subcommand === 'interrupt') {
      await terminalToolSignal('sigint');
      onDone('Sent SIGINT to terminal foreground process.', {
        display: 'system',
      });
      return null;
    }

    // Backward-compatible shorthand: /term <command>
    await terminalToolWrite(`${text}\n`);
    onDone(`Sent to terminal: ${text}`, { display: 'system' });
    return null;
  } catch (error) {
    onDone(
      `Terminal command failed: ${error instanceof Error ? error.message : String(error)}`,
      { display: 'system' },
    );
    return null;
  }
};

function extractNumericFlag(tokens: string[], name: '--lines' | '--bytes'): number | undefined {
  const idx = tokens.indexOf(name);
  if (idx === -1) return undefined;
  const value = tokens[idx + 1];
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

