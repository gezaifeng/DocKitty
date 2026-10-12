import { promises as fs } from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { Repo, importDoc, commitDoc, createBranch, documentDetail, editVersionRelations, tidyVersionLayout, purgeVersion, versionBytes, updateVersion, startDraft, recordDraftSave, exportBackup, importBackup, StorageContext, readCommit, getManifest, readTree } from '../src/index.js'
import { tmpDir, cleanup } from './helpers.js'

let dir: string, repo: Repo, first: string, second: string, third: string, source: string
const name = '稿.txt'
beforeEach(async () => {
  dir = await tmpDir(); repo = await Repo.init(path.join(dir, '库.wg'), '测试')
  source = path.join(dir, name); await fs.writeFile(source, '原始稿件')
  first = (await importDoc(repo, source)).commitId
  await fs.writeFile(path.join(repo.root, 'workspace', name), '第二稿')
  second = (await commitDoc(repo, name, { message: '第二稿', author: '测试' })).commitId!
  await fs.writeFile(path.join(repo.root, 'workspace', name), '第三稿')
  third = (await commitDoc(repo, name, { message: '第三稿', author: '测试' })).commitId!
})
afterEach(async () => { await cleanup(dir) })
const detail = () => documentDetail(repo, name)

it('isolates every new import in a test library, including after backup restore', async () => {
  const configFile = path.join(repo.root, 'repo.yaml'), config = JSON.parse(await fs.readFile(configFile, 'utf8'))
  config.isolatedSources = true; await fs.writeFile(configFile, JSON.stringify(config))
  const protectedFile = path.join(dir, '受保护原稿.txt'); await fs.writeFile(protectedFile, '原目录不要修改')
  const id = (await importDoc(repo, protectedFile, '测试新稿.txt')).commitId
  const registered = (await documentDetail(repo, '测试新稿.txt')).versions[0].sourcePath!
  expect(registered.startsWith(path.join(repo.root, 'imports') + path.sep)).toBe(true)
  const backup = path.join(dir, '隔离.zip'); await exportBackup(repo, backup)
  const restoredRoot = path.join(dir, '隔离恢复.wg'); await importBackup(backup, restoredRoot)
  const restored = await Repo.open(restoredRoot), sourceCopy = (await documentDetail(restored, '测试新稿.txt')).versions[0].sourcePath!
  expect(sourceCopy.startsWith(restoredRoot + path.sep)).toBe(true)
  await purgeVersion(restored, '测试新稿.txt', id, { deleteSource: true, confirmedSourcePath: sourceCopy })
  expect(await fs.readFile(protectedFile, 'utf8')).toBe('原目录不要修改')
  expect(await fs.readFile(registered, 'utf8')).toBe('原目录不要修改')
})

it('disconnects and reconnects both directions without losing ancestors or branch membership', async () => {
  await editVersionRelations(repo, name, second, { action: 'disconnectPrevious' })
  await editVersionRelations(repo, name, second, { action: 'disconnectNext' })
  let d = await detail()
  expect(d.versions).toHaveLength(3)
  expect(d.versions.every(v => !v.parents.length)).toBe(true)
  expect(d.versions.every(v => v.branches.includes('main'))).toBe(true)
  await editVersionRelations(repo, name, second, { action: 'connectPrevious', targetVersionId: first })
  await editVersionRelations(repo, name, second, { action: 'connectNext', targetVersionId: third })
  d = await detail()
  expect(d.versions.find(v => v.id === third)?.parents).toEqual([second])
  expect(d.versions.find(v => v.id === second)?.parents).toEqual([first])
  expect(new TextDecoder().decode(await versionBytes(repo, name, first))).toBe('原始稿件')
})

it('rejects cycles, self-links and foreign versions without persisting a partial edit', async () => {
  await expect(editVersionRelations(repo, name, first, { action: 'connectPrevious', targetVersionId: third })).rejects.toThrow('循环')
  await expect(editVersionRelations(repo, name, second, { action: 'connectNext', targetVersionId: second })).rejects.toThrow('循环')
  const foreign = path.join(dir, '他稿.txt'); await fs.writeFile(foreign, '另一文档')
  const id = (await importDoc(repo, foreign)).commitId
  await expect(editVersionRelations(repo, name, first, { action: 'connectNext', targetVersionId: id })).rejects.toThrow('同一文档')
  expect((await detail()).versions.find(v => v.id === third)?.parents).toEqual([second])
})

it('moves one version, detaches its original children and supports an independent target member', async () => {
  await createBranch(repo, name, 'TIP', { commitId: first })
  await editVersionRelations(repo, name, second, { action: 'moveBranch', branch: 'TIP' })
  let d = await detail()
  expect(d.versions.find(v => v.id === second)?.branches).toEqual(['TIP'])
  expect(d.versions.find(v => v.id === third)?.parents).toEqual([])
  expect(d.branchHeads.TIP).toBe(second)
  expect(d.branchHeads.main).toBe(third)
  await editVersionRelations(repo, name, second, { action: 'moveBranch', branch: 'main' })
  d = await detail()
  expect(d.versions.find(v => v.id === second)).toMatchObject({ parents: [], branches: ['main'] })
  expect(new TextDecoder().decode(await versionBytes(repo, name, second))).toBe('第二稿')
})

it('persists free nodes and edited relationships through backup and restart', async () => {
  await editVersionRelations(repo, name, third, { action: 'disconnectPrevious' })
  const backup = path.join(dir, '备份.zip'); await exportBackup(repo, backup)
  const target = path.join(dir, '恢复.wg'); await importBackup(backup, target)
  repo = await Repo.open(target)
  expect((await detail()).versions).toHaveLength(3)
  expect((await detail()).versions.find(v => v.id === third)).toMatchObject({ parents: [], branches: ['main'] })
})

it('recycles without deleting the imported file and restores content', async () => {
  await updateVersion(repo, name, first, { deleted: true })
  expect(await fs.readFile(source, 'utf8')).toBe('原始稿件')
  await updateVersion(repo, name, first, { deleted: false })
  expect(new TextDecoder().decode(await versionBytes(repo, name, first))).toBe('原始稿件')
})

it('requires the recorded source path, purges payload and disconnects children while preserving other drafts', async () => {
  await expect(purgeVersion(repo, name, first, { deleteSource: true, confirmedSourcePath: path.join(dir, '错误.txt') })).rejects.toThrow('完整路径')
  expect(await fs.readFile(source, 'utf8')).toBe('原始稿件')
  const ctx = StorageContext.forRepo(repo), tree = await readTree(ctx, (await readCommit(ctx, first)).tree)
  const manifest = await getManifest(ctx, tree.entries[''])
  await purgeVersion(repo, name, first, { deleteSource: true, confirmedSourcePath: source })
  await expect(fs.access(source)).rejects.toThrow()
  expect((await detail()).versions).toHaveLength(2)
  expect((await detail()).versions.find(v => v.id === second)?.parents).toEqual([])
  expect(new TextDecoder().decode(await versionBytes(repo, name, second))).toBe('第二稿')
  await expect(versionBytes(repo, name, first)).rejects.toThrow('不属于')
  if (manifest.encoding === 'generic') for (const chunk of manifest.ref.chunks) expect(await ctx.chunks.has(chunk)).toBe(false)
})

it('preserves deduplicated content in another document and refuses shared source deletion', async () => {
  await importDoc(repo, source, '副稿.txt')
  await expect(purgeVersion(repo, name, first, { deleteSource: true, confirmedSourcePath: source })).rejects.toThrow('其他版本')
  await purgeVersion(repo, name, first, { deleteSource: false })
  const other = await documentDetail(repo, '副稿.txt')
  expect(new TextDecoder().decode(await versionBytes(repo, '副稿.txt', other.versions[0].id))).toBe('原始稿件')
  expect(await fs.readFile(source, 'utf8')).toBe('原始稿件')
})

it('removes tracked draft files, blocks old saves and permits an empty document after the last purge', async () => {
  const draft = await startDraft(repo, name, third, 'main')
  await fs.writeFile(draft.workspacePath, '独立稿'); const created = await recordDraftSave(repo, draft.workspacePath)
  await purgeVersion(repo, name, created!.versionId, { deleteSource: true, confirmedSourcePath: draft.workspacePath })
  await expect(fs.access(draft.workspacePath)).rejects.toThrow()
  await fs.writeFile(draft.workspacePath, '旧窗口再次保存')
  expect(await recordDraftSave(repo, draft.workspacePath)).toBeUndefined()
  for (const id of [third, second, first]) await purgeVersion(repo, name, id, { deleteSource: false })
  expect((await detail()).versions).toHaveLength(0)
})

it('keeps branch ownership exclusive when branching and reconnecting', async () => {
  await createBranch(repo, name, 'TIP', { commitId: third })
  expect((await detail()).versions.every(v => v.branches.length === 1 && v.branches[0] === 'main')).toBe(true)
  const { importVersion } = await import('../src/index.js')
  const id = await importVersion(repo, name, source, { message: 'TIP第一稿', branch: 'TIP' })
  let d = await detail()
  expect(d.versions.filter(v => v.branches.includes('TIP')).map(v => v.id)).toEqual([id])
  expect(d.versions.find(v => v.id === third)?.branches).toEqual(['main'])
  await editVersionRelations(repo, name, id, { action: 'connectPrevious', targetVersionId: first })
  d = await detail()
  expect(d.versions.find(v => v.id === id)?.branches).toEqual(['TIP'])
  expect(d.versions.find(v => v.id === first)?.branches).toEqual(['main'])
})

it('freezes automatic and manual positions when changing connections and persists them after restart', async () => {
  await updateVersion(repo, name, first, { position: { x: 420, y: 390 } })
  const before = new Map((await detail()).versions.map(v => [v.id, { position: v.position, branches: v.branches, categoryId: v.categoryId }]))
  await editVersionRelations(repo, name, second, { action: 'disconnectNext' })
  await editVersionRelations(repo, name, second, { action: 'disconnectPrevious' })
  for (const v of (await detail()).versions) expect({ position: v.position, branches: v.branches, categoryId: v.categoryId }).toEqual(before.get(v.id))
  await editVersionRelations(repo, name, third, { action: 'connectPrevious', targetVersionId: second })
  const reopened = await documentDetail(await Repo.open(repo.root), name)
  for (const v of reopened.versions) expect(v.position).toEqual(before.get(v.id)!.position)
})

it('tidies disconnected nodes without overlap or changes to their data', async () => {
  await editVersionRelations(repo, name, second, { action: 'disconnectPrevious' })
  await editVersionRelations(repo, name, second, { action: 'disconnectNext' })
  for (const id of [first, second, third]) await updateVersion(repo, name, id, { position: { x: 50, y: 50 } })
  const before = (await detail()).versions.map(({ position, ...v }) => v)
  await tidyVersionLayout(repo, name)
  const arranged = await detail()
  expect(arranged.versions.map(({ position, ...v }) => v)).toEqual(before)
  expect(new Set(arranged.versions.map(v => JSON.stringify(v.position))).size).toBe(3)
  for (const a of arranged.versions) for (const b of arranged.versions) if (a.id !== b.id) expect(Math.abs(a.position!.x - b.position!.x) >= 265 || Math.abs(a.position!.y - b.position!.y) >= 170).toBe(true)
  await tidyVersionLayout(repo, name)
  expect((await detail()).versions.map(v => v.position)).toEqual(arranged.versions.map(v => v.position))
})
