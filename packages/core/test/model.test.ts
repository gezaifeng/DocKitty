import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import path from 'node:path'
import { Repo } from '../src/repo.js'
import { StorageContext } from '../src/storageContext.js'
import { canonicalize, commitId, writeCommit, readCommit, writeTree, readTree } from '../src/model.js'
import { tmpDir, cleanup } from './helpers.js'

let dir: string, repo: Repo, ctx: StorageContext
beforeEach(async () => {
  dir = await tmpDir()
  repo = await Repo.init(path.join(dir, '库.wg'), 't')
  ctx = StorageContext.forRepo(repo)
})
afterEach(async () => { await cleanup(dir) })

describe('canonicalize', () => {
  it('键排序后与键序无关', () => {
    expect(canonicalize({ b: 1, a: { d: 2, c: 3 } })).toBe(canonicalize({ a: { c: 3, d: 2 }, b: 1 }))
  })

  it('undefined 值不写入字面量 undefined（往返仍可解析）', async () => {
    const cid = await writeCommit(ctx, {
      parents: [], tree: 't', message: '无作者',
      author: undefined as unknown as string, createdAt: '2026-09-28T00:00:00Z',
    })
    const c = await readCommit(ctx, cid)
    expect(c.message).toBe('无作者')
  })
})

describe('Commit/Tree', () => {
  it('id 由内容决定：相同内容相同 id，不同消息不同 id', async () => {
    const base = { parents: [], tree: 't', author: 'me', createdAt: '2026-09-28T00:00:00Z' }
    expect(await commitId({ ...base, message: 'a' })).toBe(await commitId({ ...base, message: 'a' }))
    expect(await commitId({ ...base, message: 'a' })).not.toBe(await commitId({ ...base, message: 'b' }))
  })

  it('write/read 往返', async () => {
    const tid = await writeTree(ctx, { entries: { '论文.docx': 'abc123' } })
    expect(await readTree(ctx, tid)).toEqual({ entries: { '论文.docx': 'abc123' } })
    const cid = await writeCommit(ctx, {
      parents: [], tree: tid, message: '首版本', author: 'me', createdAt: '2026-09-28T00:00:00Z',
    })
    expect(await readCommit(ctx, cid)).toEqual({
      parents: [], tree: tid, message: '首版本', author: 'me', createdAt: '2026-09-28T00:00:00Z',
    })
  })
})
