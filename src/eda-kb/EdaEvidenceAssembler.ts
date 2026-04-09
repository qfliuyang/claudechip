import type {
  CommandRecord,
  EdaEvidenceBundle,
  SourceRef,
} from './EdaKnowledgeTypes.js'

function dedupeSourceRefs(refs: SourceRef[]): SourceRef[] {
  const seen = new Set<string>()
  const result: SourceRef[] = []
  for (const ref of refs) {
    const key = `${ref.docId}:${ref.sectionPath.join('/')}:${ref.page ?? ''}:${ref.anchor ?? ''}`
    if (seen.has(key)) continue
    seen.add(key)
    result.push(ref)
  }
  return result
}

function summarizeSourceTrust(refs: SourceRef[]): string | null {
  if (refs.length === 0) return null

  const labels = new Set(
    refs.map(ref => `${ref.authorityTag ?? 'unknown'}:${ref.reliabilityTag ?? 'unverified'}`),
  )
  return [...labels].slice(0, 4).join(', ')
}

function summarizeCommand(command: CommandRecord): string {
  const optionPreview = command.options
    .slice(0, 3)
    .map(option => option.name)
    .join(', ')
  const example = command.examples[0]
  return [
    `- \`${command.commandName}\`: ${command.synopsis}`,
    optionPreview ? `  options: ${optionPreview}` : null,
    example ? `  example: \`${example}\`` : null,
  ]
    .filter(Boolean)
    .join('\n')
}

export function createEvidencePromptBlock(
  bundle: EdaEvidenceBundle | null,
): string | null {
  if (!bundle) return null

  const sections: string[] = [
    '# EDA Knowledge Context',
    `- Tool: \`${bundle.tool}\``,
    `- Mode: \`${bundle.mode}\``,
    `- Version: \`${bundle.version ?? 'unknown'}\``,
    `- Intent: \`${bundle.intent}\``,
    `- Confidence: ${bundle.confidence.toFixed(2)}`,
    `- Pack health: \`${bundle.health.status}\`${bundle.health.detail ? ` (${bundle.health.detail})` : ''}`,
    summarizeSourceTrust(bundle.citations)
      ? `- Source trust tags: ${summarizeSourceTrust(bundle.citations)}`
      : null,
  ]
    .filter(Boolean) as string[]

  if (bundle.commands.length > 0) {
    sections.push(
      '',
      '## Command Records',
      ...bundle.commands.slice(0, 3).map(summarizeCommand),
    )
  }

  if (bundle.flows.length > 0) {
    sections.push(
      '',
      '## Flow Primitives',
      ...bundle.flows.slice(0, 2).map(flow =>
        `- ${flow.goal}: ${flow.steps.slice(0, 3).join(' -> ')}`,
      ),
    )
  }

  if (bundle.concepts.length > 0) {
    sections.push(
      '',
      '## Concepts',
      ...bundle.concepts.slice(0, 2).map(concept => `- ${concept.topic}: ${concept.summary}`),
    )
  }

  if (bundle.chunks.length > 0) {
    sections.push(
      '',
      '## Supporting Notes',
      ...bundle.chunks
        .slice(0, 2)
        .map(chunk => `- ${chunk.headerPath.join(' > ') || chunk.sectionPath.join(' > ')}: ${chunk.text.slice(0, 220)}`),
    )
  }

  if (bundle.citations.length > 0) {
    sections.push(
      '',
      '## Source Refs',
      ...bundle.citations.slice(0, 5).map(
        ref =>
          `- [${ref.authorityTag ?? 'unknown'} | ${ref.reliabilityTag ?? 'unverified'}] ${ref.title} :: ${ref.sectionPath.join(' > ')}`,
      ),
    )
  }

  sections.push(
    '',
    '- Use the EDA knowledge context above as the primary grounding for tool-specific answers and generated commands.',
  )

  return sections.join('\n')
}

export function collectEvidenceCitations(bundle: Omit<EdaEvidenceBundle, 'citations'>): SourceRef[] {
  return dedupeSourceRefs([
    ...bundle.commands.flatMap(record => record.sourceRefs),
    ...bundle.flows.flatMap(record => record.sourceRefs),
    ...bundle.concepts.flatMap(record => record.sourceRefs),
    ...bundle.chunks.flatMap(record => record.sourceRefs),
  ])
}
