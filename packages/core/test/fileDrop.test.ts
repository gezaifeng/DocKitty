import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { Repo, createProject, createDroppedProjects, importProjectItems, importDroppedProject, prepareProjectDrop, getProject, listProjects, refreshProject, undoEdit, redoEdit, editHistoryStatus } from '../src/index.js'
import { tmpDir, cleanup } from './helpers.js'

let directory: string, repo: Repo
beforeEach(async () => { directory = await tmpDir(); repo = await Repo.init(path.join(directory, 'library.wg'), '拖入测试') })
afterEach(async () => { await cleanup(directory) })
async function file(name: string, content = name) { const p = path.join(directory, name); await fs.mkdir(path.dirname(p), { recursive: true }); await fs.writeFile(p, content); return p }
async function projectFolder() { const source = await file('项目/正文.txt', '原稿'); const { projectIds: [id] } = await createDroppedProjects(repo, [path.dirname(source)]); return { id, folder: path.dirname(source) } }
const missing = async (p: string) => expect(fs.access(p)).rejects.toThrow()

describe('external file drops', () => {
  it('creates each folder as a project, includes empty folders, and undo does not delete sources', async () => {
    const a = path.dirname(await file('甲项目/文稿.md')), b = path.join(directory, '乙项目'); await fs.mkdir(b)
    const result = await createDroppedProjects(repo, [a, b]); expect(result.projectIds).toHaveLength(2)
    expect((await getProject(repo, result.projectIds[0])).workingFolder).toBe(a)
    expect((await getProject(repo, result.projectIds[1])).nodes).toEqual([])
    await undoEdit(repo); expect(await listProjects(repo)).toEqual([]); expect(await fs.readFile(path.join(a, '文稿.md'), 'utf8')).toBe('甲项目/文稿.md')
    await redoEdit(repo); expect(await listProjects(repo)).toHaveLength(2)
  })
  it('copies with a chosen new name, keeps the source, and refresh does not duplicate the card', async () => {
    const { id, folder } = await projectFolder(), source = await file('外部/正文.txt', '新材料')
    const plan = await prepareProjectDrop(repo, [source], id)
    expect(plan.workingFolder).toBe(folder); expect(plan.files[0]).toMatchObject({ conflict: true, suggestedName: '正文 (2).txt', inside: false })
    const result = await importDroppedProject(repo, { projectId: id, items: [{ path: source, action: 'copy', name: plan.files[0].suggestedName }] })
    expect(result.nodeIds).toHaveLength(1); expect((await getProject(repo, id)).nodes).toHaveLength(2)
    await refreshProject(repo, id); expect((await getProject(repo, id)).nodes).toHaveLength(2)
    expect(await fs.readFile(source, 'utf8')).toBe('新材料'); expect(await fs.readFile(path.join(folder, '正文.txt'), 'utf8')).toBe('原稿')
    await undoEdit(repo); await missing(path.join(folder, '正文 (2).txt')); expect((await getProject(repo, id)).nodes).toHaveLength(1)
    await redoEdit(repo); expect(await fs.readFile(path.join(folder, '正文 (2).txt'), 'utf8')).toBe('新材料')
  })
  it('cuts a folder with nested and empty contents and restores actual paths on undo and redo', async () => {
    const { id, folder } = await projectFolder(), source = path.dirname(await file('外部目录/子目录/中文.txt', '完整资料'))
    await fs.mkdir(path.join(source, '空目录'))
    await importDroppedProject(repo, { projectId: id, items: [{ path: source, action: 'move', name: '新一轮' }] })
    const dest = path.join(folder, '新一轮'); await missing(source); expect(await fs.readFile(path.join(dest, '中文.txt'), 'utf8')).toBe('完整资料')
    await undoEdit(repo); await missing(dest); expect(await fs.readFile(path.join(source, '中文.txt'), 'utf8')).toBe('完整资料'); expect((await fs.stat(path.join(source, '空目录'))).isDirectory()).toBe(true)
    await redoEdit(repo); await missing(source); expect(await fs.readFile(path.join(dest, '中文.txt'), 'utf8')).toBe('完整资料')
  })
  it('blocks undo when the copied file was edited and keeps the history entry available', async () => {
    const { id, folder } = await projectFolder(), source = await file('新增.txt', '初始内容'), dest = path.join(folder, '新增.txt')
    await importDroppedProject(repo, { projectId: id, items: [{ path: source, action: 'copy' }] }); const saved = await getProject(repo, id)
    await fs.writeFile(dest, '外部编辑'); await expect(undoEdit(repo)).rejects.toThrow('外部修改')
    expect(await getProject(repo, id)).toEqual(saved); expect(editHistoryStatus(repo).canUndo).toBe(true); expect(await fs.readFile(dest, 'utf8')).toBe('外部编辑')
    await fs.writeFile(dest, '初始内容'); await undoEdit(repo); await missing(dest)
  })
  it('blocks move undo if its original path has been reused and blocks redo if target is occupied', async () => {
    const { id, folder } = await projectFolder(), source = await file('移入.txt', '最初'), dest = path.join(folder, '移入.txt')
    await importDroppedProject(repo, { projectId: id, items: [{ path: source, action: 'move' }] })
    await fs.writeFile(source, '另一个文件'); await expect(undoEdit(repo)).rejects.toThrow('占用'); expect(await fs.readFile(source, 'utf8')).toBe('另一个文件')
    await fs.rm(source); await undoEdit(repo); await fs.writeFile(dest, '新占用'); await expect(redoEdit(repo)).rejects.toThrow('占用'); expect(await fs.readFile(source, 'utf8')).toBe('最初')
  })
  it('rolls back earlier moves and catalog changes when a later item collides', async () => {
    const { id, folder } = await projectFolder(), a = await file('第一项.txt', '第一项'), b = await file('第二项.txt', '第二项'), before = await getProject(repo, id)
    await expect(importDroppedProject(repo, { projectId: id, items: [{ path: a, action: 'move' }, { path: b, action: 'copy', name: '正文.txt' }] })).rejects.toThrow('目标已存在')
    expect(await fs.readFile(a, 'utf8')).toBe('第一项'); expect(await fs.readFile(b, 'utf8')).toBe('第二项'); await missing(path.join(folder, '第一项.txt')); expect(await getProject(repo, id)).toEqual(before)
  })
  it('uses the current folder as target, prevents invalid names and never overwrites', async () => {
    const { id, folder } = await projectFolder(); await fs.mkdir(path.join(folder, '材料')); await refreshProject(repo, id)
    const parent = (await getProject(repo, id)).nodes.find(n => n.name === '材料')!, source = await file('外部.txt')
    expect((await prepareProjectDrop(repo, [source], id, parent.id)).workingFolder).toBe(path.join(folder, '材料'))
    await expect(importDroppedProject(repo, { projectId: id, parentId: parent.id, items: [{ path: source, action: 'copy', name: '../越界.txt' }] })).rejects.toThrow('名称不合法')
    await importDroppedProject(repo, { projectId: id, parentId: parent.id, items: [{ path: source, action: 'copy' }] })
    expect((await getProject(repo, id)).nodes.find(n => n.name === '外部.txt')?.parentId).toBe(parent.id)
  })
  it('requires a choice for ambiguous roots, remembers it and supports reference-only imports without moving', async () => {
    const id = (await createProject(repo, '多个来源')).id, a = path.dirname(await file('甲/甲.txt')), b = path.dirname(await file('乙/乙.txt')), source = await file('外部.txt')
    await importProjectItems(repo, { projectId: id, paths: [a, b] })
    expect((await prepareProjectDrop(repo, [source], id)).workingFolder).toBeNull()
    await importDroppedProject(repo, { projectId: id, workingFolder: a, items: [{ path: source, action: 'reference' }] }); expect((await getProject(repo, id)).workingFolder).toBe(a)
    expect(await fs.readFile(source, 'utf8')).toBe('外部.txt'); await missing(path.join(a, '外部.txt'))
  })
  it('reuses cards already in the current folder and rejects importing the library itself', async () => {
    const { id, folder } = await projectFolder(), source = path.join(folder, '正文.txt')
    const result = await importDroppedProject(repo, { projectId: id, items: [{ path: source, action: 'reference' }] }); expect(result.nodeIds).toHaveLength(1); expect((await getProject(repo, id)).nodes).toHaveLength(1)
    await expect(importDroppedProject(repo, { projectId: id, items: [{ path: repo.root, action: 'reference' }] })).rejects.toThrow('不能导入')
  })
  it('infers the common directory of loose file sources and rolls back failed multi-folder creation', async () => {
    const id = (await createProject(repo, '散文件项目')).id, a = await file('同目录/甲.txt'), b = await file('同目录/乙.txt')
    await importProjectItems(repo, { projectId: id, paths: [a, b] })
    expect((await prepareProjectDrop(repo, [await file('其他.txt')], id)).workingFolder).toBe(path.dirname(a))
    const before = await listProjects(repo)
    await expect(createDroppedProjects(repo, [path.dirname(a), repo.root])).rejects.toThrow('不能导入')
    expect(await listProjects(repo)).toEqual(before); expect(await fs.readFile(a, 'utf8')).toBe('同目录/甲.txt')
  })
  it('resolves a junction ancestor before rejecting a copy into the source itself', async () => {
    const source = path.dirname(await file('真实位置/资料/原稿.txt', '保留内容')), target = path.join(source, '子目录'), alias = path.join(directory, '目录联接')
    await fs.mkdir(target); await fs.symlink(path.dirname(source), alias, 'junction')
    const id = (await createProject(repo, '路径验证')).id
    await expect(importDroppedProject(repo, { projectId: id, workingFolder: target, items: [{ path: path.join(alias, '资料'), action: 'copy', name: '副本' }] })).rejects.toThrow('自身')
    expect(await fs.readFile(path.join(source, '原稿.txt'), 'utf8')).toBe('保留内容'); expect(await fs.readdir(target)).toEqual([])
  })
})
