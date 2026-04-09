import { existsSync } from 'fs'
import { readdir, readFile } from 'fs/promises'
import { join } from 'path'
import { getClaudeConfigHomeDir } from '../../utils/envUtils.js'
import type {
  CommandRecord,
  ConceptRecord,
  DocChunk,
  EdaNamespaceSelection,
  FlowPrimitive,
  KnowledgePack,
  KnowledgePackHealth,
  KnowledgePackManifest,
  SourceRef,
} from '../EdaKnowledgeTypes.js'
import {
  deriveSourceAuthorityTag,
  deriveSourceReliabilityTag,
} from '../sourceTags.js'

function resolvePackRoots(): string[] {
  const envRoot = process.env.CLAUDECHIP_EDA_KB_ROOT
  if (envRoot) return [envRoot]

  return [
    join(process.cwd(), 'var', 'eda-kb', 'packs'),
    join(getClaudeConfigHomeDir(), 'eda-kb', 'packs'),
  ]
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T
}

async function readJsonLines<T>(path: string): Promise<T[]> {
  if (!existsSync(path)) return []
  const raw = await readFile(path, 'utf8')
  return raw
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => JSON.parse(line) as T)
}

function versionSort(a: string, b: string): number {
  return a.localeCompare(b, undefined, {
    numeric: true,
    sensitivity: 'base',
  })
}

export class KnowledgePackStore {
  private readonly packCache = new Map<string, KnowledgePack>()
  private readonly roots: string[]

  constructor(roots: string[] = resolvePackRoots()) {
    this.roots = roots
  }

  async getPackHealth(
    selection: EdaNamespaceSelection,
  ): Promise<KnowledgePackHealth> {
    const located = await this.locatePack(selection)
    if (!located) {
      return {
        status: 'missing_pack',
        detail: `No knowledge pack found for ${selection.vendor}/${selection.tool}.`,
        selectedVersion: selection.version,
        availableVersions: [],
      }
    }

    const healthPath = join(located.path, 'health.json')
    if (!existsSync(healthPath)) {
      return {
        status: 'degraded_pack',
        detail: `Pack ${located.path} is missing health.json.`,
        selectedVersion: located.version,
        availableVersions: located.availableVersions,
      }
    }

    const health = await readJson<KnowledgePackHealth>(healthPath)
    return {
      ...health,
      selectedVersion: located.version,
      availableVersions: located.availableVersions,
    }
  }

  async loadPack(selection: EdaNamespaceSelection): Promise<KnowledgePack | null> {
    const located = await this.locatePack(selection)
    if (!located) return null

    const cacheKey = located.path
    const cached = this.packCache.get(cacheKey)
    if (cached) return cached

    const [manifest, commands, concepts, flows, chunks, health] =
      await Promise.all([
        readJson<KnowledgePackManifest>(join(located.path, 'manifest.json')),
        readJsonLines<CommandRecord>(join(located.path, 'commands.jsonl')),
        readJsonLines<ConceptRecord>(join(located.path, 'concepts.jsonl')),
        readJsonLines<FlowPrimitive>(join(located.path, 'flows.jsonl')),
        readJsonLines<DocChunk>(join(located.path, 'chunks.jsonl')),
        this.getPackHealth(selection),
      ])

    const enrichedCommands = commands.map(command => ({
      ...command,
      sourceRefs: this.enrichSourceRefs(command.sourceRefs, manifest),
    }))
    const enrichedConcepts = concepts.map(concept => ({
      ...concept,
      sourceRefs: this.enrichSourceRefs(concept.sourceRefs, manifest),
    }))
    const enrichedFlows = flows.map(flow => ({
      ...flow,
      sourceRefs: this.enrichSourceRefs(flow.sourceRefs, manifest),
    }))
    const enrichedChunks = chunks.map(chunk => ({
      ...chunk,
      sourceRefs: this.enrichSourceRefs(chunk.sourceRefs, manifest),
    }))

    const pack: KnowledgePack = {
      manifest,
      commands: enrichedCommands,
      concepts: enrichedConcepts,
      flows: enrichedFlows,
      chunks: enrichedChunks,
      health,
    }
    this.packCache.set(cacheKey, pack)
    return pack
  }

  private enrichSourceRefs(
    refs: SourceRef[],
    manifest: KnowledgePackManifest,
  ): SourceRef[] {
    return refs.map(ref => {
      const sourceDoc = manifest.sourceDocs.find(doc => doc.docId === ref.docId)
      if (!sourceDoc) {
        return {
          ...ref,
          authorityTag: ref.authorityTag ?? 'unknown',
          reliabilityTag: ref.reliabilityTag ?? 'unverified',
          distributionTag: ref.distributionTag ?? 'unknown',
        }
      }

      return {
        ...ref,
        sourceOrigin: ref.sourceOrigin ?? sourceDoc.sourceOrigin,
        authorityTag:
          ref.authorityTag ?? sourceDoc.authorityTag ?? deriveSourceAuthorityTag(sourceDoc.sourceOrigin),
        reliabilityTag:
          ref.reliabilityTag ??
          sourceDoc.reliabilityTag ??
          deriveSourceReliabilityTag(sourceDoc.sourceOrigin),
        distributionTag: ref.distributionTag ?? sourceDoc.distributionTag ?? 'unknown',
      }
    })
  }

  private async locatePack(
    selection: EdaNamespaceSelection,
  ): Promise<{
    path: string
    version: string
    availableVersions: string[]
  } | null> {
    for (const root of this.roots) {
      const toolRoot = join(root, selection.vendor, selection.tool)
      if (!existsSync(toolRoot)) continue

      const availableVersions = (await readdir(toolRoot, { withFileTypes: true }))
        .filter(entry => entry.isDirectory())
        .map(entry => entry.name)
        .sort(versionSort)

      if (availableVersions.length === 0) continue

      const requestedVersion =
        selection.version && availableVersions.includes(selection.version)
          ? selection.version
          : availableVersions.at(-1)

      if (!requestedVersion) continue

      return {
        path: join(toolRoot, requestedVersion),
        version: requestedVersion,
        availableVersions,
      }
    }

    return null
  }
}
