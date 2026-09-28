import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { Repo } from './repo.js'
import { StorageContext } from './storageContext.js'
import { docIdOf, readCurrentBranch, writeCurrentBranch, readHead, writeHead } from './refs.js'
import { encodeFile, getManifest, getManifestByContent, materializeFile, putManifest } from './ingest/index.js'
import { readCommit, readTree, writeCommit, writeTree, type Commit, type Tree } from './model.js'
import { readFileBlocks, teeHash, writeFileAtomic } from './fsutil.js'

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
  const docId = docIdOf(docName)
  const branch = opts.branch ?? await readCurrentBranch(repo, docId)
  const ctx = StorageContext.forRepo(repo)
  const docAbs = path.join(repo.root, 'workspace', docName)
  try {
    await fs.stat(docAbs)
  } catch {
    throw new Error(`workspace 中不存在文档：${docName}`)
  }

  // 当前 head 的 tree（可能不存在 = 首次提交）
  const headId = await readHead(repo, docId, branch)
  let prevTree: Tree = { entries: {} }
  if (headId) {
    prevTree = await readTree(ctx, (await readCommit(ctx, headId)).tree)
  }

  // 收集 workspace 中该文档的所有路径
  const paths: string[] = []
  await collectDocPaths(docAbs, '', paths)
  if (paths.length === 0) throw new Error(`workspace 中文档为空：${docName}`)

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
      // 新增路径：先查全文件快速路径（内容相同的全局去重）
      const existing = await getManifestByContent(ctx, fileSha)
      manifestId = existing ? await putManifest(ctx, existing) : await putManifest(ctx, await encodeFile(ctx, abs))
      changed.push(rel ? docName + '/' + rel : docName)
    }
    entries[rel] = manifestId!
  }

  if (changed.length === 0) {
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
  await writeHead(repo, docId, branch, cid)
  return { docId, branch, commitId: cid, changed }
}

export async function checkoutDoc(repo: Repo, docName: string, opts: { branch?: string; commitId?: string }): Promise<{ docId: string; commitId: string }> {
  const docId = docIdOf(docName)
  const ctx = StorageContext.forRepo(repo)
  const branch = opts.branch ?? await readCurrentBranch(repo, docId)
  const commitId = opts.commitId ?? await readHead(repo, docId, branch)
  if (!commitId) throw new Error(`没有可检出的提交（branch=${branch}）`)

  const commit = await readCommit(ctx, commitId)
  const tree = await readTree(ctx, commit.tree)
  const docAbs = path.join(repo.root, 'workspace', docName)

  // 物化全部条目（原子写；writeFileAtomic 自建父目录）
  for (const [rel, manifestId] of Object.entries(tree.entries)) {
    const m = await getManifest(ctx, manifestId)
    const data = await materializeFile(ctx, m)
    await writeFileAtomic(path.join(docAbs, rel), data)
  }

  // 删除工作区中不属于该 tree 的多余文件（目录型文档）
  const keep = new Set(Object.keys(tree.entries))
  const present: string[] = []
  await collectDocPaths(docAbs, '', present)
  for (const rel of present) {
    if (!keep.has(rel)) await fs.rm(path.join(docAbs, rel))
  }
  return { docId, commitId }
}

export async function importDoc(repo: Repo, sourcePath: string, name?: string): Promise<{ docId: string; commitId: string }> {
  const docName = name ?? path.basename(sourcePath)
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
  const r = await commitDoc(repo, docName, { message: '导入', author: 'import' })
  if (!r.commitId) throw new Error(`导入未产生提交：${docName}`)
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
  const docId = docIdOf(docName)
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(branch)) throw new Error(`分支名不合法：${branch}`)
  if (await readHead(repo, docId, branch)) throw new Error(`分支已存在：${branch}`)
  const base = from?.commitId
    ?? await readHead(repo, docId, from?.branch ?? await readCurrentBranch(repo, docId))
  if (!base) throw new Error('没有可指向的提交（请先提交首版本）')
  await writeHead(repo, docId, branch, base)
}

export async function switchBranch(repo: Repo, docName: string, branch: string): Promise<void> {
  const docId = docIdOf(docName)
  if (!(await readHead(repo, docId, branch))) throw new Error(`分支不存在：${branch}`)
  await writeCurrentBranch(repo, docId, branch)
  await checkoutDoc(repo, docName, { branch })
}
