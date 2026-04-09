import type { CommandRecord, EdaMode, EdaTool, EdaVendor } from '../EdaKnowledgeTypes.js'
import type { ClassifiedSection } from './SectionClassifier.js'

export function extractCommandRecords(
  vendor: EdaVendor,
  tool: EdaTool,
  version: string,
  mode: EdaMode,
  sections: ClassifiedSection[],
): CommandRecord[] {
  return sections
    .filter(section => section.sectionType === 'command_synopsis')
    .map(section => ({
      id: `${tool}:${section.section.heading}`,
      vendor,
      tool,
      version,
      mode,
      commandName: section.section.heading.trim(),
      aliases: [],
      synopsis: section.section.body.split('\n')[0] ?? '',
      syntax: [],
      options: [],
      examples: [],
      warnings: [],
      relatedCommands: [],
      sourceRefs: [section.section.sourceRef],
    }))
}
