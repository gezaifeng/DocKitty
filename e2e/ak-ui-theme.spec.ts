import { revealInspector } from './inspectorHelpers'
import { auditPath } from './auditPath'
import { test, expect, _electron as electron, type Page } from '@playwright/test'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { createRequire } from 'node:module'
import type { ProjectLibrary } from '../packages/shared/src/projects.js'
import { captureGraph, editWire } from './graphHelpers.js'

const output = auditPath('ak-ui-integration-audit')
const runtime = () => process.env.WORDGIT_ELECTRON ?? path.resolve('node_modules/.cache/electron-runtime/dist/electron.exe')
const application = () => process.env.WORDGIT_APP ?? path.resolve('apps/desktop')
async function launch(temporary: string) {
  const env = { ...process.env, WORDGIT_LIBRARY_HOME: path.join(temporary, 'library') }; delete env.ELECTRON_RUN_AS_NODE
  const app = await electron.launch({ executablePath: runtime(), args: [application(), '--user-data-dir=' + path.join(temporary, 'profile')], env })
  const page = await app.firstWindow(); page.setDefaultTimeout(12000)
  await app.evaluate(({ BrowserWindow }) => { const win = BrowserWindow.getAllWindows()[0]; win.setContentSize(1600, 1000); win.webContents.setBackgroundThrottling(false) })
  return { app, page }
}
async function selectTheme(page: Page, label = '方舟') {
  await page.getByLabel('主题风格').click(); await page.getByRole('option').filter({ has: page.getByText(label, { exact: true }) }).click()
}
async function visibleAudit(page: Page) {
  const result = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1
    const context = canvas.getContext('2d', { willReadFrequently: true })!, colors = new Map<string, Uint8ClampedArray>()
    const blue = [...document.querySelectorAll('body *')].filter(e => e.getClientRects().length && [...e.childNodes].some(n => n.nodeType === 3 && n.textContent?.trim())).filter(e => { const color = getComputedStyle(e).color; let c = colors.get(color); if (!c) { context.clearRect(0, 0, 1, 1); context.fillStyle = color; context.fillRect(0, 0, 1, 1); c = context.getImageData(0, 0, 1, 1).data; colors.set(color, c) } return c[2] > c[0] + 25 && c[2] > c[1] + 15 }).map(e => e.textContent?.slice(0, 40))
    return { width: innerWidth, scrollWidth: document.documentElement.scrollWidth, blue, theme: document.documentElement.dataset.theme }
  })
  expect(result.theme).toBe('arknights'); expect(result.blue).toEqual([]); expect(result.scrollWidth).toBeLessThanOrEqual(result.width)
  const contrast = await page.evaluate(() => {
    const channel = (v: number) => { const x=v/255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4 }
    const light = (s: string) => { const c=s.match(/[\d.]+/g)!.map(Number);return .2126*channel(c[0])+.7152*channel(c[1])+.0722*channel(c[2]) }
    return [['.wg-graph-controls button','.wg-graph-controls'],['.wg-inspector>header>span','.wg-inspector']].flatMap(([selector,parent]) => {
      const node=document.querySelector(selector),surface=document.querySelector(parent);if(!node||!surface)return []
      const a=light(getComputedStyle(node).color),b=light(getComputedStyle(surface).backgroundColor);return [{selector,ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05)}]
    })
  })
  for(const item of contrast)expect(item.ratio, item.selector).toBeGreaterThanOrEqual(4.5)
  return result
}

test('arknights covers version views, all dialogs, live edge edits, settings and existing themes', async () => {
  test.setTimeout(180000)
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'dockitty-arknights-version-')), { app, page } = await launch(temporary), errors: string[] = [], captures: string[] = []
  page.on('pageerror', e => errors.push(e.message)); await page.emulateMedia({ reducedMotion: 'reduce' })
  try {
    await fs.mkdir(output, { recursive: true }); await expect(page.getByLabel('主题风格')).toBeVisible(); await selectTheme(page)
    const capture = async (name: string) => { await page.waitForTimeout(450); await visibleAudit(page); await captureGraph(app, path.join(output, name + '.png')); captures.push(name) }
    await capture('version-empty')
    const source = path.join(temporary, '毕业论文.txt'), original = '研究背景与实验方法。\n' + '在不同条件下记录实验结果，并保留修改依据。\n'.repeat(70)
    await fs.writeFile(source, original); const first = (await page.evaluate(source => window.wordgit.doc.import(source), source)).commitId!
    const root = (await page.evaluate(() => window.wordgit.repo.bootstrap())).repoRoot
    const ids = [first]
    for (const [title, content] of [['补充实验', original + '补充实验与结果讨论。\n'.repeat(30)], ['主稿定版', original + '补充实验与应用讨论。\n'.repeat(52)]]) {
      await fs.writeFile(path.join(root, 'workspace/毕业论文.txt'), content)
      ids.push((await page.evaluate(({ title }) => window.wordgit.commit.create('毕业论文.txt', title, '主题验收'), { title })).commitId!)
    }
    await page.evaluate(async ({ ids }) => {
      const category = await window.wordgit.library.mutate({ type: 'category', docName: '毕业论文.txt', action: 'create', name: '写作' })
      await window.wordgit.library.mutate({ type: 'category', docName: '毕业论文.txt', action: 'create', name: '投递' })
      await window.wordgit.library.mutate({ type: 'document', docName: '毕业论文.txt', title: '毕业论文 · 修订稿' })
      for (let i = 0; i < ids.length; i++) await window.wordgit.library.mutate({ type: 'version', docName: '毕业论文.txt', versionId: ids[i], ...(i === 0 ? { title: '研究初稿' } : {}), note: '保留本轮研究与修改记录。', categoryId: category.categoryId!, position: { x: 50 + i * 330, y: 130 + i * 35 } })
      await window.wordgit.library.mutate({ type: 'createDocument', name: '会议纪要', format: 'docx' })
      await window.wordgit.library.mutate({ type: 'createDocument', name: '实验数据', format: 'xlsx' })
    }, { ids })
    const notes = path.join(temporary, '文献笔记.md'); await fs.writeFile(notes, '# 文献笔记\n记录每一份资料的来源。'); await page.evaluate(notes => window.wordgit.doc.import(notes), notes)
    await page.reload(); await expect(page.locator('.wg-startup')).toHaveCount(0); await expect(page.locator('.wg-document-card')).toHaveCount(4)
    await page.getByRole('listitem', { name: '文档 毕业论文 · 修订稿', exact: true }).click(); await capture('version-overview')
    expect(await page.locator('.wg-document-card.selected').evaluate(e => getComputedStyle(e).color)).toBe('rgb(32, 40, 43)')
    for (const name of ['文稿', '表格与数据', '演示资料', '全部文档']) { await page.locator('.wg-nav').getByRole('button', { name: new RegExp('^' + name) }).click(); await capture('filter-' + name) }
    await page.getByRole('button', { name: '新建文档', exact: true }).click(); await capture('version-new'); await page.getByRole('dialog').getByRole('button', { name: '取消', exact: true }).click()
    const modal = async (button: string, shot: string) => { await revealInspector(page, button); await page.getByRole('button', { name: button, exact: true }).click(); await expect(page.getByRole('dialog')).toBeVisible(); await expect(page.getByRole('dialog').getByRole('button', { name: /^(取消|关闭|知道了)$/ }).first()).toBeInViewport(); await capture(shot); await page.keyboard.press('Escape') }
    await modal('导入文档 / 版本', 'version-import'); await modal('保存工作区修改', 'version-save'); await modal('改名称', 'version-document'); await modal('编辑版本信息', 'version-metadata'); await modal('建分支', 'version-branch')
    await page.getByRole('button', { name: '分类看板', exact: true }).click(); await capture('version-board'); await modal('添加分类', 'version-category')
    await page.getByRole('button', { name: '版本关系图', exact: true }).click(); await expect(page.locator('.wg-main-view')).toHaveCSS('opacity', '1'); await capture('version-graph')
    const latest = page.getByRole('button', { name: '版本节点 主稿定版', exact: true })
    await latest.click({ button: 'right' }); await capture('version-context'); await page.getByRole('menuitem', { name: '编辑备注', exact: true }).click(); await capture('version-note'); await page.keyboard.press('Escape')
    for (const [item, shot] of [['沿现有分支创建下一稿', 'version-edit'], ['删除版本…', 'version-delete'], ['展开只读预览', 'version-preview']]) { await latest.click({ button: 'right' }); await page.getByRole('menuitem', { name: item, exact: true }).click(); await expect(page.getByRole('dialog')).toBeVisible(); await capture(shot); await page.keyboard.press('Escape') }
    await revealInspector(page, '选择两版比较'); await page.getByRole('button', { name: '选择两版比较', exact: true }).click(); await latest.click(); await page.getByRole('button', { name: '版本节点 研究初稿', exact: true }).click(); await modal('开始对比', 'version-compare'); await page.getByRole('button', { name: /选择中 2\/2/ }).click()
    const line = page.locator('.wg-edge-line').first(); await editWire(page, line, 'right'); const editor = page.getByRole('dialog', { name: '编辑连线', exact: true })
    await editor.getByLabel('关系标签').fill('修改依据'); await editor.getByLabel('箭头大小').fill('18'); await expect(line).toHaveAttribute('data-arrow-size', '18'); await capture('version-edge')
    const before = (await editor.boundingBox())!, handle = (await editor.locator(':scope>header').boundingBox())!; await page.mouse.move(handle.x + 50, handle.y + 10); await page.mouse.down(); await page.mouse.move(handle.x + 300, handle.y + 25, { steps: 8 }); await page.mouse.up(); expect((await editor.boundingBox())!.x).toBeGreaterThan(before.x + 100); await editor.getByRole('button', { name: '取消', exact: true }).click(); await expect(line).toHaveAttribute('data-arrow-size', '8')
    await page.locator('.wg-riffle-figure').click({ button: 'right' }); await capture('figure-menu'); await page.keyboard.press('Escape')
    await page.getByRole('button', { name: '版本统计', exact: true }).click(); await expect(page.locator('.wg-stat-cards')).toBeVisible(); await capture('version-statistics')
    const metrics = page.locator('.wg-stat-sidebar section button'), metricCount = await metrics.count()
    for (let i = 0; i < metricCount; i++) { const button = metrics.nth(i); await button.click(); await expect(button).toHaveAttribute('aria-pressed', 'true'); await expect(page.locator('.wg-stat-heading h1')).toBeInViewport(); await visibleAudit(page) }
    await capture('version-statistics-last'); await modal('使用帮助', 'version-help')
    await page.getByLabel('保存与备份设置').click(); await expect(page.getByRole('heading', { name: '存储统计', exact: true })).toBeVisible(); await capture('settings'); await page.getByRole('button', { name: '返回工作台', exact: true }).click()
    await page.locator('.wg-menu:not(.wg-features-menu) summary').click(); await capture('file-menu'); await page.locator('.wg-projectbar').click(); await expect(page.locator('.wg-menu:not(.wg-features-menu)[open]')).toHaveCount(0)
    await page.locator('.wg-features-menu summary').click(); await capture('features-menu'); await page.keyboard.press('Escape')
    await page.getByLabel('主题风格').click(); await capture('theme-picker'); await page.keyboard.press('Escape')
    await page.getByRole('button', { name: '总览工作台', exact: true }).click(); await page.getByRole('button', { name: '回收区', exact: true }).click(); await page.getByRole('button', { name: '在工作台查看回收内容', exact: true }).click(); await capture('version-recycle'); await page.getByRole('button', { name: '返回正常内容', exact: true }).click()
    for (const [id, label] of [['blockframe', '积木'], ['raw', '粉绿'], ['retro', '视窗'], ['capsule', '胶囊'], ['liquid', '琉璃'], ['liquid-dark', '夜璃'], ['light', '素白'], ['paper', '暖纸'], ['dark', '石墨']]) { await selectTheme(page, label); await expect(page.locator('html')).toHaveAttribute('data-theme', id); expect(await page.locator('.wg-project-title .wg-title-letter').count()).toBe(0) }
    await selectTheme(page); await page.getByRole('button', { name: '总览工作台', exact: true }).click(); await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1000, 700)); await capture('compact-overview'); await page.getByLabel('主题风格').click(); await page.getByRole('option', { name: /系统/ }).scrollIntoViewIfNeeded(); await expect(page.getByRole('option', { name: /系统/ })).toBeInViewport(); await page.keyboard.press('Escape')
    await modal('新建文档', 'compact-new'); await page.getByRole('button', { name: '版本关系图', exact: true }).click(); await capture('compact-graph')
    const node = page.getByRole('button', { name: '版本节点 补充实验', exact: true }), box = (await node.boundingBox())!; await page.mouse.move(box.x + 30, box.y + 25); await page.mouse.down(); await page.mouse.move(box.x + 55, box.y + 55, { steps: 8 }); await page.mouse.up(); const dropped = (await node.boundingBox())!; await page.waitForTimeout(350); expect((await node.boundingBox())!.x).toBeCloseTo(dropped.x, 0)
    await page.getByRole('button', { name: '版本统计', exact: true }).click(); await capture('compact-statistics')
    expect(await fs.readFile(source, 'utf8')).toBe(original); expect(errors).toEqual([])
    await fs.writeFile(path.join(output, 'versions.json'), JSON.stringify({ passed: true, screenshots: captures, metrics: metricCount, allDialogs: true, compactControls: true, liveEdgeStyle: true, draggableEditor: true, noDropBounce: true, themeRoundTrip: true, sourceUnchanged: true, errors }, null, 2))
  } finally { await app.close(); if (path.dirname(temporary) === os.tmpdir() && path.basename(temporary).startsWith('dockitty-arknights-version-')) await fs.rm(temporary, { recursive: true, force: true }) }
})

test('arknights covers project layers, classification, safe previews, Agent menus and restart', async () => {
  test.setTimeout(160000)
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'dockitty-arknights-project-')); let { app, page } = await launch(temporary)
  const errors: string[] = [], captures: string[] = []; page.on('pageerror', e => errors.push(e.message))
  try {
    await fs.mkdir(output, { recursive: true }); await page.emulateMedia({ reducedMotion: 'reduce' }); await expect(page.getByLabel('主题风格')).toBeVisible(); await selectTheme(page)
    const source = path.join(temporary, '研究项目'); await fs.mkdir(path.join(source, '文稿'), { recursive: true }); await fs.mkdir(path.join(source, '图表'))
    const manuscript = path.join(source, '文稿/研究说明.md'), html = path.join(source, '资料首页.html'), text = '# 研究说明\n' + '保留实验安排与文档迭代记录。\n'.repeat(45)
    await fs.writeFile(manuscript, text); await fs.writeFile(html, '<h1>项目资料首页</h1><p>这是安全的本地资料预览。</p><script>window.untrusted=true</script>'); await fs.writeFile(path.join(source, '项目提纲.md'), '# 项目提纲\n文稿、数据与演示。')
    const require = createRequire(path.resolve('apps/desktop/package.json')), ExcelJS = require('exceljs'), book = new ExcelJS.Workbook(); book.addWorksheet('实验结果').getCell('B2').value = '主题预览数据'; await book.xlsx.writeFile(path.join(source, '实验数据.xlsx'))
    const projectId = await page.evaluate(async source => { const p = await window.wordgit.projects!.request({ action: 'create', name: '研究项目' }) as ProjectLibrary; await window.wordgit.projects!.request({ action: 'import', projectId: p.id, paths: [source], unpackFolder: true }); return p.id }, source)
    const read = () => page.evaluate(projectId => window.wordgit.projects!.request({ action: 'get', projectId }) as Promise<ProjectLibrary>, projectId)
    const project = await read(), writing = project.nodes.find(n => n.name === '文稿')!, figures = project.nodes.find(n => n.name === '图表')!
    await page.evaluate(async ({ projectId, writing, figures }) => { const c = await window.wordgit.projects!.request({ action: 'setCategory', projectId, category: { name: '写作资料' } }) as { id: string }; await window.wordgit.projects!.request({ action: 'updateNode', projectId, nodeId: writing.id, categoryId: c.id }); await window.wordgit.projects!.request({ action: 'setRelation', projectId, relation: { from: writing.id, to: figures.id, label: '图表依据', note: '用于说明论文中的实验结果。' } }) }, { projectId, writing, figures })
    await page.getByLabel('管理模式').click(); await page.getByRole('option', { name: /项目管理/ }).click()
    const capture = async (name: string) => { await page.waitForTimeout(450); await visibleAudit(page); await captureGraph(app, path.join(output, name + '.png')); captures.push(name) }
    await capture('project-home'); await page.getByRole('listitem', { name: '文档库 研究项目', exact: true }).click(); await capture('project-browser')
    await page.getByRole('listitem', { name: '资料 资料首页.html', exact: true }).click(); await page.getByRole('button', { name: '展开预览', exact: true }).click(); await expect(page.getByRole('dialog').frameLocator('iframe').getByRole('heading', { name: '项目资料首页' })).toBeVisible(); await capture('project-html-preview'); await page.keyboard.press('Escape')
    await page.getByRole('listitem', { name: '资料 实验数据.xlsx', exact: true }).click(); await page.getByRole('button', { name: '展开预览', exact: true }).click(); await expect(page.getByRole('dialog')).toContainText('主题预览数据'); await capture('project-excel-preview'); await page.keyboard.press('Escape')
    await page.getByRole('listitem', { name: '资料 文稿', exact: true }).dblclick(); await page.getByRole('listitem', { name: '资料 研究说明.md', exact: true }).click(); await capture('project-folder'); await page.getByRole('button', { name: '展开预览', exact: true }).click(); await capture('project-text-preview'); await page.keyboard.press('Escape'); await page.getByRole('button', { name: '返回上一级', exact: true }).click()
    await page.getByRole('button', { name: '文件关系图', exact: true }).click(); await capture('project-graph'); await editWire(page, page.locator('.wg-project-edges .wg-edge-line').first(), 'right'); await capture('project-edge'); await page.getByRole('dialog', { name: '编辑连线' }).getByRole('button', { name: '取消', exact: true }).click()
    await page.getByRole('button', { name: '项目节点 文稿', exact: true }).click({ button: 'right' }); await capture('project-context'); await page.keyboard.press('Escape')
    await page.getByRole('button', { name: '分类看板', exact: true }).click(); await capture('project-board'); await page.getByRole('button', { name: '添加分类', exact: true }).click(); await capture('project-category'); await page.keyboard.press('Escape')
    await page.getByLabel('重命名项目分类 写作资料').click(); await capture('project-category-rename'); await page.keyboard.press('Escape'); await page.getByLabel('删除项目分类 写作资料').click(); await capture('project-category-delete'); await page.keyboard.press('Escape')
    await page.getByRole('button', { name: '接入 Agent', exact: true }).click(); for (const name of ['Codex', 'Claude Code', 'Cursor', 'DSH']) { await page.getByRole('button', { name, exact: true }).click(); await capture('agent-' + name.replaceAll(' ', '-')) } await page.keyboard.press('Escape')
    await page.getByRole('button', { name: '文件浏览', exact: true }).click(); await page.getByRole('listitem', { name: '资料 项目提纲.md', exact: true }).click(); await revealInspector(page, '编辑显示名称与备注'); await page.getByRole('button', { name: '编辑显示名称与备注', exact: true }).click(); await capture('project-node'); await page.keyboard.press('Escape'); await page.getByRole('button', { name: '记录下一轮', exact: true }).click(); await capture('project-iteration'); await page.keyboard.press('Escape'); await page.getByRole('button', { name: '更多操作', exact: true }).click(); await page.getByRole('menuitem', { name: '从管理中移除…', exact: true }).click(); await capture('project-remove'); await page.keyboard.press('Escape')
    await page.getByRole('button', { name: '使用帮助', exact: true }).click(); await capture('project-help'); await page.keyboard.press('Escape')
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1000, 700)); await capture('compact-project'); await page.getByRole('button', { name: '文件关系图', exact: true }).click(); await capture('compact-project-graph')
    await page.emulateMedia({ reducedMotion: 'no-preference' }); await page.getByRole('button', { name: '文件浏览', exact: true }).click(); await page.waitForTimeout(450); await capture('project-motion-enabled')
    await page.locator('.wg-features-menu summary').click(); await page.getByRole('menuitemcheckbox', { name: '减少动态效果', exact: true }).click(); await expect(page.locator('html')).toHaveAttribute('data-reduced-motion', 'true'); await page.keyboard.press('Escape'); await page.getByRole('button', { name: '分类看板', exact: true }).click(); expect(await page.locator('.wg-column').first().evaluate(e => getComputedStyle(e).animationName)).toBe('none')
    await app.close(); ({ app, page } = await launch(temporary)); page.on('pageerror', e => errors.push(e.message)); await expect(page.getByLabel('主题风格')).toHaveAttribute('data-value', 'arknights'); await expect(page.locator('html')).toHaveAttribute('data-reduced-motion', 'true'); await expect(page.locator('.wg-startup')).toHaveCount(0); await capture('restart-project')
    expect(await fs.readFile(manuscript, 'utf8')).toBe(text); expect(await fs.readFile(html, 'utf8')).toBe('<h1>项目资料首页</h1><p>这是安全的本地资料预览。</p><script>window.untrusted=true</script>')
    expect(errors).toEqual([]); await fs.writeFile(path.join(output, 'projects.json'), JSON.stringify({ passed: true, screenshots: captures, fullProcessRestart: true, themeAndMotionPersisted: true, safeHtmlPreview: true, excelPreview: true, nestedFolder: true, projectMenus: true, agentConfigurationViews: 4, sourceUnchanged: true, errors }, null, 2))
  } finally { await app.close(); if (path.dirname(temporary) === os.tmpdir() && path.basename(temporary).startsWith('dockitty-arknights-project-')) await fs.rm(temporary, { recursive: true, force: true }) }
})

test('arknights startup uses the saved AK-UI theme and reaches the interactive workspace', async () => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'dockitty-arknights-startup-')), { app, page } = await launch(temporary)
  try {
    await expect(page.locator('.wg-startup')).toHaveCount(0); await selectTheme(page)
    await page.emulateMedia({ reducedMotion: 'no-preference' }); await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'arknights'); await expect(page.locator('.wg-startup')).toBeVisible()
    await expect(page.locator('.wg-mascot-art img').first()).toBeVisible()
    await fs.mkdir(output, { recursive: true }); await captureGraph(app, path.join(output, 'startup.png'))
    await expect(page.locator('.wg-startup')).toHaveCount(0); await expect(page.locator('.wg-app-reveal')).toHaveAttribute('data-entered', 'true'); await page.getByRole('button', { name: '新建文档', exact: true }).click(); await expect(page.getByRole('dialog')).toBeVisible(); await page.keyboard.press('Escape')
    await fs.writeFile(path.join(output, 'startup.json'), JSON.stringify({ passed: true, savedTheme: true, connectedMascotAsset: true, originalCatArt: true, animatedEntranceObserved: true, interactiveAfterEntrance: true }, null, 2))
  } finally { await app.close(); if (path.dirname(temporary) === os.tmpdir() && path.basename(temporary).startsWith('dockitty-arknights-startup-')) await fs.rm(temporary, { recursive: true, force: true }) }
})
