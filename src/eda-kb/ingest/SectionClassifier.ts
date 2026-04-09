import type { SectionType } from '../EdaKnowledgeTypes.js'
import type { ParsedDocumentSection } from './DocParser.js'

export interface ClassifiedSection {
  sectionType: SectionType
  confidence: number
  notes?: string
  section: ParsedDocumentSection
}

export function classifySection(section: ParsedDocumentSection): ClassifiedSection {
  const text = `${section.heading}\n${section.body}`

  if (/^\w+[_\w]*\s*$/.test(section.heading) || /\bsyntax\b/i.test(text)) {
    return { sectionType: 'command_synopsis', confidence: 0.92, section }
  }

  if (/\bexample\b/i.test(text)) {
    return { sectionType: 'example', confidence: 0.86, section }
  }

  if (/\bwarning\b|\bnote\b/i.test(text)) {
    return { sectionType: 'warning', confidence: 0.8, section }
  }

  if (/\bflow\b|\bprocedure\b|\bsteps\b/i.test(text)) {
    return { sectionType: 'flow_description', confidence: 0.78, section }
  }

  if (/\breport\b/i.test(text)) {
    return { sectionType: 'report_description', confidence: 0.76, section }
  }

  return {
    sectionType: 'prose',
    confidence: 0.5,
    notes: 'Fallback prose classification.',
    section,
  }
}
