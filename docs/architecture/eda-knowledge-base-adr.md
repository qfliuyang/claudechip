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

The user should not invoke this manually.

### Intent Classes

- `command_lookup`
- `how_to`
- `troubleshooting`
- `report_interpretation`
- `script_synthesis`

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

## 8) MCP Boundary

Expose the online serving plane through a local MCP server.

Why:

- ClaudeChip already supports MCP tools and resources
- resources are a good fit for exact command and guide references
- tools are a good fit for dynamic lookup and script assembly

The local MCP server becomes the stable boundary between:

- ingestion and serving internals
- ClaudeChip runtime components

## 9) Reliability Policy

For tool-specific EDA questions:

- KB retrieval is the default, not the exception
- general model priors are fallback only

For generated commands:

- use `CommandRecord` and `FlowPrimitive` first
- only fall back to free-form generation when KB confidence is low

For runtime execution:

- `/term` and mode-specific terminal commands still control the shared PTY
- KB affects what commands are generated and why, not who owns terminal execution

## Decision Summary

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

## Consequences

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
