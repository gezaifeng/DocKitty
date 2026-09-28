import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { Repo } from '../src/repo.js'
import { importDoc, commitDoc, listCommits, createBranch, switchBranch } from '../src/ops.js'
import { readHead, listBranches, readCurrentBranch } from '../src/refs.js'
import { StorageContext } from '../src/storageContext.js'
import { readCommit, readTree } from '../src/model.js'
import { tmpDir, cleanup, makeDocxBuf, editDocxAddParagraph } from './helpers.js'

let dir: string, repo: Repo
beforeEach(async () => {
  dir = await tmpDir()
  repo = await Repo.init(path.join(dir, '库.wg'), 't')
})
afterEach(async () => { await cleanup(dir) })

describe('importDoc', () => {
  it('导入外部文件为首版本并复制进 workspace', async () => {
    const src = path.join(dir, '外部.docx')
    await fs.writeFile(src, makeDocxBuf(['导入我']))
    const { docId, commitId } = await importDoc(repo, src)
    expect(docId).toBe(encodeURIComponent('外部.docx'))
    expect(commitId).toMatch(/^[0-9a-f]{64}$/)
    expect(await readHead(repo, docId, 'main')).toBe(commitId)
    const wsFile = path.join(repo.root, 'workspace', '外部.docx')
    expect([...(await fs.readFile(wsFile))]).toEqual([...(await fs.readFile(src))])
  })

  it('name 参数覆盖入库名', async () => {
    const src = path.join(dir, 'a.docx')
    await fs.writeFile(src, makeDocxBuf(['内容']))
    const { docId } = await importDoc(repo, src, '论文.docx')
    expect(docId).toBe(encodeURIComponent('论文.docx'))
    await fs.stat(path.join(repo.root, 'workspace', '论文.docx'))
  })

  it('导入目录作为一篇文档', async () => {
    const srcDir = path.join(dir, '资料')
    await fs.mkdir(srcDir)
    await fs.writeFile(path.join(srcDir, 'a.txt'), 'A')
    await fs.writeFile(path.join(srcDir, 'b.txt'), 'B')
    const { docId, commitId } = await importDoc(repo, srcDir)
    expect(docId).toBe(encodeURIComponent('资料'))
    expect(commitId).toMatch(/^[0-9a-f]{64}$/)
    const ctx = StorageContext.forRepo(repo)
    const tree = await readTree(ctx, (await readCommit(ctx, commitId)).tree)
    expect(Object.keys(tree.entries).sort()).toEqual(['a.txt', 'b.txt'])
  })

  it('workspace 中已存在同名文档时报错', async () => {
    const src = path.join(dir, 'a.docx')
    await fs.writeFile(src, makeDocxBuf(['x']))
    await importDoc(repo, src)
    await expect(importDoc(repo, src)).rejects.toThrow(/已存在/)
  })
})

describe('listCommits', () => {
  it('从 head 沿 parents 回溯，新→旧', async () => {
    const wsFile = path.join(repo.root, 'workspace', '论文.docx')
    const v1 = makeDocxBuf(['第一版'])
    await fs.writeFile(wsFile, v1)
    await commitDoc(repo, '论文.docx', { message: 'v1', author: 't' })
    await fs.writeFile(wsFile, editDocxAddParagraph(v1, '第二版新增。'.repeat(30)))
    await commitDoc(repo, '论文.docx', { message: 'v2', author: 't' })

    const commits = await listCommits(repo, '论文.docx')
    expect(commits.map(c => c.message)).toEqual(['v2', 'v1'])
    expect(commits[0].parents).toEqual([commits[1].id])
    expect(commits[1].parents).toEqual([])
    for (const c of commits) {
      expect(c.id).toMatch(/^[0-9a-f]{64}$/)
      expect(c.createdAt).toBeTruthy()
    }
  })

  it('无提交时返回空数组', async () => {
    expect(await listCommits(repo, '不存在的.docx')).toEqual([])
  })
})

describe('createBranch / switchBranch', () => {
  async function seedMain(): Promise<Uint8Array> {
    const wsFile = path.join(repo.root, 'workspace', '论文.docx')
    const v1 = makeDocxBuf(['主线内容'])
    await fs.writeFile(wsFile, v1)
    await commitDoc(repo, '论文.docx', { message: 'm1', author: 't' })
    return v1
  }

  it('createBranch 从当前 head 建分支；switchBranch 切换并物化工作区', async () => {
    const v1 = await seedMain()
    const docId = encodeURIComponent('论文.docx')

    await createBranch(repo, '论文.docx', 'experiment')
    expect(await listBranches(repo, docId)).toEqual(['experiment', 'main'])

    // 在 experiment 分支上提交
    const wsFile = path.join(repo.root, 'workspace', '论文.docx')
    await fs.writeFile(wsFile, editDocxAddParagraph(v1, '实验分支段落。'.repeat(40)))
    await commitDoc(repo, '论文.docx', { message: 'e1', author: 't', branch: 'experiment' })

    // 切回 main：工作区字节恢复为 v1
    await switchBranch(repo, '论文.docx', 'main')
    expect(await readCurrentBranch(repo, docId)).toBe('main')
    expect([...(await fs.readFile(wsFile))]).toEqual([...v1])

    // 切到 experiment：工作区为实验版本
    await switchBranch(repo, '论文.docx', 'experiment')
    expect(await readCurrentBranch(repo, docId)).toBe('experiment')
    expect([...(await fs.readFile(wsFile))]).not.toEqual([...v1])
  })

  it('createBranch 可用 from.commitId 指定历史起点', async () => {
    const wsFile = path.join(repo.root, 'workspace', '论文.docx')
    const v1 = makeDocxBuf(['v1'])
    await fs.writeFile(wsFile, v1)
    await commitDoc(repo, '论文.docx', { message: 'v1', author: 't' })
    const c1 = (await readHead(repo, encodeURIComponent('论文.docx'), 'main'))!
    await fs.writeFile(wsFile, editDocxAddParagraph(v1, 'v2 内容。'.repeat(30)))
    await commitDoc(repo, '论文.docx', { message: 'v2', author: 't' })

    await createBranch(repo, '论文.docx', 'old', { commitId: c1 })
    const commits = await listCommits(repo, '论文.docx', 'old')
    expect(commits.map(c => c.message)).toEqual(['v1'])
  })

  it('分支重名 / 无起点 / 切换到不存在分支均报错', async () => {
    await seedMain()
    await createBranch(repo, '论文.docx', 'experiment')
    await expect(createBranch(repo, '论文.docx', 'experiment')).rejects.toThrow(/已存在/)
    await expect(switchBranch(repo, '论文.docx', 'ghost')).rejects.toThrow(/不存在/)
    await expect(createBranch(repo, '不存在的.docx', 'b')).rejects.toThrow(/没有可指向的提交/)
  })
})
