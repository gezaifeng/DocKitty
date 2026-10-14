import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { Repo } from './repo.js'
import { StorageContext } from './storageContext.js'
import { documentDetail } from './library.js'
import { readLibraryMeta, writeLibraryMeta } from './libraryMeta.js'
import { docIds, docIdOf, writeHead } from './refs.js'
import { readCommit, readTree } from './model.js'
import { getManifest } from './ingest/index.js'
import { containedPath } from './names.js'
import { withRepoWrite } from './writeLock.js'

export async function purgeVersion(repo: Repo, docName: string, id: string, opts: { deleteSource: boolean; confirmedSourcePath?: string }) {
  return withRepoWrite(repo, async () => {
    const detail = await documentDetail(repo, docName), meta = await readLibraryMeta(repo, docName)
    const version = detail.versions.find(v => v.id === id)
    if (!version) throw new Error('该版本不存在或已彻底删除')
    const source = version.sourcePath
    if (opts.deleteSource && (!source || opts.confirmedSourcePath !== source)) throw new Error('请确认软件记录的导入文件完整路径')
    if (opts.deleteSource && source) {
      const relative = path.relative(repo.root, source)
      if (!relative || (!relative.startsWith('..') && !path.isAbsolute(relative) && !['drafts', 'workspace', 'imports'].includes(relative.split(path.sep)[0]))) throw new Error('不能删除文档库结构文件')
      const stat = await fs.lstat(source).catch(error => { if (error.code === 'ENOENT') return null; throw error })
      if (stat && (!stat.isFile() || stat.isSymbolicLink())) throw new Error('仅支持删除实际文件，目录和符号链接不能在这里删除')
      for (const name of await docIds(repo)) {
        const other = await documentDetail(repo, name)
        if (other.versions.some(v => !(name === docName && v.id === id) && v.sourcePath && path.resolve(v.sourcePath).toLowerCase() === path.resolve(source).toLowerCase())) throw new Error('其他版本也关联这份导入文件；请先使用仅从版本管理删除')
      }
    }
    // Preserve memberships of children that become independent after deletion.
    for (const v of detail.versions) {
      const record = meta.versions[v.id] ??= {}
      record.branchMembership ??= v.branches
      if (v.parents.includes(id)) { record.parents = v.parents.filter(p => p !== id); if (record.parentLabels) delete record.parentLabels[id]; if (record.parentNotes) delete record.parentNotes[id]; if (record.parentStyles) delete record.parentStyles[id] }
    }
    const record = meta.versions[id]
    const removedContents = [...new Set([id, version.contentId, ...(record.revisions ?? [])])]
    const ctx = StorageContext.forRepo(repo), candidates = new Set<string>(), candidateChunks = new Set<string>(), manifests = new Map<string, string>()
    const collect = async (commitId: string, blobs: Set<string>, chunks: Set<string>) => {
      const treeId = (await readCommit(ctx, commitId)).tree
      blobs.add(treeId)
      for (const manifestId of Object.values((await readTree(ctx, treeId)).entries)) {
        blobs.add(manifestId)
        const m = await getManifest(ctx, manifestId)
        if (blobs === candidates) manifests.set(manifestId, m.sha256)
        if (m.encoding === 'generic') for (const c of m.ref.chunks) chunks.add(c)
        else {
          for (const entry of Object.values(m.entries)) {
            if ('blob' in entry.ref) blobs.add(entry.ref.blob)
            else for (const c of entry.ref.chunks) chunks.add(c)
          }
          for (const c of m.original?.ref.chunks ?? []) chunks.add(c)
        }
      }
    }
    for (const contentId of removedContents) await collect(contentId, candidates, candidateChunks)
    const purged = new Set(removedContents)
    for (const name of await docIds(repo)) for (const contentId of (await readLibraryMeta(repo, name)).purgedContentIds ?? []) purged.add(contentId)
    const keep = new Set<string>(), keepChunks = new Set<string>()
    // All other stored commits, including recycled branches and revisions, protect shared data.
    for (const a of await fs.readdir(ctx.blobs.dir, { withFileTypes: true })) {
      if (!a.isDirectory() || !/^[a-f0-9]{2}$/.test(a.name)) continue
      for (const b of await fs.readdir(path.join(ctx.blobs.dir, a.name), { withFileTypes: true })) {
        if (!b.isDirectory() || !/^[a-f0-9]{2}$/.test(b.name)) continue
        for (const c of await fs.readdir(path.join(ctx.blobs.dir, a.name, b.name))) {
          const objectId = a.name + b.name + c
          if (!/^[a-f0-9]{64}$/.test(objectId) || purged.has(objectId)) continue
          const value = await ctx.blobs.get(objectId).then(bytes => { try { return JSON.parse(new TextDecoder().decode(bytes)) } catch { return null } })
          if (value && Array.isArray(value.parents) && typeof value.tree === 'string' && typeof value.message === 'string') await collect(objectId, keep, keepChunks)
        }
      }
    }
    for (const draft of meta.drafts ?? []) {
      if ((draft.versionId ?? draft.baseVersionId) !== id) continue
      draft.closed = true
      const file = containedPath(repo.root, draft.path)
      await fs.rm(file, { force: true })
    }
    if (meta.workingVersionId === id) {
      const file = containedPath(repo.root, `workspace/${docName}`)
      const stat = await fs.lstat(file).catch(error => { if (error.code === 'ENOENT') return null; throw error })
      if (stat?.isDirectory()) throw new Error('目录型文档请先导出保留内容，不支持在此彻底删除')
      await fs.rm(file, { force: true })
      delete meta.workingVersionId; delete meta.workingContentId
    }
    if (opts.deleteSource && source) await fs.rm(source, { force: true })
    record.purgedAt = new Date().toISOString(); record.parents = []; record.parentLabels = {}; record.parentNotes = {}; record.parentStyles = {}; record.branchMembership = []
    meta.purgedContentIds = [...new Set([...(meta.purgedContentIds ?? []), ...removedContents])]
    await writeLibraryMeta(repo, docName, meta)
    for (const [branch, head] of Object.entries(detail.branchHeads)) if (head === id) {
      const fallback = detail.versions.find(v => v.id !== id && !v.deletedAt && v.branches.includes(branch))
      if (fallback) await writeHead(repo, docIdOf(docName), branch, fallback.id)
      else await fs.rm(containedPath(repo.root, `refs/heads/${docIdOf(docName)}/${branch}`), { force: true })
    }
    for (const blob of candidates) if (!keep.has(blob)) {
      await ctx.blobs.remove(blob)
      const sha = manifests.get(blob)
      if (sha) await fs.rm(containedPath(repo.root, `objects/blobs/index/${sha}`), { force: true })
    }
    for (const chunk of candidateChunks) if (!keepChunks.has(chunk)) await ctx.chunks.remove(chunk)
    return { changed: true }
  })
}
