import { describe, expect, test } from 'bun:test'
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  appendDocumentsToKnowledgeBase,
  shouldIngestSourceDocument,
} from '../src/eda-kb/ingest/KnowledgeGrinder.js'
import { buildKnowledgePackFromDocuments } from '../src/eda-kb/ingest/PackBuilder.js'
import { writeKnowledgePack } from '../src/eda-kb/ingest/PackWriter.js'

describe('EDA knowledge ingestion', () => {
  test('builds and writes a pack from a user-supplied markdown doc', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'eda-kb-test-'))

    try {
      const docPath = join(tempRoot, 'pt-debug.md')
      await writeFile(
        docPath,
        [
          'report_timing',
          'Reports timing paths and clock details.',
          '',
          'Clock Tree Latency',
          'Use report_timing -path_type full_clock to inspect propagated clock arrival.',
          '',
          'Worst Hold Flow',
          'steps',
          'update_timing',
          'report_timing -delay_type min -max_paths 10',
        ].join('\n'),
        'utf8',
      )

      const pack = await buildKnowledgePackFromDocuments({
        vendor: 'synopsys',
        tool: 'pt',
        version: '2023.06',
        mode: 'pt_shell',
        embeddingModel: 'local-test-model',
        vectorIndexKind: 'sqlite-vec',
        sourceDocs: [
          {
            docId: 'user-doc-1',
            vendor: 'synopsys',
            tool: 'pt',
            version: '2023.06',
            title: 'User PT Notes',
            path: docPath,
            format: 'md',
            docType: 'tutorial',
            sha256: 'test',
            extractionMethod: 'rule',
            sourceOrigin: 'user_uploaded',
            authorityTag: 'user_provided_document',
            reliabilityTag: 'user_provided',
          },
        ],
      })

      const packDir = await writeKnowledgePack(join(tempRoot, 'packs'), pack)
      const manifest = JSON.parse(
        await readFile(join(packDir, 'manifest.json'), 'utf8'),
      ) as {
        sourceDocs: Array<{
          sourceOrigin: string
          authorityTag: string
          reliabilityTag: string
        }>
      }

      expect(pack.commands.length).toBeGreaterThan(0)
      expect(pack.chunks.length).toBeGreaterThan(0)
      expect(manifest.sourceDocs[0]?.sourceOrigin).toBe('user_uploaded')
      expect(manifest.sourceDocs[0]?.authorityTag).toBe('user_provided_document')
      expect(manifest.sourceDocs[0]?.reliabilityTag).toBe('user_provided')
    } finally {
      await rm(tempRoot, { recursive: true, force: true })
    }
  })

  test('appends new source documents and rebuilds the target namespace pack', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'eda-kb-append-'))

    try {
      const firstDocPath = join(tempRoot, 'first.md')
      const secondDocPath = join(tempRoot, 'second.md')

      await writeFile(
        firstDocPath,
        ['report_timing', 'Report timing command description.'].join('\n'),
        'utf8',
      )
      await writeFile(
        secondDocPath,
        ['Clock Tree Latency', 'Use report_timing -path_type full_clock.'].join('\n'),
        'utf8',
      )

      const packRoot = join(tempRoot, 'packs')

      await appendDocumentsToKnowledgeBase({
        packRoot,
        sourceDocs: [
          {
            docId: 'doc-1',
            vendor: 'synopsys',
            tool: 'pt',
            version: '2023.06',
            title: 'First Doc',
            path: firstDocPath,
            format: 'md',
            docType: 'command_ref',
            sha256: 'sha-1',
            extractionMethod: 'rule',
            sourceOrigin: 'user_uploaded',
            authorityTag: 'user_provided_document',
            reliabilityTag: 'user_provided',
            distributionTag: 'workspace_local',
          },
        ],
      })

      await appendDocumentsToKnowledgeBase({
        packRoot,
        sourceDocs: [
          {
            docId: 'doc-2',
            vendor: 'synopsys',
            tool: 'pt',
            version: '2023.06',
            title: 'Second Doc',
            path: secondDocPath,
            format: 'md',
            docType: 'tutorial',
            sha256: 'sha-2',
            extractionMethod: 'rule',
            sourceOrigin: 'user_uploaded',
            authorityTag: 'user_provided_document',
            reliabilityTag: 'user_provided',
            distributionTag: 'workspace_local',
          },
        ],
      })

      const manifest = JSON.parse(
        await readFile(
          join(packRoot, 'synopsys', 'pt', '2023.06', 'manifest.json'),
          'utf8',
        ),
      ) as { sourceDocs: Array<{ docId: string }> }

      expect(manifest.sourceDocs.map(doc => doc.docId).sort()).toEqual([
        'doc-1',
        'doc-2',
      ])
    } finally {
      await rm(tempRoot, { recursive: true, force: true })
    }
  })

  test('rejects vendor-manual HTML mirrors from active ingestion', () => {
    expect(
      shouldIngestSourceDocument({
        docId: 'tempus-html',
        vendor: 'cadence',
        tool: 'tempus',
        version: '22.10',
        title: 'Tempus User Guide',
        path: '/tmp/tempus.html',
        sourceUri: 'https://pdfcoffee.com/tempus-user-guide-pdf-free.html',
        format: 'html',
        docType: 'user_guide',
        sha256: 'sha',
        extractionMethod: 'rule',
        sourceOrigin: 'vendor_manual',
        authorityTag: 'official_vendor_document',
        reliabilityTag: 'authoritative',
        distributionTag: 'third_party_html_mirror',
      }),
    ).toBe(false)
  })
})
