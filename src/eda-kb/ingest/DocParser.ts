import { execFile } from 'child_process'
import { readFile } from 'fs/promises'
import { promisify } from 'util'
import type {
  ExtractionTrace,
  SourceDocumentManifest,
  SourceRef,
} from '../EdaKnowledgeTypes.js'

const execFileAsync = promisify(execFile)

export interface ParsedDocumentSection {
  heading: string
  body: string
  ordinal: number
  sourceRef: SourceRef
}

export interface ParsedDocument {
  manifest: SourceDocumentManifest
  sections: ParsedDocumentSection[]
  trace: ExtractionTrace
}

function buildSourceRef(
  manifest: SourceDocumentManifest,
  sectionPath: string[],
  page?: number,
  anchor?: string,
): SourceRef {
  return {
    docId: manifest.docId,
    title: manifest.title,
    sectionPath,
    page,
    anchor,
    sourceOrigin: manifest.sourceOrigin,
    authorityTag: manifest.authorityTag,
    reliabilityTag: manifest.reliabilityTag,
    distributionTag: manifest.distributionTag,
  }
}

function normalizeWhitespace(text: string): string {
  return text
    .replace(/\r/g, '')
    .replace(/\t/g, ' ')
    .replace(/[ \u00a0]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function splitTextIntoSections(
  text: string,
  manifest: SourceDocumentManifest,
  prefix = 'Section',
  page?: number,
): ParsedDocumentSection[] {
  const normalized = normalizeWhitespace(text)
  if (!normalized) {
    return []
  }

  const rawSections = normalized
    .split(/\n(?=(?:#{1,6}\s+|[A-Z][A-Za-z0-9/_ .()-]{2,80}:?$))/)
    .map(section => section.trim())
    .filter(Boolean)

  return rawSections.map((section, index) => {
    const [firstLine, ...rest] = section.split('\n')
    const heading = firstLine.trim().replace(/^#{1,6}\s+/, '') || `${prefix} ${index + 1}`
    const body = normalizeWhitespace(rest.join('\n')) || heading
    return {
      heading,
      body,
      ordinal: index,
      sourceRef: buildSourceRef(manifest, [heading], page),
    }
  })
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<\/(p|div|section|article|h[1-6]|li|tr|table)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

async function extractPdfPagesWithPython(
  path: string,
): Promise<{ pages: string[]; warnings: string[] }> {
  const script = `
import json, sys
warnings = []
pages = []
try:
    from pypdf import PdfReader
except Exception as exc:
    warnings.append(f"pypdf_unavailable:{exc}")
    print(json.dumps({"pages": [], "warnings": warnings}))
    raise SystemExit(0)

try:
    reader = PdfReader(sys.argv[1])
    for page in reader.pages:
        text = page.extract_text() or ""
        pages.append(text)
except Exception as exc:
    warnings.append(f"pdf_extract_failed:{exc}")

print(json.dumps({"pages": pages, "warnings": warnings}))
`
  const { stdout } = await execFileAsync('python', ['-c', script, path], {
    maxBuffer: 64 * 1024 * 1024,
  })
  return JSON.parse(stdout) as { pages: string[]; warnings: string[] }
}

async function extractPptxSlidesWithPython(
  path: string,
): Promise<{ slides: string[]; warnings: string[] }> {
  const script = `
import json, sys, zipfile, xml.etree.ElementTree as ET, re
warnings = []
slides = []
try:
    with zipfile.ZipFile(sys.argv[1]) as zf:
        names = sorted(
            [name for name in zf.namelist() if re.match(r"ppt/slides/slide\\d+\\.xml$", name)],
            key=lambda name: int(re.search(r"(\\d+)", name).group(1))
        )
        ns = {"a": "http://schemas.openxmlformats.org/drawingml/2006/main"}
        for name in names:
            try:
                root = ET.fromstring(zf.read(name))
                texts = [node.text for node in root.findall(".//a:t", ns) if node.text]
                slides.append("\\n".join(texts))
            except Exception as exc:
                warnings.append(f"slide_parse_failed:{name}:{exc}")
except Exception as exc:
    warnings.append(f"pptx_extract_failed:{exc}")
print(json.dumps({"slides": slides, "warnings": warnings}))
`
  const { stdout } = await execFileAsync('python', ['-c', script, path], {
    maxBuffer: 64 * 1024 * 1024,
  })
  return JSON.parse(stdout) as { slides: string[]; warnings: string[] }
}

export async function parseDocument(
  manifest: SourceDocumentManifest,
): Promise<ParsedDocument> {
  const warnings: string[] = []
  let sections: ParsedDocumentSection[] = []
  let strategy = 'text'

  if (manifest.format === 'html') {
    const raw = await readFile(manifest.path, 'utf8')
    sections = splitTextIntoSections(stripHtml(raw), manifest, 'HTML Section')
    strategy = 'html-strip'
  } else if (manifest.format === 'md' || manifest.format === 'txt') {
    const raw = await readFile(manifest.path, 'utf8')
    sections = splitTextIntoSections(raw, manifest, 'Text Section')
    strategy = manifest.format
  } else if (manifest.format === 'pdf') {
    const extracted = await extractPdfPagesWithPython(manifest.path)
    warnings.push(...extracted.warnings)
    sections = extracted.pages.flatMap((pageText, index) =>
      splitTextIntoSections(pageText, manifest, `PDF Page ${index + 1}`, index + 1),
    )
    strategy = 'python-pypdf'
  } else if (manifest.format === 'pptx') {
    const extracted = await extractPptxSlidesWithPython(manifest.path)
    warnings.push(...extracted.warnings)
    sections = extracted.slides.flatMap((slideText, index) =>
      splitTextIntoSections(slideText, manifest, `Slide ${index + 1}`, index + 1),
    )
    strategy = 'python-zip-xml'
  } else {
    warnings.push(`unsupported_format:${manifest.format}`)
  }

  if (sections.length === 0) {
    sections = [
      {
        heading: manifest.title,
        body: '',
        ordinal: 0,
        sourceRef: buildSourceRef(manifest, [manifest.title]),
      },
    ]
    warnings.push('empty_extraction')
  }

  return {
    manifest,
    sections,
    trace: {
      extractor: 'claudechip-eda-grinder',
      strategy,
      extractedAt: new Date().toISOString(),
      warnings,
      sourceFormat: manifest.format,
    },
  }
}
