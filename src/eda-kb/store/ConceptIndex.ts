import type { ConceptRecord } from '../EdaKnowledgeTypes.js'

function scoreConcept(concept: ConceptRecord, query: string): number {
  const haystack = [
    concept.topic,
    concept.summary,
    ...concept.relatedCommands,
    ...concept.relatedReports,
    ...concept.relatedFlows,
  ]
    .join(' \n ')
    .toLowerCase()

  let score = 0
  for (const token of query.toLowerCase().split(/\s+/)) {
    if (!token) continue
    if (haystack.includes(token)) score += 0.2
  }
  return Math.min(score, 1)
}

export class ConceptIndex {
  search(concepts: ConceptRecord[], query: string, limit: number): ConceptRecord[] {
    return [...concepts]
      .map(concept => ({ concept, score: scoreConcept(concept, query) }))
      .filter(entry => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(entry => entry.concept)
  }
}
