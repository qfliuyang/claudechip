import type { EdaTool, EdaVendor, FlowPrimitive } from '../EdaKnowledgeTypes.js'
import type { ClassifiedSection } from './SectionClassifier.js'

export function extractFlowPrimitives(
  vendor: EdaVendor,
  tool: EdaTool,
  version: string,
  sections: ClassifiedSection[],
): FlowPrimitive[] {
  return sections
    .filter(section => section.sectionType === 'flow_description')
    .map(section => ({
      id: `${tool}:flow:${section.section.heading}`,
      vendor,
      tool,
      version,
      goal: section.section.heading.trim(),
      preconditions: [],
      steps: section.section.body.split('\n').map(line => line.trim()).filter(Boolean).slice(0, 8),
      template: [],
      expectedOutputs: [],
      followUps: [],
      sourceRefs: [section.section.sourceRef],
    }))
}
