import type { TerminalContextSnapshot } from '../terminal/TerminalContext.js'
import { classifyEdaIntent } from './IntentClassifier.js'
import type {
  EdaIntent,
  EdaKnowledgeLookupRequest,
  EdaKnowledgeRoute,
  EdaNamespaceSelection,
  EdaRetrievalTier,
  EdaTool,
  EdaVendor,
} from './EdaKnowledgeTypes.js'

const TOOL_HINTS: Array<{
  tool: EdaTool
  vendor: EdaVendor
  mode: EdaNamespaceSelection['mode']
  patterns: RegExp[]
}> = [
  { tool: 'innovus', vendor: 'cadence', mode: 'innovus', patterns: [/\binnovus\b/i, /\bccopt_design\b/i, /\btimeDesign\b/i] },
  { tool: 'icc2', vendor: 'synopsys', mode: 'icc2_shell', patterns: [/\bicc2\b/i, /\bicc2_shell\b/i, /\bclock_opt\b/i, /\bplace_opt\b/i] },
  { tool: 'pt', vendor: 'synopsys', mode: 'pt_shell', patterns: [/\bpt(?:_shell)?\b/i, /\bprimetime\b/i, /\breport_timing\b/i, /\bcheck_timing\b/i] },
  { tool: 'dc', vendor: 'synopsys', mode: 'dc_shell', patterns: [/\bdc(?:_shell)?\b/i, /\bcompile_ultra\b/i, /\breport_qor\b/i] },
  { tool: 'tempus', vendor: 'cadence', mode: 'tempus', patterns: [/\btempus\b/i, /\breport_timing\b/i, /\btimeDesign\b/i] },
  { tool: 'voltus', vendor: 'cadence', mode: 'eda', patterns: [/\bvoltus\b/i, /\bpower integrity\b/i, /\bir drop\b/i] },
  { tool: 'vcs', vendor: 'synopsys', mode: 'eda', patterns: [/\bvcs\b/i, /\bsimv\b/i, /\bverilog simulator\b/i] },
  { tool: 'spyglass', vendor: 'synopsys', mode: 'eda', patterns: [/\bspyglass\b/i, /\blint\b/i, /\bcdc\b/i] },
]

function tierForIntent(intent: EdaIntent): EdaRetrievalTier {
  switch (intent) {
    case 'command_lookup':
      return 'hot'
    case 'script_synthesis':
      return 'slow'
    case 'how_to':
    case 'troubleshooting':
    case 'report_interpretation':
      return 'warm'
  }
}

function namespaceFromTerminalContext(
  terminalContext: TerminalContextSnapshot | undefined,
): EdaNamespaceSelection | null {
  if (!terminalContext) return null

  switch (terminalContext.mode) {
    case 'innovus':
      return {
        vendor: 'cadence',
        tool: 'innovus',
        version: null,
        mode: 'innovus',
        transport: terminalContext.transport,
        source: 'terminal_mode',
      }
    case 'icc2_shell':
      return {
        vendor: 'synopsys',
        tool: 'icc2',
        version: null,
        mode: 'icc2_shell',
        transport: terminalContext.transport,
        source: 'terminal_mode',
      }
    case 'pt_shell':
      return {
        vendor: 'synopsys',
        tool: 'pt',
        version: null,
        mode: 'pt_shell',
        transport: terminalContext.transport,
        source: 'terminal_mode',
      }
    case 'dc_shell':
      return {
        vendor: 'synopsys',
        tool: 'dc',
        version: null,
        mode: 'dc_shell',
        transport: terminalContext.transport,
        source: 'terminal_mode',
      }
    case 'tempus':
      return {
        vendor: 'cadence',
        tool: 'tempus',
        version: null,
        mode: 'tempus',
        transport: terminalContext.transport,
        source: 'terminal_mode',
      }
    case 'genus':
      return {
        vendor: 'cadence',
        tool: 'genus',
        version: null,
        mode: 'genus',
        transport: terminalContext.transport,
        source: 'terminal_mode',
      }
    default:
      return null
  }
}

function namespaceFromQuery(query: string): EdaNamespaceSelection | null {
  for (const hint of TOOL_HINTS) {
    if (hint.patterns.some(pattern => pattern.test(query))) {
      return {
        vendor: hint.vendor,
        tool: hint.tool,
        version: null,
        mode: hint.mode,
        transport: 'local',
        source: 'query_hint',
      }
    }
  }

  return null
}

export function routeEdaKnowledgeRequest(
  request: EdaKnowledgeLookupRequest,
): EdaKnowledgeRoute {
  const query = request.query.trim()
  if (!query) {
    return {
      shouldRetrieve: false,
      namespace: null,
      intent: null,
      tier: null,
      reason: 'Empty query.',
    }
  }

  const namespace =
    namespaceFromTerminalContext(request.terminalContext) ?? namespaceFromQuery(query)

  if (!namespace) {
    return {
      shouldRetrieve: false,
      namespace: null,
      intent: null,
      tier: null,
      reason: 'No EDA mode or tool hint detected.',
    }
  }

  const intent = classifyEdaIntent(query)
  return {
    shouldRetrieve: true,
    namespace,
    intent,
    tier: tierForIntent(intent.primary),
    reason: `${namespace.tool} namespace selected from ${namespace.source}.`,
  }
}
