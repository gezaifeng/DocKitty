import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { deflateSync } from 'fflate'
import { Repo } from '../src/repo.js'
import { commitDoc } from '../src/ops.js'
import { scrub } from '../src/scrub.js'
import { StorageContext } from '../src/storageContext.js'
import { readCommit, readTree } from '../src/model.js'
import { getManifest } from '../src/ingest/index.js'
import { createProject, importProjectItems, getProject } from '../src/projects.js'
import { tmpDir, cleanup, makeDocxBuf } from './helpers.js'

let dir: string, repo: Repo
beforeEach(async () => {
  dir = await tmpDir()
  repo = await Repo.init(path.join(dir, '库.wg'), 't')
})
afterEach(async () => { await cleanup(dir) })

describe('scrub', () => {
  it.each(['commit', 'tree', 'manifest', 'chunk'])('reports a missing referenced %s instead of a clean library', async kind => {
    await fs.writeFile(path.join(repo.root, 'workspace', 'draft.txt'), 'Keep the immutable history.')
    const commitId = (await commitDoc(repo, 'draft.txt', { message: 'v1', author: 'test' })).commitId!
    const ctx = StorageContext.forRepo(repo), commit = await readCommit(ctx, commitId), tree = await readTree(ctx, commit.tree)
    const manifestId = tree.entries[''], manifest = await getManifest(ctx, manifestId)
    if (manifest.encoding !== 'generic') throw new Error('Expected a generic text fixture')
    const id = kind === 'commit' ? commitId : kind === 'tree' ? commit.tree : kind === 'manifest' ? manifestId : manifest.ref.chunks[0]
    const target = path.join(repo.objectsDir(kind === 'chunk' ? 'chunks' : 'blobs'), id.slice(0, 2), id.slice(2, 4), id.slice(4))
    await fs.rm(target)
    const result = await scrub(repo)
    expect(result.corrupted.some(item => item.objectPath === target && item.actual.includes('missing'))).toBe(true)
  })

  it('checks project file snapshots as well as version objects', async () => {
    const source = path.join(dir, 'project.txt'); await fs.writeFile(source, 'project source')
    const project = await createProject(repo, 'Project')
    await importProjectItems(repo, { projectId: project.id, paths: [source] })
    const hash = (await getProject(repo, project.id)).nodes[0].contentHash!
    const target = path.join(repo.root, 'objects', 'project-files', hash)
    await fs.rm(target)
    expect((await scrub(repo)).corrupted.some(item => item.objectPath === target)).toBe(true)
  })
  it('干净仓库校验：0 个损坏对象', async () => {
    await fs.writeFile(path.join(repo.root, 'workspace', '论文.docx'), makeDocxBuf(['第一章']))
    await commitDoc(repo, '论文.docx', { message: 'v1', author: 'test' })
    const result = await scrub(repo)
    expect(result.corrupted).toHaveLength(0)
    expect(result.checked).toBeGreaterThan(0)
  })

  it('发现被篡改的对象', async () => {
    await fs.writeFile(path.join(repo.root, 'workspace', '论文.docx'), makeDocxBuf(['第一章']))
    await commitDoc(repo, '论文.docx', { message: 'v1', author: 'test' })

    // 找到第一个 blob 文件并覆盖其内容（有效 deflate，但内容不同）
    const blobsDir = repo.objectsDir('blobs')
    let corruptedPath: string | null = null
    outer: for (const l1 of await fs.readdir(blobsDir, { withFileTypes: true })) {
      if (!l1.isDirectory()) continue
      for (const l2 of await fs.readdir(path.join(blobsDir, l1.name), { withFileTypes: true })) {
        if (!l2.isDirectory()) continue
        for (const l3 of await fs.readdir(path.join(blobsDir, l1.name, l2.name), { withFileTypes: true })) {
          if (!l3.isFile()) continue
          corruptedPath = path.join(blobsDir, l1.name, l2.name, l3.name)
          break outer
        }
      }
    }
    expect(corruptedPath).not.toBeNull()
    await fs.writeFile(corruptedPath!, deflateSync(new TextEncoder().encode('corrupted!')))

    const result = await scrub(repo)
    expect(result.corrupted).toHaveLength(1)
    expect(result.corrupted[0].objectPath).toBe(corruptedPath)
  })
})
