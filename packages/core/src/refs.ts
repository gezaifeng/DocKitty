import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { Repo } from './repo.js'
import { writeFileAtomic } from './fsutil.js'

export function docIdOf(name: string): string {
  return encodeURIComponent(name)
}

export function docNameOf(docId: string): string {
  return decodeURIComponent(docId)
}

function headsDir(repo: Repo, docId: string): string {
  return path.join(repo.root, 'refs', 'heads', docId)
}

export async function docIds(repo: Repo): Promise<string[]> {
  const base = path.join(repo.root, 'refs', 'heads')
  try {
    const es = await fs.readdir(base, { withFileTypes: true })
    return es.filter(e => e.isDirectory()).map(e => docNameOf(e.name))
  } catch {
    return []
  }
}

export async function listBranches(repo: Repo, docId: string): Promise<string[]> {
  try {
    const es = await fs.readdir(headsDir(repo, docId), { withFileTypes: true })
    return es.filter(e => e.isFile() && e.name !== 'HEAD').map(e => e.name).sort()
  } catch {
    return []
  }
}

export async function readHead(repo: Repo, docId: string, branch: string): Promise<string | null> {
  try {
    return (await fs.readFile(path.join(headsDir(repo, docId), branch), 'utf8')).trim()
  } catch {
    return null
  }
}

export async function writeHead(repo: Repo, docId: string, branch: string, commitId: string): Promise<void> {
  await writeFileAtomic(path.join(headsDir(repo, docId), branch), new TextEncoder().encode(commitId))
}

export async function readCurrentBranch(repo: Repo, docId: string): Promise<string> {
  try {
    return (await fs.readFile(path.join(headsDir(repo, docId), 'HEAD'), 'utf8')).trim() || 'main'
  } catch {
    return 'main'
  }
}

export async function writeCurrentBranch(repo: Repo, docId: string, branch: string): Promise<void> {
  await writeFileAtomic(path.join(headsDir(repo, docId), 'HEAD'), new TextEncoder().encode(branch))
}

export async function deleteBranch(repo: Repo, docId: string, branch: string): Promise<void> {
  const current = await readCurrentBranch(repo, docId)
  if (branch === current) throw new Error(`不能删除当前分支：${branch}`)
  await fs.rm(path.join(headsDir(repo, docId), branch))
}
