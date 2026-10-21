import { promises as fs } from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import type { Repo } from './repo.js'
import { writeFileAtomic } from './fsutil.js'
import { withRepoWrite } from './writeLock.js'
import { validateDocName } from './names.js'

interface Snapshot { files: Map<string, Buffer>; directories: string[]; hash: string }
interface Change { file: string; before?: Buffer; after?: Buffer }
export interface ExternalHistory {
  validate(direction: 'undo' | 'redo'): Promise<void>
  apply(direction: 'undo' | 'redo'): Promise<void>
}
interface Entry { label: string; changes: Change[]; addedDirectories: string[]; removedDirectories: string[]; beforeHash: string; afterHash: string; external?: ExternalHistory }
const histories = new Map<string, { undo: Entry[]; redo: Entry[] }>()
const history = (repo: Repo) => {
  const root = path.resolve(repo.root)
  if (!histories.has(root)) histories.set(root, { undo: [], redo: [] })
  return histories.get(root)!
}
export function clearEditHistory(repo: Repo) { histories.delete(path.resolve(repo.root)) }
export function editHistoryStatus(repo: Repo) {
  const state = history(repo)
  return { canUndo: !!state.undo.length, canRedo: !!state.redo.length, undoLabel: state.undo.at(-1)?.label ?? null, redoLabel: state.redo.at(-1)?.label ?? null }
}
async function capture(repo: Repo, workspaceName?: string): Promise<Snapshot> {
  const files = new Map<string, Buffer>(), directories: string[] = []
  async function read(relative: string) {
    const target = path.join(repo.root, relative)
    let stat
    try { stat = await fs.lstat(target) } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error }
    if (stat.isSymbolicLink()) throw new Error('管理索引不能使用目录链接')
    if (stat.isDirectory()) {
      directories.push(relative)
      for (const name of (await fs.readdir(target)).sort()) await read(path.join(relative, name))
    } else if (stat.isFile()) {
      let bytes = await fs.readFile(target)
      if (relative === path.join('projects', 'catalog.json')) {
        const catalog = JSON.parse(bytes.toString('utf8'))
        // Refresh timestamps alone do not invalidate a previous user edit.
        for (const project of catalog.projects ?? []) delete project.refreshedAt
        bytes = Buffer.from(JSON.stringify(catalog, null, 2))
      }
      files.set(relative, bytes)
    }
  }
  // Source files, drafts, immutable objects and imported copies are not part
  // of history. A software-written workspace is restored only if untouched.
  for (const name of ['refs', 'library', 'quarantine', path.join('projects', 'catalog.json')]) await read(name)
  const hash = createHash('sha256')
  for (const dir of directories) hash.update('dir:' + dir + '\0')
  for (const [name, bytes] of files) hash.update(name + '\0').update(bytes)
  if (workspaceName) {
    validateDocName(workspaceName)
    await read(path.join('workspace', workspaceName))
  }
  return { files, directories, hash: hash.digest('hex') }
}
export async function withUndoableAction<T>(repo: Repo, label: string, action: () => Promise<T>, workspaceName?: string, external?: ExternalHistory): Promise<T> {
  return withRepoWrite(repo, async () => {
    const before = await capture(repo, workspaceName)
    let result!: T, failure: unknown, failed = false
    try { result = await action() } catch (error) { failure = error; failed = true }
    const after = await capture(repo, workspaceName)
    const state = history(repo)
    const expected = state.undo.at(-1)?.afterHash ?? state.redo.at(-1)?.beforeHash
    if (expected && expected !== before.hash) { state.undo = []; state.redo = [] }
    const changes: Change[] = []
    for (const file of new Set([...before.files.keys(), ...after.files.keys()])) {
      const a = before.files.get(file), b = after.files.get(file)
      if (!a || !b || !a.equals(b)) changes.push({ file, before: a, after: b })
    }
    if (!changes.length && before.hash === after.hash) { if (failed) throw failure; return result }
    state.undo.push({ label, changes, addedDirectories: after.directories.filter(d => !before.directories.includes(d)), removedDirectories: before.directories.filter(d => !after.directories.includes(d)), beforeHash: before.hash, afterHash: after.hash, external })
    if (state.undo.length > 100) state.undo.shift()
    state.redo = []
    if (failed) throw failure
    return result
  })
}
async function replay(repo: Repo, direction: 'undo' | 'redo') {
  return withRepoWrite(repo, async () => {
    const state = history(repo), entry = state[direction].at(-1)
    if (!entry) return editHistoryStatus(repo)
    const expected = direction === 'undo' ? entry.afterHash : entry.beforeHash
    if ((await capture(repo)).hash !== expected) {
      clearEditHistory(repo)
      throw new Error('资料已被其他操作更新，旧撤回记录已清除，以免覆盖新内容')
    }
    await entry.external?.validate(direction)
    const applied: Change[] = [], target = direction === 'undo' ? 'before' : 'after', original = direction === 'undo' ? 'after' : 'before'
    let workspaceEditsPreserved = false
    async function write(change: Change, side: 'before' | 'after') {
      const file = path.join(repo.root, change.file), bytes = change[side]
      if (bytes) await writeFileAtomic(file, bytes)
      else await fs.rm(file, { force: true })
    }
    try {
      for (const change of entry.changes) {
        if (change.file.startsWith('workspace' + path.sep)) {
          const current = await fs.readFile(path.join(repo.root, change.file)).catch(error => { if (error.code !== 'ENOENT') throw error; return undefined })
          const expectedBytes = change[original]
          if (current ? !expectedBytes?.equals(current) : !!expectedBytes) { workspaceEditsPreserved = true; continue }
        }
        await write(change, target); applied.push(change)
      }
      const remove = direction === 'undo' ? entry.addedDirectories : entry.removedDirectories
      for (const dir of [...remove].sort((a, b) => b.length - a.length)) await fs.rmdir(path.join(repo.root, dir)).catch(error => { if (!['ENOENT', 'ENOTEMPTY'].includes(error.code)) throw error })
      const create = direction === 'undo' ? entry.removedDirectories : entry.addedDirectories
      for (const dir of create) await fs.mkdir(path.join(repo.root, dir), { recursive: true })
      await entry.external?.apply(direction)
    } catch (error) { for (const change of applied.reverse()) await write(change, original); throw error }
    state[direction].pop(); state[direction === 'undo' ? 'redo' : 'undo'].push(entry)
    return { ...editHistoryStatus(repo), workspaceEditsPreserved }
  })
}
export const undoEdit = (repo: Repo) => replay(repo, 'undo')
export const redoEdit = (repo: Repo) => replay(repo, 'redo')
