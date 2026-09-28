import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { Repo, FORMAT_VERSION } from '../src/repo.js'

let dir: string
beforeEach(async () => { dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wg-repo-')) })
afterEach(async () => { await fs.rm(dir, { recursive: true, force: true }) })

describe('Repo.init', () => {
  it('创建 spec §5.1 规定的目录布局与 repo.yaml', async () => {
    const repo = await Repo.init(path.join(dir, '库.wg'), '我的文档')
    for (const d of ['journal', 'objects/blobs', 'objects/chunks', 'objects/ooxml',
                     'refs/heads', 'quarantine', 'workspace', 'index']) {
      const st = await fs.stat(path.join(repo.root, d))
      expect(st.isDirectory()).toBe(true)
    }
    const yaml = JSON.parse(await fs.readFile(path.join(repo.root, 'repo.yaml'), 'utf8'))
    expect(yaml.formatVersion).toBe(FORMAT_VERSION)
    expect(yaml.name).toBe('我的文档')
    expect(typeof yaml.createdAt).toBe('string')
  })
})

describe('Repo.open', () => {
  it('打开合法仓库', async () => {
    await Repo.init(path.join(dir, '库.wg'), 'x')
    const repo = await Repo.open(path.join(dir, '库.wg'))
    expect(repo.root).toBe(path.join(dir, '库.wg'))
  })
  it('拒绝更高格式版本的仓库', async () => {
    const root = path.join(dir, '库.wg')
    await Repo.init(root, 'x')
    await fs.writeFile(path.join(root, 'repo.yaml'), JSON.stringify({ formatVersion: 999, name: 'x', createdAt: '' }))
    await expect(Repo.open(root)).rejects.toThrow(/格式版本/)
  })
  it('拒绝非仓库目录', async () => {
    await expect(Repo.open(dir)).rejects.toThrow(/不是 word_git 仓库/)
  })
})
