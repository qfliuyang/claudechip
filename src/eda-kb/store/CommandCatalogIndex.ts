import type { CommandRecord } from '../EdaKnowledgeTypes.js'

function scoreCommand(command: CommandRecord, query: string): number {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) return 0

  const name = command.commandName.toLowerCase()
  if (name === normalizedQuery) return 1
  if (command.aliases.some(alias => alias.toLowerCase() === normalizedQuery)) {
    return 0.96
  }
  if (name.startsWith(normalizedQuery)) return 0.9
  if (command.aliases.some(alias => alias.toLowerCase().startsWith(normalizedQuery))) {
    return 0.86
  }

  let score = 0
  const haystack = [
    command.commandName,
    ...command.aliases,
    command.synopsis,
    ...command.syntax,
    ...command.examples,
    ...command.warnings,
    ...command.options.map(option => `${option.name} ${option.description}`),
  ]
    .join(' \n ')
    .toLowerCase()

  for (const token of normalizedQuery.split(/\s+/)) {
    if (!token) continue
    if (haystack.includes(token)) score += 0.18
  }

  return Math.min(score, 0.84)
}

export class CommandCatalogIndex {
  search(commands: CommandRecord[], query: string, limit: number): CommandRecord[] {
    return [...commands]
      .map(command => ({ command, score: scoreCommand(command, query) }))
      .filter(entry => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(entry => entry.command)
  }
}
