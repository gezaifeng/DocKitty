import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { Repo } from '../src/repo.js'
import { commitDoc, createBranch } from '../src/ops.js'
import { readHead, docIdOf } from '../src/refs.js'
import { deleteBranchSafe, listQuarantine, restoreFromQuarantine, purgeQuarantine } from '../src/quarantine.js'
import { tmpDir, cleanup, makeDocxBuf } from './helpers.js'

let dir: string, repo: Repo
beforeEach(async () => {
  dir = await tmpDir()
  repo = await Repo.init(path.join(dir, '库.wg'), 't')
  await fs.writeFile(path.join(repo.root, 'workspace', '论文.docx'), makeDocxBuf(['第一章']))
  await commitDoc(repo, '论文.docx', { message: 'v1', author: 'test' })
  await createBranch(repo, '论文.docx', 'feature')
})
afterEach(async () => { await cleanup(dir) })

describe('quarantine', () => {
  it('deleteBranchSafe 创建回收条目并删除分支引用', async () => {
    const entry = await deleteBranchSafe(repo, '论文.docx', 'feature')
    expect(entry.branch).toBe('feature')
    expect(entry.commitId).toMatch(/^[0-9a-f]{64}$/)
    expect(entry.docName).toBe('论文.docx')
    expect(await readHead(repo, docIdOf('论文.docx'), 'feature')).toBeNull()
    await expect(fs.access(path.join(repo.root, 'quarantine', `${entry.id}.json`))).resolves.toBeUndefined()
  })

  it('listQuarantine 返回全部回收条目，按 deletedAt 倒序', async () => {
    await deleteBranchSafe(repo, '论文.docx', 'feature')
    const list = await listQuarantine(repo)
    expect(list).toHaveLength(1)
    expect(list[0].branch).toBe('feature')
  })

  it('restoreFromQuarantine 恢复分支引用并删除回收条目', async () => {
    const entry = await deleteBranchSafe(repo, '论文.docx', 'feature')
    await restoreFromQuarantine(repo, entry.id)
    expect(await readHead(repo, docIdOf('论文.docx'), 'feature')).toBe(entry.commitId)
    expect(await listQuarantine(repo)).toHaveLength(0)
  })

  it('purgeQuarantine 删除超过时限的条目', async () => {
    await deleteBranchSafe(repo, '论文.docx', 'feature')
    const count = await purgeQuarantine(repo, Date.now() + 1)
    expect(count).toBe(1)
    expect(await listQuarantine(repo)).toHaveLength(0)
  })

  it('purgeQuarantine 保留未到期条目（默认 30 天）', async () => {
    await deleteBranchSafe(repo, '论文.docx', 'feature')
    const count = await purgeQuarantine(repo)
    expect(count).toBe(0)
    expect(await listQuarantine(repo)).toHaveLength(1)
  })
})
