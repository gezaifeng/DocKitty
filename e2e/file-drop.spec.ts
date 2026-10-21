import { auditPath } from './auditPath'
import { test, expect, _electron as electron, type Page, type Locator } from '@playwright/test'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { captureGraph } from './graphHelpers.js'

async function nativeDrop(page: Page, files: string[], target: Locator, release = true, duringDrag?: () => Promise<void>) {
  const bounds = (await target.boundingBox())!, x = bounds.x + bounds.width / 2, y = bounds.y + Math.min(bounds.height / 2, 150)
  const session = await page.context().newCDPSession(page), data = { items: [], files, dragOperationsMask: 1 }
  try {
    await session.send('Input.dispatchDragEvent', { type: 'dragEnter', x, y, data })
    await session.send('Input.dispatchDragEvent', { type: 'dragOver', x, y, data })
    await expect(page.locator('.wg-drop-overlay')).toBeVisible()
    await page.waitForTimeout(80)
    await duringDrag?.()
    if (release) await session.send('Input.dispatchDragEvent', { type: 'drop', x, y, data })
  } finally { await session.detach() }
}

test('real disk files drag into both modes with safe project copy/move and undo', async () => {
  test.setTimeout(180000)
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'dockitty-drag-')), source = path.join(temp, '星芽计划'), output = auditPath('file-drop-audit')
  await fs.mkdir(path.join(source, '材料'), { recursive: true }); await fs.writeFile(path.join(source, '正文.txt'), '项目原稿'); await fs.writeFile(path.join(source, '材料', '参考.md'), '# 参考')
  const outside = path.join(temp, '外部'); await fs.mkdir(outside); const manuscript = path.join(outside, '正文.txt'); await fs.writeFile(manuscript, '外部文稿')
  const moveFile = path.join(outside, '移入.md'); await fs.writeFile(moveFile, '# 待移入')
  const env = { ...process.env, WORDGIT_LIBRARY_HOME: temp }; delete env.ELECTRON_RUN_AS_NODE
  const app = await electron.launch({ executablePath: process.env.WORDGIT_ELECTRON ?? path.resolve('node_modules/.cache/electron-runtime/dist/electron.exe'), args: [process.env.WORDGIT_APP ?? path.resolve('apps/desktop'), '--user-data-dir=' + path.join(temp, 'profile')], env })
  try {
    const page = await app.firstWindow(), errors: string[] = []; page.on('pageerror', e => errors.push(e.message)); page.setDefaultTimeout(12000)
    await page.emulateMedia({ reducedMotion: 'reduce' }); await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1600, 1000)); await expect(page.getByLabel('管理模式')).toBeVisible(); await fs.mkdir(output, { recursive: true })
    await page.getByLabel('管理模式').click(); await page.getByRole('option', { name: /项目管理/ }).click()
    await nativeDrop(page, [source], page.locator('.wg-project-library-list'))
    await expect(page.getByRole('listitem', { name: '资料 正文.txt', exact: true })).toBeVisible()
    const projects = await page.evaluate(() => window.wordgit.projects!.request({ action: 'list' })) as Array<{ id: string }>, id = projects[0].id
    await nativeDrop(page, [manuscript], page.locator('.wg-project-content'))
    await expect(page.getByRole('dialog', { name: '拖入项目资料', exact: true })).toBeVisible()
    await page.getByLabel('处理方式 正文.txt').selectOption('copy'); await expect(page.getByLabel('目标名称 正文.txt')).toHaveValue('正文 (2).txt')
    await captureGraph(app, path.join(output, 'project-copy-conflict.png'))
    await page.getByRole('button', { name: '取消', exact: true }).click()
    await expect(fs.access(path.join(source, '正文 (2).txt'))).rejects.toThrow(); expect(await fs.readFile(manuscript, 'utf8')).toBe('外部文稿')
    await nativeDrop(page, [manuscript], page.locator('.wg-project-content')); await page.getByLabel('处理方式 正文.txt').selectOption('copy'); await page.getByRole('button', { name: '确认导入', exact: true }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0); expect(await fs.readFile(path.join(source, '正文 (2).txt'), 'utf8').catch(() => null)).toBe('外部文稿')
    await page.getByRole('button', { name: '刷新', exact: true }).click(); await expect(page.getByRole('listitem', { name: '资料 正文 (2).txt', exact: true })).toHaveCount(1)
    await page.keyboard.press('Control+z'); await expect.poll(() => fs.access(path.join(source, '正文 (2).txt')).then(() => true, () => false)).toBe(false)
    await page.keyboard.press('Control+Shift+z'); await expect.poll(() => fs.readFile(path.join(source, '正文 (2).txt'), 'utf8').catch(() => null)).toBe('外部文稿')
    await nativeDrop(page, [moveFile], page.getByRole('listitem', { name: '资料 材料', exact: true })); await page.getByLabel('处理方式 移入.md').selectOption('move'); await page.getByRole('button', { name: '确认导入', exact: true }).click()
    await expect(page.getByRole('listitem', { name: '资料 移入.md', exact: true })).toBeVisible(); expect(await fs.readFile(path.join(source, '材料', '移入.md'), 'utf8')).toBe('# 待移入'); await expect(fs.access(moveFile)).rejects.toThrow()
    await page.keyboard.press('Control+z'); await expect.poll(() => fs.readFile(moveFile, 'utf8').catch(() => null)).toBe('# 待移入'); await expect(fs.access(path.join(source, '材料', '移入.md'))).rejects.toThrow()
    await page.keyboard.press('Control+Shift+z'); await expect.poll(() => fs.access(moveFile).then(() => true, () => false)).toBe(false)
    await captureGraph(app, path.join(output, 'project-folder-drop.png'))
    await page.getByLabel('管理模式').click(); await page.getByRole('option', { name: /版本管理/ }).click()
    await nativeDrop(page, [manuscript], page.locator('.wg-file-center'))
    await expect(page.getByRole('dialog', { name: '拖入文档', exact: true })).toBeVisible(); await expect(page.getByLabel('导入归属 正文.txt')).toHaveValue('new'); await page.getByRole('button', { name: '确认导入', exact: true }).click()
    await expect(page.getByRole('listitem', { name: '文档 正文.txt', exact: true })).toBeVisible()
    const revision = path.join(outside, '修订.txt'); await fs.writeFile(revision, '外部文稿补充内容')
    await nativeDrop(page, [revision], page.getByRole('listitem', { name: '文档 正文.txt', exact: true })); await expect(page.getByLabel('导入归属 修订.txt')).toHaveValue('正文.txt')
    await captureGraph(app, path.join(output, 'version-drop-dialog.png')); await page.getByRole('button', { name: '确认导入', exact: true }).click()
    await expect.poll(() => page.evaluate(() => window.wordgit.library.detail('正文.txt').then(d => d.versions.length))).toBe(2)
    const other = path.join(outside, '独立.txt'); await fs.writeFile(other, '独立文档')
    await nativeDrop(page, [revision, other], page.locator('.wg-files-heading')); await page.getByLabel('导入归属 修订.txt').selectOption('skip'); await page.getByRole('button', { name: '确认导入', exact: true }).click()
    await expect(page.getByRole('listitem', { name: '文档 独立.txt', exact: true })).toBeVisible()
    expect(await fs.readFile(manuscript, 'utf8')).toBe('外部文稿'); expect(await fs.readFile(path.join(source, '正文.txt'), 'utf8')).toBe('项目原稿'); expect(errors).toEqual([])
    await fs.writeFile(path.join(output, 'interaction.json'), JSON.stringify({ passed: true, cdpNativeDiskFiles: true, folderCreatesProject: true, copyCancelPreservesFiles: true, conflictRenamed: true, refreshNoDuplicate: true, copyMoveActualUndoRedo: true, dropFolderTarget: true, versionTarget: true, batchPerItemChoice: true, externalSourceContentsPreserved: true, errors, projectId: id }, null, 2))
  } finally { await app.close(); if (path.dirname(temp) === os.tmpdir() && path.basename(temp).startsWith('dockitty-drag-')) await fs.rm(temp, { recursive: true, force: true }) }
})

test('homepage project targets, chosen work folders, graph and board folder targets, and snapshot refusal', async () => {
  test.setTimeout(120000)
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'dockitty-drag-edge-')), output = auditPath('file-drop-audit')
  const a = path.join(temp, '甲'), b = path.join(temp, '乙'), work = path.join(temp, '工作'); for (const folder of [a, b, work]) await fs.mkdir(folder)
  const external = path.join(temp, '外部.md'); await fs.writeFile(external, '# 原始内容')
  const env = { ...process.env, WORDGIT_LIBRARY_HOME: temp }; delete env.ELECTRON_RUN_AS_NODE
  const app = await electron.launch({ executablePath: process.env.WORDGIT_ELECTRON ?? path.resolve('node_modules/.cache/electron-runtime/dist/electron.exe'), args: [process.env.WORDGIT_APP ?? path.resolve('apps/desktop'), '--user-data-dir=' + path.join(temp, 'profile')], env })
  try {
    const page = await app.firstWindow(); page.setDefaultTimeout(12000); await page.emulateMedia({ reducedMotion: 'reduce' }); await expect(page.getByLabel('管理模式')).toBeVisible(); await fs.mkdir(output, { recursive: true })
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1600, 1000))
    const projectId = await page.evaluate(async paths => { const p = await window.wordgit.projects!.request({ action: 'create', name: '多位置项目' }) as any; await window.wordgit.projects!.request({ action: 'import', projectId: p.id, paths }); return p.id }, [a, b])
    await page.getByLabel('管理模式').click(); await page.getByRole('option', { name: /项目管理/ }).click()
    await nativeDrop(page, [external], page.getByRole('listitem', { name: '文档库 多位置项目', exact: true })); await expect(page.locator('.wg-drop-folder-choice')).toContainText('尚未确定；保留原位置导入不需要目标文件夹')
    await app.evaluate(({ dialog }, folder) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] }) }, work)
    await page.getByRole('button', { name: '选择目录…', exact: true }).click(); await expect(page.locator('.wg-drop-folder-choice')).toContainText(work)
    await page.getByLabel('处理方式 外部.md').selectOption('copy'); await page.getByRole('button', { name: '确认导入', exact: true }).click()
    await expect.poll(() => fs.readFile(path.join(work, '外部.md'), 'utf8').catch(() => null)).toBe('# 原始内容')
    expect(await page.evaluate(projectId => window.wordgit.projects!.request({ action: 'get', projectId }).then((p: any) => p.workingFolder), projectId)).toBe(work)
    const newFile = path.join(temp, '图中拖入.txt'); await fs.writeFile(newFile, '图中资料')
    await page.getByRole('button', { name: '文件关系图', exact: true }).click(); await nativeDrop(page, [newFile], page.getByRole('button', { name: '项目节点 甲', exact: true })); await expect(page.locator('.wg-drop-folder-choice')).toContainText(a); await page.getByRole('button', { name: '确认导入', exact: true }).click()
    await page.getByRole('button', { name: '返回上一级', exact: true }).click(); await page.getByRole('button', { name: '分类看板', exact: true }).click(); await nativeDrop(page, [newFile], page.getByRole('button', { name: '看板资料 乙', exact: true })); await expect(page.locator('.wg-drop-folder-choice')).toContainText(b); await page.getByRole('button', { name: '取消', exact: true }).click()
    const snapshot = await page.evaluate(async ({ projectId, source }) => { const r = await window.wordgit.projects!.request({ action: 'import', projectId, paths: [source], snapshot: true, title: '历史资料' }) as any; return r.nodeIds[0] }, { projectId, source: a })
    await page.getByRole('button', { name: '刷新', exact: true }).click(); await page.getByRole('button', { name: '文件浏览', exact: true }).click(); await page.getByRole('listitem', { name: '资料 历史资料', exact: true }).dblclick()
    const before = await page.evaluate(projectId => window.wordgit.projects!.request({ action: 'get', projectId }).then((p: any) => p.nodes), projectId)
    await nativeDrop(page, [external], page.locator('.wg-project-content'), true, async () => { await expect(page.locator('.wg-drop-overlay')).toContainText('历史快照仅供查看') }); await expect(page.getByRole('dialog')).toHaveCount(0)
    expect(await page.evaluate(projectId => window.wordgit.projects!.request({ action: 'get', projectId }).then((p: any) => p.nodes), projectId)).toEqual(before)
    expect(await fs.readFile(external, 'utf8')).toBe('# 原始内容'); expect(await fs.readFile(newFile, 'utf8')).toBe('图中资料')
    await fs.writeFile(path.join(output, 'edge-cases.json'), JSON.stringify({ passed: true, homepageProjectTarget: true, ambiguousDirectoryChoosesAndRemembers: true, nativeFolderChooserStubbed: true, graphFolderTarget: true, boardFolderTarget: true, snapshotDropRefused: true, sourcesPreserved: true }, null, 2))
  } finally { await app.close(); if (path.dirname(temp) === os.tmpdir() && path.basename(temp).startsWith('dockitty-drag-edge-')) await fs.rm(temp, { recursive: true, force: true }) }
})

test('drop overlays and import dialogs retain all ten themes and support compact windows', async () => {
  test.setTimeout(180000)
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'dockitty-drag-theme-')), folder = path.join(temp, '项目文件'), output = auditPath('file-drop-audit')
  await fs.mkdir(path.join(folder, '材料'), { recursive: true }); await fs.writeFile(path.join(folder, '正文.txt'), '现有文稿')
  const files = []
  for (const name of ['正文.txt', '说明.md', '记录.txt', '数据.csv']) { const file = path.join(temp, name); await fs.writeFile(file, '拖入示例'); files.push(file) }
  const env = { ...process.env, WORDGIT_LIBRARY_HOME: temp }; delete env.ELECTRON_RUN_AS_NODE
  const app = await electron.launch({ executablePath: process.env.WORDGIT_ELECTRON ?? path.resolve('node_modules/.cache/electron-runtime/dist/electron.exe'), args: [process.env.WORDGIT_APP ?? path.resolve('apps/desktop'), '--user-data-dir=' + path.join(temp, 'profile')], env })
  try {
    const page = await app.firstWindow(); page.setDefaultTimeout(12000); await page.emulateMedia({ reducedMotion: 'reduce' }); await expect(page.getByLabel('管理模式')).toBeVisible(); await fs.mkdir(output, { recursive: true })
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1600, 1000))
    const { projectIds: [projectId] } = await page.evaluate(folder => window.wordgit.drop!.createProjects([folder]), folder)
    const themes = [['blockframe', '积木'], ['raw', '粉绿'], ['retro', '视窗'], ['capsule', '胶囊'], ['light', '素白'], ['paper', '暖纸'], ['dark', '石墨'], ['liquid', '琉璃'], ['liquid-dark', '夜璃'], ['redline', '赤幕']]
    for (const [id, label] of themes) {
      await page.getByLabel('主题风格').click(); await page.getByRole('option').filter({ has: page.getByText(label, { exact: true }) }).click()
      await page.getByLabel('管理模式').click(); await page.getByRole('option', { name: /项目管理/ }).click()
      if (await page.getByRole('listitem', { name: '文档库 项目文件', exact: true }).count()) await page.getByRole('listitem', { name: '文档库 项目文件', exact: true }).click()
      await page.getByRole('button', { name: '文件关系图', exact: true }).click()
      await nativeDrop(page, [files[0]], page.getByRole('button', { name: '项目节点 材料', exact: true }), true, () => captureGraph(app, path.join(output, `${id}-overlay.png`)))
      await page.getByLabel('处理方式 正文.txt').selectOption('copy'); await expect(page.getByRole('button', { name: '确认导入', exact: true })).toBeInViewport()
      await captureGraph(app, path.join(output, `${id}-project-dialog.png`)); await page.getByRole('button', { name: '取消', exact: true }).click()
      await page.getByLabel('管理模式').click(); await page.getByRole('option', { name: /版本管理/ }).click(); await nativeDrop(page, files, page.locator('.wg-file-center'))
      await expect(page.getByLabel('导入归属 数据.csv')).toHaveCount(1); await expect(page.getByRole('button', { name: '确认导入', exact: true })).toBeInViewport()
      const color = await page.locator('.wg-drop-item').first().evaluate(el => getComputedStyle(el).color); expect(color).not.toBe('rgb(0, 0, 255)')
      await captureGraph(app, path.join(output, `${id}-version-dialog.png`)); await page.getByRole('button', { name: '取消', exact: true }).click()
    }
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1000, 700))
    await nativeDrop(page, files, page.locator('.wg-file-center')); await page.getByLabel('导入归属 数据.csv').scrollIntoViewIfNeeded(); await expect(page.getByLabel('导入归属 数据.csv')).toBeInViewport(); await page.getByRole('button', { name: '取消', exact: true }).click()
    await page.getByLabel('管理模式').click(); await page.getByRole('option', { name: /项目管理/ }).click(); if (await page.getByRole('listitem', { name: '文档库 项目文件', exact: true }).count()) await page.getByRole('listitem', { name: '文档库 项目文件', exact: true }).click(); await page.getByRole('button', { name: '文件浏览', exact: true }).click()
    await page.getByRole('button', { name: '刷新', exact: true }).click()
    expect(await page.evaluate(projectId => window.wordgit.projects!.request({ action: 'get', projectId }).then((p: any) => p.nodes.length), projectId)).toBe(2)
    for (const file of files) expect(await fs.readFile(file, 'utf8')).toBe('拖入示例')
    await fs.writeFile(path.join(output, 'themes.json'), JSON.stringify({ passed: true, themes: themes.map(([id]) => id), screenshots: themes.length * 3, compactWindow: true, cancelledDialogsPreserveData: true, sourceContentsPreserved: true }, null, 2))
  } finally { await app.close(); if (path.dirname(temp) === os.tmpdir() && path.basename(temp).startsWith('dockitty-drag-theme-')) await fs.rm(temp, { recursive: true, force: true }) }
})
