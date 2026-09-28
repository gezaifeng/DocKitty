import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { Repo } from './repo.js'
import { StorageContext } from './storageContext.js'
import { docIdOf, readCurrentBranch, readHead, writeHead } from './refs.js'
import { encodeFile, getManifest, getManifestByContent, putManifest } from './ingest/index.js'
import { readCommit, readTree, writeCommit, writeTree, type Commit, type Tree } from './model.js'
import { readFileBlocks, teeHash } from './fsutil.js'

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
    const key = rel ? docName + '/' + rel : docName
    const abs = path.join(docAbs, rel)
    const fileSha = await sha256File(abs)
    const prevManifestId = prevTree.entries[key]
    let manifestId = prevManifestId ?? null

    if (manifestId) {
      const prevManifest = await getManifest(ctx, manifestId)
      if (prevManifest.sha256 !== fileSha) {
        manifestId = await putManifest(ctx, await encodeFile(ctx, abs, prevManifest))
        changed.push(key)
      }
    } else {
      // 新增路径：先查全文件快速路径（内容相同的全局去重）
      const existing = await getManifestByContent(ctx, fileSha)
      manifestId = existing ? await putManifest(ctx, existing) : await putManifest(ctx, await encodeFile(ctx, abs))
      changed.push(key)
    }
    entries[key] = manifestId!
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
