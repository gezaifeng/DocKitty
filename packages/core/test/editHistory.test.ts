import { promises as fs } from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { Repo, createProject, importProjectItems, getProject, updateProjectNode, deleteProjectNode, importDoc, documentDetail, withUndoableAction, undoEdit, redoEdit, editHistoryStatus, clearEditHistory } from '../src/index.js'
import { tmpDir, cleanup } from './helpers.js'

let directory: string, repo: Repo
beforeEach(async () => { directory = await tmpDir(); repo = await Repo.init(path.join(directory, '历史.wg'), '历史测试') })
afterEach(async () => { clearEditHistory(repo); await cleanup(directory) })

it('undoes project imports and removals and redoes them without touching sources', async () => {
  const project = await createProject(repo, '研究项目'), source = path.join(directory, '正文.md'); await fs.writeFile(source, '# 正文')
  const imported = await withUndoableAction(repo, '导入资料', () => importProjectItems(repo, { projectId: project.id, paths: [source] }))
  const nodeId = imported.nodeIds[0]
  await withUndoableAction(repo, '移除资料', () => deleteProjectNode(repo, project.id, nodeId))
  await undoEdit(repo); expect((await getProject(repo, project.id)).nodes.map(n => n.id)).toEqual([nodeId])
  await undoEdit(repo); expect((await getProject(repo, project.id)).nodes).toEqual([])
  expect(editHistoryStatus(repo)).toMatchObject({ canUndo: false, canRedo: true, redoLabel: '导入资料' })
  await fs.writeFile(source, '# 外部新内容')
  await redoEdit(repo); expect((await getProject(repo, project.id)).nodes.map(n => n.id)).toEqual([nodeId])
  await redoEdit(repo); expect((await getProject(repo, project.id)).nodes).toEqual([])
  expect(await fs.readFile(source, 'utf8')).toBe('# 外部新内容')
})

it('undoes a document import completely, while preserving workspace edits and immutable snapshots for redo', async () => {
  const source = path.join(directory, '论文.txt'); await fs.writeFile(source, '初稿')
  const imported = await withUndoableAction(repo, '导入文档', () => importDoc(repo, source), '论文.txt')
  const workspace = path.join(repo.root, 'workspace', '论文.txt'); await fs.writeFile(workspace, 'Word 尚未记录的修改')
  await undoEdit(repo)
  const { libraryDocuments } = await import('../src/index.js'); expect(await libraryDocuments(repo)).toEqual([])
  await redoEdit(repo); expect((await documentDetail(repo, '论文.txt')).versions[0].id).toBe(imported.commitId)
  expect(await fs.readFile(workspace, 'utf8')).toBe('Word 尚未记录的修改'); expect(await fs.readFile(source, 'utf8')).toBe('初稿')
})

it('ignores no-op and failed operations, clears redo after a new edit, and serializes nested writes', async () => {
  const project = await createProject(repo, '项目'), source = path.join(directory, '资料.txt'); await fs.writeFile(source, '资料')
  const { nodeIds: [id] } = await importProjectItems(repo, { projectId: project.id, paths: [source] })
  await Promise.all([
    withUndoableAction(repo, '改名', () => updateProjectNode(repo, project.id, id, { title: '命名' })),
    withUndoableAction(repo, '备注', () => updateProjectNode(repo, project.id, id, { note: '说明' })),
  ])
  await withUndoableAction(repo, '空操作', async () => {})
  await expect(withUndoableAction(repo, '失败', async () => { throw new Error('未执行') })).rejects.toThrow('未执行')
  expect(editHistoryStatus(repo).undoLabel).toBe('备注')
  await undoEdit(repo); expect((await getProject(repo, project.id)).nodes[0]).toMatchObject({ title: '命名', note: '' })
  await withUndoableAction(repo, '新备注', () => updateProjectNode(repo, project.id, id, { note: '新的说明' }))
  expect(editHistoryStatus(repo).canRedo).toBe(false)
})

it('refuses to overwrite data changed by an external agent and clears stale history', async () => {
  const project = await createProject(repo, '项目'), source = path.join(directory, '资料.txt'); await fs.writeFile(source, '资料')
  const { nodeIds: [id] } = await importProjectItems(repo, { projectId: project.id, paths: [source] })
  await withUndoableAction(repo, '备注', () => updateProjectNode(repo, project.id, id, { note: '软件备注' }))
  await updateProjectNode(repo, project.id, id, { note: '外部 Agent 备注' })
  await expect(undoEdit(repo)).rejects.toThrow('其他操作更新')
  expect((await getProject(repo, project.id)).nodes[0].note).toBe('外部 Agent 备注')
  expect(editHistoryStatus(repo)).toMatchObject({ canUndo: false, canRedo: false })
})

it('restores a software-written workspace, but preserves later editor changes', async () => {
  const source = path.join(directory, '论文.txt'); await fs.writeFile(source, '原稿'); await importDoc(repo, source)
  const file = path.join(repo.root, 'workspace', '论文.txt')
  await withUndoableAction(repo, '软件恢复工作区', () => fs.writeFile(file, '软件恢复的旧稿'), '论文.txt')
  await undoEdit(repo); expect(await fs.readFile(file, 'utf8')).toBe('原稿')
  await redoEdit(repo); expect(await fs.readFile(file, 'utf8')).toBe('软件恢复的旧稿')
  await fs.writeFile(file, 'Word 新修改')
  expect(await undoEdit(repo)).toMatchObject({ workspaceEditsPreserved: true })
  expect(await fs.readFile(file, 'utf8')).toBe('Word 新修改')
  await redoEdit(repo); expect(await fs.readFile(file, 'utf8')).toBe('Word 新修改')
})

it('retains a recoverable partial operation when an editor fails after metadata was saved', async () => {
  const project = await createProject(repo, '项目'), source = path.join(directory, '文件.txt'); await fs.writeFile(source, '内容')
  const { nodeIds: [id] } = await importProjectItems(repo, { projectId: project.id, paths: [source] })
  await expect(withUndoableAction(repo, '未完成操作', async () => { await updateProjectNode(repo, project.id, id, { note: '已保存' }); throw new Error('编辑器未启动') })).rejects.toThrow('编辑器未启动')
  expect(editHistoryStatus(repo).undoLabel).toBe('未完成操作')
  await undoEdit(repo); expect((await getProject(repo, project.id)).nodes[0].note).toBe('')
})
