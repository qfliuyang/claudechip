import type { EdaMode, EdaTool, EdaVendor, KnowledgePack, KnowledgePackManifest, SourceDocumentManifest } from '../EdaKnowledgeTypes.js'
import { extractCommandRecords } from './CommandExtractor.js'
import { buildDocChunks } from './ChunkContextBuilder.js'
import { extractConceptRecords } from './ConceptExtractor.js'
import { createSourceDocumentManifest } from './DocManifest.js'
import { parseDocument } from './DocParser.js'
import { extractFlowPrimitives } from './FlowPrimitiveExtractor.js'
import { classifySection } from './SectionClassifier.js'

export async function buildKnowledgePackFromDocuments(input: {
  vendor: EdaVendor
  tool: EdaTool
  version: string
  mode: EdaMode
  embeddingModel: string
  vectorIndexKind: 'sqlite-vec' | 'faiss'
  sourceDocs: SourceDocumentManifest[]
}): Promise<KnowledgePack> {
  const sourceDocs = input.sourceDocs.map(createSourceDocumentManifest)
  const parsedDocs = await Promise.all(sourceDocs.map(parseDocument))
  const classifiedSections = parsedDocs.flatMap(doc =>
    doc.sections.map(section => classifySection(section)),
  )

  const manifest: KnowledgePackManifest = {
    packId: `${input.vendor}-${input.tool}-${input.version}`,
    vendor: input.vendor,
    tool: input.tool,
    version: input.version,
    createdAt: new Date().toISOString(),
    embeddingModel: input.embeddingModel,
    vectorIndexKind: input.vectorIndexKind,
    sourceDocs,
  }

  const commands = extractCommandRecords(
    input.vendor,
    input.tool,
    input.version,
    input.mode,
    classifiedSections,
  )
  const concepts = extractConceptRecords(
    input.vendor,
    input.tool,
    input.version,
    classifiedSections,
  )
  const flows = extractFlowPrimitives(
    input.vendor,
    input.tool,
    input.version,
    classifiedSections,
  )
  const chunks = buildDocChunks(
    input.vendor,
    input.tool,
    input.version,
    sourceDocs[0]?.docType ?? 'user_guide',
    classifiedSections,
  )

  return {
    manifest,
    commands,
    concepts,
    flows,
    chunks,
    health: {
      status: 'ready',
      commandCount: commands.length,
      conceptCount: concepts.length,
      flowCount: flows.length,
      chunkCount: chunks.length,
      selectedVersion: input.version,
      availableVersions: [input.version],
      warnings: [],
    },
  }
}
