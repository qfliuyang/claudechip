import type { FlowPrimitive } from '../EdaKnowledgeTypes.js'

function scoreFlow(flow: FlowPrimitive, query: string): number {
  const haystack = [
    flow.goal,
    ...flow.preconditions,
    ...flow.steps,
    ...flow.template,
    ...flow.expectedOutputs,
    ...flow.followUps,
  ]
    .join(' \n ')
    .toLowerCase()

  let score = 0
  for (const token of query.toLowerCase().split(/\s+/)) {
    if (!token) continue
    if (haystack.includes(token)) score += 0.18
  }
  return Math.min(score, 1)
}

export class FlowIndex {
  search(flows: FlowPrimitive[], query: string, limit: number): FlowPrimitive[] {
    return [...flows]
      .map(flow => ({ flow, score: scoreFlow(flow, query) }))
      .filter(entry => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(entry => entry.flow)
  }
}
