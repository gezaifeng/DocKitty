import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { Repo } from '../src/repo.js'
import { commitDoc, checkoutDoc } from '../src/ops.js'
import { docIdOf, readHead, writeHead } from '../src/refs.js'
import { tmpDir, cleanup, makeDocxBuf, editDocxAddParagraph } from './helpers.js'
import { readLibraryMeta } from '../src/libraryMeta.js'

let dir: string, repo: Repo
beforeEach(async () => {
  dir = await tmpDir()
  repo = await Repo.init(path.join(dir, '库.wg'), 't')
})
afterEach(async () => { await cleanup(dir) })

const docPath = () => path.join(repo.root, 'workspace', '论文.docx')

describe('checkoutDoc', () => {
  it('rolls back the entire folder when publishing a prepared checkout fails', async () => {
    const folder = path.join(repo.root, 'workspace', 'folder'); await fs.mkdir(folder)
    await fs.writeFile(path.join(folder, 'a.txt'), 'old A'); await fs.writeFile(path.join(folder, 'b.txt'), 'old B')
    const first = (await commitDoc(repo, 'folder', { message: 'v1', author: 'test' })).commitId!
    await fs.writeFile(path.join(folder, 'a.txt'), 'current A'); await fs.rm(path.join(folder, 'b.txt')); await fs.writeFile(path.join(folder, 'c.txt'), 'current C')
    const current = (await commitDoc(repo, 'folder', { message: 'v2', author: 'test' })).commitId!
    const rename = fs.rename.bind(fs), failure = vi.spyOn(fs, 'rename').mockImplementation(async (from, to) => {
      if (String(from).endsWith(path.sep + 'next')) throw new Error('publish failure fixture')
      return rename(from, to)
    })
    try { await expect(checkoutDoc(repo, 'folder', { commitId: first })).rejects.toThrow('publish failure fixture') }
    finally { failure.mockRestore() }
    expect(await fs.readdir(folder)).toEqual(['a.txt', 'c.txt'])
    expect(await fs.readFile(path.join(folder, 'a.txt'), 'utf8')).toBe('current A')
    expect(await fs.readFile(path.join(folder, 'c.txt'), 'utf8')).toBe('current C')
    expect((await readLibraryMeta(repo, 'folder')).workingVersionId).toBe(current)
    expect(await fs.readdir(path.join(repo.root, 'journal'))).toEqual([])
    expect((await fs.readdir(path.join(repo.root, 'workspace'))).some(name => name.startsWith('.checkout-'))).toBe(false)
  })

  it('recovers a checkout interrupted after moving the old workspace aside', async () => {
    await fs.writeFile(docPath(), makeDocxBuf(['current contents']))
    await commitDoc(repo, '论文.docx', { message: 'v1', author: 'test' })
    const beforeMeta = await readLibraryMeta(repo, '论文.docx'), original = await fs.readFile(docPath())
    const stage = await fs.mkdtemp(path.join(repo.root, 'workspace', '.checkout-'))
    await fs.writeFile(path.join(stage, 'next'), 'prepared target')
    await fs.writeFile(path.join(repo.root, 'journal', path.basename(stage) + '.json'), JSON.stringify({ op: 'checkout', docName: '论文.docx', stage: path.basename(stage), beforeMeta, beforeBranch: 'main', hadPrevious: true }))
    await fs.rename(docPath(), path.join(stage, 'previous'))
    await Repo.open(repo.root)
    expect(await fs.readFile(docPath())).toEqual(original)
    expect(await readLibraryMeta(repo, '论文.docx')).toEqual(beforeMeta)
    expect(await fs.readdir(path.join(repo.root, 'journal'))).toEqual([])
    await expect(fs.stat(stage)).rejects.toThrow()
  })
  it('检出旧提交后工作区恢复为该版本字节', async () => {
    const v1 = makeDocxBuf(['第一章'])
    await fs.writeFile(docPath(), v1)
    await commitDoc(repo, '论文.docx', { message: 'v1', author: 't' })
    const c1 = await readHead(repo, docIdOf('论文.docx'), 'main')

    await fs.writeFile(docPath(), editDocxAddParagraph(v1, '后来的大量修改内容。'.repeat(100)))
    await commitDoc(repo, '论文.docx', { message: 'v2', author: 't' })

    await checkoutDoc(repo, '论文.docx', { commitId: c1! })
    expect([...(await fs.readFile(docPath()))]).toEqual([...v1])
  })

  it('检出其他分支 head', async () => {
    const v1 = makeDocxBuf(['主线内容'])
    await fs.writeFile(docPath(), v1)
    await commitDoc(repo, '论文.docx', { message: 'v1', author: 't' })
    const c1 = (await readHead(repo, docIdOf('论文.docx'), 'main'))!

    await writeHead(repo, docIdOf('论文.docx'), '实验', c1)
    const branched = editDocxAddParagraph(makeDocxBuf(['主线内容']), '实验分支独有的段落。'.repeat(50))
    await fs.writeFile(docPath(), branched)
    await commitDoc(repo, '论文.docx', { message: '实验改动', author: 't', branch: '实验' })

    await checkoutDoc(repo, '论文.docx', { branch: 'main' })
    expect([...(await fs.readFile(docPath()))]).toEqual([...v1])
  })

  it('检出时删除工作区中不属于该提交的多余文件', async () => {
    const docDir = path.join(repo.root, 'workspace', '资料')
    await fs.mkdir(docDir, { recursive: true })
    await fs.writeFile(path.join(docDir, 'a.txt'), 'A')
    await commitDoc(repo, '资料', { message: 'v1', author: 't' })

    // 工作区混入一个不属于任何提交的多余文件
    const stray = path.join(docDir, 'stray.txt')
    await fs.writeFile(stray, '多余')

    await checkoutDoc(repo, '资料', { branch: 'main' })
    await expect(fs.stat(stray)).rejects.toThrow()
    expect(await fs.readFile(path.join(docDir, 'a.txt'), 'utf8')).toBe('A')
  })
})
