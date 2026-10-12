import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { Repo } from './repo.js'
import { writeFileAtomic } from './fsutil.js'
import { docIdOf, readHead, writeHead, deleteBranch, readCurrentBranch } from './refs.js'
import { withRepoWrite } from './writeLock.js'
import { validateDocName, validateBranchName } from './names.js'
import { readLibraryMeta } from './libraryMeta.js'

export interface QuarantineEntry {
  id: string
  docId: string
  docName: string
  branch: string
  commitId: string
  deletedAt: string
}

export async function deleteBranchSafe(repo: Repo, docName: string, branch: string): Promise<QuarantineEntry> {
  return withRepoWrite(repo, () => deleteBranchSafeUnlocked(repo, docName, branch))
}

async function deleteBranchSafeUnlocked(repo: Repo, docName: string, branch: string): Promise<QuarantineEntry> {
  validateDocName(docName)
  validateBranchName(branch)
  const docId = docIdOf(docName)
  if (await readCurrentBranch(repo, docId) === branch) throw new Error('不能删除当前分支')
  const commitId = await readHead(repo, docId, branch)
  if (!commitId) throw new Error(`分支不存在：${branch}`)
  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const entry: QuarantineEntry = { id, docId, docName, branch, commitId, deletedAt: new Date().toISOString() }
  const qDir = path.join(repo.root, 'quarantine')
  await fs.mkdir(qDir, { recursive: true })
  await writeFileAtomic(path.join(qDir, `${id}.json`), new TextEncoder().encode(JSON.stringify(entry)))
  await deleteBranch(repo, docId, branch)
  return entry
}

export async function listQuarantine(repo: Repo): Promise<QuarantineEntry[]> {
  const qDir = path.join(repo.root, 'quarantine')
  let names: string[]
  try { names = await fs.readdir(qDir) } catch { return [] }
  const entries: QuarantineEntry[] = []
  for (const name of names) {
    if (!name.endsWith('.json')) continue
    entries.push(JSON.parse(await fs.readFile(path.join(qDir, name), 'utf8')) as QuarantineEntry)
  }
  return entries.sort((a, b) => b.deletedAt.localeCompare(a.deletedAt))
}

export async function restoreFromQuarantine(repo: Repo, entryId: string, branch?: string): Promise<void> {
  return withRepoWrite(repo, () => restoreUnlocked(repo, entryId, branch))
}

async function restoreUnlocked(repo: Repo, entryId: string, branch?: string): Promise<void> {
  validateDocName(entryId)
  const qDir = path.join(repo.root, 'quarantine')
  const p = path.join(qDir, `${entryId}.json`)
  const entry = JSON.parse(await fs.readFile(p, 'utf8')) as QuarantineEntry
  if ((await readLibraryMeta(repo, entry.docName)).versions[entry.commitId]?.purgedAt) throw new Error('该分支末端文件已彻底删除，不能恢复该引用')
  const target=branch??entry.branch
  validateBranchName(target)
  if (await readHead(repo, entry.docId, target)) throw new Error('同名分支已存在，请输入其他恢复名称')
  await writeHead(repo, entry.docId, target, entry.commitId)
  await fs.rm(p)
}

export async function purgeQuarantine(repo: Repo, beforeMs?: number): Promise<number> {
  const cutoff = beforeMs ?? (Date.now() - 30 * 24 * 60 * 60 * 1000)
  const entries = await listQuarantine(repo)
  const qDir = path.join(repo.root, 'quarantine')
  let count = 0
  for (const entry of entries) {
    if (new Date(entry.deletedAt).getTime() < cutoff) {
      await fs.rm(path.join(qDir, `${entry.id}.json`), { force: true })
      count++
    }
  }
  return count
}
