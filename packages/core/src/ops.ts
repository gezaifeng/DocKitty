import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { Repo } from './repo.js'
import { StorageContext } from './storageContext.js'
import { docIdOf, docIds, listBranches, readCurrentBranch, writeCurrentBranch, readHead, writeHead } from './refs.js'
import { encodeFile, getManifest, getManifestByContent, materializeFile, putManifest } from './ingest/index.js'
import { readCommit, readTree, writeCommit, writeTree, type Commit, type Tree } from './model.js'
import { readFileBlocks, teeHash, writeFileAtomic } from './fsutil.js'
import { openJournal, closeJournal } from './journal.js'
import { validateDocName, validateBranchName, containedPath } from './names.js'
import { withRepoWrite } from './writeLock.js'
import { readLibraryMeta, writeLibraryMeta, resolveVersion, workingVersion } from './libraryMeta.js'
import { sha256 } from './hashes.js'
import { registerImportSource } from './importSources.js'

export interface CommitResult {
  docId: string
  branch: string
  commitId: string | null
  changed: string[]
}

async function sha256File(p: string): Promise<string> {
  const tee = teeHash(readFileBlocks(p))
  for await (const _ of tee.stream) { /* 仅消费 */ }
  return tee.digest()
}

async function collectDocPaths(abs: string, rel: string, out: string[]): Promise<void> {
  const st = await fs.stat(abs)
  if (st.isDirectory()) {
    for (const e of await fs.readdir(abs)) {
      await collectDocPaths(path.join(abs, e), rel ? `${rel}/${e}` : e, out)
    }
  } else {
    out.push(rel)
  }
}

export async function commitDoc(repo: Repo, docName: string, opts: { message: string; author: string; branch?: string }): Promise<CommitResult> {
  return withRepoWrite(repo, () => commitDocUnlocked(repo, docName, opts))
}

export async function commitDocUnlocked(repo: Repo, docName: string, opts: { message: string; author: string; branch?: string }): Promise<CommitResult> {
  validateDocName(docName)
  const docId = docIdOf(docName)
  const branch = opts.branch ?? await readCurrentBranch(repo, docId)
  validateBranchName(branch)
  const journalId = await openJournal(repo, 'commit', docName, branch)
  try {
    const ctx = StorageContext.forRepo(repo)
    const docAbs = path.join(repo.root, 'workspace', docName)
    try {
      await fs.stat(docAbs)
    } catch {
      throw new Error(`workspace 中不存在文档：${docName}`)
    }

    const headId = await readHead(repo, docId, branch)
    let prevTree: Tree = { entries: {} }
    if (headId) {
      prevTree = await readTree(ctx, (await readCommit(ctx, await resolveVersion(repo, docName, headId))).tree)
    }

    const paths: string[] = []
    await collectDocPaths(docAbs, '', paths)
    if (paths.length === 0 && !headId) throw new Error(`workspace 中文档为空：${docName}`)

    const entries: Tree['entries'] = {}
    const changed: string[] = []
    for (const rel of paths.sort()) {
      const abs = path.join(docAbs, rel)
      const fileSha = await sha256File(abs)
      const prevManifestId = prevTree.entries[rel]
      let manifestId = prevManifestId ?? null

      if (manifestId) {
        const prevManifest = await getManifest(ctx, manifestId)
        if (prevManifest.sha256 !== fileSha) {
          manifestId = await putManifest(ctx, await encodeFile(ctx, abs, prevManifest))
          changed.push(rel ? docName + '/' + rel : docName)
        }
      } else {
        const existing = await getManifestByContent(ctx, fileSha)
        manifestId = existing ? await putManifest(ctx, existing) : await putManifest(ctx, await encodeFile(ctx, abs))
        changed.push(rel ? docName + '/' + rel : docName)
      }
      entries[rel] = manifestId!
    }

    for (const rel of Object.keys(prevTree.entries)) {
      if (!(rel in entries)) changed.push(rel ? docName + '/' + rel : docName)
    }

    if (changed.length === 0) {
      await closeJournal(repo, journalId)
      return { docId, branch, commitId: null, changed }
    }

    const treeId = await writeTree(ctx, { entries })
    const commit: Commit = {
      parents: headId ? [headId] : [],
      tree: treeId,
      message: opts.message,
      author: opts.author,
      createdAt: new Date().toISOString(),
    }
    const cid = await writeCommit(ctx, commit)
    const ownership = await readLibraryMeta(repo, docName)
    ;(ownership.versions[cid] ??= {}).branchMembership = [branch]
    await writeLibraryMeta(repo, docName, ownership)
    await writeHead(repo, docId, branch, cid)
    await workingVersion(repo, docName, cid)
    await closeJournal(repo, journalId)
    return { docId, branch, commitId: cid, changed }
  } catch (e) {
    // journal 条目故意留下：下次 Repo.open() 触发 recoverJournal 清理
    throw e
  }
}

export async function checkoutDoc(repo: Repo, docName: string, opts: { branch?: string; commitId?: string }): Promise<{ docId: string; commitId: string }> {
  return withRepoWrite(repo, () => checkoutDocUnlocked(repo, docName, opts))
}

export async function workspaceStatus(repo: Repo, docName: string): Promise<{ dirty: boolean; versionId: string | null; exists: boolean }> {
  validateDocName(docName)
  const meta = await readLibraryMeta(repo, docName)
  const versionId = meta.workingVersionId ?? await readHead(repo, docIdOf(docName), await readCurrentBranch(repo, docIdOf(docName)))
  const docAbs = path.join(repo.root, 'workspace', docName)
  const exists = await fs.stat(docAbs).then(() => true, () => false)
  if (!exists || !versionId) return { dirty: exists, versionId, exists }
  const ctx = StorageContext.forRepo(repo)
  const contentId = meta.workingContentId ?? await resolveVersion(repo, docName, versionId)
  const tree = await readTree(ctx, (await readCommit(ctx, contentId)).tree)
  const paths: string[] = []
  await collectDocPaths(docAbs, '', paths)
  if (paths.length !== Object.keys(tree.entries).length) return { dirty: true, versionId, exists }
  for (const rel of paths) {
    if (!tree.entries[rel]) return { dirty: true, versionId, exists }
    const m = await getManifest(ctx, tree.entries[rel])
    const hash = await sha256File(containedPath(docAbs, rel))
    if (hash !== m.sha256) {
      if (m.encoding !== 'ooxml' || m.original || hash !== await sha256(await materializeFile(ctx, m))) return { dirty: true, versionId, exists }
    }
  }
  return { dirty: false, versionId, exists }
}

export async function checkoutDocUnlocked(repo: Repo, docName: string, opts: { branch?: string; commitId?: string }): Promise<{ docId: string; commitId: string }> {
  validateDocName(docName)
  const docId = docIdOf(docName)
  const ctx = StorageContext.forRepo(repo)
  const branch = opts.branch ?? await readCurrentBranch(repo, docId)
  const commitId = opts.commitId ?? await readHead(repo, docId, branch)
  if (!commitId) throw new Error(`没有可检出的提交（branch=${branch}）`)

  const commit = await readCommit(ctx, await resolveVersion(repo, docName, commitId))
  const tree = await readTree(ctx, commit.tree)
  const docAbs = path.join(repo.root, 'workspace', docName)

  const materialized: Array<{ target: string; data: Uint8Array }> = []
  for (const [rel, manifestId] of Object.entries(tree.entries)) {
    const m = await getManifest(ctx, manifestId)
    materialized.push({ target: containedPath(docAbs, rel), data: await materializeFile(ctx, m) })
  }
  if ((await workspaceStatus(repo, docName)).dirty) {
    await commitDocUnlocked(repo, docName, { message: '恢复或切换前自动保护的工作区', author: 'word_git' })
  }
  if (Object.keys(tree.entries).length === 0) await fs.mkdir(docAbs, { recursive: true })

  // 物化全部条目（原子写；writeFileAtomic 自建父目录）
  for (const item of materialized) await writeFileAtomic(item.target, item.data)

  // 删除工作区中不属于该 tree 的多余文件（目录型文档）
  const keep = new Set(Object.keys(tree.entries))
  const present: string[] = []
  await collectDocPaths(docAbs, '', present)
  for (const rel of present) {
    if (!keep.has(rel)) await fs.rm(containedPath(docAbs, rel))
  }
  await workingVersion(repo, docName, commitId)
  return { docId, commitId }
}

export async function importDoc(repo: Repo, sourcePath: string, name?: string): Promise<{ docId: string; commitId: string }> {
  return withRepoWrite(repo, () => importDocUnlocked(repo, sourcePath, name))
}

export async function importDocUnlocked(repo: Repo, sourcePath: string, name?: string): Promise<{ docId: string; commitId: string }> {
  const docName = validateDocName(name ?? path.basename(sourcePath))
  const existing = await docIds(repo)
  if (existing.some(n => n.toLocaleLowerCase() === docName.toLocaleLowerCase())) throw new Error('该文档已存在，请使用“导入为已有文档的版本”')
  const dest = path.join(repo.root, 'workspace', docName)
  const exists = await fs.stat(dest).then(() => true, () => false)
  if (exists) throw new Error(`workspace 中已存在文档：${docName}`)
  await fs.mkdir(path.dirname(dest), { recursive: true })
  const st = await fs.stat(sourcePath)
  if (st.isDirectory()) {
    await fs.cp(sourcePath, dest, { recursive: true })
  } else {
    await fs.copyFile(sourcePath, dest)
  }
  const r = await commitDocUnlocked(repo, docName, { message: '导入', author: 'import' })
  if (!r.commitId) throw new Error(`导入未产生提交：${docName}`)
  const meta = await readLibraryMeta(repo, docName)
  ;(meta.versions[r.commitId] ??= {}).sourcePath = await registerImportSource(repo, docName, r.commitId, sourcePath)
  await writeLibraryMeta(repo, docName, meta)
  return { docId: r.docId, commitId: r.commitId }
}

export interface CommitNode {
  id: string
  parents: string[]
  message: string
  author: string
  createdAt: string
}

export async function listCommits(repo: Repo, docName: string, branch?: string): Promise<CommitNode[]> {
  const docId = docIdOf(docName)
  const ctx = StorageContext.forRepo(repo)
  let id = await readHead(repo, docId, branch ?? await readCurrentBranch(repo, docId))
  const out: CommitNode[] = []
  while (id) {
    const c = await readCommit(ctx, id)
    out.push({ id, parents: c.parents, message: c.message, author: c.author, createdAt: c.createdAt })
    id = c.parents[0] ?? null
  }
  return out
}

export async function createBranch(repo: Repo, docName: string, branch: string, from?: { branch?: string; commitId?: string }): Promise<void> {
  return withRepoWrite(repo, () => createBranchUnlocked(repo, docName, branch, from))
}

export async function createBranchUnlocked(repo: Repo, docName: string, branch: string, from?: { branch?: string; commitId?: string }): Promise<void> {
  validateDocName(docName)
  validateBranchName(branch)
  const docId = docIdOf(docName)
  const existing = await listBranches(repo, docId)
  if (existing.some(n => n.toLocaleLowerCase() === branch.toLocaleLowerCase())) throw new Error(`分支已存在：${branch}`)
  const base = from?.commitId
    ?? await readHead(repo, docId, from?.branch ?? await readCurrentBranch(repo, docId))
  if (!base) throw new Error('没有可指向的提交（请先提交首版本）')
  await readCommit(StorageContext.forRepo(repo), base)
  const meta = await readLibraryMeta(repo, docName)
  if (meta.versions[base]?.purgedAt) throw new Error('该版本文件已彻底删除')
  await writeHead(repo, docId, branch, base)
}

export async function switchBranch(repo: Repo, docName: string, branch: string): Promise<void> {
  return withRepoWrite(repo, () => switchBranchUnlocked(repo, docName, branch))
}

export async function switchBranchUnlocked(repo: Repo, docName: string, branch: string): Promise<void> {
  validateDocName(docName)
  validateBranchName(branch)
  const docId = docIdOf(docName)
  if (!(await readHead(repo, docId, branch))) throw new Error(`分支不存在：${branch}`)
  await checkoutDocUnlocked(repo, docName, { branch })
  await writeCurrentBranch(repo, docId, branch)
}
