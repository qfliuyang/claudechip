# EDA Knowledge Base Implementation Plan

- Status: Proposed
- Date: 2026-04-08
- Depends on: `docs/architecture/eda-knowledge-base-adr.md`

## 1) Objective

Translate the EDA knowledge base architecture into a concrete plan for this repo with:

- explicit modules
- explicit data schemas
- local MCP serving contracts
- offline ingestion stages
- low-latency runtime routing
- phased rollout gates

## 2) Target Module Map

## 2.1 Runtime Core Modules

Create under `src/eda-kb/`:

- `src/eda-kb/EdaKnowledgeTypes.ts`
- `src/eda-kb/IntentClassifier.ts`
- `src/eda-kb/EdaKnowledgeRouter.ts`
- `src/eda-kb/EdaKnowledgeGateway.ts`
- `src/eda-kb/EdaEvidenceAssembler.ts`
- `src/eda-kb/EdaKnowledgeContext.ts`
- `src/eda-kb/EdaKnowledgeMetrics.ts`

Responsibilities:

- types and schemas
- intent classification
- mode and intent routing
- lookup orchestration
- evidence bundle assembly
- runtime metrics

## 2.2 Ingestion Modules

Create under `src/eda-kb/ingest/`:

- `src/eda-kb/ingest/DocManifest.ts`
- `src/eda-kb/ingest/DocParser.ts`
- `src/eda-kb/ingest/SectionClassifier.ts`
- `src/eda-kb/ingest/CommandExtractor.ts`
- `src/eda-kb/ingest/ConceptExtractor.ts`
- `src/eda-kb/ingest/FlowPrimitiveExtractor.ts`
- `src/eda-kb/ingest/ChunkContextBuilder.ts`
- `src/eda-kb/ingest/PackBuilder.ts`

Responsibilities:

- parse manuals
- classify sections
- extract structured records
- compute contextual chunk text
- build knowledge packs
- keep versioned source metadata stable

## 2.3 Serving Store Modules

Create under `src/eda-kb/store/`:

- `src/eda-kb/store/KnowledgePackStore.ts`
- `src/eda-kb/store/CommandCatalogIndex.ts`
- `src/eda-kb/store/ConceptIndex.ts`
- `src/eda-kb/store/FlowIndex.ts`
- `src/eda-kb/store/ChunkIndex.ts`

Responsibilities:

- load packs
- namespace packs by vendor/tool/version
- exact lookup
- keyword lookup
- hybrid retrieval
- expose pack health

## 2.4 MCP Server Modules

Create under `src/eda-kb/mcp/`:

- `src/eda-kb/mcp/EdaKnowledgeMcpServer.ts`
- `src/eda-kb/mcp/tools/edaLookup.ts`
- `src/eda-kb/mcp/tools/edaCommandResolve.ts`
- `src/eda-kb/mcp/tools/edaFlowLookup.ts`
- `src/eda-kb/mcp/tools/edaReportExplain.ts`
- `src/eda-kb/mcp/resources/EdaResourceResolver.ts`

Responsibilities:

- expose local KB via MCP
- stable tool/resource contracts

## 2.5 Runtime Integration Points

Integrate with:

- `src/screens/REPL.tsx`
- `src/utils/systemPrompt.ts`
- `src/commands/term/term.tsx`
- `src/commands/terminal-mode/shared.tsx`
- `src/terminal/TerminalContext.ts`
- `src/tools.ts`

## 3) Data Schemas

## 3.1 Core Types

File: `src/eda-kb/EdaKnowledgeTypes.ts`

```ts
export type EdaVendor = 'cadence' | 'synopsys' | 'siemens' | 'unknown'

export type EdaTool =
  | 'innovus'
  | 'icc2'
  | 'pt'
  | 'dc'
  | 'genus'
  | 'tempus'
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

export type SectionType =
  | 'command_synopsis'
  | 'option_table'
  | 'example'
  | 'usage_note'
  | 'warning'
  | 'flow_description'
  | 'report_description'
  | 'prose'

export interface SourceRef {
  docId: string
  title: string
  sectionPath: string[]
  page?: number
  anchor?: string
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
```

## 3.2 Knowledge Pack Schema

```ts
export interface KnowledgePackManifest {
  packId: string
  vendor: EdaVendor
  tool: EdaTool
  version: string
  createdAt: string
  embeddingModel: string
  vectorIndexKind: 'sqlite-vec' | 'faiss'
  sourceDocs: Array<{
    docId: string
    title: string
    path: string
    format: 'html' | 'md' | 'txt' | 'pdf'
    docType: string
    sha256: string
    extractionMethod: 'rule' | 'llm' | 'hybrid'
  }>
}

export interface KnowledgePack {
  manifest: KnowledgePackManifest
  commands: CommandRecord[]
  concepts: ConceptRecord[]
  flows: FlowPrimitive[]
  chunks: DocChunk[]
}
```

## 4) Local Storage Layout

Store generated knowledge packs under:

- `var/eda-kb/packs/<vendor>/<tool>/<version>/manifest.json`
- `var/eda-kb/packs/<vendor>/<tool>/<version>/commands.jsonl`
- `var/eda-kb/packs/<vendor>/<tool>/<version>/concepts.jsonl`
- `var/eda-kb/packs/<vendor>/<tool>/<version>/flows.jsonl`
- `var/eda-kb/packs/<vendor>/<tool>/<version>/chunks.jsonl`
- `var/eda-kb/packs/<vendor>/<tool>/<version>/indexes/*`
- `var/eda-kb/packs/<vendor>/<tool>/<version>/health.json`

Input manuals live outside the pack output path, for example:

- `data/eda-docs/<vendor>/<tool>/<version>/*`

This keeps:

- raw documents
- generated packs
- runtime indexes

separate and auditable.

Embeddings should live in the local vector index files under `indexes/`, not inline in `chunks.jsonl`, unless a future debug/export mode explicitly needs inline vectors.

## 4.1 Default Local Retrieval Stack

To preserve portability in air-gapped or semi-isolated EDA environments, the default retrieval stack should be local-first:

- exact lookup tables for command names and aliases
- BM25 or equivalent local keyword index
- local embedding model
- local vector store

Recommended default choices for v1:

- embedding model: local model selected during ingestion and recorded in pack manifest
- vector index: `sqlite-vec` first, `faiss` as acceptable fallback

This keeps runtime retrieval independent of hosted embedding services.

## 5) MCP API

## 5.1 Tools

### `eda_lookup`

Use for:

- general EDA lookup by mode and intent

Input:

```json
{
  "query": "debug clock tree latency",
  "mode": "innovus",
  "intent": "troubleshooting",
  "tool": "innovus",
  "version": "23.1",
  "limit": 5
}
```

`version` should be optional at the tool boundary. When omitted, the serving layer resolves it from terminal/session context or falls back to the latest available pack for the selected tool namespace.

Output:

- top command records
- top concepts
- top flows
- top chunks
- citations
- confidence
- pack health

### `eda_command_resolve`

Use for:

- exact command lookup
- command explanation
- short command synthesis

Input:

```json
{
  "query": "report_timing -from CLK -to U1/Q",
  "mode": "pt_shell",
  "tool": "pt",
  "version": "2023.06"
}
```

`version` should be optional here as well, with the same resolution policy.

Output:

- normalized command name
- matching command record(s)
- examples
- warnings
- citations

### `eda_flow_lookup`

Use for:

- script synthesis
- small workflow assembly

Input:

```json
{
  "goal": "inspect worst hold paths",
  "mode": "pt_shell",
  "tool": "pt",
  "version": "2023.06",
  "limit": 3
}
```

Output:

- matching `FlowPrimitive`s
- parameterization hints
- citations

### `eda_report_explain`

Use for:

- explain report types and debugging paths

Input:

```json
{
  "reportType": "clock tree latency",
  "mode": "innovus",
  "tool": "innovus",
  "version": "23.1"
}
```

Output:

- related concepts
- related commands
- common debug sequence
- citations

## 5.2 Resources

Examples:

- `eda://cadence/innovus/23.1/command/report_timing`
- `eda://synopsys/pt/2023.06/concept/worst_hold_path`
- `eda://cadence/innovus/23.1/flow/clock_tree_latency_debug`

Resources should return compact, typed payloads rather than raw PDF text.

## 6) Runtime Query Pipeline

## 6.1 New Runtime Flow

Per user turn:

1. read terminal context from app state
2. classify whether the turn is EDA-relevant
3. classify intent
4. select namespace
5. call `EdaKnowledgeGateway`
6. assemble compact `EvidenceBundle`
7. inject bundle into prompt context
8. answer normally or execute through `/term`

## 6.0 Intent Classification

File: `src/eda-kb/IntentClassifier.ts`

Responsibilities:

- classify user turn into one or more `EdaIntent` values
- return confidence
- decide whether multi-intent retrieval is needed

Recommended strategy:

1. rule-first classifier
   - exact command names
   - command-like flags or Tcl structure
   - common troubleshooting phrases
   - report/debug verbs
2. optional lightweight model-assisted classification only when rule confidence is low
3. fallback to multi-intent retrieval when confidence is below threshold

Suggested output:

```ts
export interface IntentClassification {
  primary: EdaIntent
  secondary?: EdaIntent[]
  confidence: number
  reason: string
}
```

Default threshold guidance:

- `>= 0.85`: rule-only single-intent route
- `0.5 - 0.84`: model-assisted or capped multi-intent route
- `< 0.5`: general fallback with warning in internal diagnostics

## 6.2 Evidence Bundle

File: `src/eda-kb/EdaEvidenceAssembler.ts`

```ts
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
}
```

Guidelines:

- keep bundles small
- prefer typed records over raw chunks
- max 3 to 5 supporting records in normal turns
- enforce ranking order:
  - `CommandRecord`
  - `FlowPrimitive`
  - `ConceptRecord`
  - `DocChunk`
- enforce a hard evidence token budget

Suggested default budget:

- evidence bundle soft cap: 1500 tokens
- evidence bundle hard cap: 2000 tokens

## 6.3 Silent Routing Policy

The user should not manually opt into the KB for ordinary EDA questions.

Default routing:

- if current mode is an EDA shell and query is tool-specific, retrieve automatically
- if mode is `shell` or `ssh` but the user names an EDA tool, retrieve automatically
- if mode is `vim`, only retrieve if query content is clearly EDA-related
- if no matching knowledge pack is available for detected mode/tool/version, mark runtime as degraded and inject an internal warning

## 6.4 Cold Start and Empty-KB Policy

The serving layer must expose pack health before retrieval begins.

File:

- `src/eda-kb/store/KnowledgePackStore.ts`

Required behavior:

- report whether a pack exists for the active tool/version
- report whether only a generic vendor/tool pack exists
- distinguish:
  - `ready`
  - `missing_pack`
  - `degraded_pack`
  - `loading`

If no pack is available:

- do not block the turn
- do not silently act as if KB grounding succeeded
- inject an internal warning into the turn context
- allow fallback model reasoning

Version resolution policy:

1. prefer version explicitly resolved from session or terminal context
2. if absent, use the latest available version for the selected tool namespace
3. if runtime context suggests a different version than the selected pack, emit a version-mismatch warning in diagnostics and pack health

## 7) Ingestion Pipeline

## 7.1 Source Manifest

Create a manifest per imported doc set:

- vendor
- tool
- version
- doc path
- doc type
- checksum
- source format
- source URI or provenance label
- extraction policy

File:

- `src/eda-kb/ingest/DocManifest.ts`

Suggested schema:

```ts
export interface SourceDocumentManifest {
  docId: string
  vendor: EdaVendor
  tool: EdaTool
  version: string
  title: string
  path: string
  sourceUri?: string
  format: 'html' | 'md' | 'txt' | 'pdf'
  docType: 'user_guide' | 'command_ref' | 'tutorial' | 'troubleshooting'
  sha256: string
  extractionMethod: 'rule' | 'llm' | 'hybrid'
}
```

## 7.2 Parsing

Primary recommendation for v1:

- ingest structured HTML, Markdown, and plain-text exports into a normalized intermediate form
- defer first-class PDF ingestion until the v1 pipeline is stable

Future recommendation for PDF-heavy corpora:

- use Docling to parse PDFs/manuals into structured intermediate form

Output should preserve:

- headings
- tables
- examples/code blocks
- reading order
- page/anchor mapping

## 7.3 Section Classification

Classify parsed sections into:

- command reference
- conceptual guide
- troubleshooting
- tutorial/example
- flow recipe

This reduces extraction ambiguity downstream.

Classifier policy:

- rule-first for obvious command-reference patterns
- optional LLM-assisted fallback for ambiguous narrative sections
- write section class plus confidence into intermediate artifacts

Section classifier output should always carry:

- `sectionType`
- confidence
- extraction notes when fallback classification was needed

LLM extraction scope policy:

- `rule`: default for well-structured HTML, Markdown, and command-reference pages
- `llm`: optional enrichment for difficult narrative sections or poor source formatting; requires model access at ingest time only
- `hybrid`: rule-extracted structure plus LLM-generated summaries or enrichments

Air-gapped deployments must remain able to ingest and serve packs using `rule` extraction only.

## 7.4 Structured Extraction

### Command Extraction

Extract:

- command name
- aliases
- options
- examples
- warnings
- related commands

### Concept Extraction

Extract:

- topic
- summary
- related commands/reports

### Flow Extraction

Extract:

- goal
- prerequisites
- step sequence
- reusable templates

## 7.5 Contextual Chunk Building

For each chunk:

- include local section path
- include neighboring headers
- include tool/version labels
- build contextual chunk text for hybrid retrieval

This follows the contextual retrieval approach and reduces ambiguity in technical docs.

## 7.6 Pack Build and Publish

Outputs:

- JSONL knowledge objects
- searchable indexes
- manifest metadata

Publishing a pack should be atomic so runtime readers never see half-built state.

Pack publish should also emit:

- health summary
- extraction counts
- embedding/index metadata

## 8) Low-Latency Serving Design

## 8.1 Target Budgets

- command lookup: 2 seconds target, 5 seconds worst case
- simple command generation: 3 seconds target, 7 seconds worst case
- small script synthesis: 5 seconds target, 10 seconds worst case

## 8.2 Hot Path Rules

Hot path must avoid:

- raw manual parsing
- full corpus fanout
- graph reasoning
- multi-stage agent loops

Hot path should use:

- exact match
- prefix match
- small BM25/hybrid search

Hot path should not require vector search if exact/keyword confidence is already high.

## 8.3 Warm Path Rules

Warm path can use:

- concept records
- flow primitives
- top few support chunks

But should still limit fanout aggressively.

Suggested warm-path fanout caps:

- top 3 command records
- top 2 flow primitives
- top 2 concept records
- top 3 doc chunks

## 9) Integration Phases

## Phase A: Types and Router Skeleton

Deliver:

- core schemas
- intent classifier contract
- mode-to-tool namespace mapping
- intent classifier
- runtime router skeleton

Files:

- `src/eda-kb/EdaKnowledgeTypes.ts`
- `src/eda-kb/EdaKnowledgeRouter.ts`

Exit gate:

- build passes
- router unit tests exist

## Phase B: Offline Pack Builder

Deliver:

- doc manifest handling
- parser adapter
- command extraction
- concept extraction
- pack writer

Exit gate:

- can ingest at least one Innovus or PT doc set into a pack
- pack contents are inspectable and versioned

## Phase C: Online Serving Store

Deliver:

- local pack loader
- exact lookup
- keyword lookup
- hybrid retrieval

Exit gate:

- command lookup against ingested pack is under latency target on local machine
- pack health endpoint exists

## Phase D: MCP Server

Deliver:

- local MCP server
- tools and resources above

Exit gate:

- ClaudeChip can query KB through MCP tools in dev mode

## Phase E: Silent Runtime Routing

Deliver:

- REPL integration
- evidence bundle injection
- mode-aware automatic retrieval

Exit gate:

- EDA-mode user questions automatically retrieve without manual intervention

## Phase F: Mode-Specific Command Generation

Deliver:

- `/term` and `/innovus` `/icc2_shell` `/pt_shell` NL routing backed by KB
- command generation from `CommandRecord` and `FlowPrimitive`

Exit gate:

- command lookup and simple script synthesis meet latency target

## Phase G: Hardening

Deliver:

- metrics
- pack versioning controls
- missing-knowledge telemetry
- doc licensing checks

Exit gate:

- production-ready observability and upgrade path

## 10) Test Plan

## 10.1 Unit Tests

- mode-to-namespace routing
- intent classification
- command extraction normalization
- evidence bundle truncation rules
- pack health states
- section classification confidence handling

## 10.2 Integration Tests

- ingest a sample manual into a pack
- load pack and resolve exact command
- retrieve troubleshooting flow by mode
- inject evidence into prompt path without user intervention

## 10.3 Performance Tests

- command lookup latency
- small script synthesis latency
- namespace fanout caps
- exact-hit vs vector-fallback rates

## 10.4 Acceptance Tests

- `innovus` query retrieves Innovus pack, not shell fallback
- `pt_shell` query retrieves PT pack
- `shell` query mentioning EDA tool still routes correctly
- `/term` NL task does not blindly type plain text into terminal

## 11) Rollout Controls

Feature flags:

- `eda_kb_ingest_v1`
- `eda_kb_runtime_v1`
- `eda_kb_mcp_v1`
- `eda_kb_auto_route_v1`

Suggested rollout:

1. local ingestion only
2. local runtime retrieval only
3. dogfood on one or two tool packs
4. enable silent routing for EDA modes
5. expand supported tools and document sets

Fallback:

- if KB unavailable, ClaudeChip still answers using existing prompt and terminal context
- if KB confidence low, use broader retrieval or plain model fallback
- if pack missing for current tool/version, do not block normal operation

## 12) Definition of Done

Done when:

1. manuals are ingested into versioned structured packs
2. command lookup does not require rereading raw manuals
3. runtime silently routes tool-specific EDA queries to the correct namespace
4. `/term` and mode-specific terminal commands can use KB-backed command generation
5. common command lookup and small script synthesis stay within latency targets
6. all results preserve source provenance

## 13) Open Questions for Expert Review

- which vendor/tool/version combinations should be first-class in v1
- whether command extraction should be fully automatic or partly curated
- whether `dc_shell` should be added to the first mode bundle set
- how to handle licensed/vendor-proprietary documentation packaging and distribution
- whether flow primitives should start as curated YAML/JSON before automatic extraction is trusted
- whether section classification should remain mostly rule-based for v1
- whether `sqlite-vec` should be the default vector backend or only the portability fallback

## References

- See `docs/architecture/eda-knowledge-base-adr.md`
