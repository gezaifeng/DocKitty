import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { Repo } from '../src/repo.js'
import { StorageContext } from '../src/storageContext.js'
import { encodeGeneric, materializeGeneric } from '../src/ingest/generic.js'
import { readFileBlocks } from '../src/fsutil.js'
import { tmpDir, cleanup } from './helpers.js'

let dir: string, repo: Repo, ctx: StorageContext
beforeEach(async () => {
  dir = await tmpDir()
  repo = await Repo.init(path.join(dir, '库.wg'), 't')
  ctx = StorageContext.forRepo(repo)
})
afterEach(async () => { await cleanup(dir) })

describe('generic 编码', () => {
  it('编码→物化 往返逐字节一致（1MB 随机内容）', async () => {
    const buf = new Uint8Array(1_000_000)
    for (let i = 0; i < buf.length; i++) buf[i] = (i * 31 + 7) & 0xff
    const p = path.join(dir, 'f.bin')
    await fs.writeFile(p, buf)

    const m = await encodeGeneric(ctx, readFileBlocks(p))
    expect(m.encoding).toBe('generic')
    expect(m.size).toBe(buf.length)
    expect(m.ref.chunks.length).toBeGreaterThan(10)

    const back = await materializeGeneric(ctx, m)
    expect([...back]).toEqual([...buf])
  })

  it('相同文件二次编码复用已有块（无新增对象）', async () => {
    const p = path.join(dir, 'f.bin')
    await fs.writeFile(p, new Uint8Array(100_000).fill(1))
    const m1 = await encodeGeneric(ctx, readFileBlocks(p))
    const m2 = await encodeGeneric(ctx, readFileBlocks(p))
    expect(m2.ref.chunks).toEqual(m1.ref.chunks)
  })
})
