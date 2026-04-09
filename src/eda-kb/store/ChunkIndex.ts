import type { DocChunk } from '../EdaKnowledgeTypes.js'

function scoreChunk(chunk: DocChunk, query: string): number {
  const haystack = [chunk.text, chunk.contextualText, chunk.bm25Text]
    .join(' \n ')
    .toLowerCase()

  let score = 0
  for (const token of query.toLowerCase().split(/\s+/)) {
    if (!token) continue
    if (haystack.includes(token)) score += 0.14
  }
  return Math.min(score, 1)
}

export class ChunkIndex {
  search(chunks: DocChunk[], query: string, limit: number): DocChunk[] {
    return [...chunks]
      .map(chunk => ({ chunk, score: scoreChunk(chunk, query) }))
      .filter(entry => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(entry => entry.chunk)
  }
}
