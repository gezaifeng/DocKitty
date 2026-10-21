import { auditPath } from './auditPath'
import { test, expect, _electron as electron } from '@playwright/test'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import type { ProjectLibrary } from '../packages/shared/src/projects.js'
import { dragWire, editWire, captureGraph } from './graphHelpers.js'

async function launch(prefix: string) {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), prefix)), env = { ...process.env, WORDGIT_LIBRARY_HOME: temporary }; delete env.ELECTRON_RUN_AS_NODE
  const app = await electron.launch({ executablePath: process.env.WORDGIT_ELECTRON ?? path.resolve('node_modules/.cache/electron-runtime/dist/electron.exe'), args: [process.env.WORDGIT_APP ?? path.resolve('apps/desktop'), '--user-data-dir=' + path.join(temporary, 'profile')], env })
  const page = await app.firstWindow(), errors: string[] = []; page.on('pageerror', e => errors.push(e.message))
  await page.emulateMedia({ reducedMotion: 'reduce' }); await app.evaluate(({ BrowserWindow }) => { const win = BrowserWindow.getAllWindows()[0]; win.webContents.setBackgroundThrottling(false); win.setContentSize(1600, 1000) }); await page.getByRole('button', { name: '总览工作台', exact: true }).waitFor()
  return { temporary, app, page, errors, async close() { await app.close(); if (path.dirname(temporary) === os.tmpdir() && path.basename(temporary).startsWith(prefix)) await fs.rm(temporary, { recursive: true, force: true }) } }
}
const themes = [['blockframe', '积木'], ['light', '素白'], ['paper', '暖纸'], ['dark', '石墨'], ['raw', '粉绿'], ['retro', '视窗'], ['capsule', '胶囊']]
const output = auditPath('edge-editor-audit')
async function formatWire(app: import('@playwright/test').ElectronApplication, page: import('@playwright/test').Page, line: import('@playwright/test').Locator, theme: string, mode: string, index: number) {
  await editWire(page, line, 'right')
  const menu = page.getByRole('dialog', { name: '编辑连线', exact: true })
  await expect(menu).toBeVisible(); await expect(menu).toBeInViewport(); await expect(menu.getByRole('button', { name: '保存', exact: true })).toBeInViewport()
  const style = { arrow: ['triangle', 'chevron', 'diamond', 'none'][index % 4], arrowSize: 16, line: ['solid', 'dashed', 'double'][index % 3], width: 3 }
  await menu.getByLabel('箭头形状').selectOption(style.arrow); await menu.getByLabel('箭头大小').fill(''); await expect(menu.getByRole('button', { name: '保存', exact: true })).toBeDisabled(); await menu.getByLabel('箭头大小').pressSequentially(String(style.arrowSize)); await expect(menu.getByLabel('箭头大小')).toHaveValue(String(style.arrowSize)); await menu.getByLabel('线条格式').selectOption(style.line); await menu.getByLabel('线条粗细').fill(String(style.width))
  await expect(line).toHaveAttribute('data-line', style.line); await expect(line).toHaveAttribute('data-arrow-size', '16')
  await captureGraph(app, path.join(output, `${theme}-${mode}-style-menu.png`))
  await menu.getByRole('button', { name: '保存', exact: true }).click(); await expect(menu).toHaveCount(0)
  await expect(line).toHaveAttribute('data-line', style.line); await expect(line).toHaveAttribute('data-arrow', style.arrow); await expect(line).toHaveAttribute('data-arrow-size', '16')
  await captureGraph(app, path.join(output, `${theme}-${mode}-styled-graph.png`))
  await page.keyboard.press('Control+z'); await expect(page.locator('.wg-notice')).toContainText('已撤回')
  await page.keyboard.press('Control+Shift+z'); await expect(page.locator('.wg-notice')).toContainText('已重做')
  await expect(line).toHaveAttribute('data-line', style.line)
  return style
}


test('right-drag project wires, graphical label/reversal, undo/redo, category, movement and outside file-menu dismissal', async () => {
  const run = await launch('dockitty-gesture-project-'), { page, temporary } = run
  try {
    await fs.mkdir(output, { recursive: true })
    const a = path.join(temporary, '正文.md'), b = path.join(temporary, '演示.md'); await fs.writeFile(a, '# 原正文'); await fs.writeFile(b, '# 演示提纲')
    const projectId = await page.evaluate(async paths => { const p = await window.wordgit.projects!.request({ action: 'create', name: '文稿关系' }) as ProjectLibrary; await window.wordgit.projects!.request({ action: 'import', projectId: p.id, paths }); return p.id }, [a, b])
    const read = () => page.evaluate(projectId => window.wordgit.projects!.request({ action: 'get', projectId }) as Promise<ProjectLibrary>, projectId)
    await page.getByLabel('管理模式').click(); await page.getByRole('option', { name: /项目管理/ }).click(); await page.getByRole('listitem', { name: '文档库 文稿关系' }).click(); await page.getByRole('button', { name: '文件关系图', exact: true }).click()
    const source = page.getByRole('button', { name: '项目节点 正文.md' }), target = page.getByRole('button', { name: '项目节点 演示.md' })
    const positions = (await read()).nodes.map(n => [n.id, n.position])
    await dragWire(page, source, target)
    await expect.poll(async () => (await read()).relations.length).toBe(1)
    expect((await read()).relations[0].label).toBe(''); await expect(page.getByRole('dialog')).toHaveCount(0); await expect(page.locator('.wg-project-edges text')).toHaveCount(0); await expect(page.getByRole('menu')).toHaveCount(0)
    expect((await read()).nodes.map(n => [n.id, n.position])).toEqual(positions)
    await source.click({ button: 'right' }); await expect(page.getByRole('menu', { name: '项目资料操作' })).toBeVisible(); await page.keyboard.press('Escape')
    await editWire(page, page.locator('.wg-project-edges .wg-edge-line')); await expect(page.getByLabel('关系起点')).toHaveCount(0); await expect(page.getByLabel('关系目标')).toHaveCount(0)
    await page.getByLabel('关系标签').fill('演示材料'); await page.getByRole('dialog').getByRole('button', { name: '保存', exact: true }).click()
    await expect.poll(async () => (await read()).relations[0].label).toBe('演示材料')
    await page.keyboard.press('Control+z'); await expect.poll(async () => (await read()).relations[0].label).toBe('')
    await page.keyboard.press('Control+Shift+z'); await expect.poll(async () => (await read()).relations[0].label).toBe('演示材料')
    const edge = (await read()).relations[0]
    await editWire(page, page.locator('.wg-project-edges .wg-edge-line')); await page.getByRole('button', { name: '反转箭头', exact: true }).click(); await page.getByRole('dialog').getByRole('button', { name: '保存', exact: true }).click()
    await expect.poll(async () => (await read()).relations[0].from).toBe(edge.to)
    await page.keyboard.press('Control+z'); await expect.poll(async () => (await read()).relations[0].from).toBe(edge.from)
    await page.keyboard.press('Control+y'); await expect.poll(async () => (await read()).relations[0].from).toBe(edge.to)
    for (let i = 0; i < 3; i++) { await page.keyboard.press('Control+z'); await page.waitForTimeout(100) }
    await expect.poll(async () => (await read()).relations.length).toBe(0)
    for (let i = 0; i < 3; i++) { await page.keyboard.press('Control+Shift+z'); await page.waitForTimeout(100) }
    await expect.poll(async () => (await read()).relations[0].from).toBe(edge.to)
    await dragWire(page, source, target, false); await page.keyboard.press('Control+z'); await page.mouse.up({ button: 'right' }); await expect(page.locator('.wg-connection-preview')).toHaveCount(0); expect((await read()).relations).toHaveLength(1)
    await source.click(); const box = (await source.boundingBox())!, previous = (await read()).nodes.find(n => n.name === '正文.md')!.position
    await page.mouse.move(box.x + 100, box.y + 60); await page.mouse.down(); await page.mouse.move(box.x + 140, box.y + 90, { steps: 8 }); await page.mouse.up()
    await expect.poll(async () => (await read()).nodes.find(n => n.name === '正文.md')!.position.x).toBeGreaterThan(previous.x)
    await page.keyboard.press('Control+z'); await expect.poll(async () => (await read()).nodes.find(n => n.name === '正文.md')!.position).toEqual(previous)
    await expect(source).toHaveCSS('left', `${previous.x}px`)
    const category = await page.evaluate(projectId => window.wordgit.projects!.request({ action: 'setCategory', projectId, category: { name: '投稿材料' } }) as Promise<{ id: string }>, projectId)
    await page.locator('.wg-inspector-organized').getByRole('tab', { name: '信息', exact: true }).click(); await page.getByLabel('资料分类', { exact: true }).selectOption(category.id); await page.keyboard.press('Control+z'); await expect.poll(async () => (await read()).nodes.find(n => n.name === '正文.md')?.categoryId ?? '').toBe('')
    await page.keyboard.press('Control+Shift+z'); await expect.poll(async () => (await read()).nodes.find(n => n.name === '正文.md')?.categoryId).toBe(category.id)
    const screenshots: string[] = []
    for (const [index, [theme, label]] of themes.entries()) {
      await page.getByLabel('主题风格').click(); await page.getByRole('option').filter({ has: page.getByText(label, { exact: true }) }).click()
      const format = await formatWire(run.app, page, page.locator('.wg-project-edges .wg-edge-line'), theme, 'project', index)
      await expect.poll(async () => (await read()).relations[0].style).toEqual(format)
      await page.getByText('文件', { exact: true }).click(); await expect(page.locator('details.wg-menu:not(.wg-features-menu)')).toHaveAttribute('open', '')
      await expect(page.getByRole('button', { name: /^撤回/ })).toBeInViewport(); const menuName = theme + '-project-menu.png'; screenshots.push(menuName); await captureGraph(run.app, path.join(output, menuName))
      await page.locator('.wg-projectbar').click({ position: { x: 250, y: 20 } }); await expect(page.locator('details.wg-menu:not(.wg-features-menu)')).not.toHaveAttribute('open', '')
      await editWire(page, page.locator('.wg-project-edges .wg-edge-line')); const dialogName = theme + '-project-edge.png'; screenshots.push(dialogName); await captureGraph(run.app, path.join(output, dialogName)); await page.getByRole('dialog').getByRole('button', { name: '取消', exact: true }).click()
      await dragWire(page, source, target, false); const draftName = theme + '-project-drag.png'; screenshots.push(draftName); await captureGraph(run.app, path.join(output, draftName)); await page.keyboard.press('Escape'); await page.mouse.up({ button: 'right' })
    }
    await fs.writeFile(a, '# Agent 新正文')
    await source.click({ button: 'right' }); await page.getByRole('menuitem', { name: '从管理中移除…' }).click(); await page.getByRole('button', { name: '确认移除', exact: true }).click(); await expect(source).toHaveCount(0)
    await page.keyboard.press('Control+z'); await expect(source).toBeVisible(); expect(await fs.readFile(a, 'utf8')).toBe('# Agent 新正文')
    expect(run.errors).toEqual([])
    await fs.writeFile(path.join(output, 'project-verification.json'), JSON.stringify({ passed: true, version: '0.5.3', screenshots, edgeStyles: true, sevenThemeStyleMenus: true, styleUndoRedo: true, rightDrag: true, fixedSourceCard: true, defaultLabelEmpty: true, doubleClickEditing: true, noEndpointDropdowns: true, reverseActualRelationship: true, undoRedoShortcuts: true, undoMoveDisplayedCorrectly: true, undoClassification: true, undoRemovalPreservesSource: true, outsideMenuDismissal: true, rendererErrors: run.errors }, null, 2))
  } finally { await run.close() }
})

test('version wire gestures, labels and real reversal are undoable, cycle rejection is atomic and menus close outside', async () => {
  const run = await launch('dockitty-gesture-version-'), { page, temporary } = run
  try {
    const source = path.join(temporary, '论文.txt'); await fs.writeFile(source, '第一稿')
    const first = (await page.evaluate(source => window.wordgit.doc.import(source), source)).commitId
    const root = (await page.evaluate(() => window.wordgit.repo.bootstrap())).repoRoot
    await fs.writeFile(path.join(root, 'workspace', '论文.txt'), '第二稿'); const second = (await page.evaluate(() => window.wordgit.commit.create('论文.txt', '第二稿', '测试'))).commitId!
    await fs.writeFile(path.join(root, 'workspace', '论文.txt'), '第三稿'); const third = (await page.evaluate(() => window.wordgit.commit.create('论文.txt', '第三稿', '测试'))).commitId!
    for (const [id, x] of [[first, 40], [second, 340], [third, 640]] as const) await page.evaluate(({ id, x }) => window.wordgit.library.mutate({ type: 'version', docName: '论文.txt', versionId: id, position: { x, y: 100 } }), { id, x })
    await page.evaluate(id => window.wordgit.library.mutate({ type: 'relations', docName: '论文.txt', versionId: id, action: 'disconnectPrevious' }), second)
    await page.locator('.wg-document-card').filter({ hasText: '论文.txt' }).click(); await page.getByRole('button', { name: '版本关系图', exact: true }).click()
    const detail = () => page.evaluate(() => window.wordgit.library.detail('论文.txt')), old = page.getByRole('button', { name: '版本节点 导入', exact: true }), next = page.getByRole('button', { name: '版本节点 第二稿', exact: true })
    const positions = (await detail()).versions.map(v => [v.id, v.position, v.branches])
    await dragWire(page, old, next); await expect.poll(async () => (await detail()).versions.find(v => v.id === second)?.parents).toContain(first)
    expect((await detail()).versions.find(v => v.id === second)?.parentLabels?.[first] ?? '').toBe(''); expect((await detail()).versions.map(v => [v.id, v.position, v.branches])).toEqual(positions)
    const line = () => page.locator(`.wg-edge-line[data-from="${first}"][data-to="${second}"]`)
    await editWire(page, line()); await page.getByLabel('关系标签').fill('投刊前修改'); await page.getByRole('dialog').getByRole('button', { name: '保存', exact: true }).click()
    await expect.poll(async () => (await detail()).versions.find(v => v.id === second)?.parentLabels?.[first]).toBe('投刊前修改')
    for (const [index, [theme, label]] of themes.entries()) {
      await page.getByLabel('主题风格').click(); await page.getByRole('option').filter({ has: page.getByText(label, { exact: true }) }).click()
      const format = await formatWire(run.app, page, line(), theme, 'version', index)
      await expect.poll(async () => (await detail()).versions.find(v => v.id === second)?.parentStyles?.[first]).toEqual(format)
      await editWire(page, line()); await page.getByRole('button', { name: '反转箭头', exact: true }).click()
      await captureGraph(run.app, path.join(output, theme + '-version-edge.png')); await page.getByRole('dialog').getByRole('button', { name: '取消', exact: true }).click()
    }
    await editWire(page, line()); await page.getByRole('button', { name: '反转箭头', exact: true }).click(); await page.getByRole('dialog').getByRole('button', { name: '保存', exact: true }).click()
    await expect.poll(async () => (await detail()).versions.find(v => v.id === first)?.parents).toContain(second)
    await page.keyboard.press('Control+z'); await expect.poll(async () => (await detail()).versions.find(v => v.id === second)?.parents).toContain(first)
    await page.keyboard.press('Control+Shift+z'); await expect.poll(async () => (await detail()).versions.find(v => v.id === first)?.parentLabels?.[second]).toBe('投刊前修改')
    expect((await detail()).versions.map(v => [v.id, v.position, v.branches])).toEqual(positions)
    await page.keyboard.press('Control+z'); await expect.poll(async () => (await detail()).versions.find(v => v.id === second)?.parents).toContain(first)
    await page.evaluate(({ first, third }) => window.wordgit.library.mutate({ type: 'relations', docName: '论文.txt', versionId: first, targetVersionId: third, action: 'connectNext' }), { first, third })
    const before = await detail(); await page.evaluate(({ first, third }) => window.wordgit.library.mutate({ type: 'relations', docName: '论文.txt', versionId: first, targetVersionId: third, action: 'reverseConnection' }).then(() => false, () => true), { first, third }).then(rejected => expect(rejected).toBe(true)); expect(await detail()).toEqual(before)
    await next.click({ button: 'right' }); await expect(page.getByRole('menu', { name: /版本操作/ })).toBeVisible(); await page.keyboard.press('Escape')
    await page.getByText('文件', { exact: true }).click(); await page.locator('.wg-projectbar').click({ position: { x: 300, y: 20 } }); await expect(page.locator('details.wg-menu:not(.wg-features-menu)')).not.toHaveAttribute('open', '')
    await fs.writeFile(source, '外部原稿新修改'); await fs.writeFile(path.join(root, 'workspace', '论文.txt'), '未记录的 Word 修改')
    await page.keyboard.press('Control+z'); expect(await fs.readFile(source, 'utf8')).toBe('外部原稿新修改'); expect(await fs.readFile(path.join(root, 'workspace', '论文.txt'), 'utf8')).toBe('未记录的 Word 修改')
    expect(run.errors).toEqual([])
    await fs.writeFile(path.join(output, 'version-verification.json'), JSON.stringify({ passed: true, version: '0.5.3', rightDrag: true, namesPersisted: true, edgeStyles: true, sevenThemeStyleMenus: true, styleUndoRedo: true, realReversal: true, undoRedo: true, rejectedCycleLeavesDataUnchanged: true, branchAndPositionPreserved: true, sourceAndWorkspaceEditsPreserved: true, rendererErrors: run.errors }, null, 2))
  } finally { await run.close() }
})

test('imports undo and redo through the File menu, text shortcuts stay local, permanent delete clears history, and restart starts fresh', async () => {
  const run = await launch('dockitty-history-lifetime-'), { page, temporary } = run
  let restarted: Awaited<ReturnType<typeof electron.launch>> | undefined
  try {
    const source = path.join(temporary, '撤回验证.txt'); await fs.writeFile(source, '原始内容')
    const id = (await page.evaluate(source => window.wordgit.doc.import(source), source)).commitId
    const card = page.getByRole('listitem', { name: '文档 撤回验证.txt', exact: true }); await expect(card).toBeVisible(); await card.click()
    await page.getByText('文件', { exact: true }).click(); await page.getByRole('button', { name: /^撤回：导入文档/ }).click(); await expect(card).toHaveCount(0); await expect(page.locator('details.wg-menu:not(.wg-features-menu)')).not.toHaveAttribute('open', '')
    await fs.writeFile(source, '原文件后来修改')
    await page.keyboard.press('Control+Shift+z'); await expect(card).toBeVisible(); await card.click()
    const before = await page.evaluate(() => window.wordgit.history!.status())
    const search = page.getByLabel('查找文档', { exact: true }); await search.click(); await search.pressSequentially('临时关键词'); await search.press('Control+z')
    expect(await page.evaluate(() => window.wordgit.history!.status())).toEqual(before)
    await search.fill(''); await page.locator('.wg-projectbar').click({ position: { x: 250, y: 20 } })
    await page.evaluate(id => window.wordgit.library.mutate({ type: 'version', docName: '撤回验证.txt', versionId: id, note: '测试备注' }), id)
    await page.getByText('文件', { exact: true }).click(); await page.getByRole('button', { name: /^撤回：编辑版本信息/ }).click()
    await expect.poll(async () => (await page.evaluate(() => window.wordgit.library.detail('撤回验证.txt'))).versions[0].note).toBe('')
    await page.keyboard.press('Control+Shift+z'); await expect.poll(async () => (await page.evaluate(() => window.wordgit.library.detail('撤回验证.txt'))).versions[0].note).toBe('测试备注')
    await run.app.close()
    const env = { ...process.env, WORDGIT_LIBRARY_HOME: temporary }; delete env.ELECTRON_RUN_AS_NODE
    restarted = await electron.launch({ executablePath: process.env.WORDGIT_ELECTRON ?? path.resolve('node_modules/.cache/electron-runtime/dist/electron.exe'), args: [process.env.WORDGIT_APP ?? path.resolve('apps/desktop'), '--user-data-dir=' + path.join(temporary, 'profile')], env })
    const fresh = await restarted.firstWindow(); await fresh.getByRole('button', { name: '总览工作台', exact: true }).waitFor()
    expect(await fresh.evaluate(() => window.wordgit.history!.status())).toMatchObject({ canUndo: false, canRedo: false })
    await fresh.evaluate(id => window.wordgit.library.mutate({ type: 'version', docName: '撤回验证.txt', versionId: id, note: '最后备注' }), id)
    expect((await fresh.evaluate(() => window.wordgit.history!.status())).canUndo).toBe(true)
    await fresh.evaluate(id => window.wordgit.library.mutate({ type: 'purgeVersion', docName: '撤回验证.txt', versionId: id, deleteSource: false }), id)
    expect(await fresh.evaluate(() => window.wordgit.history!.status())).toMatchObject({ canUndo: false, canRedo: false })
    expect(await fs.readFile(source, 'utf8')).toBe('原文件后来修改'); expect(run.errors).toEqual([])
    await fs.writeFile(path.join(output, 'history-verification.json'), JSON.stringify({ passed: true, version: '0.5.3', importUndoRedo: true, menuActionClosesMenu: true, inputCtrlZPreserved: true, metadataUndoRedo: true, restartClearsHistory: true, permanentDeleteClearsHistory: true, originalSourceUnchanged: true }, null, 2))
  } finally { if (restarted) await restarted.close(); await run.close() }
})
