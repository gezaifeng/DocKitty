import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { unzipSync } from 'fflate'
import path from 'node:path'
import { Repo } from '../src/repo.js'
import { StorageContext } from '../src/storageContext.js'
import { isOoxml, encodeOoxml, decodeOoxml } from '../src/ingest/ooxml.js'
import { tmpDir, cleanup, makeDocxBuf, editDocxAddParagraph } from './helpers.js'

let dir: string, repo: Repo, ctx: StorageContext
beforeEach(async () => {
  dir = await tmpDir()
  repo = await Repo.init(path.join(dir, '库.wg'), 't')
  ctx = StorageContext.forRepo(repo)
})
afterEach(async () => { await cleanup(dir) })

describe('OOXML 识别', () => {
  it('识别 fflate 生成的 docx，拒绝普通文件', () => {
    expect(isOoxml(makeDocxBuf(['标题']))).toBe(true)
    expect(isOoxml(new TextEncoder().encode('not a zip'))).toBe(false)
  })
})

describe('OOXML 编码/解码', () => {
  it('重建后所有部件与原部件逐字节一致', async () => {
    const original = makeDocxBuf(['第一章 绪论', '1.1 研究背景'])
    const m = await encodeOoxml(ctx, original)
    expect(m.encoding).toBe('ooxml')
    expect(m.order).toEqual(['[Content_Types].xml', '_rels/.rels', 'word/document.xml'])

    const rebuilt = await decodeOoxml(ctx, m)
    const a = unzipSync(original)
    const b = unzipSync(rebuilt)
    expect(Object.keys(b).sort()).toEqual(Object.keys(a).sort())
    for (const k of Object.keys(a)) {
      expect(new TextDecoder().decode(b[k])).toBe(new TextDecoder().decode(a[k]))
    }
  })

  it('编辑一个部件后重编码，未变部件复用 ref（零新增存储）', async () => {
    const v1 = makeDocxBuf(['第一章 绪论'])
    const m1 = await encodeOoxml(ctx, v1)
    const before = await countObjects(path.join(dir, '库.wg', 'objects'))

    const v2 = editDocxAddParagraph(v1, '新增的一段正文内容，足够长以越过 CDC 最小块大小。'.repeat(50))
    const m2 = await encodeOoxml(ctx, v2, m1)

    // [Content_Types].xml 与 _rels/.rels 未变 → ref 完全复用
    expect(m2.entries['[Content_Types].xml'].ref).toEqual(m1.entries['[Content_Types].xml'].ref)
    expect(m2.entries['_rels/.rels'].ref).toEqual(m1.entries['_rels/.rels'].ref)
    const after = await countObjects(path.join(dir, '库.wg', 'objects'))
    expect(after.chunks + after.blobs).toBeLessThan(before.chunks + before.blobs + 8)

    const rebuilt = await decodeOoxml(ctx, m2)
    const a = unzipSync(v2)
    const b = unzipSync(rebuilt)
    for (const k of Object.keys(a)) {
      expect(new TextDecoder().decode(b[k])).toBe(new TextDecoder().decode(a[k]))
    }
  })
})

async function countObjects(objectsDir: string) {
  const fs = await import('node:fs/promises')
  async function walk(d: string): Promise<number> {
    let n = 0
    for (const e of await fs.readdir(d, { withFileTypes: true })) {
      if (e.name.includes('.tmp')) continue
      n += e.isDirectory() ? await walk(path.join(d, e.name)) : 1
    }
    return n
  }
  return {
    chunks: await walk(path.join(objectsDir, 'chunks')),
    blobs: await walk(path.join(objectsDir, 'blobs')),
  }
}
