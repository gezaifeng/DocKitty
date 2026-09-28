import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { Repo } from './repo.js'
import { writeFileAtomic } from './fsutil.js'

export interface JournalEntry {
  id: string
  op: 'commit' | 'import'
  docName: string
  branch: string
  startedAt: string
}

export async function openJournal(
  repo: Repo,
  op: JournalEntry['op'],
  docName: string,
  branch: string,
): Promise<string> {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const entry: JournalEntry = { id, op, docName, branch, startedAt: new Date().toISOString() }
  await writeFileAtomic(
    path.join(repo.root, 'journal', `${id}.json`),
    new TextEncoder().encode(JSON.stringify(entry)),
  )
  return id
}

export async function closeJournal(repo: Repo, id: string): Promise<void> {
  await fs.rm(path.join(repo.root, 'journal', `${id}.json`), { force: true })
}

export async function recoverJournal(repo: Repo): Promise<number> {
  await cleanTmpFiles(repo)
  const jDir = path.join(repo.root, 'journal')
  let names: string[]
  try {
    names = await fs.readdir(jDir)
  } catch {
    return 0
  }
  let count = 0
  for (const name of names) {
    if (!name.endsWith('.json')) continue
    await fs.rm(path.join(jDir, name), { force: true })
    count++
  }
  return count
}

async function cleanTmpFiles(repo: Repo): Promise<void> {
  for (const sub of ['objects/blobs', 'objects/chunks', 'objects/ooxml', 'refs/heads']) {
    await cleanDir(path.join(repo.root, sub))
  }
}

async function cleanDir(dir: string): Promise<void> {
  let entries: import('node:fs').Dirent[]
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const e of entries) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) await cleanDir(p)
    else if (e.isFile() && e.name.includes('.tmp-')) await fs.rm(p, { force: true })
  }
}
