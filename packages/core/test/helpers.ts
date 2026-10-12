import { promises as fs } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { zipSync, unzipSync } from 'fflate'

export async function tmpDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'wg-test-'))
}
export async function cleanup(dir: string): Promise<void> {
  await fs.rm(dir, { recursive: true, force: true })
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

export function makeDocxXml(paragraphs: string[]): string {
  const body = paragraphs.map(t => `<w:p><w:r><w:t>${escapeXml(t)}</w:t></w:r></w:p>`).join('')
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`
}

function docxParts(documentXml: string): Record<string, Uint8Array> {
  const enc = new TextEncoder()
  return {
    '[Content_Types].xml': enc.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`),
    '_rels/.rels': enc.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`),
    'word/document.xml': enc.encode(documentXml),
  }
}

export function makeDocxBuf(paragraphs: string[]): Uint8Array {
  return zipSync(docxParts(makeDocxXml(paragraphs)), { mtime: new Date(1980, 0, 1) })
}

export function editDocxAddParagraph(buf: Uint8Array, text: string): Uint8Array {
  const parts = unzipSync(buf)
  const dec = new TextDecoder()
  const enc = new TextEncoder()
  const xml = dec.decode(parts['word/document.xml'])
  parts['word/document.xml'] = enc.encode(
    xml.replace('</w:body>', `<w:p><w:r><w:t>${escapeXml(text)}</w:t></w:r></w:p></w:body>`))
  return zipSync(parts, { mtime: new Date(1980, 0, 1) })
}
