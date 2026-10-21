import { auditPath } from './auditPath'
import { test, expect, _electron as electron, type Page } from '@playwright/test'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import type { ProjectLibrary } from '../packages/shared/src/projects.js'
import { captureGraph } from './graphHelpers.js'

const output = auditPath('redline-motion-graph-menu-audit')
async function launch() {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'dockitty-graph-menu-')), env = { ...process.env, WORDGIT_LIBRARY_HOME: temporary }; delete env.ELECTRON_RUN_AS_NODE
  const app = await electron.launch({ executablePath: process.env.WORDGIT_ELECTRON ?? path.resolve('node_modules/.cache/electron-runtime/dist/electron.exe'), args: [process.env.WORDGIT_APP ?? path.resolve('apps/desktop'), '--user-data-dir=' + path.join(temporary, 'profile')], env })
  const page = await app.firstWindow(), errors: string[] = []; page.on('pageerror', e => errors.push(e.message)); page.setDefaultTimeout(12000)
  await app.evaluate(({ BrowserWindow }) => { const win = BrowserWindow.getAllWindows()[0]; win.setContentSize(1600, 1000); win.webContents.setBackgroundThrottling(false) })
  await expect(page.getByLabel('主题风格')).toBeVisible(); await fs.mkdir(output, { recursive: true })
  return { app, page, temporary, errors, async close() { await app.close(); if (path.dirname(temporary) === os.tmpdir() && path.basename(temporary).startsWith('dockitty-graph-menu-')) await fs.rm(temporary, { recursive: true, force: true }) } }
}
async function theme(page: Page, name: string) { await page.getByLabel('主题风格').click(); await page.getByRole('option').filter({ has: page.getByText(name, { exact: true }) }).click() }
async function blankMenu(page: Page) {
  const canvas = page.locator('.wg-graph-canvas'), box = (await canvas.boundingBox())!
  await page.mouse.click(box.x + box.width - 30, box.y + 80, { button: 'right' })
  await expect(page.getByRole('menu', { name: '关系图操作', exact: true })).toBeVisible()
}

test('redline uses the demo sweep, menu/dialog motions and click-only cat reaction; graph menu refresh discovers workspace files', async () => {
  test.setTimeout(120000)
  const run = await launch(), { app, page, temporary } = run
  try {
    await page.emulateMedia({ reducedMotion: 'no-preference' }); await theme(page, '赤幕'); await page.locator('.wg-redline-sweep').evaluate(e => Promise.all(e.getAnimations().map(a => a.finished)))
    const cat = page.getByRole('button', { name: '稿喵小猫，右键抚摸' }); await cat.hover()
    expect(await cat.evaluate(e => getComputedStyle(e).backgroundColor)).toBe('rgba(0, 0, 0, 0)')
    await expect(page.locator('.wg-cat-spark')).toHaveCount(0); await cat.click(); await expect(page.locator('.wg-cat-spark')).toHaveCount(1)
    await page.locator('.wg-cat-spark').evaluate(e => { const a = e.getAnimations()[0]; a.pause(); a.currentTime = 220 })
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))); await captureGraph(app, path.join(output, 'cat-click.png'))
    await page.locator('.wg-menu:not(.wg-features-menu) summary').click(); expect(await page.locator('.wg-menu[open]>div').evaluate(e => getComputedStyle(e).animationName)).toBe('wg-redline-menu'); await page.keyboard.press('Escape')
    const source = path.join(temporary, '原稿.txt'); await fs.writeFile(source, '原稿不可改动'); await page.evaluate(source => window.wordgit.doc.import(source), source)
    await page.getByRole('listitem', { name: '文档 原稿.txt', exact: true }).click(); await page.getByRole('button', { name: '版本关系图', exact: true }).click()
    const sweep = page.locator('.wg-redline-sweep')
    const samples = await sweep.evaluate(e => { const a = e.getAnimations()[0]; a.pause(); a.currentTime = 70; const early = getComputedStyle(e).transform; a.currentTime = 190; const late = getComputedStyle(e).transform; return { early, late, polygon: getComputedStyle(e).clipPath, pointer: getComputedStyle(e).pointerEvents } })
    expect(samples.early).not.toBe(samples.late); expect(samples.polygon).toContain('80% 100%'); expect(samples.pointer).toBe('none')
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))); await captureGraph(app, path.join(output, 'diagonal-sweep.png')); await sweep.evaluate(e => e.getAnimations()[0].finish())
    await blankMenu(page); await expect(page.getByRole('menuitem', { name: '整理卡片布局', exact: true })).toBeInViewport(); await captureGraph(app, path.join(output, 'version-menu.png'))
    await page.keyboard.press('Escape'); await expect(page.getByRole('menu', { name: '关系图操作' })).toHaveCount(0)
    const root = (await page.evaluate(() => window.wordgit.repo.bootstrap())).repoRoot
    await fs.writeFile(path.join(root, 'workspace/工作目录新增.md'), '# new')
    await blankMenu(page); await page.getByRole('menuitem', { name: '刷新工作目录与关系', exact: true }).click()
    await expect.poll(() => page.evaluate(() => window.wordgit.library.list().then(docs => docs.length))).toBe(2)
    await blankMenu(page); await page.getByRole('menuitem', { name: '新建文档', exact: true }).click()
    await expect(page.getByRole('dialog')).toBeVisible(); expect(await page.getByRole('dialog').evaluate(e => getComputedStyle(e).animationName)).toBe('wg-redline-dialog'); await page.keyboard.press('Escape')
    await blankMenu(page); await page.mouse.click(250, 135); await expect(page.getByRole('menu', { name: '关系图操作' })).toHaveCount(0)
    await page.locator('.wg-features-menu summary').click(); await page.getByRole('menuitemcheckbox', { name: '减少动态效果', exact: true }).click(); await page.keyboard.press('Escape')
    await expect(sweep).toHaveCount(0); await page.getByRole('button', { name: '总览工作台', exact: true }).click(); await cat.click(); expect(await cat.locator('img').evaluate(e => e.getAnimations().filter(a => a.playState === 'running').length)).toBe(0)
    await theme(page, '积木'); await expect(sweep).toHaveCount(0)
    expect(await fs.readFile(source, 'utf8')).toBe('原稿不可改动'); expect(run.errors).toEqual([])
    await fs.writeFile(path.join(output, 'motion.json'), JSON.stringify({ passed: true, samples, catHoverTransparent: true, catClickSpark: true, reducedMotion: true, existingThemeUnchanged: true, workspaceDiscovery: true, errors: run.errors }, null, 2))
  } finally { await run.close() }
})

test('project blank menu creates real files/folders, refreshes relationships and supports safe undo/redo across themes', async () => {
  test.setTimeout(180000)
  const run = await launch(), { app, page, temporary } = run
  try {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const folder = path.join(temporary, '项目'); await fs.mkdir(folder); await fs.writeFile(path.join(folder, '原文件.md'), '# source')
    const projectId = await page.evaluate(async folder => { const p = await window.wordgit.projects!.request({ action: 'create', name: '项目' }) as ProjectLibrary; await window.wordgit.projects!.request({ action: 'import', projectId: p.id, paths: [folder], unpackFolder: true }); return p.id }, folder)
    await page.getByLabel('管理模式').click(); await page.getByRole('option', { name: /项目管理/ }).click(); await page.getByRole('listitem', { name: '文档库 项目', exact: true }).click(); await page.getByRole('button', { name: '文件关系图', exact: true }).click()
    const read = () => page.evaluate(projectId => window.wordgit.projects!.request({ action: 'get', projectId }) as Promise<ProjectLibrary>, projectId)
    async function create(kind: '新建文档' | '新建文件夹', name: string, format = 'txt') {
      await blankMenu(page); await page.getByRole('menuitem', { name: kind, exact: true }).click(); await page.getByLabel('新建名称').fill(name)
      if (kind === '新建文档') await page.getByLabel('新建文档格式').selectOption(format)
      await expect(page.getByLabel('新建保存位置')).toHaveValue(folder); await page.getByRole('button', { name: '创建', exact: true }).click(); await expect(page.getByRole('dialog')).toHaveCount(0)
    }
    await theme(page, '赤幕'); await create('新建文件夹', '文稿')
    expect((await fs.stat(path.join(folder, '文稿'))).isDirectory()).toBe(true)
    await page.keyboard.press('Control+z'); await expect.poll(() => read().then(p => p.nodes.length)).toBe(1); await expect(fs.stat(path.join(folder, '文稿'))).rejects.toMatchObject({ code: 'ENOENT' })
    await page.keyboard.press('Control+Shift+z'); await expect.poll(() => read().then(p => p.nodes.length)).toBe(2)
    for (const format of ['txt', 'docx', 'xlsx', 'md']) { await create('新建文档', '新稿', format); expect((await fs.stat(path.join(folder, '新稿.' + format))).isFile()).toBe(true) }
    await fs.writeFile(path.join(folder, '外部新增.txt'), 'added'); await blankMenu(page); await page.getByRole('menuitem', { name: '刷新项目文件与关系', exact: true }).click(); await expect.poll(() => read().then(p => p.nodes.some(n => n.name === '外部新增.txt'))).toBe(true)
    const node = (await read()).nodes.find(n => n.name === '新稿.txt')!, other = (await read()).nodes.find(n => n.name === '原文件.md')!
    await page.evaluate(({ projectId, node, other }) => window.wordgit.projects!.request({ action: 'setRelation', projectId, relation: { from: node.id, to: other.id, label: '参考' } }), { projectId, node, other })
    await blankMenu(page); await page.getByRole('menuitem', { name: '刷新项目文件与关系', exact: true }).click(); expect((await read()).relations[0].label).toBe('参考')
    for (const [id, name] of [['redline','赤幕'],['blockframe','积木'],['raw','粉绿'],['retro','视窗'],['capsule','胶囊'],['light','素白'],['paper','暖纸'],['dark','石墨'],['liquid','琉璃'],['liquid-dark','夜璃']]) {
      await theme(page, name); await blankMenu(page); await expect(page.getByRole('menuitem', { name: '新建文件夹', exact: true })).toBeInViewport(); await captureGraph(app, path.join(output, id + '-menu.png'))
      await page.getByRole('menuitem', { name: '新建文档', exact: true }).click(); await expect(page.getByRole('button', { name: '创建', exact: true })).toBeInViewport(); await captureGraph(app, path.join(output, id + '-new.png')); await page.keyboard.press('Escape')
    }
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1000, 700)); await expect.poll(() => page.evaluate(() => innerWidth)).toBe(1000); await page.waitForTimeout(450); await blankMenu(page); await expect(page.getByRole('menuitem', { name: '新建文件夹', exact: true })).toBeInViewport(); await page.keyboard.press('Escape')
    expect(await fs.readFile(path.join(folder, '原文件.md'), 'utf8')).toBe('# source'); expect(run.errors).toEqual([])
    await fs.writeFile(path.join(output, 'project-menu.json'), JSON.stringify({ passed: true, realDiskCreation: true, formats: ['txt','docx','xlsx','md'], folderUndoRedo: true, tenThemes: true, compact: true, relationsPreserved: true, sourceUnchanged: true, errors: run.errors }, null, 2))
  } finally { await run.close() }
})
