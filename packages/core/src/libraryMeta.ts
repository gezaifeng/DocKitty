import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { Repo } from './repo.js'
import { docIdOf } from './refs.js'
import { writeFileAtomic } from './fsutil.js'
import { validateDocName } from './names.js'

export interface VersionMeta {
  title?: string
  note?: string
  categoryId?: string
  order?: number
  position?: { x: number; y: number }
  deletedAt?: string | null
  contentId?: string
  revisions?: string[]
  parents?: string[]
  branchMembership?: string[]
  purgedAt?: string
  sourcePath?: string
}

export interface LibraryMeta {
  format: 1
  title?: string
  deletedAt?: string | null
  workingVersionId?: string
  workingContentId?: string
  categories: Array<{ id: string; name: string }>
  versions: Record<string, VersionMeta>
  purgedContentIds?: string[]
  drafts?: Array<{ id: string; path: string; branch: string; baseVersionId: string; versionId?: string; title: string; mode: 'new' | 'replace'; sha256: string; closed?: boolean; pendingHead?: boolean; position?: { x: number; y: number } }>
}

export async function readLibraryMeta(repo: Repo, docName: string): Promise<LibraryMeta> {
  validateDocName(docName)
  try {
    const value = JSON.parse(await fs.readFile(path.join(repo.root, 'library', docIdOf(docName) + '.json'), 'utf8')) as LibraryMeta
    if (value.format !== 1 || !Array.isArray(value.categories) || !value.versions) throw new Error('文档整理数据格式无效')
    return value
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    return { format: 1, categories: [], versions: {} }
  }
}

export async function writeLibraryMeta(repo: Repo, docName: string, meta: LibraryMeta): Promise<void> {
  validateDocName(docName)
  await writeFileAtomic(path.join(repo.root, 'library', docIdOf(docName) + '.json'), new TextEncoder().encode(JSON.stringify(meta, null, 2)))
}

export async function workingVersion(repo: Repo, docName: string, id: string): Promise<void> {
  const meta = await readLibraryMeta(repo, docName)
  meta.workingVersionId = id
  meta.workingContentId = meta.versions[id]?.contentId ?? id
  await writeLibraryMeta(repo, docName, meta)
}

export async function resolveVersion(repo: Repo, docName: string, id: string): Promise<string> {
  const meta = await readLibraryMeta(repo, docName)
  if (meta.versions[id]?.purgedAt) throw new Error('该版本文件已彻底删除')
  return meta.versions[id]?.contentId ?? id
}
