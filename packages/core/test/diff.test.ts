import { describe, it, expect } from 'vitest'
import { zipSync } from 'fflate'
import { diffText, extractDocxText } from '../src/diff.js'

// Helper: build a minimal docx buffer for testing
function makeDocx(bodyText: string): Uint8Array {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:r>
        <w:t>${bodyText}</w:t>
      </w:r>
    </w:p>
  </w:body>
</w:document>`
  const enc = new TextEncoder()
  return zipSync({
    '[Content_Types].xml': enc.encode(
      '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"></Types>',
    ),
    'word/document.xml': enc.encode(xml),
  })
}

describe('diffText', () => {
  it('returns empty array for identical strings', () => {
    const result = diffText('hello', 'hello')
    const deletions = result.filter((r) => r.type !== 'equal')
    expect(deletions).toHaveLength(0)
    expect(result.some((r) => r.type === 'equal')).toBe(true)
  })

  it('detects inserted characters', () => {
    const result = diffText('abc', 'axbc')
    const inserts = result.filter((r) => r.type === 'insert')
    expect(inserts.some((r) => r.text === 'x')).toBe(true)
  })

  it('detects deleted characters', () => {
    const result = diffText('axbc', 'abc')
    const deletes = result.filter((r) => r.type === 'delete')
    expect(deletes.some((r) => r.text === 'x')).toBe(true)
  })

  it('handles Chinese character-level diff', () => {
    const result = diffText('今天天气很好', '今天天气不好')
    const deletes = result.filter((r) => r.type === 'delete')
    const inserts = result.filter((r) => r.type === 'insert')
    expect(deletes.some((r) => r.text === '很')).toBe(true)
    expect(inserts.some((r) => r.text === '不')).toBe(true)
  })

  it('returns DiffResult with type and text fields', () => {
    const result = diffText('a', 'b')
    for (const r of result) {
      expect(['equal', 'insert', 'delete']).toContain(r.type)
      expect(typeof r.text).toBe('string')
    }
  })

  it('handles empty strings', () => {
    const result = diffText('', 'hello')
    expect(result.some((r) => r.type === 'insert' && r.text === 'hello')).toBe(true)
  })

  it('handles both strings empty', () => {
    const result = diffText('', '')
    expect(result.every((r) => r.type === 'equal')).toBe(true)
  })
})

describe('extractDocxText', () => {
  it('extracts text from a minimal docx', async () => {
    const buf = makeDocx('论文正文内容')
    const text = await extractDocxText(buf)
    expect(text).toContain('论文正文内容')
  })

  it('extracts ASCII text', async () => {
    const buf = makeDocx('Hello World')
    const text = await extractDocxText(buf)
    expect(text).toContain('Hello World')
  })

  it('reports missing document.xml instead of pretending the document is empty', async () => {
    const enc = new TextEncoder()
    const buf = zipSync({
      '[Content_Types].xml': enc.encode('<Types/>'),
    })
    await expect(extractDocxText(buf)).rejects.toThrow('缺少正文')
  })

  it('strips XML tags from document.xml', async () => {
    const buf = makeDocx('纯文本')
    const text = await extractDocxText(buf)
    // Should not contain raw XML tags
    expect(text).not.toContain('<w:')
    expect(text).toContain('纯文本')
  })
})


it('decodes XML entities and preserves paragraphs, tabs and visible inserted text', async () => {
  const xml = '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>中文 &amp; &#65;</w:t><w:tab/><w:t>数据</w:t><w:br/><w:t>续行</w:t></w:r></w:p><w:p><w:del><w:r><w:delText>删除内容</w:delText></w:r></w:del><w:ins><w:r><w:t>新增</w:t></w:r></w:ins></w:p></w:body></w:document>'
  expect(await extractDocxText(zipSync({ 'word/document.xml': new TextEncoder().encode(xml) }))).toBe('中文 & A\t数据\n续行\n新增')
  await expect(extractDocxText(new Uint8Array([1, 2, 3]))).rejects.toThrow('损坏')
})
it('rejects oversized interactive comparisons instead of blocking indefinitely', () => {
  expect(() => diffText('x'.repeat(160001), 'y')).toThrow('文本过长')
})
