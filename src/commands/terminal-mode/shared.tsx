import type { LocalJSXCommandCall } from '../../types/command.js';
import {
  terminalToolReadTail,
  terminalToolSignal,
  terminalToolStatus,
  terminalToolWrite,
} from '../../terminal/adapters/TerminalToolsAdapter.js';
import { requestTerminalPanelFocus } from '../../utils/terminalPanelFocus.js';
import type { TerminalMode } from '../../terminal/TerminalContext.js';

type TerminalClassifierProfile = {
  literalPrefixes: string[];
  literalKeywords: string[];
  naturalLanguageMarkers?: string[];
};

const DEFAULT_NATURAL_LANGUAGE_MARKERS = [
  'please ',
  'how do i',
  'how to ',
  'help me ',
  'show me ',
  'kill all process',
  'with name ',
  'called ',
  'debug ',
  'find ',
  'what is ',
  'why is ',
  'i want ',
  'i need ',
  'generate ',
  'can you ',
];

export const TERMINAL_MODE_COMMAND_HINTS: Record<TerminalMode, TerminalClassifierProfile> = {
  shell: {
    literalPrefixes: [
      'cd', 'ls', 'pwd', 'echo', 'cat', 'grep', 'rg', 'find', 'git', 'ssh', 'tmux',
      'vim', 'nvim', 'vi', 'make', 'python', 'python3', 'bash', 'zsh', 'source',
      'export', 'set', 'unset', 'pkill', 'kill', 'ps', 'top', 'less', 'tail', 'head',
    ],
    literalKeywords: ['|', '&&', '||', ';', '>', '<', '$(', '${', './', '../'],
  },
  ssh: {
    literalPrefixes: [
      'cd', 'ls', 'pwd', 'echo', 'cat', 'grep', 'rg', 'find', 'git', 'tmux',
      'vim', 'nvim', 'vi', 'make', 'python', 'python3', 'bash', 'zsh', 'source',
      'export', 'set', 'unset', 'pkill', 'kill', 'ps', 'top', 'less', 'tail', 'head',
      'scp', 'rsync', 'ssh',
    ],
    literalKeywords: ['|', '&&', '||', ';', '>', '<', '$(', '${', './', '../'],
  },
  tmux: {
    literalPrefixes: [
      'tmux', 'ls', 'pwd', 'cd', 'vim', 'nvim', 'vi', 'ssh', 'cat', 'grep', 'rg',
      'make', 'python', 'python3',
    ],
    literalKeywords: ['split-window', 'new-window', 'select-pane', 'attach-session'],
  },
  vim: {
    literalPrefixes: [':q', ':qa', ':w', ':wq', ':x', ':set', ':e', ':w!', ':help', '/'],
    literalKeywords: ['hjkl', 'gg', 'G', 'dd', 'yy', ':%s/'],
    naturalLanguageMarkers: ['how do i', 'how to ', 'what does ', 'explain ', 'why is '],
  },
  innovus: {
    literalPrefixes: [
      'report_timing', 'report_clock_tree', 'report_clock_timing', 'set_propagated_clock',
      'timeDesign', 'optDesign', 'place_opt_design', 'ccopt_design', 'ccopt_check_prerequisites',
      'get_db', 'dbGet', 'report_ccopt', 'create_ccopt_clock_tree_spec', 'source',
    ],
    literalKeywords: ['-from', '-to', '-through', '-group', '-path_type', '-late', '-early'],
  },
  icc2_shell: {
    literalPrefixes: [
      'report_timing', 'report_clock_tree', 'report_qor', 'report_constraint', 'get_cells',
      'get_pins', 'get_nets', 'set_app_var', 'set_propagated_clock', 'place_opt',
      'route_opt', 'clock_opt', 'source',
    ],
    literalKeywords: ['-from', '-to', '-through', '-max_paths', '-delay_type', '-nosplit'],
  },
  pt_shell: {
    literalPrefixes: [
      'report_timing', 'report_constraints', 'report_analysis_coverage', 'check_timing',
      'get_timing_paths', 'get_cells', 'get_pins', 'read_sdc', 'read_verilog',
      'set_propagated_clock', 'update_timing', 'source',
    ],
    literalKeywords: ['-from', '-to', '-through', '-delay_type', '-max_paths', '-nworst'],
  },
  eda: {
    literalPrefixes: [
      'report_timing', 'report_qor', 'get_cells', 'get_pins', 'get_nets', 'source',
    ],
    literalKeywords: ['-from', '-to', '-through', '-max_paths'],
  },
  unknown: {
    literalPrefixes: [],
    literalKeywords: ['|', '&&', '||', ';', '>', '<'],
  },
};

function extractNumericFlag(tokens: string[], name: '--lines' | '--bytes'): number | undefined {
  const idx = tokens.indexOf(name);
  if (idx === -1) return undefined;
  const value = tokens[idx + 1];
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function describeMismatch(expectedMode: TerminalMode, actualMode: TerminalMode): string {
  if (expectedMode === actualMode) return '';
  return ` Current detected terminal mode is \`${actualMode}\`, but /${expectedMode} will still send bytes through the shared PTY.`;
}

export function createTerminalModeCommand(
  mode: TerminalMode,
  displayName = mode,
): LocalJSXCommandCall {
  return async (onDone, context, args) => {
    const text = (args ?? '').trim();
    const tokens = text ? text.split(/\s+/) : [];
    const [subcommand, ...restTokens] = tokens;
    const rest = restTokens.join(' ').trim();
    const status = await terminalToolStatus();

    const focusPane = () => {
      context.setAppState(prev => ({
        ...prev,
        terminalPanelVisible: true,
      }));
      requestTerminalPanelFocus();
    };

    if (!text) {
      onDone(
        [
          `/${displayName} targets the shared right-pane terminal with ${displayName}-aware intent.`,
          `Current terminal context: ${status.context.summary}.${describeMismatch(mode, status.context.mode)}`,
          'Usage:',
          `  /${displayName} <command>`,
          `  /${displayName} send <text>`,
          `  /${displayName} read [--lines N] [--bytes N]`,
          `  /${displayName} focus`,
          `  /${displayName} interrupt`,
          `  /${displayName} status`,
        ].join('\n'),
        { display: 'system' },
      );
      return null;
    }

    if (subcommand === 'focus') {
      focusPane();
      onDone(`Focused right-pane terminal for /${displayName}.`, { display: 'system' });
      return null;
    }

    if (subcommand === 'status') {
      onDone(JSON.stringify(status, null, 2), { display: 'system' });
      return null;
    }

    if (subcommand === 'interrupt') {
      await terminalToolSignal('sigint');
      onDone(`Sent SIGINT through /${displayName}.`, { display: 'system' });
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

    if (subcommand === 'send') {
      if (!rest) {
        onDone(`Usage: /${displayName} send <text>`, { display: 'system' });
        return null;
      }
      focusPane();
      await terminalToolWrite(rest);
      onDone(
        `Sent raw terminal input via /${displayName} (${status.context.summary}).${describeMismatch(mode, status.context.mode)}`,
        { display: 'system' },
      );
      return null;
    }

    if (classifyTerminalRequest(text, status.context.mode || mode) === 'natural_language') {
      onDone(
        `Interpreting /${displayName} input as a terminal task for ${status.context.summary}.`,
        {
          display: 'system',
          shouldQuery: true,
          metaMessages: [
            buildTerminalGenerationMetaPrompt({
              commandName: displayName,
              requestedMode: mode,
              status,
              userRequest: text,
            }),
          ],
        },
      );
      return null;
    }

    focusPane();
    await terminalToolWrite(`${text}\n`);
    onDone(
      `Sent /${displayName} command to terminal (${status.context.summary}): ${text}.${describeMismatch(mode, status.context.mode)}`,
      { display: 'system' },
    );
    return null;
  };
}

export type TerminalRequestKind = 'literal' | 'natural_language';

export function classifyTerminalRequest(
  text: string,
  mode: TerminalMode = 'shell',
): TerminalRequestKind {
  const trimmed = text.trim();
  if (!trimmed) return 'literal';
  const lower = trimmed.toLowerCase();

  const profile = TERMINAL_MODE_COMMAND_HINTS[mode] ?? TERMINAL_MODE_COMMAND_HINTS.unknown;
  const head = lower.split(/\s+/)[0] ?? '';

  const explicitNaturalLanguageMarkers = [
    ...DEFAULT_NATURAL_LANGUAGE_MARKERS,
    ...(profile.naturalLanguageMarkers ?? []),
  ];

  if (explicitNaturalLanguageMarkers.some(marker => lower.includes(marker))) {
    return 'natural_language';
  }

  if (
    /[|&;<>()`$]/.test(trimmed) ||
    /^(?:\.{1,2}\/|\/|~\/)/.test(trimmed) ||
    /^[A-Z_][A-Z0-9_]*=/.test(trimmed)
  ) {
    return 'literal';
  }

  if (profile.literalPrefixes.includes(head)) {
    return 'literal';
  }

  if (profile.literalKeywords.some(marker => lower.includes(marker))) {
    return 'literal';
  }

  const tokens = trimmed.split(/\s+/).filter(Boolean);
  if (tokens.length >= 6 && !/[=*]/.test(trimmed)) {
    return 'natural_language';
  }

  return 'literal';
}

export function buildTerminalGenerationMetaPrompt({
  commandName,
  requestedMode,
  status,
  userRequest,
}: {
  commandName: string;
  requestedMode?: TerminalMode;
  status: Awaited<ReturnType<typeof terminalToolStatus>>;
  userRequest: string;
}): string {
  const requestedModeLine = requestedMode
    ? `- The slash command used by the user was \`/${commandName}\`, which implies intended terminal mode \`${requestedMode}\`.`
    : `- The slash command used by the user was \`/${commandName}\`.`

  return [
    '<terminal-task-request>',
    'The user entered a natural-language terminal request instead of a literal command line.',
    'Interpret it as a request to operate the shared right-pane terminal using the terminal tools.',
    requestedModeLine,
    `- Current terminal context summary: ${status.context.summary}`,
    `- Current detected mode: \`${status.context.mode}\``,
    `- Prompt ready: ${status.context.promptReady ? 'yes' : 'no'}`,
    status.context.recentCommand
      ? `- Most recent committed terminal command: \`${status.context.recentCommand}\``
      : '- No recent committed terminal command is known.',
    '- Prefer reading terminal state first when the request depends on current context.',
    '- Use TerminalWriteTool for interactive input to the shared terminal pane.',
    '- Use TerminalBashTool only when a bounded exec-style command is appropriate for the current mode.',
    '- If the terminal appears to be in vim or another unsafe editor-like state, do not blindly inject disruptive bytes. Explain the risk and ask before doing so.',
    '- If the mode is an EDA shell such as innovus, icc2_shell, or pt_shell, generate tool-native commands rather than generic Unix shell commands.',
    '- If you can safely generate the command, execute it instead of merely describing it.',
    `User terminal task: ${userRequest}`,
    '</terminal-task-request>',
  ].join('\n');
}
