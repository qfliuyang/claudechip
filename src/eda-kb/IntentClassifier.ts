import type { EdaIntent, IntentClassification } from './EdaKnowledgeTypes.js'

const INTENT_RULES: Array<{
  intent: EdaIntent
  score: number
  patterns: RegExp[]
}> = [
  {
    intent: 'script_synthesis',
    score: 0.9,
    patterns: [
      /\b(generate|write|assemble|create|make)\b.{0,32}\b(script|tcl|flow|sequence)\b/i,
      /\bsmall script\b/i,
      /\bscript for\b/i,
    ],
  },
  {
    intent: 'troubleshooting',
    score: 0.88,
    patterns: [
      /\b(debug|diagnose|fix|why is|why are|issue|problem|latency problem|violation)\b/i,
      /\bhow to debug\b/i,
      /\broot cause\b/i,
    ],
  },
  {
    intent: 'report_interpretation',
    score: 0.86,
    patterns: [
      /\b(explain|interpret|understand|read)\b.{0,32}\b(report|timing|qor|latency|slack)\b/i,
      /\bwhat does\b.{0,24}\breport_/i,
    ],
  },
  {
    intent: 'how_to',
    score: 0.78,
    patterns: [
      /\bhow do i\b/i,
      /\bhow to\b/i,
      /\bbest way\b/i,
      /\bsteps to\b/i,
    ],
  },
  {
    intent: 'command_lookup',
    score: 0.92,
    patterns: [
      /(^|\s)(report_[a-z0-9_]+|check_[a-z0-9_]+|set_[a-z0-9_]+|get_[a-z0-9_]+|ccopt_[a-z0-9_]+|timeDesign|place_opt|clock_opt|route_opt|icc2_shell|pt_shell|innovus)(\s|$)/i,
      /\s-[a-z][\w-]*/i,
      /`[^`]+`/,
    ],
  },
]

function normalizeScores(
  scores: Map<EdaIntent, number>,
): Array<{ intent: EdaIntent; score: number }> {
  return [...scores.entries()]
    .map(([intent, score]) => ({ intent, score: Math.min(1, score) }))
    .sort((a, b) => b.score - a.score)
}

function applyRuleBoosts(query: string, scores: Map<EdaIntent, number>): void {
  const trimmed = query.trim()
  if (!trimmed) return

  if (/^[a-z_][\w]*(\s+-[\w-]+.*)?$/i.test(trimmed)) {
    scores.set(
      'command_lookup',
      Math.max(scores.get('command_lookup') ?? 0, 0.9),
    )
  }

  if (/\b(report|timing|slack|latency|skew|path)\b/i.test(trimmed)) {
    scores.set(
      'report_interpretation',
      Math.max(scores.get('report_interpretation') ?? 0, 0.55),
    )
  }
}

export function classifyEdaIntent(query: string): IntentClassification {
  const scores = new Map<EdaIntent, number>()

  for (const rule of INTENT_RULES) {
    for (const pattern of rule.patterns) {
      if (pattern.test(query)) {
        scores.set(rule.intent, Math.max(scores.get(rule.intent) ?? 0, rule.score))
      }
    }
  }

  applyRuleBoosts(query, scores)

  const ranked = normalizeScores(scores)
  const primary = ranked[0]

  if (!primary) {
    return {
      primary: 'how_to',
      secondary: ['troubleshooting'],
      confidence: 0.4,
      reason: 'No strong rule matched; using broad fallback.',
      strategy: 'multi-intent-fallback',
    }
  }

  const secondary = ranked
    .slice(1)
    .filter(entry => entry.score >= 0.5)
    .map(entry => entry.intent)

  const strategy =
    primary.score >= 0.85
      ? 'rule-only'
      : primary.score >= 0.5
        ? 'model-assisted'
        : 'multi-intent-fallback'

  return {
    primary: primary.intent,
    secondary: secondary.length > 0 ? secondary : undefined,
    confidence: primary.score,
    reason: `Matched intent heuristics for ${primary.intent}.`,
    strategy,
  }
}
