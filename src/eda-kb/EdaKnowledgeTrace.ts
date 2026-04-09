import { isEnvTruthy } from '../utils/envUtils.js'
import { logForDebugging } from '../utils/debug.js'
import type {
  CommandRecord,
  ConceptRecord,
  DocChunk,
  EdaKnowledgeContext,
  EdaKnowledgeLookupRequest,
  FlowPrimitive,
  KnowledgePackHealth,
} from './EdaKnowledgeTypes.js'

function compactText(text: string | undefined, maxLength = 220): string {
  if (!text) return ''

  const normalized = text.replace(/\s+/g, ' ').trim()
  if (normalized.length <= maxLength) {
    return normalized
  }

  return `${normalized.slice(0, maxLength - 3)}...`
}

function summarizeCommand(record: CommandRecord) {
  return {
    commandName: record.commandName,
    synopsis: compactText(record.synopsis),
    source: record.sourceRefs[0] ?? null,
  }
}

function summarizeConcept(record: ConceptRecord) {
  return {
    topic: record.topic,
    summary: compactText(record.summary),
    source: record.sourceRefs[0] ?? null,
  }
}

function summarizeFlow(record: FlowPrimitive) {
  return {
    goal: record.goal,
    steps: record.steps.slice(0, 3).map(step => compactText(step, 140)),
    source: record.sourceRefs[0] ?? null,
  }
}

function summarizeChunk(chunk: DocChunk) {
  return {
    sectionPath: chunk.sectionPath,
    sectionType: chunk.sectionType,
    text: compactText(chunk.text),
    source: chunk.sourceRefs[0] ?? null,
  }
}

function summarizeHealth(health: KnowledgePackHealth | undefined) {
  if (!health) return null

  return {
    status: health.status,
    detail: health.detail ?? null,
    selectedVersion: health.selectedVersion ?? null,
    availableVersions: health.availableVersions ?? [],
    warnings: health.warnings ?? [],
    commandCount: health.commandCount ?? null,
    conceptCount: health.conceptCount ?? null,
    flowCount: health.flowCount ?? null,
    chunkCount: health.chunkCount ?? null,
  }
}

export function isEdaKnowledgeTraceEnabled(): boolean {
  return isEnvTruthy(process.env.CLAUDECHIP_EDA_TRACE)
}

export function traceEdaKnowledgeLookup(
  request: EdaKnowledgeLookupRequest,
  context: EdaKnowledgeContext,
): void {
  if (!isEdaKnowledgeTraceEnabled()) {
    return
  }

  logForDebugging(
    [
      '[EDA-KB] lookup',
      JSON.stringify(
        {
          query: request.query,
          limit: request.limit ?? null,
          terminalContext: request.terminalContext
            ? {
                mode: request.terminalContext.mode,
                transport: request.terminalContext.transport,
                app: request.terminalContext.app,
                host: request.terminalContext.host,
                promptReady: request.terminalContext.promptReady,
                summary: request.terminalContext.summary,
                recentCommand: request.terminalContext.recentCommand,
              }
            : null,
          route: context.route,
          health: summarizeHealth(context.evidence?.health),
          selectedEvidence: context.evidence
            ? {
                tool: context.evidence.tool,
                version: context.evidence.version,
                commandCount: context.evidence.commands.length,
                conceptCount: context.evidence.concepts.length,
                flowCount: context.evidence.flows.length,
                chunkCount: context.evidence.chunks.length,
                citationCount: context.evidence.citations.length,
                commands: context.evidence.commands
                  .slice(0, 3)
                  .map(summarizeCommand),
                concepts: context.evidence.concepts
                  .slice(0, 3)
                  .map(summarizeConcept),
                flows: context.evidence.flows.slice(0, 2).map(summarizeFlow),
                chunks: context.evidence.chunks.slice(0, 2).map(summarizeChunk),
              }
            : null,
          promptBlock: context.promptBlock,
        },
        null,
        2,
      ),
    ].join('\n'),
    { level: 'verbose' },
  )
}

export function traceEdaKnowledgePromptInjection(
  edaKnowledgeContext: EdaKnowledgeContext | null | undefined,
): void {
  if (!isEdaKnowledgeTraceEnabled() || !edaKnowledgeContext) {
    return
  }

  logForDebugging(
    [
      '[EDA-KB] prompt-injection',
      JSON.stringify(
        {
          route: edaKnowledgeContext.route,
          promptBlock: edaKnowledgeContext.promptBlock,
        },
        null,
        2,
      ),
    ].join('\n'),
    { level: 'verbose' },
  )
}
