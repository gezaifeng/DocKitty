import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { Repo } from './repo.js'
import { writeFileAtomic } from './fsutil.js'
import { docIdOf, readHead, writeHead, deleteBranch } from './refs.js'

export interface QuarantineEntry {
  id: string
  docId: string
  docName: string
  branch: string
  commitId: string
  deletedAt: string
}

export async function deleteBranchSafe(repo: Repo, docName: string, branch: string): Promise<QuarantineEntry> {
  const docId = docIdOf(docName)
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

export async function restoreFromQuarantine(repo: Repo, entryId: string): Promise<void> {
  const qDir = path.join(repo.root, 'quarantine')
  const p = path.join(qDir, `${entryId}.json`)
  const entry = JSON.parse(await fs.readFile(p, 'utf8')) as QuarantineEntry
  await writeHead(repo, entry.docId, entry.branch, entry.commitId)
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
