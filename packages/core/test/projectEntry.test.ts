import { beforeEach, afterEach, it, expect } from 'vitest'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Repo, createProject, importProjectItems, getProject, refreshProject, createProjectEntry, resolveProjectWorkingFolder, undoEdit, redoEdit } from '../src/index.js'

let temp: string, folder: string, repo: Repo, projectId: string
beforeEach(async () => {
  temp = await fs.mkdtemp(path.join(os.tmpdir(), 'dockitty-project-entry-'))
  folder = path.join(temp, 'project'); await fs.mkdir(folder)
  repo = await Repo.init(path.join(temp, 'library.wg'), 'test')
  projectId = (await createProject(repo, '项目')).id
  await importProjectItems(repo, { projectId, paths: [folder], unpackFolder: true })
})
afterEach(async () => { if (path.dirname(temp) === os.tmpdir() && path.basename(temp).startsWith('dockitty-project-entry-')) await fs.rm(temp, { recursive: true, force: true }) })

it('creates one real file, preserves its identity on refresh, and restores file and card through undo/redo', async () => {
  expect(await resolveProjectWorkingFolder(repo, projectId)).toBe(await fs.realpath(folder))
  const result = await createProjectEntry(repo, { projectId, name: '正文.txt' }, Buffer.from(''))
  expect(await fs.readFile(result.sourcePath, 'utf8')).toBe('')
  await refreshProject(repo, projectId)
  expect((await getProject(repo, projectId)).nodes.map(n => n.id)).toEqual([result.nodeId])
  await undoEdit(repo); await expect(fs.stat(result.sourcePath)).rejects.toMatchObject({ code: 'ENOENT' })
  expect((await getProject(repo, projectId)).nodes).toHaveLength(0)
  await redoEdit(repo); expect(await fs.readFile(result.sourcePath, 'utf8')).toBe('')
  expect((await getProject(repo, projectId)).nodes[0].id).toBe(result.nodeId)
})
it('creates in a nested folder and keeps folders undoable only while empty', async () => {
  const created = await createProjectEntry(repo, { projectId, name: '文稿' })
  const child = await createProjectEntry(repo, { projectId, parentId: created.nodeId, name: '笔记.md' }, Buffer.from('# note'))
  expect(child.sourcePath).toBe(path.join(folder, '文稿', '笔记.md'))
  expect((await getProject(repo, projectId)).nodes.find(n => n.id === child.nodeId)?.parentId).toBe(created.nodeId)
  await undoEdit(repo); await undoEdit(repo)
  await expect(fs.stat(created.sourcePath)).rejects.toMatchObject({ code: 'ENOENT' })
  await redoEdit(repo); await fs.writeFile(path.join(created.sourcePath, 'external.txt'), 'keep')
  await expect(undoEdit(repo)).rejects.toThrow('外部修改')
  expect(await fs.readFile(path.join(created.sourcePath, 'external.txt'), 'utf8')).toBe('keep')
})
it('refuses collisions, traversal, external edits and an occupied redo destination', async () => {
  const created = await createProjectEntry(repo, { projectId, name: '正文.txt' }, Buffer.from('blank'))
  await expect(createProjectEntry(repo, { projectId, name: '正文.txt' }, Buffer.from('overwrite'))).rejects.toThrow('占用')
  await expect(createProjectEntry(repo, { projectId, name: '../escape' }, Buffer.from(''))).rejects.toThrow('不合法')
  await fs.writeFile(created.sourcePath, 'external')
  await expect(undoEdit(repo)).rejects.toThrow('外部修改')
  expect((await getProject(repo, projectId)).nodes).toHaveLength(1)
  await fs.writeFile(created.sourcePath, 'blank'); await undoEdit(repo)
  await fs.writeFile(created.sourcePath, 'occupied'); await expect(redoEdit(repo)).rejects.toThrow('占用')
  expect(await fs.readFile(created.sourcePath, 'utf8')).toBe('occupied')
})
it('asks for a root target when ambiguous, remembers the chosen directory, and rejects snapshots and links', async () => {
  const other = path.join(temp, 'other'); await fs.mkdir(other)
  await importProjectItems(repo, { projectId, paths: [other], unpackFolder: true })
  expect(await resolveProjectWorkingFolder(repo, projectId)).toBeNull()
  await expect(createProjectEntry(repo, { projectId, name: 'new.txt' }, Buffer.from(''))).rejects.toThrow('选择项目工作')
  await createProjectEntry(repo, { projectId, workingFolder: other, name: 'new.txt' }, Buffer.from(''))
  expect(await resolveProjectWorkingFolder(repo, projectId)).toBe(await fs.realpath(other))
  const snapshot = await importProjectItems(repo, { projectId, paths: [folder], snapshot: true })
  await expect(createProjectEntry(repo, { projectId, parentId: snapshot.nodeIds[0], name: 'forbidden' })).rejects.toThrow('历史快照')
  const link = path.join(temp, 'link'); await fs.symlink(folder, link, process.platform === 'win32' ? 'junction' : 'dir')
  const linked = await importProjectItems(repo, { projectId, paths: [link] })
  await expect(createProjectEntry(repo, { projectId, parentId: linked.nodeIds[0], name: 'forbidden' })).rejects.toThrow('链接')
  await expect(fs.stat(path.join(folder, 'forbidden'))).rejects.toMatchObject({ code: 'ENOENT' })
})
