import { promises as fs } from 'node:fs'
import path from 'node:path'
import { randomUUID, createHash } from 'node:crypto'
import type { Repo } from './repo.js'
import { documentDetail, versionBytes, snapshotSource } from './library.js'
import { readLibraryMeta, writeLibraryMeta } from './libraryMeta.js'
import { createBranchUnlocked, switchBranchUnlocked } from './ops.js'
import { docIds, docIdOf, writeHead } from './refs.js'
import { containedPath, validateBranchName } from './names.js'
import { withRepoWrite } from './writeLock.js'
import { writeFileAtomic } from './fsutil.js'
import { StorageContext } from './storageContext.js'
import { readCommit, readTree } from './model.js'
import { getManifest } from './ingest/index.js'

const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
function draftPath(repo: Repo, relative: string) {
  if (!relative.startsWith('drafts/')) throw new Error('编辑副本必须位于稿喵文档库内')
  return containedPath(repo.root, relative)
}

export async function startDraft(repo: Repo, docName: string, versionId: string, branch: string, mode: 'new' | 'replace' = 'new', title?: string) {
  return withRepoWrite(repo, async () => {
    validateBranchName(branch)
    const detail = await documentDetail(repo, docName), base = detail.versions.find(v => v.id === versionId)
    if (!base || base.deletedAt || detail.deletedAt) throw new Error('请先还原文档和版本')
    if (detail.workspace.dirty && detail.currentBranch === branch) throw new Error('当前工作区有未记录修改，请先保存工作区，再创建独立新稿')
    const newBranch = !detail.branchHeads[branch]
    if (newBranch) await createBranchUnlocked(repo, docName, branch, { commitId: versionId })
    else if (detail.branchHeads[branch] !== versionId) throw new Error('所选版本不是目标分支末端，请从此版本新建分支')
    if (detail.currentBranch !== branch || detail.workspace.versionId !== versionId) await switchBranchUnlocked(repo, docName, branch)
    const bytes = await versionBytes(repo, docName, versionId), meta = await readLibraryMeta(repo, docName)
    // A subsequent editing action on this branch starts a new session. Old draft files remain available.
    for (const draft of meta.drafts ?? []) if (draft.branch === branch) draft.closed = true
    const id = randomUUID(), ext = path.extname(docName), stem = path.basename(docName, ext).slice(0, 24)
    const filename = `${stem}_${branch.replace(/[\\/:*?"<>|]/g, '_').slice(0, 18)}_v${detail.versions.length + (mode === 'new' ? 1 : 0)}_${id.slice(0, 6)}${ext}`
    const relative = `drafts/${digest(Buffer.from(docName)).slice(0, 12)}/${id}/${filename}`
    await writeFileAtomic(draftPath(repo, relative), bytes)
    const draft = { id, path: relative, branch, baseVersionId: versionId, versionId: mode === 'replace' ? versionId : undefined,
      title: title?.trim() || (mode === 'replace' ? base.title : `${branch} · 第${detail.versions.filter(v => v.branches.includes(branch)).length + 1}稿`), mode, sha256: digest(bytes),
      position: base.position ? { x: base.position.x + (mode === 'new' ? 265 : 0), y: base.position.y + (newBranch ? 170 : 0) } : undefined }
    ;(meta.drafts ??= []).push(draft)
    await writeLibraryMeta(repo, docName, meta)
    return { workspacePath: draftPath(repo, relative), branch, draftId: id }
  })
}

export async function activeDraftFiles(repo: Repo) {
  const files: Array<{ docName: string; path: string }> = []
  for (const docName of await docIds(repo)) {
    const meta = await readLibraryMeta(repo, docName)
    if (!meta.deletedAt) for (const draft of meta.drafts ?? []) if (!draft.closed) files.push({ docName, path: draftPath(repo, draft.path) })
  }
  return files
}

export async function recordDraftSave(repo: Repo, file: string) {
  const relative = path.relative(repo.root, path.resolve(file)).split(path.sep).join('/')
  draftPath(repo, relative)
  return withRepoWrite(repo, async () => {
    for (const docName of await docIds(repo)) {
      const meta = await readLibraryMeta(repo, docName), draft = meta.drafts?.find(d => d.path === relative && !d.closed)
      if (!draft || meta.deletedAt) continue
      if (draft.pendingHead && draft.versionId) {
        const head = (await documentDetail(repo, docName)).branchHeads[draft.branch]
        if (head === draft.baseVersionId) await writeHead(repo, docIdOf(docName), draft.branch, draft.versionId)
        else if (head !== draft.versionId) throw new Error('分支在记录期间发生变化，编辑副本仍保留，请核对分支')
        draft.pendingHead = false; await writeLibraryMeta(repo, docName, meta)
      }
      const detail = await documentDetail(repo, docName), base = detail.versions.find(v => v.id === (draft.versionId ?? draft.baseVersionId))
      if (!base || base.deletedAt) return
      if (!detail.branchHeads[draft.branch]) throw new Error('编辑副本对应的分支已删除，文件仍保留，未重新创建分支')
      const bytes = await fs.readFile(draftPath(repo, relative)).catch(error => { if (error.code === 'ENOENT') return null; throw error })
      if (!bytes) return
      const sha = digest(bytes)
      if (sha === draft.sha256) return
      if (detail.branchHeads[draft.branch] !== (draft.versionId ?? draft.baseVersionId)) throw new Error('分支已经向后发展，请从这份副本新建分支；已有历史未改动')
      const parents = draft.versionId ? base.parents : [draft.baseVersionId]
      const contentId = await snapshotSource(repo, draftPath(repo, relative), parents, draft.title)
      const ctx = StorageContext.forRepo(repo), tree = await readTree(ctx, (await readCommit(ctx, contentId)).tree)
      if ((await getManifest(ctx, tree.entries[''])).sha256 !== sha) throw new Error('文件仍在写入，等待下一次保存后记录')
      const created = !draft.versionId
      if (created) {
        draft.versionId = contentId
        meta.versions[contentId] = { branchMembership: [draft.branch], title: draft.title, categoryId: base.categoryId, position: draft.position, sourcePath: relative }
        draft.pendingHead = true
      } else {
        const version = meta.versions[draft.versionId!] ??= {}
        version.revisions = [...(version.revisions ?? []), version.contentId ?? draft.versionId!]
        version.contentId = contentId
      }
      draft.sha256 = sha
      if (!detail.workspace.dirty && detail.currentBranch === draft.branch && [draft.baseVersionId, draft.versionId].includes(meta.workingVersionId)) {
        await writeFileAtomic(path.join(repo.root, 'workspace', docName), bytes)
        meta.workingVersionId = draft.versionId
        meta.workingContentId = contentId
      }
      await writeLibraryMeta(repo, docName, meta)
      if (created) {
        await writeHead(repo, docIdOf(docName), draft.branch, draft.versionId!)
        draft.pendingHead = false; await writeLibraryMeta(repo, docName, meta)
      }
      return { docName, branch: draft.branch, workspacePath: draftPath(repo, relative), versionId: draft.versionId!, status: created ? 'created' as const : 'updated' as const }
    }
  })
}
