import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import path from 'node:path'
import { Repo } from '../src/repo.js'
import { docIds, listBranches, readHead, writeHead, readCurrentBranch, writeCurrentBranch, deleteBranch } from '../src/refs.js'
import { tmpDir, cleanup } from './helpers.js'

let dir: string, repo: Repo
beforeEach(async () => {
  dir = await tmpDir()
  repo = await Repo.init(path.join(dir, '库.wg'), 't')
})
afterEach(async () => { await cleanup(dir) })

describe('分支引用', () => {
  it('write/read/原子替换 head', async () => {
    await writeHead(repo, '论文', 'main', 'c1')
    expect(await readHead(repo, '论文', 'main')).toBe('c1')
    await writeHead(repo, '论文', 'main', 'c2')
    expect(await readHead(repo, '论文', 'main')).toBe('c2')
  })

  it('listBranches 不含 HEAD；docIds 列出所有文档', async () => {
    await writeHead(repo, '论文', 'main', 'c1')
    await writeHead(repo, '论文', '实验分支', 'c2')
    await writeHead(repo, '报告', 'main', 'c3')
    expect(await listBranches(repo, '论文')).toEqual(['main', '实验分支'])
    expect((await docIds(repo)).sort()).toEqual(['报告', '论文'])
  })

  it('当前分支默认 main，可切换；不可删除当前分支', async () => {
    await writeHead(repo, '论文', 'main', 'c1')
    await writeHead(repo, '论文', 'b2', 'c2')
    expect(await readCurrentBranch(repo, '论文')).toBe('main')
    await writeCurrentBranch(repo, '论文', 'b2')
    expect(await readCurrentBranch(repo, '论文')).toBe('b2')
    await expect(deleteBranch(repo, '论文', 'b2')).rejects.toThrow(/当前分支/)
    await deleteBranch(repo, '论文', 'main')
    expect(await listBranches(repo, '论文')).toEqual(['b2'])
  })

  it('不存在的 head 返回 null', async () => {
    expect(await readHead(repo, '不存在', 'main')).toBeNull()
  })
})
