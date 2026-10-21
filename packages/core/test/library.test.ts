import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { zipSync } from 'fflate'
import {
  Repo, importDoc, commitDoc, checkoutDoc, createBranch, switchBranch,
  documentDetail, libraryDocuments, updateDocument, updateVersion, updateCategory,
  importVersion, saveWorkspace, versionBytes, undoReplacement, exportVersion,
  beginVersionEdit, moveBranchHead, workspaceStatus, listCommits, exportBackup, importBackup,
} from '../src/index.js'
import { tmpDir, cleanup } from './helpers.js'

let dir: string, repo: Repo, workspace: string, firstId: string
beforeEach(async () => {
  dir = await tmpDir()
  repo = await Repo.init(path.join(dir, '论文库.wg'), '论文')
  const source = path.join(dir, '论文.txt')
  await fs.writeFile(source, '第一稿的原始论证')
  firstId = (await importDoc(repo, source)).commitId
  workspace = path.join(repo.root, 'workspace', '论文.txt')
})
afterEach(async () => { await cleanup(dir) })

describe('统一文档与版本数据', () => {
  it('相同文档的旧版导入与分支汇总不产生重复文档或重复祖先', async () => {
    await createBranch(repo, '论文.txt', '导师修改', { commitId: firstId })
    const older = path.join(dir, '论文_旧稿.txt')
    await fs.writeFile(older, '导师修改内容')
    const id = await importVersion(repo, '论文.txt', older, { message: '导师意见', branch: '导师修改' })
    const d = await documentDetail(repo, '论文.txt')
    expect(d.versions).toHaveLength(2)
    expect(d.versions.find(v => v.id === firstId)?.branches.sort()).toEqual(['main'])
    expect(d.branchHeads['导师修改']).toBe(id)
    expect(await libraryDocuments(repo)).toHaveLength(1)
    expect(await fs.readFile(workspace, 'utf8')).toBe('第一稿的原始论证')
    expect((await workspaceStatus(repo, '论文.txt')).dirty).toBe(false)
  })

  it('覆盖同版本不增加可见节点，预览导出读取新内容，替换可撤销', async () => {
    await fs.writeFile(workspace, '小幅修正')
    const saved = await saveWorkspace(repo, '论文.txt', 'replace', '润色第一稿')
    expect(saved.versionId).toBe(firstId)
    expect((await documentDetail(repo, '论文.txt')).versions).toHaveLength(1)
    expect(new TextDecoder().decode(await versionBytes(repo, '论文.txt', firstId))).toBe('小幅修正')
    expect((await workspaceStatus(repo, '论文.txt')).dirty).toBe(false)
    const destination = path.join(dir, '导出.txt')
    await exportVersion(repo, '论文.txt', firstId, destination)
    expect(await fs.readFile(destination, 'utf8')).toBe('小幅修正')
    await undoReplacement(repo, '论文.txt', firstId)
    expect(new TextDecoder().decode(await versionBytes(repo, '论文.txt', firstId))).toBe('第一稿的原始论证')
    expect(await fs.readFile(workspace, 'utf8')).toBe('小幅修正')
  })

  it('从替换后的最新稿另存新版本，父版本仍指向稳定版本编号', async () => {
    await fs.writeFile(workspace, '修正')
    await saveWorkspace(repo, '论文.txt', 'replace', '修正')
    await fs.writeFile(workspace, '继续修改')
    const saved = await saveWorkspace(repo, '论文.txt', 'new', '第二稿')
    const d = await documentDetail(repo, '论文.txt')
    expect(d.versions).toHaveLength(2)
    expect(d.versions.find(v => v.id === saved.versionId)?.parents).toEqual([firstId])
    expect(new TextDecoder().decode(await versionBytes(repo, '论文.txt', firstId))).toBe('修正')
  })

  it('分类、排序、位置、说明、回收状态与文档名称重启后保持一致', async () => {
    const id = await updateCategory(repo, '论文.txt', 'create', '导师已确认')
    await updateVersion(repo, '论文.txt', firstId, { categoryId: id!, order: 12, position: { x: 300, y: 90 }, title: '确认稿', note: '保留此论证', deleted: true })
    await updateDocument(repo, '论文.txt', { title: '我的毕业论文', deleted: true })
    repo = await Repo.open(repo.root)
    const d = await documentDetail(repo, '论文.txt')
    expect(d.title).toBe('我的毕业论文')
    expect(d.deletedAt).toBeTruthy()
    expect(d.versions[0]).toMatchObject({ title: '确认稿', note: '保留此论证', categoryId: id, order: 12, position: { x: 300, y: 90 } })
    expect(d.versions[0].deletedAt).toBeTruthy()
    await updateCategory(repo, '论文.txt', 'rename', '最终确认', id!)
    await updateCategory(repo, '论文.txt', 'delete', undefined, id!)
    await updateVersion(repo, '论文.txt', firstId, { deleted: false })
    await updateDocument(repo, '论文.txt', { deleted: false })
    const restored = await documentDetail(repo, '论文.txt')
    expect(restored.versions[0].categoryId).toBe('')
    expect(restored.versions[0].deletedAt).toBeNull()
    expect(restored.deletedAt).toBeNull()
  })

  it('不允许跨文档改动版本，不允许不存在的分类或格式错误的旧稿', async () => {
    await expect(updateVersion(repo, '论文.txt', 'a'.repeat(64), { title: '错误' })).rejects.toThrow('不属于')
    await expect(updateVersion(repo, '论文.txt', firstId, { categoryId: 'missing' })).rejects.toThrow('分类不存在')
    const file = path.join(dir, 'wrong.docx')
    await fs.writeFile(file, 'x')
    await expect(importVersion(repo, '论文.txt', file, { message: '错误格式' })).rejects.toThrow('格式')
  })

  it('并发整理与并发导入串行完成，不丢栏目或版本', async () => {
    await Promise.all(['初稿', '修订', '定稿'].map(name => updateCategory(repo, '论文.txt', 'create', name)))
    const file = path.join(dir, 'new.txt')
    await fs.writeFile(file, '新稿内容')
    await Promise.all(['第二稿', '第三稿'].map(message => importVersion(repo, '论文.txt', file, { message })))
    const d = await documentDetail(repo, '论文.txt')
    expect(d.categories).toHaveLength(3)
    expect(d.versions).toHaveLength(3)
    expect(await listCommits(repo, '论文.txt')).toHaveLength(3)
  })

  it('移动分支指针前保留原路线，从历史稿可进入新改稿路线', async () => {
    await fs.writeFile(workspace, '第二稿')
    const second = await saveWorkspace(repo, '论文.txt', 'new', '第二稿')
    await expect(moveBranchHead(repo, '论文.txt', 'main', firstId)).rejects.toThrow('当前分支')
    await createBranch(repo, '论文.txt', '另一路线')
    const moved = await moveBranchHead(repo, '论文.txt', '另一路线', firstId)
    expect(moved.protectedBranch).toBeTruthy()
    let d = await documentDetail(repo, '论文.txt')
    expect(d.branchHeads['另一路线']).toBe(firstId)
    expect(d.branchHeads[moved.protectedBranch!]).toBe(second.versionId)
    await beginVersionEdit(repo, '论文.txt', firstId, '新改稿')
    d = await documentDetail(repo, '论文.txt')
    expect(d.currentBranch).toBe('新改稿')
    expect(await fs.readFile(workspace, 'utf8')).toBe('第一稿的原始论证')
  })

  it('备份带走整理数据与覆盖修订，恢复后各内容仍可访问', async () => {
    const categoryId = await updateCategory(repo, '论文.txt', 'create', '定稿')
    await updateVersion(repo, '论文.txt', firstId, { categoryId: categoryId! })
    await fs.writeFile(workspace, '覆盖后的内容')
    await saveWorkspace(repo, '论文.txt', 'replace', '润色')
    const backup = path.join(dir, 'backup.wgbak')
    await exportBackup(repo, backup)
    const restored = await importBackup(backup, path.join(dir, '还原.wg'))
    expect((await documentDetail(restored, '论文.txt')).versions[0].categoryId).toBe(categoryId)
    expect(new TextDecoder().decode(await versionBytes(restored, '论文.txt', firstId))).toBe('覆盖后的内容')
  })
})

describe('稿件保护回归', () => {
  it('继续编辑当前最新稿保留未保存修改，不重复检出或增加保护节点', async () => {
    await fs.writeFile(workspace, '正在写但尚未记录')
    await beginVersionEdit(repo, '论文.txt', firstId, 'main')
    expect(await fs.readFile(workspace, 'utf8')).toBe('正在写但尚未记录')
    expect((await documentDetail(repo, '论文.txt')).versions).toHaveLength(1)
  })
  it('恢复或切换自动保护未提交稿，历史只读导出不改工作区', async () => {
    await fs.writeFile(workspace, '不可丢的未提交稿')
    await checkoutDoc(repo, '论文.txt', { commitId: firstId })
    const protectedVersion = (await listCommits(repo, '论文.txt'))[0]
    expect(new TextDecoder().decode(await versionBytes(repo, '论文.txt', protectedVersion.id))).toBe('不可丢的未提交稿')
    expect(await fs.readFile(workspace, 'utf8')).toBe('第一稿的原始论证')
    await createBranch(repo, '论文.txt', '导师修改')
    await fs.writeFile(workspace, '切换前的新草稿')
    await switchBranch(repo, '论文.txt', '导师修改')
    expect((await documentDetail(repo, '论文.txt')).versions.length).toBeGreaterThan(2)
  })

  it('目录仅删文件和删光文件都能提交和恢复', async () => {
    const source = path.join(dir, '配套资料')
    await fs.mkdir(source)
    await fs.writeFile(path.join(source, 'a.txt'), 'a')
    await fs.writeFile(path.join(source, 'b.txt'), 'b')
    await importDoc(repo, source)
    const working = path.join(repo.root, 'workspace', '配套资料')
    await fs.rm(path.join(working, 'b.txt'))
    expect((await commitDoc(repo, '配套资料', { message: '删b', author: 't' })).changed).toEqual(['配套资料/b.txt'])
    await fs.rm(path.join(working, 'a.txt'))
    const empty = await commitDoc(repo, '配套资料', { message: '清空', author: 't' })
    await checkoutDoc(repo, '配套资料', { commitId: empty.commitId! })
    expect(await fs.readdir(working)).toEqual([])
  })

  it('不同 ZIP 元数据与压缩方式的 Office 包逐字节恢复', async () => {
    const parts = { '[Content_Types].xml': new TextEncoder().encode('<Types/>'), 'word/document.xml': new TextEncoder().encode('<document>测试</document>') }
    const original = zipSync(parts, { mtime: new Date(2024, 3, 7), level: 0 })
    const source = path.join(dir, '原包.docx')
    await fs.writeFile(source, original)
    const imported = await importDoc(repo, source)
    expect(await versionBytes(repo, '原包.docx', imported.commitId)).toEqual(original)
  })

  it('中文分支允许，HEAD/设备保留名/大小写重名拒绝，导出不覆盖已有内容', async () => {
    await createBranch(repo, '论文.txt', '导师 大修')
    for (const name of ['HEAD', 'head', 'CON', '../escape']) await expect(createBranch(repo, '论文.txt', name)).rejects.toThrow('不合法')
    await createBranch(repo, '论文.txt', 'Review')
    await expect(createBranch(repo, '论文.txt', 'review')).rejects.toThrow('已存在')
    await expect(exportVersion(repo, '论文.txt', firstId, workspace)).rejects.toThrow('仓库外')
    const dest = path.join(dir, 'existing.txt')
    await fs.writeFile(dest, '请保留')
    await expect(exportVersion(repo, '论文.txt', firstId, dest)).rejects.toThrow('已存在')
    expect(await fs.readFile(dest, 'utf8')).toBe('请保留')
  })
})
