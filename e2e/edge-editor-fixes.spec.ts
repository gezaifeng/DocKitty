import { auditPath } from './auditPath'
import { test, expect, _electron as electron } from '@playwright/test'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import type { ProjectLibrary } from '../packages/shared/src/projects.js'
import { editWire, captureGraph } from './graphHelpers.js'

async function launch(prefix: string) {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), prefix)), env = { ...process.env, WORDGIT_LIBRARY_HOME: temporary }; delete env.ELECTRON_RUN_AS_NODE
  const app = await electron.launch({ executablePath: process.env.WORDGIT_ELECTRON ?? path.resolve('node_modules/.cache/electron-runtime/dist/electron.exe'), args: [process.env.WORDGIT_APP ?? path.resolve('apps/desktop'), '--user-data-dir=' + path.join(temporary, 'profile')], env })
  const page = await app.firstWindow(), errors: string[] = []; page.on('pageerror', e => errors.push(e.message))
  await page.emulateMedia({ reducedMotion: 'reduce' }); await app.evaluate(({ BrowserWindow }) => { const win = BrowserWindow.getAllWindows()[0]; win.webContents.setBackgroundThrottling(false); win.setContentSize(1600, 1000) }); await page.getByRole('button', { name: '总览工作台', exact: true }).waitFor()
  return { temporary, app, page, errors, async close() { await app.close(); if (path.dirname(temporary) === os.tmpdir() && path.basename(temporary).startsWith(prefix)) await fs.rm(temporary, { recursive: true, force: true }) } }
}
const output = auditPath('edge-editor-audit')
const themes = [['blockframe', '积木'], ['light', '素白'], ['paper', '暖纸'], ['dark', '石墨'], ['raw', '粉绿'], ['retro', '视窗'], ['capsule', '胶囊']]
async function vanishedNotice(page: import('@playwright/test').Page, prefix: string) {
  await expect(page.locator('.wg-notice')).toContainText(prefix)
  await expect(page.locator('.wg-notice')).toHaveCount(0, { timeout: 3500 })
}

test('version editor unifies both gestures, previews the actual graph without writes, restores canceled edits and expires undo notices', async () => {
  const run = await launch('dockitty-edge-version-'), { page, temporary } = run
  try {
    await fs.mkdir(output, { recursive: true })
    const source = path.join(temporary, '版本.txt'); await fs.writeFile(source, '第一版')
    const first = (await page.evaluate(source => window.wordgit.doc.import(source), source)).commitId
    const root = (await page.evaluate(() => window.wordgit.repo.bootstrap())).repoRoot
    await fs.writeFile(path.join(root, 'workspace', '版本.txt'), '第二版')
    const second = (await page.evaluate(() => window.wordgit.commit.create('版本.txt', '第二版', '验收'))).commitId!
    for (const [id, x] of [[first, 40], [second, 340]] as const) await page.evaluate(({ id, x }) => window.wordgit.library.mutate({ type: 'version', docName: '版本.txt', versionId: id, position: { x, y: 100 } }), { id, x })
    await page.getByRole('listitem', { name: '文档 版本.txt', exact: true }).click(); await page.getByRole('button', { name: '版本关系图', exact: true }).click()
    const detail = () => page.evaluate(() => window.wordgit.library.detail('版本.txt'))
    const line = page.locator(`.wg-edge-line[data-from="${first}"][data-to="${second}"]`), editor = page.getByRole('dialog', { name: '编辑连线', exact: true })
    await page.getByText('文件', { exact: true }).click()
    for (const name of ['新建文档…', '导入文档 / 版本…', '更改保存位置…', '备份与保存设置']) await expect(page.getByRole('button', { name, exact: true })).toBeVisible()
    await page.getByRole('button', { name: '备份与保存设置', exact: true }).click(); await expect(page.getByRole('button', { name: '备份导出', exact: true })).toBeVisible(); await page.getByRole('button', { name: '返回工作台', exact: true }).click()
    const savedBefore = await detail(), historyBefore = await page.evaluate(() => window.wordgit.history!.status()), originalPath = await line.getAttribute('d')
    await editWire(page, line)
    await expect(editor).toBeVisible(); await expect(editor.locator('.wg-connection-direction')).toHaveCount(0)
    await editor.getByLabel('关系标签').fill('格式修订'); await editor.getByLabel('关系备注').fill('关系说明\n正文备注另行保留')
    await editor.getByLabel('箭头大小').fill('18'); await editor.getByLabel('线条粗细').fill('4'); await editor.getByLabel('线条格式').selectOption('dashed')
    await expect(line).toHaveCSS('stroke-width', '4px'); await expect(line).toHaveAttribute('data-arrow-size', '18'); await expect(line).toHaveAttribute('data-line', 'dashed')
    expect(await detail()).toEqual(savedBefore); expect(await page.evaluate(() => window.wordgit.history!.status())).toEqual(historyBefore)
    await editor.getByRole('button', { name: '反转箭头', exact: true }).click(); await expect(line).not.toHaveAttribute('d', originalPath!)
    expect(await detail()).toEqual(savedBefore)
    await editor.getByRole('button', { name: '取消', exact: true }).click(); await expect(line).toHaveCSS('stroke-width', '1.5px'); await expect(line).toHaveAttribute('d', originalPath!)
    await editWire(page, line, 'right'); await expect(editor.getByLabel('关系标签')).toHaveValue('')
    await editor.getByLabel('关系标签').fill('格式修订'); await editor.getByLabel('关系备注').fill('关系说明\n正文备注另行保留'); await editor.getByLabel('线条粗细').fill('3')
    await editor.getByRole('button', { name: '保存', exact: true }).click(); await expect(editor).toHaveCount(0)
    await expect.poll(async () => (await detail()).versions.find(v => v.id === second)?.parentNotes?.[first]).toBe('关系说明\n正文备注另行保留')
    expect((await detail()).versions.find(v => v.id === second)?.note).toBe('')
    await page.keyboard.press('Control+z'); await vanishedNotice(page, '已撤回')
    await expect.poll(async () => (await detail()).versions.find(v => v.id === second)?.parentLabels?.[first]).toBeUndefined()
    await page.keyboard.press('Control+Shift+z'); await vanishedNotice(page, '已重做')
    for (const [theme, label] of themes) {
      await page.getByLabel('主题风格').click(); await page.getByRole('option').filter({ has: page.getByText(label, { exact: true }) }).click()
      await editWire(page, line); await expect(editor.getByLabel('关系备注')).toHaveValue('关系说明\n正文备注另行保留')
      await editor.getByLabel('线条格式').selectOption('double'); await expect(line).toHaveAttribute('data-line', 'double')
      await expect(editor.getByRole('button', { name: '保存', exact: true })).toBeInViewport()
      await captureGraph(run.app, path.join(output, theme + '-version-unified-editor.png'))
      await page.keyboard.press('Escape'); await expect(line).toHaveAttribute('data-line', 'solid')
    }
    await run.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(900, 600))
    await editWire(page, line); await expect(editor.getByRole('button', { name: '保存', exact: true })).toBeInViewport(); await captureGraph(run.app, path.join(output, 'compact-version-editor.png')); await page.keyboard.press('Escape')
    expect(await fs.readFile(source, 'utf8')).toBe('第一版'); expect(run.errors).toEqual([])
    await fs.writeFile(path.join(output, 'version-fixes.json'), JSON.stringify({ passed: true, version: '0.5.3', sameEditorForBothGestures: true, noEndpoints: true, liveCanvasPreviewWithoutWrites: true, cancelRestoresSavedStyle: true, notesSeparateFromManuscript: true, undoRedoNoticesExpire: true, originalMenuEntries: true, themes: 7, minimumWindow: true, rendererErrors: run.errors }, null, 2))
  } finally { await run.close() }
})

test('project menus retain import, backups and relocation, while unified edge edits preview, cancel and undo correctly', async () => {
  const run = await launch('dockitty-edge-project-'), { page, temporary } = run
  try {
    await fs.mkdir(output, { recursive: true })
    const a = path.join(temporary, '甲.md'), b = path.join(temporary, '乙.md'), folder = path.join(temporary, '补充材料')
    await fs.writeFile(a, '# 甲'); await fs.writeFile(b, '# 乙'); await fs.mkdir(folder); await fs.writeFile(path.join(folder, '说明.txt'), '补充说明')
    await run.app.evaluate(({ dialog }, paths) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: paths }) }, [a, b])
    await page.getByLabel('管理模式').click(); await page.getByRole('option', { name: /项目管理/ }).click()
    await page.getByText('文件', { exact: true }).click()
    for (const name of ['批量导入文件…', '导入文件夹…', '更改保存位置…', '备份与保存设置']) await expect(page.getByRole('button', { name, exact: true })).toBeVisible()
    await page.getByRole('button', { name: '批量导入文件…', exact: true }).click(); await page.getByLabel('新文档库名称').fill('菜单回归'); await page.getByRole('button', { name: '开始导入', exact: true }).click()
    await expect(page.getByRole('listitem', { name: '资料 甲.md', exact: true })).toBeVisible()
    const projectId = (await page.evaluate(() => window.wordgit.projects!.request({ action: 'list' }) as Promise<ProjectLibrary[]>))[0].id
    const read = () => page.evaluate(projectId => window.wordgit.projects!.request({ action: 'get', projectId }) as Promise<ProjectLibrary>, projectId)
    await run.app.evaluate(({ dialog }, folder) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] }) }, folder)
    await page.getByText('文件', { exact: true }).click(); await page.getByRole('button', { name: '导入文件夹…', exact: true }).click(); await page.getByRole('button', { name: '开始导入', exact: true }).click(); await expect(page.getByRole('listitem', { name: '资料 说明.txt', exact: true })).toBeVisible()
    const project = await read(), from = project.nodes.find(n => n.name === '甲.md')!.id, to = project.nodes.find(n => n.name === '乙.md')!.id
    await page.evaluate(({ projectId, from, to }) => window.wordgit.projects!.request({ action: 'setRelation', projectId, relation: { from, to, label: '', note: '' } }), { projectId, from, to })
    await page.getByRole('button', { name: '文件关系图', exact: true }).click()
    const line = page.locator('.wg-project-edges .wg-edge-line'), editor = page.getByRole('dialog', { name: '编辑连线', exact: true })
    const before = (await read()).relations[0]
    await editWire(page, line, 'right'); await editor.getByLabel('关系标签').fill('投稿格式'); await editor.getByLabel('关系备注').fill('为期刊调整格式'); await editor.getByLabel('箭头大小').fill('20'); await editor.getByLabel('线条格式').selectOption('double')
    await expect(line).toHaveAttribute('data-line', 'double'); await expect(line).toHaveAttribute('data-arrow-size', '20'); expect((await read()).relations[0]).toEqual(before)
    await page.keyboard.press('Escape'); await expect(line).toHaveAttribute('data-line', 'solid')
    await editWire(page, line); await editor.getByLabel('关系标签').fill('投稿格式'); await editor.getByLabel('关系备注').fill('为期刊调整格式'); await editor.getByRole('button', { name: '反转箭头', exact: true }).click(); await editor.getByRole('button', { name: '保存', exact: true }).click()
    await expect.poll(async () => (await read()).relations[0]).toMatchObject({ from: to, to: from, label: '投稿格式', note: '为期刊调整格式' })
    await page.keyboard.press('Control+z'); await vanishedNotice(page, '已撤回'); expect((await read()).relations[0]).toEqual(before)
    await page.keyboard.press('Control+Shift+z'); await vanishedNotice(page, '已重做')
    for (const [theme, label] of themes) {
      await page.getByLabel('主题风格').click(); await page.getByRole('option').filter({ has: page.getByText(label, { exact: true }) }).click(); await editWire(page, line)
      await expect(editor.locator('.wg-connection-direction')).toHaveCount(0); await expect(editor.getByLabel('关系备注')).toHaveValue('为期刊调整格式')
      await editor.getByLabel('线条格式').selectOption('dashed'); await expect(line).toHaveAttribute('data-line', 'dashed'); await captureGraph(run.app, path.join(output, theme + '-project-unified-editor.png'))
      await editor.getByRole('button', { name: '取消', exact: true }).click(); await expect(line).toHaveAttribute('data-line', 'solid')
    }
    const backup = path.join(temporary, '菜单备份.wgbak'), restored = path.join(temporary, '恢复库'); await fs.mkdir(restored)
    await run.app.evaluate(({ dialog }, backup) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: backup }) }, backup)
    await page.getByText('文件', { exact: true }).click(); await page.getByRole('button', { name: '备份与保存设置', exact: true }).click(); await page.getByRole('button', { name: '备份导出', exact: true }).click(); await expect.poll(() => fs.stat(backup).then(() => true, () => false)).toBe(true)
    await run.app.evaluate(({ dialog }, paths) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [paths.shift()!] }) }, [backup, restored])
    await page.getByRole('button', { name: '从备份恢复', exact: true }).click(); await expect(page.getByRole('listitem', { name: '文档库 菜单回归', exact: true })).toBeVisible(); await page.getByRole('listitem', { name: '文档库 菜单回归', exact: true }).click()
    const destination = path.join(temporary, '迁移位置'); await fs.mkdir(destination)
    await run.app.evaluate(({ dialog }, destination) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [destination] }) }, destination)
    await page.getByText('文件', { exact: true }).click(); await page.getByRole('button', { name: '更改保存位置…', exact: true }).click(); await page.getByRole('dialog').getByRole('button', { name: '保存', exact: true }).click()
    await expect(page.getByRole('listitem', { name: '文档库 菜单回归', exact: true })).toBeVisible()
    expect((await page.evaluate(() => window.wordgit.repo.bootstrap())).repoRoot).toBe(path.join(destination, '稿喵文档库.wg'))
    expect((await read()).relations[0]).toMatchObject({ label: '投稿格式', note: '为期刊调整格式' }); expect(await fs.readFile(a, 'utf8')).toBe('# 甲'); expect(await fs.readFile(b, 'utf8')).toBe('# 乙'); expect(run.errors).toEqual([])
    await fs.writeFile(path.join(output, 'project-fixes.json'), JSON.stringify({ passed: true, version: '0.5.3', menuBatchImport: true, menuFolderImport: true, menuBackupExportRestore: true, menuRelocation: true, liveCanvasPreview: true, cancelRestoresStyle: true, sameEditorForBothGestures: true, notesAndReversalSavedTogether: true, noticesExpire: true, sourceUnchanged: true, themes: 7, rendererErrors: run.errors }, null, 2))
  } finally { await run.close() }
})
