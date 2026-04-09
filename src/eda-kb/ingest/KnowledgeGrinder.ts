import { existsSync } from 'fs'
import { readFile } from 'fs/promises'
import { join } from 'path'
import type {
  EdaMode,
  EdaTool,
  KnowledgePackManifest,
  SourceDocumentManifest,
} from '../EdaKnowledgeTypes.js'
import { createSourceDocumentManifest } from './DocManifest.js'
import { buildKnowledgePackFromDocuments } from './PackBuilder.js'
import { writeKnowledgePack } from './PackWriter.js'

function inferModeFromTool(tool: EdaTool): EdaMode {
  switch (tool) {
    case 'innovus':
      return 'innovus'
    case 'icc2':
      return 'icc2_shell'
    case 'pt':
      return 'pt_shell'
    case 'dc':
      return 'dc_shell'
    case 'genus':
      return 'genus'
    case 'tempus':
      return 'tempus'
    default:
      return 'eda'
  }
}

function dedupeSourceDocuments(
  sourceDocs: SourceDocumentManifest[],
): SourceDocumentManifest[] {
  const seen = new Map<string, SourceDocumentManifest>()
  for (const doc of sourceDocs) {
    const normalized = createSourceDocumentManifest(doc)
    const key = `${normalized.docId}:${normalized.sha256}`
    const existing = seen.get(key)
    if (!existing) {
      seen.set(key, normalized)
      continue
    }

    seen.set(key, {
      ...existing,
      ...normalized,
      sourceUri: normalized.sourceUri ?? existing.sourceUri,
      distributionTag:
        normalized.distributionTag !== 'unknown'
          ? normalized.distributionTag
          : existing.distributionTag,
    })
  }
  return [...seen.values()]
}

export function shouldIngestSourceDocument(
  doc: SourceDocumentManifest,
): boolean {
  if (
    doc.sourceOrigin === 'vendor_manual' &&
    doc.distributionTag === 'third_party_html_mirror'
  ) {
    return false
  }

  if (doc.sourceOrigin === 'community_discussion') {
    return false
  }

  return true
}

async function readExistingSourceDocs(
  packRoot: string,
  vendor: string,
  tool: string,
  version: string,
): Promise<SourceDocumentManifest[]> {
  const manifestPath = join(packRoot, vendor, tool, version, 'manifest.json')
  if (!existsSync(manifestPath)) return []
  const manifest = JSON.parse(
    await readFile(manifestPath, 'utf8'),
  ) as KnowledgePackManifest
  return manifest.sourceDocs ?? []
}

function groupSourceDocuments(
  sourceDocs: SourceDocumentManifest[],
): Map<string, SourceDocumentManifest[]> {
  const grouped = new Map<string, SourceDocumentManifest[]>()
  for (const doc of sourceDocs) {
    const key = `${doc.vendor}/${doc.tool}/${doc.version}`
    const current = grouped.get(key) ?? []
    current.push(doc)
    grouped.set(key, current)
  }
  return grouped
}

export async function appendDocumentsToKnowledgeBase(input: {
  sourceDocs: SourceDocumentManifest[]
  packRoot: string
  embeddingModel?: string
  vectorIndexKind?: 'sqlite-vec' | 'faiss'
}): Promise<string[]> {
  const filteredDocs = input.sourceDocs
    .map(createSourceDocumentManifest)
    .filter(shouldIngestSourceDocument)
  const grouped = groupSourceDocuments(filteredDocs)
  const writtenPackDirs: string[] = []

  for (const [key, newDocs] of grouped) {
    const [vendor, tool, version] = key.split('/')
    const existingDocs = await readExistingSourceDocs(
      input.packRoot,
      vendor,
      tool,
      version,
    )
    const mergedDocs = dedupeSourceDocuments([...existingDocs, ...newDocs])
    const pack = await buildKnowledgePackFromDocuments({
      vendor: vendor as SourceDocumentManifest['vendor'],
      tool: tool as EdaTool,
      version,
      mode: inferModeFromTool(tool as EdaTool),
      embeddingModel: input.embeddingModel ?? 'claudechip-eda-grinder-v1',
      vectorIndexKind: input.vectorIndexKind ?? 'sqlite-vec',
      sourceDocs: mergedDocs,
    })
    writtenPackDirs.push(await writeKnowledgePack(input.packRoot, pack))
  }

  return writtenPackDirs
}

export async function appendDocumentsFromManifestFile(input: {
  manifestPath: string
  packRoot: string
  embeddingModel?: string
  vectorIndexKind?: 'sqlite-vec' | 'faiss'
}): Promise<string[]> {
  const lines = (await readFile(input.manifestPath, 'utf8'))
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
  const sourceDocs = lines.map(
    line => JSON.parse(line) as SourceDocumentManifest,
  )
  return appendDocumentsToKnowledgeBase({
    sourceDocs,
    packRoot: input.packRoot,
    embeddingModel: input.embeddingModel,
    vectorIndexKind: input.vectorIndexKind,
  })
}
