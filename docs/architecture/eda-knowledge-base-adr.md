# ADR: Mode-Aware EDA Knowledge Base Architecture

- Status: Proposed
- Date: 2026-04-08
- Owner: ClaudeChip

## Context

ClaudeChip is moving beyond generic coding assistance into chip-design and EDA-assisted workflows.

Target users will often:

1. work in a mode-specific tool shell such as `innovus`, `icc2_shell`, `pt_shell`, or `dc_shell`
2. ask for command explanations, troubleshooting help, and short script synthesis without leaving the main chat
3. expect answers to align with vendor manuals, command references, and standard flow practices
4. expect command generation to be fast enough for interactive use

The current terminal-aware architecture gives ClaudeChip useful runtime signals:

- mode classification from the shared right pane
- mode-aware slash commands
- terminal tools for read/write/exec
- mode-aware prompt addenda

That is necessary but not sufficient.

Without a knowledge base:

- command generation depends too heavily on model priors
- tool-specific answers are inconsistent across modes and versions
- command lookup is slow if it depends on raw manual retrieval each turn
- chip-design troubleshooting cannot reliably cite the source manuals users trust

The key product requirement is:

- EDA-specific knowledge must be routed automatically and silently based on runtime mode and query intent
- command lookup and small script synthesis should generally complete within 10 seconds
- manuals must be ingested once and converted into structured, queryable knowledge artifacts

## Decision

Adopt a two-plane, mode-aware EDA knowledge base architecture:

1. an offline ingestion plane that converts manuals and references into structured knowledge objects and indexes
2. an online serving plane that routes queries by mode and intent to small, tool-specific knowledge namespaces

The knowledge base is not a generic vector store. It is a typed system built around:

- `CommandRecord`
- `ConceptRecord`
- `FlowPrimitive`
- `DocChunk`

The runtime path does not read raw manuals directly except as a fallback. Normal user turns should retrieve from prebuilt knowledge objects and indexes.

The runtime router must also classify intent explicitly rather than relying on prompt heuristics alone. Intent routing is part of the platform, not left to the model on each turn.

## Why This Architecture

### 1) EDA Questions Are Not One Retrieval Problem

User questions naturally split into at least five intents:

- command lookup
- how-to guidance
- troubleshooting
- report interpretation
- small flow/script synthesis

These need different serving strategies. A single flat RAG pipeline is slower and less reliable than routing by intent.

### 2) Exact Tokens Matter

EDA command names, options, reports, and Tcl fragments are highly sensitive to exact spelling.

Examples:

- `report_timing`
- `-path_type`
- `ccopt_design`
- `check_timing`

That makes keyword and exact-match retrieval mandatory. Semantic retrieval is useful, but not enough by itself.

### 3) Manual Structure Matters

Vendor manuals are not just prose. They include:

- command synopses
- option tables
- examples
- usage notes
- warnings
- flows

So the system must preserve hierarchy and tables during ingestion and then promote important structures into typed records.

### 4) Latency Matters

Users should not wait on:

- raw PDF parsing
- full-corpus retrieval over all vendors/tools
- graph expansion
- multi-stage agent loops

The hot path must use compact, prebuilt indexes scoped by mode and tool.

## Architecture

## 1) Offline Ingestion Plane

Responsibilities:

- parse manuals and command references
- preserve document structure
- extract typed knowledge records
- compute contextual summaries
- build exact, keyword, and vector indexes
- publish versioned knowledge packs

Properties:

- asynchronous
- heavy
- not on the user-facing query path

## 2) Online Serving Plane

Responsibilities:

- accept mode and intent signals
- choose the correct knowledge namespace
- retrieve compact evidence
- return citations and confidence
- support command and script generation without re-reading raw manuals

Properties:

- low latency
- mode-aware
- intent-aware
- silent by default

## 3) Knowledge Namespaces

Knowledge must be partitioned by:

- vendor
- tool
- version

Examples:

- `cadence/innovus/23.1`
- `synopsys/icc2/2023.12`
- `synopsys/pt/2023.06`
- `synopsys/dc/2023.03`

Each namespace contains:

- command catalog
- concept index
- flow primitive index
- guide chunk index

This avoids global-corpus fanout on ordinary turns.

## 4) Knowledge Units

### `CommandRecord`

Primary unit for fast command lookup.

Contains:

- `vendor`
- `tool`
- `version`
- `mode`
- `commandName`
- `aliases`
- `syntax`
- `options`
- `examples`
- `warnings`
- `relatedCommands`
- `sourceRefs`

### `ConceptRecord`

Primary unit for conceptual questions.

Contains:

- `topic`
- `toolScope`
- `summary`
- `relatedCommands`
- `relatedReports`
- `relatedFlows`
- `sourceRefs`

### `FlowPrimitive`

Primary unit for small script synthesis.

Contains:

- `goal`
- `toolScope`
- `preconditions`
- `steps`
- `template`
- `expectedOutputs`
- `followUps`
- `sourceRefs`

### `DocChunk`

Fallback/supporting evidence.

Contains:

- `sectionPath`
- `headerPath`
- `text`
- `contextualText`
- `bm25Text`
- `embedding`
- `sourceRefs`

## 5) Runtime Router

Add a silent runtime router before the main model answer.

Inputs:

- user message
- current terminal mode
- transport and host context
- recent terminal command
- prompt-ready state

Outputs:

- domain
- tool namespace
- intent
- retrieval tier
- confidence

The user should not invoke this manually.

### Intent Classes

- `command_lookup`
- `how_to`
- `troubleshooting`
- `report_interpretation`
- `script_synthesis`

### Intent Classification Policy

Intent classification must be explicit and confidence-scored.

Recommended approach:

1. rule-first classifier for obvious cases
   - exact command name present
   - command-like syntax present
   - common troubleshooting phrases
   - common report/debug verbs
2. lightweight model-assisted classification only when rule confidence is low
3. fallback to multi-intent retrieval when confidence remains ambiguous

This avoids forcing a full model turn just to decide which retriever to use.

Recommended confidence policy:

- high confidence: `>= 0.85`
  - use rule-only routing
- medium confidence: `0.50 - 0.84`
  - allow lightweight model-assisted classification
- low confidence: `< 0.50`
  - use multi-intent retrieval fallback

### Example Routing

If:

- mode = `innovus`
- user asks = "how to debug the clock tree latency problem"

Then route to:

- `cadence/innovus/<version>`
- `ConceptRecord`
- `FlowPrimitive`
- top few `DocChunk`s

If:

- mode = `pt_shell`
- user asks = "generate a small script for worst hold path inspection"

Then route to:

- `synopsys/pt/<version>`
- `CommandRecord`
- `FlowPrimitive`

## 6) Retrieval Tiers

### Hot Path

Used for:

- direct command lookup
- small command generation

Uses:

- exact lookup
- prefix lookup
- small BM25/hybrid query over command catalog

Default retrieval order:

1. exact command name
2. alias match
3. prefix match
4. keyword/BM25
5. vector/hybrid fallback

Target:

- under 2 seconds end-to-end in common cases

### Warm Path

Used for:

- how-to
- troubleshooting
- report interpretation

Uses:

- `ConceptRecord`
- `FlowPrimitive`
- a few `DocChunk`s

Target:

- under 7 seconds end-to-end in common cases

### Slow Path

Used for:

- larger script synthesis
- broader troubleshooting

Uses:

- `FlowPrimitive`
- `CommandRecord`
- supporting chunks

Target:

- under 10 seconds for simple scripts
- degrade gracefully with partial answer if needed

## 7) Prompt and Tool Integration

The knowledge base should not rely on the model deciding from scratch whether to search manuals.

Instead:

1. mode and intent are detected first
2. retrieval happens automatically when appropriate
3. a compact evidence bundle is attached to the model context
4. ClaudeChip answers or generates commands using that evidence

This means the KB acts as a platform service beneath the assistant, not as a user-triggered skill.

Evidence injection must be budgeted and ranked. The default ranking order is:

1. `CommandRecord`
2. `FlowPrimitive`
3. `ConceptRecord`
4. `DocChunk`

The runtime should prefer a small, high-confidence evidence bundle over a large mixed-context dump.

## 8) Ingestion Specificity

The ingestion pipeline must explicitly track:

- source format
- vendor
- tool
- version
- document type
- extraction method

Supported input formats for v1 should be declared up front:

- HTML
- Markdown
- plain text exports

PDF ingestion should be treated as a later expansion phase after the HTML/Markdown/text pipeline is stable and measurable.

Versioned manuals must be stored as separate namespaces, even when content overlaps heavily across releases.

Section classification should use a stable taxonomy so extraction remains testable and deterministic.

## 9) MCP Boundary

Expose the online serving plane through a local MCP server.

Why:

- ClaudeChip already supports MCP tools and resources
- resources are a good fit for exact command and guide references
- tools are a good fit for dynamic lookup and script assembly

The local MCP server becomes the stable boundary between:

- ingestion and serving internals
- ClaudeChip runtime components

## 10) Retrieval and Indexing Strategy

The serving plane must prefer local, portable retrieval components.

Default recommendation:

- exact lookup tables for commands and aliases
- BM25 or equivalent keyword index
- local vector index for semantic fallback

Because many EDA environments are air-gapped or semi-isolated, the default vector strategy should not depend on a hosted embedding service.

Preferred default:

- local embedding model
- local vector store such as SQLite-vec or FAISS

This keeps both ingestion and serving deployable in restricted environments.

Embeddings do not need to live inline with `DocChunk` JSON records. Storing vectors only inside the local vector index is acceptable and preferred when it reduces pack size.

## 11) Reliability Policy

For tool-specific EDA questions:

- KB retrieval is the default, not the exception
- general model priors are fallback only

For generated commands:

- use `CommandRecord` and `FlowPrimitive` first
- only fall back to free-form generation when KB confidence is low

If no pack is available for the detected tool/version:

- do not silently pretend the KB exists
- inject an internal warning that the system is running without the expected pack
- allow fallback reasoning, but mark it as lower-confidence behavior

If multiple pack versions exist for the same tool:

1. prefer the version explicitly resolved from runtime context
2. otherwise fall back to the latest available compatible version
3. record a version-mismatch warning when runtime context and selected pack diverge

For runtime execution:

- `/term` and mode-specific terminal commands still control the shared PTY
- KB affects what commands are generated and why, not who owns terminal execution

## 12) Metrics and Observability

Minimum runtime metrics:

- retrieval latency by intent
- exact-match hit rate
- keyword hit rate
- vector fallback rate
- no-pack fallback rate
- evidence bundle token size

Minimum ingestion metrics:

- documents parsed
- sections classified
- commands extracted
- concepts extracted
- flow primitives extracted
- extraction failures by document

## 13) Decision Summary

ClaudeChip will use a:

- mode-aware
- intent-routed
- offline-ingested
- structured
- MCP-served
- low-latency

EDA knowledge base.

This is the architecture that best satisfies:

- no user intervention for routing
- high command accuracy
- source-backed guidance
- sub-10-second interactive UX

## 14) Consequences

### Positive

- fast command lookup
- better mode-specific answers
- source-backed command and flow generation
- silent routing from runtime context
- clear boundary for future expert-curated knowledge packs

### Negative

- ingestion pipeline is non-trivial
- command extraction quality will vary by vendor docs
- versioning and licensing of manuals must be handled carefully
- a graph layer remains optional future work rather than immediate scope

### Deferred

- GraphRAG-style relationship extraction
- automatic remote file/manual synchronization
- user-facing manual browser UI

## References

- Anthropic Contextual Retrieval: `https://www.anthropic.com/engineering/contextual-retrieval`
- Anthropic Citations: `https://platform.claude.com/docs/en/build-with-claude/citations`
- Claude Code MCP docs: `https://code.claude.com/docs/en/mcp`
- Model Context Protocol docs: `https://modelcontextprotocol.io/docs/getting-started/intro`
- Docling: `https://www.docling.ai/`
- Docling document converter docs: `https://docling-project.github.io/docling/reference/document_converter/`
- Qdrant hybrid search docs: `https://qdrant.tech/documentation/search-precision/reranking-hybrid-search/`
- Azure AI Search hybrid search overview: `https://learn.microsoft.com/en-us/azure/search/hybrid-search-overview`
- LlamaIndex advanced retrieval patterns: `https://developers.llamaindex.ai/python/framework/optimizing/advanced_retrieval/advanced_retrieval/`
- Microsoft GraphRAG: `https://github.com/microsoft/graphrag`
