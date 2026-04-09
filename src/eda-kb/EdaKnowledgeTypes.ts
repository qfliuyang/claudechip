import type { TerminalContextSnapshot } from '../terminal/TerminalContext.js'

export type EdaVendor = 'cadence' | 'synopsys' | 'siemens' | 'unknown'

export type EdaTool =
  | 'innovus'
  | 'icc2'
  | 'pt'
  | 'dc'
  | 'genus'
  | 'tempus'
  | 'voltus'
  | 'vcs'
  | 'spyglass'
  | 'custom'

export type EdaMode =
  | 'innovus'
  | 'icc2_shell'
  | 'pt_shell'
  | 'dc_shell'
  | 'genus'
  | 'tempus'
  | 'eda'
  | 'unknown'

export type EdaIntent =
  | 'command_lookup'
  | 'how_to'
  | 'troubleshooting'
  | 'report_interpretation'
  | 'script_synthesis'

export type EdaRetrievalTier = 'hot' | 'warm' | 'slow'

export type SectionType =
  | 'command_synopsis'
  | 'option_table'
  | 'example'
  | 'usage_note'
  | 'warning'
  | 'flow_description'
  | 'report_description'
  | 'prose'

export type SourceOrigin =
  | 'vendor_manual'
  | 'user_uploaded'
  | 'workspace_doc'
  | 'generated_note'
  | 'community_discussion'

export type SourceAuthorityTag =
  | 'official_vendor_document'
  | 'user_provided_document'
  | 'workspace_document'
  | 'generated_note'
  | 'community_discussion'
  | 'unknown'

export type SourceReliabilityTag =
  | 'authoritative'
  | 'user_provided'
  | 'workspace_local'
  | 'generated'
  | 'unverified'

export type SourceDistributionTag =
  | 'official_distribution'
  | 'third_party_mirror'
  | 'third_party_html_mirror'
  | 'workspace_local'
  | 'generated'
  | 'unknown'

export interface ExtractionTrace {
  extractor: string
  strategy: string
  extractedAt: string
  warnings: string[]
  sourceFormat: string
}

export interface SourceRef {
  docId: string
  title: string
  sectionPath: string[]
  page?: number
  anchor?: string
  sourceOrigin?: SourceOrigin
  authorityTag?: SourceAuthorityTag
  reliabilityTag?: SourceReliabilityTag
  distributionTag?: SourceDistributionTag
}

export interface CommandRecord {
  id: string
  vendor: EdaVendor
  tool: EdaTool
  version: string
  mode: EdaMode
  commandName: string
  aliases: string[]
  synopsis: string
  syntax: string[]
  options: Array<{
    name: string
    argumentHint?: string
    description: string
  }>
  examples: string[]
  warnings: string[]
  relatedCommands: string[]
  sourceRefs: SourceRef[]
}

export interface ConceptRecord {
  id: string
  vendor: EdaVendor
  tool: EdaTool
  version: string
  topic: string
  summary: string
  relatedCommands: string[]
  relatedReports: string[]
  relatedFlows: string[]
  sourceRefs: SourceRef[]
}

export interface FlowPrimitive {
  id: string
  vendor: EdaVendor
  tool: EdaTool
  version: string
  goal: string
  preconditions: string[]
  steps: string[]
  template: string[]
  expectedOutputs: string[]
  followUps: string[]
  sourceRefs: SourceRef[]
}

export interface DocChunk {
  id: string
  vendor: EdaVendor
  tool: EdaTool
  version: string
  docType: 'user_guide' | 'command_ref' | 'tutorial' | 'troubleshooting'
  sectionType: SectionType
  headerPath: string[]
  sectionPath: string[]
  text: string
  contextualText: string
  bm25Text: string
  sourceRefs: SourceRef[]
}

export interface SourceDocumentManifest {
  docId: string
  vendor: EdaVendor
  tool: EdaTool
  version: string
  title: string
  path: string
  sourceUri?: string
  format: 'html' | 'md' | 'txt' | 'pdf' | 'pptx'
  docType: 'user_guide' | 'command_ref' | 'tutorial' | 'troubleshooting'
  sha256: string
  extractionMethod: 'rule' | 'llm' | 'hybrid'
  sourceOrigin: SourceOrigin
  authorityTag: SourceAuthorityTag
  reliabilityTag: SourceReliabilityTag
  distributionTag?: SourceDistributionTag
}

export interface KnowledgePackManifest {
  packId: string
  vendor: EdaVendor
  tool: EdaTool
  version: string
  createdAt: string
  embeddingModel: string
  vectorIndexKind: 'sqlite-vec' | 'faiss'
  sourceDocs: SourceDocumentManifest[]
}

export interface KnowledgePackHealth {
  status: 'ready' | 'missing_pack' | 'degraded_pack' | 'loading'
  detail?: string
  commandCount?: number
  conceptCount?: number
  flowCount?: number
  chunkCount?: number
  selectedVersion?: string | null
  availableVersions?: string[]
  warnings?: string[]
}

export interface KnowledgePack {
  manifest: KnowledgePackManifest
  commands: CommandRecord[]
  concepts: ConceptRecord[]
  flows: FlowPrimitive[]
  chunks: DocChunk[]
  health: KnowledgePackHealth
}

export interface IntentClassification {
  primary: EdaIntent
  secondary?: EdaIntent[]
  confidence: number
  reason: string
  strategy: 'rule-only' | 'model-assisted' | 'multi-intent-fallback'
}

export interface EdaNamespaceSelection {
  vendor: EdaVendor
  tool: EdaTool
  version: string | null
  mode: EdaMode
  transport: TerminalContextSnapshot['transport']
  source: 'terminal_mode' | 'query_hint' | 'fallback'
}

export interface EdaKnowledgeRoute {
  shouldRetrieve: boolean
  namespace: EdaNamespaceSelection | null
  intent: IntentClassification | null
  tier: EdaRetrievalTier | null
  reason: string
}

export interface EdaKnowledgeLookupRequest {
  query: string
  terminalContext?: TerminalContextSnapshot
  limit?: number
}

export interface EdaEvidenceBundle {
  vendor: EdaVendor
  tool: EdaTool
  version: string | null
  mode: EdaMode
  intent: EdaIntent
  confidence: number
  commands: CommandRecord[]
  concepts: ConceptRecord[]
  flows: FlowPrimitive[]
  chunks: DocChunk[]
  citations: SourceRef[]
  health: KnowledgePackHealth
}

export interface EdaKnowledgeContext {
  route: EdaKnowledgeRoute
  evidence: EdaEvidenceBundle | null
  promptBlock: string | null
}
