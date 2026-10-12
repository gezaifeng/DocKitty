import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { Repo } from '../src/repo.js'
import { StorageContext } from '../src/storageContext.js'
import { encodeFile, materializeFile, putManifest, getManifest, getManifestByContent } from '../src/ingest/index.js'
import { tmpDir, cleanup, makeDocxBuf } from './helpers.js'

let dir: string, repo: Repo, ctx: StorageContext
beforeEach(async () => {
  dir = await tmpDir()
  repo = await Repo.init(path.join(dir, '库.wg'), 't')
  ctx = StorageContext.forRepo(repo)
})
afterEach(async () => { await cleanup(dir) })

describe('encodeFile 调度', () => {
  it('docx 走 ooxml 编码，txt 走 generic', async () => {
    const p1 = path.join(dir, 'a.docx')
    await fs.writeFile(p1, makeDocxBuf(['x']))
    const m1 = await encodeFile(ctx, p1)
    expect(m1.encoding).toBe('ooxml')

    const p2 = path.join(dir, 'b.txt')
    await fs.writeFile(p2, 'hello world')
    const m2 = await encodeFile(ctx, p2)
    expect(m2.encoding).toBe('generic')
  })

  it('伪 zip（PK 头但无 Content_Types）回退 generic', async () => {
    const p = path.join(dir, 'fake.docx')
    const bad = new Uint8Array([0x50, 0x4b, 3, 4, ...new TextEncoder().encode('junk')])
    await fs.writeFile(p, bad)
    const m = await encodeFile(ctx, p)
    expect(m.encoding).toBe('generic')
    expect([...await materializeFile(ctx, m)]).toEqual([...bad])
  })
})

describe('清单存储', () => {
  it('put/get/byContent 往返', async () => {
    const p = path.join(dir, 'a.docx')
    await fs.writeFile(p, makeDocxBuf(['内容']))
    const m = await encodeFile(ctx, p)
    const id = await putManifest(ctx, m)
    expect(await getManifest(ctx, id)).toEqual(m)
    expect(await getManifestByContent(ctx, m.sha256)).toEqual(m)
    expect(await getManifestByContent(ctx, '0'.repeat(64))).toBeNull()
  })
})
