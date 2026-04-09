import { describe, expect, test } from 'bun:test'
import { existsSync } from 'fs'
import { mkdtemp, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { execFileSync } from 'child_process'
import { parseDocument } from '../src/eda-kb/ingest/DocParser.js'

describe('document grinder parser', () => {
  test('parses html into structured sections with source refs', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'eda-html-'))

    try {
      const htmlPath = join(tempRoot, 'guide.html')
      await writeFile(
        htmlPath,
        '<html><body><h1>report_timing</h1><p>Reports timing paths.</p><h2>Clock Tree Latency</h2><p>Use full_clock.</p></body></html>',
        'utf8',
      )

      const parsed = await parseDocument({
        docId: 'html-1',
        vendor: 'synopsys',
        tool: 'pt',
        version: '2023.06',
        title: 'HTML Guide',
        path: htmlPath,
        format: 'html',
        docType: 'user_guide',
        sha256: 'sha',
        extractionMethod: 'rule',
        sourceOrigin: 'workspace_doc',
        authorityTag: 'workspace_document',
        reliabilityTag: 'workspace_local',
        distributionTag: 'workspace_local',
      })

      expect(parsed.sections.length).toBeGreaterThan(0)
      expect(parsed.sections[0]?.sourceRef.docId).toBe('html-1')
      expect(parsed.trace.strategy).toBe('html-strip')
    } finally {
      await rm(tempRoot, { recursive: true, force: true })
    }
  })

  test('parses pptx slide text through zip/xml extraction', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'eda-pptx-'))

    try {
      const pptxPath = join(tempRoot, 'deck.pptx')
      const script = `
import sys, zipfile
from pathlib import Path
path = Path(sys.argv[1])
with zipfile.ZipFile(path, 'w') as zf:
    zf.writestr('ppt/slides/slide1.xml', '<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>Clock Tree Latency</a:t></a:r></a:p><a:p><a:r><a:t>Inspect propagated clocks</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>')
`
      execFileSync('python', ['-c', script, pptxPath])

      const parsed = await parseDocument({
        docId: 'pptx-1',
        vendor: 'cadence',
        tool: 'innovus',
        version: '19.11',
        title: 'Deck',
        path: pptxPath,
        format: 'pptx',
        docType: 'tutorial',
        sha256: 'sha',
        extractionMethod: 'rule',
        sourceOrigin: 'user_uploaded',
        authorityTag: 'user_provided_document',
        reliabilityTag: 'user_provided',
        distributionTag: 'workspace_local',
      })

      expect(parsed.sections.length).toBeGreaterThan(0)
      expect(parsed.sections.map(section => section.body).join('\n')).toContain(
        'Inspect propagated clocks',
      )
      expect(parsed.trace.strategy).toBe('python-zip-xml')
    } finally {
      await rm(tempRoot, { recursive: true, force: true })
    }
  })

  test('parses staged pdf manuals when pypdf extraction is available', async () => {
    if (process.env.CLAUDECHIP_RUN_PDF_TEST !== '1') {
      expect(true).toBe(true)
      return
    }

    const pdfPath =
      'data/eda-docs/acquisition/2026-04-08-initial-campaign/downloads/xuetang-mirror/cadence/Innovus User Guide Product Version 19.11.pdf'

    if (!existsSync(pdfPath)) {
      expect(true).toBe(true)
      return
    }

    const parsed = await parseDocument({
      docId: 'innovus-pdf',
      vendor: 'cadence',
      tool: 'innovus',
      version: '19.11',
      title: 'Innovus User Guide Product Version 19.11',
      path: pdfPath,
      format: 'pdf',
      docType: 'user_guide',
      sha256: 'sha',
      extractionMethod: 'rule',
      sourceOrigin: 'vendor_manual',
      authorityTag: 'official_vendor_document',
      reliabilityTag: 'authoritative',
      distributionTag: 'third_party_mirror',
    })

    const combined = parsed.sections.map(section => section.body).join('\n')
    expect(parsed.trace.strategy).toBe('python-pypdf')
    expect(combined.length).toBeGreaterThan(1000)
  })
})
