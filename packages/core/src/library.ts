import { promises as fs } from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type { Repo } from './repo.js'
import { StorageContext } from './storageContext.js'
import { docIds, docIdOf, listBranches, readHead, readCurrentBranch, writeHead } from './refs.js'
import { readCommit, readTree, writeCommit, writeTree } from './model.js'
import { encodeFile, getManifest, putManifest, materializeFile } from './ingest/index.js'
import { readLibraryMeta, writeLibraryMeta, resolveVersion, type LibraryMeta, type VersionMeta } from './libraryMeta.js'
import { commitDocUnlocked, checkoutDocUnlocked, createBranchUnlocked, switchBranchUnlocked, workspaceStatus } from './ops.js'
import { validateDocName, validateBranchName, containedPath } from './names.js'
import { withRepoWrite } from './writeLock.js'
import { writeFileAtomic } from './fsutil.js'
import { defaultVersionPositions } from './versionLayout.js'
import { registerImportSource } from './importSources.js'

export interface LibraryVersion {
  id: string
  contentId: string
  parents: string[]
  title: string
  note: string
  author: string
  createdAt: string
  branches: string[]
  categoryId: string
  order: number
  position?: { x: number; y: number }
  deletedAt: string | null
  revisionCount: number
  sourcePath?: string
}

export interface DocumentDetail {
  docName: string
  title: string
  deletedAt: string | null
  currentBranch: string
  branchHeads: Record<string, string>
  categories: Array<{ id: string; name: string }>
  versions: LibraryVersion[]
  workspace: { dirty: boolean; versionId: string | null; exists: boolean }
  draft?: { path: string; branch: string; baseVersionId: string; versionId?: string; title: string }
}

export async function documentDetail(repo: Repo, docName: string): Promise<DocumentDetail> {
  validateDocName(docName)
  const meta = await readLibraryMeta(repo, docName)
  const ctx = StorageContext.forRepo(repo)
  const heads: Record<string, string> = {}
  const versions = new Map<string, LibraryVersion>()
  for (const branch of await listBranches(repo, docIdOf(docName))) {
    const head = await readHead(repo, docIdOf(docName), branch)
    if (!head || meta.versions[head]?.purgedAt) continue
    heads[branch] = head
    const visited = new Set<string>()
    const queue = [head]
    while (queue.length) {
      const id = queue.pop()!
      if (visited.has(id)) continue
      visited.add(id)
      if (meta.versions[id]?.purgedAt) continue
      let version = versions.get(id)
      if (!version) {
        const original = await readCommit(ctx, id)
        const v = meta.versions[id] ?? {}
        const contentId = v.contentId ?? id
        const content = contentId === id ? original : await readCommit(ctx, contentId)
        version = {
          id, contentId, parents: v.parents ?? original.parents, title: v.title ?? original.message,
          note: v.note ?? '', author: content.author, createdAt: original.createdAt,
          branches: [], categoryId: v.categoryId ?? '', order: v.order ?? 0,
          position: v.position, deletedAt: v.deletedAt ?? null, revisionCount: v.revisions?.length ?? 0,
          sourcePath: v.sourcePath ? path.isAbsolute(v.sourcePath) ? v.sourcePath : containedPath(repo.root, v.sourcePath) : undefined,
        }
        versions.set(id, version)
      }
      if (!version.branches.includes(branch)) version.branches.push(branch)
      queue.push(...version.parents)
    }
  }
  for (const id of Object.keys(meta.versions)) {
    if (meta.versions[id].purgedAt) continue
    if (!versions.has(id)) {
      const original = await readCommit(ctx, id)
      const v = meta.versions[id]
      versions.set(id, {
        id, contentId: v.contentId ?? id, parents: v.parents ?? original.parents, title: v.title ?? original.message,
        note: v.note ?? '', author: original.author, createdAt: original.createdAt, branches: [],
        categoryId: v.categoryId ?? '', order: v.order ?? 0, position: v.position,
        deletedAt: v.deletedAt ?? null, revisionCount: v.revisions?.length ?? 0,
        sourcePath: v.sourcePath ? path.isAbsolute(v.sourcePath) ? v.sourcePath : containedPath(repo.root, v.sourcePath) : undefined,
      })
    }
  }
  for (const version of versions.values()) {
    const membership = meta.versions[version.id]?.branchMembership
    const candidates = membership?.filter(branch => branch in heads) ?? version.branches
    const owner = candidates.includes('main') ? 'main' : candidates.find(branch => !branch.startsWith('保护-')) ?? candidates[0] ?? Object.keys(heads)[0] ?? 'main'
    version.branches = [owner]
  }
  const positions = defaultVersionPositions([...versions.values()])
  for (const version of versions.values()) version.position ??= positions.get(version.id)
  const currentBranch = await readCurrentBranch(repo, docIdOf(docName))
  return {
    docName, title: meta.title ?? docName, deletedAt: meta.deletedAt ?? null,
    currentBranch, branchHeads: heads,
    categories: meta.categories, versions: [...versions.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id)),
    workspace: await workspaceStatus(repo, docName),
    draft: meta.drafts?.filter(d => !d.closed && d.branch === currentBranch && (d.versionId ?? d.baseVersionId) === heads[currentBranch]).at(-1),
  }
}

export async function libraryDocuments(repo: Repo): Promise<Array<{
  docName: string; title: string; deletedAt: string | null; currentBranch: string
  versionCount: number; lastModified: string | null; dirty: boolean
}>> {
  const docs = []
  for (const name of await docIds(repo)) {
    const d = await documentDetail(repo, name)
    const active = d.versions.filter(v => !v.deletedAt)
    docs.push({ docName: name, title: d.title, deletedAt: d.deletedAt, currentBranch: d.currentBranch,
      versionCount: active.length, lastModified: active[0]?.createdAt ?? null, dirty: d.workspace.dirty })
  }
  return docs
}

async function requireVersion(repo: Repo, docName: string, id: string): Promise<LibraryVersion> {
  const version = (await documentDetail(repo, docName)).versions.find(v => v.id === id)
  if (!version) throw new Error('该版本不属于所选文档')
  return version
}

export async function updateDocument(repo: Repo, docName: string, patch: { title?: string; deleted?: boolean }): Promise<void> {
  return withRepoWrite(repo, async () => {
    await documentDetail(repo, docName)
    const meta = await readLibraryMeta(repo, docName)
    if (patch.title !== undefined) {
      if (!patch.title.trim()) throw new Error('文档显示名称不能为空')
      meta.title = patch.title.trim()
    }
    if (patch.deleted !== undefined) {
      meta.deletedAt = patch.deleted ? new Date().toISOString() : null
      if (patch.deleted) for (const draft of meta.drafts ?? []) draft.closed = true
    }
    await writeLibraryMeta(repo, docName, meta)
  })
}

export async function updateVersion(repo: Repo, docName: string, id: string, patch: {
  title?: string; note?: string; categoryId?: string; order?: number
  position?: { x: number; y: number }; deleted?: boolean
}): Promise<void> {
  return withRepoWrite(repo, async () => {
    await requireVersion(repo, docName, id)
    const meta = await readLibraryMeta(repo, docName)
    const v = meta.versions[id] ??= {}
    if (patch.title !== undefined) {
      if (!patch.title.trim()) throw new Error('版本名称不能为空')
      v.title = patch.title.trim()
    }
    if (patch.note !== undefined) v.note = patch.note
    if (patch.categoryId !== undefined) {
      if (patch.categoryId && !meta.categories.some(c => c.id === patch.categoryId)) throw new Error('分类不存在')
      v.categoryId = patch.categoryId
    }
    if (patch.order !== undefined) {
      if (!Number.isFinite(patch.order)) throw new Error('排序值无效')
      v.order = patch.order
    }
    if (patch.position !== undefined) {
      if (!Number.isFinite(patch.position.x) || !Number.isFinite(patch.position.y)) throw new Error('节点位置无效')
      v.position = patch.position
    }
    if (patch.deleted !== undefined) {
      v.deletedAt = patch.deleted ? new Date().toISOString() : null
      if (patch.deleted) for (const draft of meta.drafts ?? []) if ((draft.versionId ?? draft.baseVersionId) === id) draft.closed = true
    }
    await writeLibraryMeta(repo, docName, meta)
  })
}

export async function updateCategory(repo: Repo, docName: string, action: 'create' | 'rename' | 'delete', name?: string, id?: string): Promise<string | null> {
  return withRepoWrite(repo, async () => {
    await documentDetail(repo, docName)
    const meta = await readLibraryMeta(repo, docName)
    if (action === 'delete') {
      if (!meta.categories.some(c => c.id === id)) throw new Error('分类不存在')
      meta.categories = meta.categories.filter(c => c.id !== id)
      for (const v of Object.values(meta.versions)) if (v.categoryId === id) v.categoryId = ''
      await writeLibraryMeta(repo, docName, meta)
      return null
    }
    if (!name?.trim()) throw new Error('分类名称不能为空')
    if (meta.categories.some(c => c.name === name.trim() && c.id !== id)) throw new Error('分类名称已存在')
    const categoryId = action === 'create' ? randomUUID() : id
    if (!categoryId) throw new Error('分类不存在')
    if (action === 'create') meta.categories.push({ id: categoryId, name: name.trim() })
    else {
      const category = meta.categories.find(c => c.id === id)
      if (!category) throw new Error('分类不存在')
      category.name = name.trim()
    }
    await writeLibraryMeta(repo, docName, meta)
    return categoryId
  })
}

export async function arrangeVersions(repo: Repo, docName: string, categoryId: string, versionIds: string[]): Promise<void> {
  return withRepoWrite(repo, async () => {
    const d = await documentDetail(repo, docName)
    const meta = await readLibraryMeta(repo, docName)
    if (categoryId && !meta.categories.some(c => c.id === categoryId)) throw new Error('分类不存在')
    if (new Set(versionIds).size !== versionIds.length) throw new Error('排序列表含重复版本')
    for (const id of versionIds) if (!d.versions.some(v => v.id === id && !v.deletedAt)) throw new Error('排序列表包含不可用版本')
    versionIds.forEach((id, order) => {
      const v = meta.versions[id] ??= {}
      v.categoryId = categoryId
      v.order = order
    })
    await writeLibraryMeta(repo, docName, meta)
  })
}

export async function snapshotSource(repo: Repo, sourcePath: string, parents: string[], message: string): Promise<string> {
  const ctx = StorageContext.forRepo(repo)
  const entries: Record<string, string> = {}
  async function visit(absolute: string, relative: string): Promise<void> {
    const st = await fs.lstat(absolute)
    if (st.isSymbolicLink()) throw new Error('请导入实际文件或目录，不支持符号链接')
    if (st.isDirectory()) {
      for (const name of (await fs.readdir(absolute)).sort()) await visit(path.join(absolute, name), relative ? relative + '/' + name : name)
    } else {
      entries[relative] = await putManifest(ctx, await encodeFile(ctx, absolute))
    }
  }
  await visit(sourcePath, '')
  return writeCommit(ctx, { parents, tree: await writeTree(ctx, { entries }), message, author: 'user', createdAt: new Date().toISOString() })
}

export async function importVersion(repo: Repo, docName: string, sourcePath: string, opts: { message: string; branch?: string; replaceVersionId?: string }): Promise<string> {
  return withRepoWrite(repo, async () => {
    const detail = await documentDetail(repo, docName)
    if (detail.deletedAt) throw new Error('请先从回收区还原该文档')
    const currentPath = path.join(repo.root, 'workspace', docName)
    const sourceStat = await fs.stat(sourcePath)
    const currentStat = await fs.stat(currentPath).catch(error => { if (error.code === 'ENOENT') return null; throw error })
    if (currentStat && sourceStat.isDirectory() !== currentStat.isDirectory()) throw new Error('文件与目录型文档不能互相替换')
    if (!sourceStat.isDirectory() && path.extname(sourcePath).toLowerCase() !== path.extname(docName).toLowerCase()) throw new Error('版本文件格式必须与原文档一致')
    if (!opts.message.trim()) throw new Error('请填写版本名称')
    if (opts.replaceVersionId) {
      const version = await requireVersion(repo, docName, opts.replaceVersionId)
      const contentId = await snapshotSource(repo, sourcePath, version.parents, opts.message)
      const meta = await readLibraryMeta(repo, docName)
      const v = meta.versions[version.id] ??= {}
      v.revisions = [...(v.revisions ?? []), v.contentId ?? version.id]
      v.contentId = contentId
      v.title = opts.message.trim()
      v.sourcePath = await registerImportSource(repo, docName, contentId, sourcePath)
      await writeLibraryMeta(repo, docName, meta)
      return version.id
    }
    const branch = validateBranchName(opts.branch ?? detail.currentBranch)
    const head = detail.branchHeads[branch]
    if (!head && detail.versions.length) throw new Error('目标分支不存在，请先创建分支')
    const id = await snapshotSource(repo, sourcePath, head ? [head] : [], opts.message)
    const meta = await readLibraryMeta(repo, docName)
    meta.versions[id] = { branchMembership: [branch], title: opts.message.trim(), sourcePath: await registerImportSource(repo, docName, id, sourcePath) }
    await writeLibraryMeta(repo, docName, meta)
    await writeHead(repo, docIdOf(docName), branch, id)
    return id
  })
}

export async function saveWorkspace(repo: Repo, docName: string, mode: 'new' | 'replace', message: string): Promise<{ versionId: string; changed: boolean }> {
  return withRepoWrite(repo, async () => {
    if (!message.trim()) throw new Error('请填写版本名称')
    const status = await workspaceStatus(repo, docName)
    if (!status.exists) throw new Error('工作区文件不存在，请先恢复所需版本')
    if (!status.dirty) return { versionId: status.versionId!, changed: false }
    if (mode === 'new') {
      const result = await commitDocUnlocked(repo, docName, { message, author: 'user' })
      return { versionId: result.commitId ?? status.versionId!, changed: result.commitId !== null }
    }
    if (!status.versionId) throw new Error('没有可覆盖的版本，请另存新版本')
    const version = await requireVersion(repo, docName, status.versionId)
    const contentId = await snapshotSource(repo, path.join(repo.root, 'workspace', docName), version.parents, message)
    const meta = await readLibraryMeta(repo, docName)
    const v = meta.versions[version.id] ??= {}
    v.revisions = [...(v.revisions ?? []), v.contentId ?? version.id]
    v.contentId = contentId
    v.title = message.trim()
    meta.workingContentId = contentId
    await writeLibraryMeta(repo, docName, meta)
    return { versionId: version.id, changed: true }
  })
}

export async function undoReplacement(repo: Repo, docName: string, id: string): Promise<void> {
  return withRepoWrite(repo, async () => {
    await requireVersion(repo, docName, id)
    const meta = await readLibraryMeta(repo, docName)
    const v = meta.versions[id]
    if (!v?.revisions?.length) throw new Error('该版本没有可撤销的替换记录')
    v.contentId = v.revisions.pop()!
    await writeLibraryMeta(repo, docName, meta)
  })
}

export async function versionBytes(repo: Repo, docName: string, id: string): Promise<Uint8Array> {
  const version = await requireVersion(repo, docName, id)
  const ctx = StorageContext.forRepo(repo)
  const tree = await readTree(ctx, (await readCommit(ctx, version.contentId)).tree)
  if (!tree.entries['']) throw new Error('目录型文档请使用导出目录功能')
  return materializeFile(ctx, await getManifest(ctx, tree.entries['']))
}

export async function exportVersion(repo: Repo, docName: string, id: string, destination: string): Promise<void> {
  const version = await requireVersion(repo, docName, id)
  const ctx = StorageContext.forRepo(repo)
  const tree = await readTree(ctx, (await readCommit(ctx, version.contentId)).tree)
  const target = path.resolve(destination)
  const repoRoot = path.resolve(repo.root)
  if (target === repoRoot || target.startsWith(repoRoot + path.sep)) throw new Error('请导出到仓库外，避免覆盖工作区或历史数据')
  if (await fs.stat(target).then(() => true, () => false)) throw new Error('目标已存在，请选择新的文件名或空目录')
  const files: Array<{ target: string; bytes: Uint8Array }> = []
  for (const [rel, manifestId] of Object.entries(tree.entries)) files.push({ target: containedPath(target, rel), bytes: await materializeFile(ctx, await getManifest(ctx, manifestId)) })
  if (!files.length) await fs.mkdir(target, { recursive: true })
  for (const file of files) await writeFileAtomic(file.target, file.bytes)
}

export async function beginVersionEdit(repo: Repo, docName: string, id: string, branch?: string): Promise<void> {
  return withRepoWrite(repo, async () => {
    const version = await requireVersion(repo, docName, id)
    const d = await documentDetail(repo, docName)
    const target = branch ?? d.currentBranch
    if (!d.branchHeads[target]) await createBranchUnlocked(repo, docName, target, { commitId: id })
    else if (d.branchHeads[target] !== id) throw new Error('该版本不是目标分支最新稿，请填写新分支名，或先移动分支起点')
    const meta = await readLibraryMeta(repo, docName)
    if (target === d.currentBranch && d.workspace.exists && meta.workingVersionId === id && meta.workingContentId === version.contentId) return
    await switchBranchUnlocked(repo, docName, target)
  })
}

export async function moveBranchHead(repo: Repo, docName: string, branch: string, versionId: string): Promise<{ protectedBranch: string | null }> {
  return withRepoWrite(repo, async () => {
    validateBranchName(branch)
    if ((await readCurrentBranch(repo, docIdOf(docName))) === branch) throw new Error('不能移动当前分支引用，请先切换到其他分支')
    await requireVersion(repo, docName, versionId)
    const head = await readHead(repo, docIdOf(docName), branch)
    if (!head) throw new Error('分支不存在')
    if (head === versionId) return { protectedBranch: null }
    const protectedBranch = '保护-' + Date.now() + '-' + randomUUID().slice(0, 6)
    await writeHead(repo, docIdOf(docName), protectedBranch, head)
    await writeHead(repo, docIdOf(docName), branch, versionId)
    return { protectedBranch }
  })
}
