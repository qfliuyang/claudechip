import type { DocChunk, EdaTool, EdaVendor } from '../EdaKnowledgeTypes.js'
import type { ClassifiedSection } from './SectionClassifier.js'

export function buildDocChunks(
  vendor: EdaVendor,
  tool: EdaTool,
  version: string,
  docType: DocChunk['docType'],
  sections: ClassifiedSection[],
): DocChunk[] {
  return sections.map((section, index) => ({
    id: `${tool}:chunk:${index}`,
    vendor,
    tool,
    version,
    docType,
    sectionType: section.sectionType,
    headerPath: [section.section.heading.trim()],
    sectionPath: [section.section.heading.trim()],
    text: section.section.body,
    contextualText: `${tool} ${version} ${section.section.heading}\n${section.section.body}`,
    bm25Text: `${section.section.heading}\n${section.section.body}`,
    sourceRefs: [section.section.sourceRef],
  }))
}
