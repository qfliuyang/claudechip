import { createEvidencePromptBlock, collectEvidenceCitations } from './EdaEvidenceAssembler.js'
import { routeEdaKnowledgeRequest } from './EdaKnowledgeRouter.js'
import { traceEdaKnowledgeLookup } from './EdaKnowledgeTrace.js'
import { ChunkIndex } from './store/ChunkIndex.js'
import { CommandCatalogIndex } from './store/CommandCatalogIndex.js'
import { ConceptIndex } from './store/ConceptIndex.js'
import { FlowIndex } from './store/FlowIndex.js'
import { KnowledgePackStore } from './store/KnowledgePackStore.js'
import type {
  EdaEvidenceBundle,
  EdaKnowledgeContext,
  EdaKnowledgeLookupRequest,
} from './EdaKnowledgeTypes.js'

export class EdaKnowledgeGateway {
  private readonly store: KnowledgePackStore
  private readonly commands = new CommandCatalogIndex()
  private readonly concepts = new ConceptIndex()
  private readonly flows = new FlowIndex()
  private readonly chunks = new ChunkIndex()

  constructor(store = new KnowledgePackStore()) {
    this.store = store
  }

  async lookup(request: EdaKnowledgeLookupRequest): Promise<EdaKnowledgeContext> {
    const route = routeEdaKnowledgeRequest(request)
    if (!route.shouldRetrieve || !route.namespace || !route.intent) {
      const context = {
        route,
        evidence: null,
        promptBlock: null,
      }
      traceEdaKnowledgeLookup(request, context)
      return context
    }

    const pack = await this.store.loadPack(route.namespace)
    const health = await this.store.getPackHealth(route.namespace)

    if (!pack) {
      const evidence: EdaEvidenceBundle = {
        vendor: route.namespace.vendor,
        tool: route.namespace.tool,
        version: route.namespace.version,
        mode: route.namespace.mode,
        intent: route.intent.primary,
        confidence: route.intent.confidence,
        commands: [],
        concepts: [],
        flows: [],
        chunks: [],
        citations: [],
        health,
      }
      const context = {
        route,
        evidence,
        promptBlock: createEvidencePromptBlock(evidence),
      }
      traceEdaKnowledgeLookup(request, context)
      return context
    }

    const limit = request.limit ?? 3
    const intentSet = new Set([
      route.intent.primary,
      ...(route.intent.secondary ?? []),
    ])

    const evidenceBase = {
      vendor: pack.manifest.vendor,
      tool: pack.manifest.tool,
      version: pack.manifest.version,
      mode: route.namespace.mode,
      intent: route.intent.primary,
      confidence: route.intent.confidence,
      commands:
        intentSet.has('command_lookup') || intentSet.has('script_synthesis')
          ? this.commands.search(pack.commands, request.query, limit)
          : this.commands.search(pack.commands, request.query, Math.min(limit, 2)),
      concepts:
        intentSet.has('how_to') ||
        intentSet.has('troubleshooting') ||
        intentSet.has('report_interpretation')
          ? this.concepts.search(pack.concepts, request.query, Math.min(limit, 2))
          : [],
      flows:
        intentSet.has('script_synthesis') || intentSet.has('troubleshooting')
          ? this.flows.search(pack.flows, request.query, Math.min(limit, 2))
          : [],
      chunks:
        route.tier !== 'hot' || intentSet.has('troubleshooting') || intentSet.has('report_interpretation')
          ? this.chunks.search(pack.chunks, request.query, Math.min(limit, 2))
          : [],
      health,
    }

    const evidence: EdaEvidenceBundle = {
      ...evidenceBase,
      citations: collectEvidenceCitations(evidenceBase),
    }

    const context = {
      route,
      evidence,
      promptBlock: createEvidencePromptBlock(evidence),
    }
    traceEdaKnowledgeLookup(request, context)
    return context
  }
}

export const defaultEdaKnowledgeGateway = new EdaKnowledgeGateway()
