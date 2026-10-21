import { auditPath } from './auditPath'
import { test, expect, _electron as electron } from '@playwright/test'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { captureGraph, editWire } from './graphHelpers.js'
import type { ProjectLibrary } from '../packages/shared/src/projects.js'

test.use({ actionTimeout: 12000 })

test('glass views, global features, widget persistence and exact pointer coordinates', async () => {
  test.setTimeout(180000)
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'dockitty-liquid-')), output = auditPath('liquid-glass-integration-audit')
  await fs.mkdir(output, { recursive: true })
  const env = { ...process.env, WORDGIT_LIBRARY_HOME: temporary }; delete env.ELECTRON_RUN_AS_NODE
  const app = await electron.launch({ executablePath: process.env.WORDGIT_ELECTRON ?? path.resolve('node_modules/.cache/electron-runtime/dist/electron.exe'), args: [process.env.WORDGIT_APP ?? path.resolve('apps/desktop'), '--user-data-dir=' + path.join(temporary, 'profile')], env })
  try {
    const page = await app.firstWindow(), errors: string[] = [], captures: string[] = []
    page.setDefaultTimeout(12000)
    const runtime = await app.evaluate(({ app }) => ({ version: app.getVersion(), packaged: app.isPackaged }))
    page.on('pageerror', e => errors.push(e.message))
    await app.evaluate(({ BrowserWindow }) => { const win = BrowserWindow.getAllWindows()[0]; win.webContents.setBackgroundThrottling(false); win.setContentSize(1600, 1000) })
    await expect(page.getByRole('button', { name: '总览工作台', exact: true })).toBeVisible()
    const source = path.join(temporary, '毕业论文.txt'), name = '毕业论文.txt', original = '# 研究背景\n保存文档修改的来路。\n'.repeat(25)
    await fs.writeFile(source, original)
    const first = (await page.evaluate(source => window.wordgit.doc.import(source), source)).commitId!
    const root = (await page.evaluate(() => window.wordgit.repo.bootstrap())).repoRoot
    await fs.writeFile(path.join(root, 'workspace', name), original + '补充实验结果与讨论。')
    const second = (await page.evaluate(name => window.wordgit.commit.create(name, '补充实验与讨论', '测试'), name)).commitId!
    const category = await page.evaluate(name => window.wordgit.library.mutate({ type: 'category', docName: name, action: 'create', name: '导师审阅' }), name)
    for (const [id, x] of [[first, 40], [second, 440]] as const) await page.evaluate(({ name, id, x, categoryId }) => window.wordgit.library.mutate({ type: 'version', docName: name, versionId: id, position: { x, y: 100 }, categoryId, note: '这一稿的修改说明。\n'.repeat(70) }), { name, id, x, categoryId: category.categoryId })
    await page.getByRole('listitem', { name: '文档 ' + name, exact: true }).click()
    async function theme(label: string) { await page.getByLabel('主题风格').click(); await page.getByRole('option').filter({ has: page.getByText(label, { exact: true }) }).click() }
    async function capture(file: string) {
      if (await page.locator('.wg-main-view').count()) { await expect(page.locator('.wg-main-view')).toHaveCSS('opacity', '1'); await expect(page.locator('.wg-main-view')).toHaveCSS('transform', 'none') }
      await page.waitForTimeout(150)
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      const blue = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.wg-menubar *, .wg-button, .wg-nav button, .wg-stat-heading *')].filter(e => e.getClientRects().length).filter(e => { const c = getComputedStyle(e).color.match(/[\d.]+/g)?.map(Number); return c && c[2] > c[0] + 25 && c[2] > c[1] + 15 }).map(e => e.textContent?.slice(0, 25)))
      expect(blue).toEqual([]); await captureGraph(app, path.join(output, file + '.png')); captures.push(file)
    }
    for (const label of ['琉璃', '夜璃']) {
      await theme(label)
      for (const [view, key] of [['总览工作台', 'overview'], ['版本关系图', 'graph'], ['分类看板', 'board'], ['版本统计', 'stats']]) {
        await page.getByRole('button', { name: view, exact: true }).click()
        await expect(page.getByRole('button', { name: view, exact: true })).toHaveAttribute('aria-pressed', 'true')
        await expect(page.locator(view === '总览工作台' ? '.wg-overview' : view === '版本关系图' ? '.wg-graph-canvas' : view === '分类看板' ? '.wg-columns' : '.wg-stat-chart-panel')).toBeVisible()
        if (view === '版本统计') await expect(page.locator('.wg-stat-chart-panel')).toBeVisible()
        await capture((label === '夜璃' ? 'dark-' : 'light-') + key)
      }
      await page.getByRole('button', { name: '总览工作台', exact: true }).click()
      await page.getByRole('button', { name: '展开预览', exact: true }).click(); await expect(page.getByRole('dialog')).toBeVisible(); await capture(label === '夜璃' ? 'dark-preview' : 'light-preview'); await page.keyboard.press('Escape')
      await page.locator('.wg-menu summary').filter({ hasText: /^功能$/ }).click(); await expect(page.getByRole('menu', { name: '全局功能' })).toBeVisible(); await capture(label === '夜璃' ? 'dark-features' : 'light-features'); await page.keyboard.press('Escape')
    }
    await theme('琉璃')
    const order = await page.locator('.wg-menubar').evaluate(el => {
      const file = el.querySelector('.wg-menu:not(.wg-features-menu)')!, features = el.querySelector('.wg-features-menu')!, help = el.querySelector('.wg-help-trigger')!
      return { fileBeforeFeatures: !!(file.compareDocumentPosition(features) & Node.DOCUMENT_POSITION_FOLLOWING), helpLast: el.lastElementChild === help }
    })
    expect(order).toEqual({ fileBeforeFeatures: true, helpLast: true })
    const features = page.locator('.wg-features-menu summary')
    await features.click(); await page.getByRole('menuitemcheckbox', { name: '背景流动', exact: true }).click()
    expect(await page.locator('.wg-liquid-background svg').evaluate(el => (el as SVGSVGElement).animationsPaused())).toBe(true)
    await page.getByRole('menuitemcheckbox', { name: '背景流动', exact: true }).click(); await page.keyboard.press('Escape')
    await page.locator('.wg-liquid-background svg').evaluate(el => (el as SVGSVGElement).setCurrentTime(0))
    const curve = () => page.locator('.wg-liquid-background .jade-ribbon').evaluate(el => { const path = el as SVGPathElement, p = path.getPointAtLength(path.getTotalLength() * .25); return { x: p.x, y: p.y } })
    const before = await curve(); await page.waitForTimeout(1200); const after = await curve(); expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeGreaterThan(8)
    await page.getByRole('button', { name: '版本关系图', exact: true }).click()
    await expect(page.locator('.wg-graph-node')).toHaveCount(2)
    await expect(page.locator('.wg-main-view')).toHaveCSS('transform', 'none')
    const card = page.locator('.wg-graph-node').first(), box = (await card.boundingBox())!, pointer = { x: box.x + box.width * .6, y: box.y + box.height * .6 }
    await page.mouse.move(pointer.x, pointer.y)
    const aligned = await card.evaluate(el => {
      const panel = el as HTMLElement, r = el.getBoundingClientRect(), x = Number(panel.style.getPropertyValue('--wg-light-x')), y = Number(panel.style.getPropertyValue('--wg-light-y'))
      return { x: r.left + (x + panel.clientLeft) * r.width / panel.offsetWidth, y: r.top + (y + panel.clientTop) * r.height / panel.offsetHeight, head: panel.style.getPropertyValue('--wg-light-head') }
    })
    expect(aligned.x).toBeCloseTo(pointer.x, 0); expect(aligned.y).toBeCloseTo(pointer.y, 0); expect(aligned.head).toContain('radial-gradient')
    expect(await card.evaluate(el => getComputedStyle(el).backgroundSize.split(',').every(size => size.trim() === 'auto'))).toBe(true)
    await page.getByRole('button', { name: '版本节点 补充实验与讨论', exact: true }).click()
    const inspector = page.locator('.wg-inspector'); await inspector.getByRole('tab', { name: '信息', exact: true }).click()
    const section = inspector.getByRole('tabpanel'); await section.locator('.wg-version-note summary').click()
    await section.evaluate(el => { el.scrollTop = 120 }); expect(await section.evaluate(el => el.scrollTop)).toBeGreaterThan(0)
    const local = await inspector.evaluate(el => { const r = el.getBoundingClientRect(); for (const y of [25, 55, 95, 150]) { const x = r.left + 30, py = r.top + y; if (document.elementFromPoint(x, py)?.closest('.wg-button,.wg-icon-button,.wg-inspector') === el) return { x, y: py } } throw new Error('No clear detail surface') })
    await page.mouse.move(local.x, local.y)
    const detailPoint = await inspector.evaluate(el => { const r = el.getBoundingClientRect(), panel = el as HTMLElement; return { x: r.left + Number(panel.style.getPropertyValue('--wg-light-x')) + panel.clientLeft, y: r.top + Number(panel.style.getPropertyValue('--wg-light-y')) + panel.clientTop } })
    expect(detailPoint.x).toBeCloseTo(local.x, 0); expect(detailPoint.y).toBeCloseTo(local.y, 0)
    await capture('scrolled-detail-light')
    const figure = page.locator('.wg-riffle-figure'); await figure.click({ button: 'right' }); await page.getByRole('menuitemradio', { name: /^Drawer ·/ }).click()
    await figure.click({ button: 'right' }); await capture('widget-menu'); await expect(page.getByRole('menuitem', { name: '关闭小组件', exact: true })).toBeVisible(); await page.getByRole('menuitem', { name: '关闭小组件', exact: true }).click(); await expect(page.locator('.wg-graph-riffle')).toHaveCount(0)
    await features.click(); await expect(page.getByRole('menuitemcheckbox', { name: '关系图小组件' })).toHaveAttribute('aria-checked', 'false'); await page.getByRole('menuitemcheckbox', { name: '关系图小组件' }).click(); await page.keyboard.press('Escape'); await expect(figure).toHaveAttribute('data-figure', 'Drawer')
    const line = page.locator('.wg-edge-line').first(); await editWire(page, line, 'right'); await capture('edge-editor'); await page.keyboard.press('Escape')
    const folder = path.join(temporary, '项目资料'); await fs.mkdir(folder); await fs.writeFile(path.join(folder, '说明.md'), '# 说明\n整理资料'); await fs.writeFile(path.join(folder, '页面.html'), '<h1>安全页面</h1>')
    const projectId = await page.evaluate(async folder => { const p = await window.wordgit.projects!.request({ action: 'create', name: '投稿资料' }) as ProjectLibrary; await window.wordgit.projects!.request({ action: 'import', projectId: p.id, paths: [folder], unpackFolder: true }); return p.id }, folder)
    await page.getByLabel('管理模式').click(); await page.getByRole('option', { name: /项目管理/ }).click(); await page.getByRole('listitem', { name: '文档库 投稿资料', exact: true }).click()
    for (const label of ['琉璃', '夜璃']) {
      await theme(label)
      for (const [view, key] of [['文件浏览', 'files'], ['文件关系图', 'graph'], ['分类看板', 'board']]) { await page.getByRole('button', { name: view, exact: true }).click(); await capture((label === '夜璃' ? 'dark-' : 'light-') + 'project-' + key) }
    }
    await page.getByRole('button', { name: '文件浏览', exact: true }).click(); await page.getByRole('listitem', { name: '资料 说明.md', exact: true }).click(); await page.getByRole('button', { name: '展开预览', exact: true }).click(); await expect(page.getByRole('dialog').locator('pre')).toContainText('整理资料'); await capture('project-preview'); await page.keyboard.press('Escape')
    for (const [label, key] of [['积木', 'blockframe'], ['粉绿', 'raw'], ['视窗', 'retro'], ['胶囊', 'capsule'], ['素白', 'light'], ['暖纸', 'paper'], ['石墨', 'dark'], ['系统', 'system']]) { await theme(label); await features.click(); await expect(page.getByRole('menuitemcheckbox', { name: '关系图小组件' })).toBeVisible(); await capture('old-theme-' + key + '-features'); await page.keyboard.press('Escape') }
    await theme('琉璃'); await features.click(); await page.getByRole('menuitemcheckbox', { name: '减少透明度' }).click(); await capture('reduced-transparency'); await page.getByRole('menuitemcheckbox', { name: '减少透明度' }).click(); await page.getByRole('menuitemcheckbox', { name: '减少动态效果' }).click(); expect(await page.locator('.wg-liquid-background svg').evaluate(el => (el as SVGSVGElement).animationsPaused())).toBe(true); await page.getByRole('menuitemcheckbox', { name: '减少动态效果' }).click(); await page.keyboard.press('Escape')
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(900, 600)); await capture('compact-project'); await features.click(); await expect(page.getByRole('menuitemcheckbox', { name: '关系图小组件' })).toBeInViewport(); await page.keyboard.press('Escape')
    await page.getByRole('button', { name: '使用帮助', exact: true }).click(); await expect(page.getByRole('dialog')).toBeVisible(); await page.keyboard.press('Escape')
    await page.getByRole('button', { name: '文件关系图', exact: true }).click(); await figure.click({ button: 'right' }); await page.getByRole('menuitem', { name: '关闭小组件' }).click(); await page.reload(); await expect(page.getByLabel('管理模式')).toBeVisible(); await page.getByLabel('管理模式').click(); await page.getByRole('option', { name: /项目管理/ }).click(); await page.getByRole('listitem', { name: '文档库 投稿资料', exact: true }).click(); await page.getByRole('button', { name: '文件关系图', exact: true }).click(); await expect(page.locator('.wg-graph-riffle')).toHaveCount(0)
    await features.click(); await page.getByRole('menuitemcheckbox', { name: '关系图小组件' }).click(); await page.keyboard.press('Escape'); await expect(figure).toHaveAttribute('data-figure', 'Drawer')
    expect(await fs.readFile(source, 'utf8')).toBe(original); expect(errors).toEqual([])
    await fs.writeFile(path.join(output, 'verification.json'), JSON.stringify({ passed: true, appVersion: runtime.version, packaged: runtime.packaged, renderer: 'production Electron', pointerAlignedOnZoomAndScroll: true, widgetCloseAndReopen: true, preferencesPersistAfterReload: true, sourceUnchanged: true, errors, projectId, screenshots: captures }, null, 2))
  } finally { await app.close(); if (path.dirname(temporary) === os.tmpdir() && path.basename(temporary).startsWith('dockitty-liquid-')) await fs.rm(temporary, { recursive: true, force: true }) }
})
