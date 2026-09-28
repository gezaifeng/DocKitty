import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { Repo } from '../src/repo.js'
import { openJournal, closeJournal, recoverJournal } from '../src/journal.js'
import { commitDoc } from '../src/ops.js'
import { tmpDir, cleanup, makeDocxBuf } from './helpers.js'

let dir: string, repo: Repo
beforeEach(async () => {
  dir = await tmpDir()
  repo = await Repo.init(path.join(dir, '库.wg'), 't')
})
afterEach(async () => { await cleanup(dir) })

describe('journal', () => {
  it('openJournal 创建条目；closeJournal 删除它', async () => {
    const id = await openJournal(repo, 'commit', '论文.docx', 'main')
    const jDir = path.join(repo.root, 'journal')
    expect((await fs.readdir(jDir)).filter(n => n.endsWith('.json'))).toHaveLength(1)
    await closeJournal(repo, id)
    expect((await fs.readdir(jDir)).filter(n => n.endsWith('.json'))).toHaveLength(0)
  })

  it('recoverJournal 清理 pending 条目和 .tmp 文件', async () => {
    await openJournal(repo, 'commit', '论文.docx', 'main')
    // 模拟崩溃时遗留的 .tmp 文件
    const tmpFile = path.join(repo.root, 'objects', 'blobs', 'aa', 'bb', 'orphan.tmp-9999-abc')
    await fs.mkdir(path.dirname(tmpFile), { recursive: true })
    await fs.writeFile(tmpFile, 'orphan')

    const count = await recoverJournal(repo)
    expect(count).toBe(1)

    expect((await fs.readdir(path.join(repo.root, 'journal'))).filter(n => n.endsWith('.json'))).toHaveLength(0)
    await expect(fs.access(tmpFile)).rejects.toThrow()
  })

  it('Repo.open() 自动触发 recoverJournal', async () => {
    const repoRoot = repo.root
    await openJournal(repo, 'commit', '论文.docx', 'main')
    const tmpFile = path.join(repoRoot, 'objects', 'chunks', 'cc', 'dd', 'x.tmp-1-z')
    await fs.mkdir(path.dirname(tmpFile), { recursive: true })
    await fs.writeFile(tmpFile, 'orphan2')

    await Repo.open(repoRoot)  // triggers recoverJournal

    expect((await fs.readdir(path.join(repoRoot, 'journal'))).filter(n => n.endsWith('.json'))).toHaveLength(0)
    await expect(fs.access(tmpFile)).rejects.toThrow()
  })

  it('commitDoc 成功后 journal 为空', async () => {
    await fs.writeFile(path.join(repo.root, 'workspace', '论文.docx'), makeDocxBuf(['第一章']))
    await commitDoc(repo, '论文.docx', { message: 'v1', author: 'test' })
    expect((await fs.readdir(path.join(repo.root, 'journal'))).filter(n => n.endsWith('.json'))).toHaveLength(0)
  })
})
