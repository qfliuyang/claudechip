import type { ConceptRecord, EdaTool, EdaVendor } from '../EdaKnowledgeTypes.js'
import type { ClassifiedSection } from './SectionClassifier.js'

export function extractConceptRecords(
  vendor: EdaVendor,
  tool: EdaTool,
  version: string,
  sections: ClassifiedSection[],
): ConceptRecord[] {
  return sections
    .filter(section => section.sectionType === 'prose' || section.sectionType === 'report_description')
    .slice(0, 50)
    .map(section => ({
      id: `${tool}:concept:${section.section.heading}`,
      vendor,
      tool,
      version,
      topic: section.section.heading.trim(),
      summary: section.section.body.slice(0, 500),
      relatedCommands: [],
      relatedReports: [],
      relatedFlows: [],
      sourceRefs: [section.section.sourceRef],
    }))
}
