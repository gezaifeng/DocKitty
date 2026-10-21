import { promises as fs } from 'node:fs'
import path from 'node:path'
import { inflateSync } from 'fflate'
import type { Repo } from './repo.js'
import { sha256 } from './hashes.js'
import { withRepoWrite } from './writeLock.js'
import { readFileBlocks, teeHash } from './fsutil.js'
import type { LibraryMeta } from './libraryMeta.js'

export interface ScrubCorruption {
  objectPath: string
  expected: string
  actual: string
}

export interface ScrubResult {
  checked: number
  corrupted: ScrubCorruption[]
}

export async function scrub(repo: Repo): Promise<ScrubResult> {
  return withRepoWrite(repo, () => scrubUnlocked(repo))
}

async function scrubUnlocked(repo: Repo): Promise<ScrubResult> {
  const dirs = [repo.objectsDir('blobs'), repo.objectsDir('chunks'), repo.objectsDir('ooxml')]
  let checked = 0
  const corrupted: ScrubCorruption[] = []
  const required = new Map<string, string>(), present = new Set<string>()
  const problem = (objectPath: string, expected: string, actual: string) => corrupted.push({ objectPath, expected, actual })
  const readJson = async (file: string) => {
    try { return JSON.parse(await fs.readFile(file, 'utf8')) }
    catch (error) { problem(file, 'valid JSON', (error as Error).message); return null }
  }
  const entries = async (dir: string) => {
    try { return await fs.readdir(dir, { withFileTypes: true }) }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') problem(dir, 'readable directory', (error as Error).message); return [] }
  }
  const metadata: LibraryMeta[] = []
  for (const entry of await entries(path.join(repo.root, 'library'))) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue
    const file = path.join(repo.root, 'library', entry.name), value = await readJson(file)
    if (value) {
      if (value.format !== 1 || !value.versions || !Array.isArray(value.categories)) problem(file, 'valid library metadata', 'invalid format')
      else metadata.push(value)
    }
  }
  const purged = new Set(metadata.flatMap(meta => meta.purgedContentIds ?? []))
  const requireObject = (kind: 'blobs' | 'chunks', id: unknown) => {
    if (typeof id !== 'string' || !/^[a-f0-9]{64}$/.test(id)) { problem(repo.objectsDir(kind), 'SHA-256 object id', String(id)); return }
    if (kind === 'blobs' && purged.has(id)) return
    required.set(path.join(repo.objectsDir(kind), id.slice(0, 2), id.slice(2, 4), id.slice(4)), id)
  }
  for (const meta of metadata) {
    if (meta.workingContentId) requireObject('blobs', meta.workingContentId)
    for (const [id, version] of Object.entries(meta.versions)) {
      if (version.purgedAt) continue
      requireObject('blobs', id)
      if (version.contentId) requireObject('blobs', version.contentId)
      for (const revision of version.revisions ?? []) requireObject('blobs', revision)
    }
  }
  for (const doc of await entries(path.join(repo.root, 'refs', 'heads'))) {
    if (!doc.isDirectory()) continue
    for (const branch of await entries(path.join(repo.root, 'refs', 'heads', doc.name))) {
      if (!branch.isFile() || branch.name === 'HEAD' || branch.name.includes('.tmp-')) continue
      const file = path.join(repo.root, 'refs', 'heads', doc.name, branch.name)
      try { requireObject('blobs', (await fs.readFile(file, 'utf8')).trim()) }
      catch (error) { problem(file, 'readable branch', (error as Error).message) }
    }
  }
  for (const entry of await entries(path.join(repo.root, 'quarantine'))) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue
    const value = await readJson(path.join(repo.root, 'quarantine', entry.name))
    if (value) requireObject('blobs', value.commitId)
  }
  const fileReferences = (value: { ref?: { chunks?: string[]; blob?: string }; entries?: Record<string, { ref?: { chunks?: string[]; blob?: string } }>; original?: { ref?: { chunks?: string[] } } }) => {
    if (value.ref?.blob) requireObject('blobs', value.ref.blob)
    for (const id of value.ref?.chunks ?? []) requireObject('chunks', id)
    for (const entry of Object.values(value.entries ?? {})) {
      if (entry.ref?.blob) requireObject('blobs', entry.ref.blob)
      for (const id of entry.ref?.chunks ?? []) requireObject('chunks', id)
    }
    for (const id of value.original?.ref?.chunks ?? []) requireObject('chunks', id)
  }
  for (const dir of dirs) {
    await walkObjects(dir, async (objectPath, expectedId) => {
      present.add(objectPath)
      let raw: Uint8Array
      try {
        raw = inflateSync(new Uint8Array(await fs.readFile(objectPath)))
      } catch (error) {
        problem(objectPath, expectedId, `(read/inflate failed: ${(error as Error).message})`)
        checked++
        return
      }
      const actual = await sha256(raw)
      if (actual !== expectedId) problem(objectPath, expectedId, actual)
      checked++
      if (dir !== repo.objectsDir('blobs') || purged.has(expectedId)) return
      let value
      try { value = JSON.parse(new TextDecoder().decode(raw)) } catch { return }
      if (!value || typeof value !== 'object') return
      if (typeof value.tree === 'string' && Array.isArray(value.parents)) { requireObject('blobs', value.tree); for (const id of value.parents) requireObject('blobs', id) }
      else if (value.encoding === 'generic' || value.encoding === 'ooxml') fileReferences(value)
      else if (value.entries && Object.values(value.entries).every(id => typeof id === 'string')) for (const id of Object.values(value.entries)) requireObject('blobs', id)
    }, entries)
  }
  const projectDir = path.join(repo.root, 'objects', 'project-files')
  const catalogPath = path.join(repo.root, 'projects', 'catalog.json')
  if ((await entries(path.dirname(catalogPath))).some(entry => entry.name === 'catalog.json')) {
    const catalog = await readJson(catalogPath)
    if (catalog && catalog.format === 1 && Array.isArray(catalog.projects)) {
      for (const project of catalog.projects) for (const node of project.nodes ?? []) {
        if (node.kind !== 'file' || node.linkTarget) continue
        if (typeof node.contentHash !== 'string' || !/^[a-f0-9]{64}$/.test(node.contentHash)) problem(catalogPath, 'project snapshot id', String(node.contentHash))
        else required.set(path.join(projectDir, node.contentHash), node.contentHash)
      }
    } else if (catalog) problem(catalogPath, 'valid project catalog', 'invalid format')
  }
  for (const entry of await entries(projectDir)) {
    if (!entry.isFile() || !/^[a-f0-9]{64}$/.test(entry.name)) continue
    const file = path.join(projectDir, entry.name); present.add(file); checked++
    try {
      const hash = teeHash(readFileBlocks(file))
      for await (const _ of hash.stream) { /* stream snapshot verification */ }
      const actual = await hash.digest()
      if (actual !== entry.name) problem(file, entry.name, actual)
    } catch (error) { problem(file, entry.name, (error as Error).message) }
  }
  for (const [file, id] of required) if (!present.has(file)) { checked++; problem(file, id, '(missing referenced object)') }
  return { checked, corrupted }
}

async function walkObjects(dir: string, cb: (p: string, id: string) => Promise<void>, entries: (dir: string) => Promise<import('node:fs').Dirent[]>): Promise<void> {
  for (const e1 of (await entries(dir)).filter(e => e.isDirectory() && /^[a-f0-9]{2}$/.test(e.name))) {
    const d1 = path.join(dir, e1.name)
    for (const e2 of (await entries(d1)).filter(e => e.isDirectory() && /^[a-f0-9]{2}$/.test(e.name))) {
      const d2 = path.join(d1, e2.name)
      for (const e3 of (await entries(d2)).filter(e => e.isFile() && /^[a-f0-9]{60}$/.test(e.name))) {
        await cb(path.join(d2, e3.name), e1.name + e2.name + e3.name)
      }
    }
  }
}
