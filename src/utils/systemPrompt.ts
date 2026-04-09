// SKIPPED: import { feature } from 'bun:bundle'; - causes hang
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from '../services/analytics/index.js'
import type { ToolUseContext } from '../Tool.js'
import type { EdaKnowledgeContext } from '../eda-kb/EdaKnowledgeTypes.js'
import type { TerminalContextSnapshot } from '../terminal/TerminalContext.js'
import type { AgentDefinition } from '../tools/AgentTool/loadAgentsDir.js'
import { isBuiltInAgent } from '../tools/AgentTool/loadAgentsDir.js'
import { isEnvTruthy } from './envUtils.js'
import { asSystemPrompt, type SystemPrompt } from './systemPromptType.js'

export { asSystemPrompt, type SystemPrompt } from './systemPromptType.js'

// Dead code elimination: conditional import for proactive mode.
// Same pattern as prompts.ts — lazy require to avoid pulling the module
// into non-proactive builds.
/* eslint-disable @typescript-eslint/no-require-imports */
const proactiveModule =
  false || false
    ? (require('../proactive/index.js') as typeof import('../proactive/index.js'))
    : null
/* eslint-enable @typescript-eslint/no-require-imports */

function isProactiveActive_SAFE_TO_CALL_ANYWHERE(): boolean {
  return proactiveModule?.isProactiveActive() ?? false
}

/**
 * Builds the effective system prompt array based on priority:
 * 0. Override system prompt (if set, e.g., via loop mode - REPLACES all other prompts)
 * 1. Coordinator system prompt (if coordinator mode is active)
 * 2. Agent system prompt (if mainThreadAgentDefinition is set)
 *    - In proactive mode: agent prompt is APPENDED to default (agent adds domain
 *      instructions on top of the autonomous agent prompt, like teammates do)
 *    - Otherwise: agent prompt REPLACES default
 * 3. Custom system prompt (if specified via --system-prompt)
 * 4. Default system prompt (the standard Claude Code prompt)
 *
 * Plus appendSystemPrompt is always added at the end if specified (except when override is set).
 */
export function buildEffectiveSystemPrompt({
  mainThreadAgentDefinition,
  toolUseContext,
  customSystemPrompt,
  defaultSystemPrompt,
  appendSystemPrompt,
  terminalContext,
  edaKnowledgeContext,
  overrideSystemPrompt,
}: {
  mainThreadAgentDefinition: AgentDefinition | undefined
  toolUseContext: Pick<ToolUseContext, 'options'>
  customSystemPrompt: string | undefined
  defaultSystemPrompt: string[]
  appendSystemPrompt: string | undefined
  terminalContext?: TerminalContextSnapshot
  edaKnowledgeContext?: EdaKnowledgeContext | null
  overrideSystemPrompt?: string | null
}): SystemPrompt {
  if (overrideSystemPrompt) {
    return asSystemPrompt([overrideSystemPrompt])
  }
  // Coordinator mode: use coordinator prompt instead of default
  // Use inline env check instead of coordinatorModule to avoid circular
  // dependency issues during test module loading.
  if (
    false &&
    isEnvTruthy(process.env.CLAUDE_CODE_COORDINATOR_MODE) &&
    !mainThreadAgentDefinition
  ) {
    // Lazy require to avoid circular dependency at module load time
    const { getCoordinatorSystemPrompt } =
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('../coordinator/coordinatorMode.js') as typeof import('../coordinator/coordinatorMode.js')
    return asSystemPrompt([
      getCoordinatorSystemPrompt(),
      ...(appendSystemPrompt ? [appendSystemPrompt] : []),
    ])
  }

  const agentSystemPrompt = mainThreadAgentDefinition
    ? isBuiltInAgent(mainThreadAgentDefinition)
      ? mainThreadAgentDefinition.getSystemPrompt({
          toolUseContext: { options: toolUseContext.options },
        })
      : mainThreadAgentDefinition.getSystemPrompt()
    : undefined

  // Log agent memory loaded event for main loop agents
  if (mainThreadAgentDefinition?.memory) {
    logEvent('tengu_agent_memory_loaded', {
      ...(process.env.USER_TYPE === 'ant' && {
        agent_type:
          mainThreadAgentDefinition.agentType as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      }),
      scope:
        mainThreadAgentDefinition.memory as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      source:
        'main-thread' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    })
  }

  // In proactive mode, agent instructions are appended to the default prompt
  // rather than replacing it. The proactive default prompt is already lean
  // (autonomous agent identity + memory + env + proactive section), and agents
  // add domain-specific behavior on top — same pattern as teammates.
  if (
    agentSystemPrompt &&
    (false || false) &&
    isProactiveActive_SAFE_TO_CALL_ANYWHERE()
  ) {
    return asSystemPrompt([
      ...defaultSystemPrompt,
      ...(buildTerminalModeSystemPrompt(terminalContext) ?? []),
      ...(buildEdaKnowledgeSystemPrompt(edaKnowledgeContext) ?? []),
      `\n# Custom Agent Instructions\n${agentSystemPrompt}`,
      ...(appendSystemPrompt ? [appendSystemPrompt] : []),
    ])
  }

  return asSystemPrompt([
    ...(agentSystemPrompt
      ? [agentSystemPrompt]
      : customSystemPrompt
        ? [customSystemPrompt]
        : defaultSystemPrompt),
    ...(buildTerminalModeSystemPrompt(terminalContext) ?? []),
    ...(buildEdaKnowledgeSystemPrompt(edaKnowledgeContext) ?? []),
    ...(appendSystemPrompt ? [appendSystemPrompt] : []),
  ])
}

function buildTerminalModeSystemPrompt(
  terminalContext: TerminalContextSnapshot | undefined,
): string[] | null {
  if (!terminalContext) return null

  const meaningfulMode =
    terminalContext.mode !== 'shell' ||
    terminalContext.transport !== 'local' ||
    terminalContext.app !== 'shell' ||
    terminalContext.host !== null

  if (!meaningfulMode) return null

  const hostLine =
    terminalContext.transport === 'ssh'
      ? `- The right terminal pane is currently attached to a remote session${terminalContext.host ? ` on host \`${terminalContext.host}\`` : ''}.`
      : '- The right terminal pane is currently local.'

  const promptLine = terminalContext.promptReady
    ? '- The terminal appears ready for another command.'
    : '- The terminal does not appear to be sitting at a normal shell prompt right now.'

  const recentCommandLine = terminalContext.recentCommand
    ? `- The most recent committed terminal command was: \`${terminalContext.recentCommand}\``
    : null

  const modeGuidance =
    terminalContext.mode === 'innovus'
      ? [
          '- The user is currently working inside Innovus or a closely related EDA shell.',
          '- Prefer Innovus/Tcl-aware reasoning when the user asks about timing, CTS, routing, reports, or debug in the right pane.',
          '- If suggesting `/term` actions, generate commands that make sense inside Innovus, not ordinary shell commands, unless you explicitly tell the user to exit back to the shell.',
        ]
      : terminalContext.mode === 'icc2_shell'
        ? [
            '- The user is currently working inside Synopsys ICC2 shell.',
            '- Prefer ICC2 Tcl commands, reporting patterns, and physical-design debugging workflows rather than generic shell advice.',
            '- If suggesting `/term` actions, generate commands that make sense inside `icc2_shell`.',
          ]
        : terminalContext.mode === 'pt_shell'
          ? [
              '- The user is currently working inside Synopsys PrimeTime shell.',
              '- Prefer timing-analysis and report-debug reasoning in PrimeTime Tcl terms rather than generic shell advice.',
              '- If suggesting `/term` actions, generate commands that make sense inside `pt_shell`.',
            ]
        : terminalContext.mode === 'tempus'
          ? [
              '- The user is currently working inside Cadence Tempus.',
              '- Prefer static-timing-analysis reasoning, report inspection, and Tempus-native command suggestions instead of generic shell advice.',
              '- If suggesting `/term` actions, generate commands that make sense inside Tempus.',
            ]
      : terminalContext.mode === 'vim'
        ? [
            '- The right pane is currently in vim-like editor mode.',
            '- Avoid assuming shell command injection is safe; if suggesting `/term` actions, be explicit that the pane is in an editor and command bytes may affect the buffer.',
          ]
        : terminalContext.mode === 'tmux'
          ? [
              '- The right pane is currently inside tmux.',
              '- Assume the user may be interacting with panes, sessions, or nested shells rather than a bare shell.',
            ]
          : terminalContext.mode === 'ssh'
            ? [
                '- The right pane is currently an SSH-backed shell.',
                '- When discussing files, logs, or tools, assume they may live on the remote machine rather than the local workspace.',
              ]
            : terminalContext.mode === 'eda'
              ? [
                  '- The right pane appears to be inside an EDA tool shell rather than a plain Unix shell.',
                ]
              : [
                  `- The right pane terminal mode is currently classified as \`${terminalContext.mode}\`.`,
                ]

  return [
    [
      '# Right Pane Terminal Context',
      `- Current classified mode: \`${terminalContext.mode}\``,
      `- Context summary: ${terminalContext.summary}`,
      hostLine,
      promptLine,
      recentCommandLine,
      ...modeGuidance,
      '- Adapt your reasoning and any `/term` command suggestions to this terminal mode automatically.',
    ]
      .filter(Boolean)
      .join('\n'),
  ]
}

function buildEdaKnowledgeSystemPrompt(
  edaKnowledgeContext: EdaKnowledgeContext | null | undefined,
): string[] | null {
  if (!edaKnowledgeContext?.promptBlock) return null
  return [edaKnowledgeContext.promptBlock]
}
