import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { Repo } from '../src/repo.js'
import { commitDoc, checkoutDoc } from '../src/ops.js'
import { docIdOf, readHead, writeHead } from '../src/refs.js'
import { tmpDir, cleanup, makeDocxBuf, editDocxAddParagraph } from './helpers.js'

let dir: string, repo: Repo
beforeEach(async () => {
  dir = await tmpDir()
  repo = await Repo.init(path.join(dir, '库.wg'), 't')
})
afterEach(async () => { await cleanup(dir) })

const docPath = () => path.join(repo.root, 'workspace', '论文.docx')

describe('checkoutDoc', () => {
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
