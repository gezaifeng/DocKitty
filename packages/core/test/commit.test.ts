import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { Repo } from '../src/repo.js'
import { commitDoc, listCommits } from '../src/ops.js'
import { docIdOf, readHead } from '../src/refs.js'
import { tmpDir, cleanup, makeDocxBuf, editDocxAddParagraph } from './helpers.js'

let dir: string, repo: Repo
beforeEach(async () => {
  dir = await tmpDir()
  repo = await Repo.init(path.join(dir, '库.wg'), 't')
})
afterEach(async () => { await cleanup(dir) })

async function importFile(name: string, buf: Uint8Array): Promise<void> {
  await fs.writeFile(path.join(repo.root, 'workspace', name), buf)
  await commitDoc(repo, name, { message: '导入', author: 'tester' })
}

describe('commitDoc', () => {
  it('首次提交创建 main 分支头', async () => {
    await importFile('论文.docx', makeDocxBuf(['第一章']))
    const head = await readHead(repo, docIdOf('论文.docx'), 'main')
    expect(head).toMatch(/^[0-9a-f]{64}$/)
  })

  it('修改后提交：head 前进、changed 列出变更路径', async () => {
    await importFile('论文.docx', makeDocxBuf(['第一章']))
    const v1 = await readHead(repo, docIdOf('论文.docx'), 'main')
    await fs.writeFile(path.join(repo.root, 'workspace', '论文.docx'),
      editDocxAddParagraph(makeDocxBuf(['第一章']), '新增内容，长度足够以越过 CDC 最小块。'.repeat(20)))
    const r = await commitDoc(repo, '论文.docx', { message: '补充正文', author: 'tester' })
    expect(r.commitId).toMatch(/^[0-9a-f]{64}$/)
    expect(r.changed).toEqual(['论文.docx'])
    expect(await readHead(repo, docIdOf('论文.docx'), 'main')).not.toBe(v1)
  })

  it('无变更时 commitId 为 null', async () => {
    await importFile('论文.docx', makeDocxBuf(['第一章']))
    const r = await commitDoc(repo, '论文.docx', { message: '再提交', author: 'tester' })
    expect(r.commitId).toBeNull()
    expect(r.changed).toEqual([])
  })

  it('author 缺省（CLI 未传 --author）时提交对象仍可读', async () => {
    await importFile('论文.docx', makeDocxBuf(['第一章']))
    await fs.writeFile(path.join(repo.root, 'workspace', '论文.docx'),
      editDocxAddParagraph(makeDocxBuf(['第一章']), '新增内容，长度足够以越过 CDC 最小块。'.repeat(20)))
    const r = await commitDoc(repo, '论文.docx', {
      message: '无作者提交', author: undefined as unknown as string,
    })
    expect(r.commitId).toMatch(/^[0-9a-f]{64}$/)
    const commits = await listCommits(repo, '论文.docx')
    expect(commits[0].message).toBe('无作者提交')
  })

  it('workspace 中不存在该文档时报错', async () => {
    await expect(commitDoc(repo, 'ghost.docx', { message: 'x', author: 't' }))
      .rejects.toThrow(/workspace 中不存在/)
  })
})
