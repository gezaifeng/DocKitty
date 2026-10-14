import { test, expect, _electron as electron } from '@playwright/test'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { createRequire } from 'node:module'
const require = createRequire(path.resolve('apps/desktop/package.json')), ExcelJS = require('exceljs'), { unzipSync, zipSync } = require('fflate')
import type { ProjectLibrary } from '../packages/shared/src/projects.js'
import { editWire, captureGraph } from './graphHelpers.js'

async function launch(prefix: string) {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), prefix)), env = { ...process.env, WORDGIT_LIBRARY_HOME: temporary }; delete env.ELECTRON_RUN_AS_NODE
  const app = await electron.launch({ executablePath: process.env.WORDGIT_ELECTRON ?? path.resolve('node_modules/.cache/electron-runtime/dist/electron.exe'), args: [process.env.WORDGIT_APP ?? path.resolve('apps/desktop'), '--user-data-dir=' + path.join(temporary, 'profile')], env })
  const page = await app.firstWindow(), errors: string[] = []; page.on('pageerror', e => errors.push(e.message))
  await page.emulateMedia({ reducedMotion: 'reduce' }); await app.evaluate(({ BrowserWindow }) => { const win = BrowserWindow.getAllWindows()[0]; win.webContents.setBackgroundThrottling(false); win.setContentSize(1600, 1000) }); await page.getByRole('button', { name: '总览工作台', exact: true }).waitFor()
  return { temporary, app, page, errors, async close() { await app.close(); if (path.dirname(temporary) === os.tmpdir() && path.basename(temporary).startsWith(prefix)) await fs.rm(temporary, { recursive: true, force: true }) } }
}
const output = path.resolve('docs/menu-preview-audit')
const themes = [['blockframe', 'BlockFrame'], ['light', '浅色办公'], ['paper', '纸张书房'], ['dark', '石墨暗色'], ['raw', '粉绿方块'], ['retro', '经典视窗'], ['capsule', '胶囊文具']]

async function dragEditor(page: import('@playwright/test').Page, dx: number, dy: number) {
  const editor = page.getByRole('dialog', { name: '编辑连线', exact: true }), handle = editor.locator(':scope > header')
  await handle.hover({ position: { x: 65, y: 8 } })
  const box = (await handle.boundingBox())!, initial = (await editor.boundingBox())!
  const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }))
  await page.mouse.down()
  await page.mouse.move(box.x + 65 + dx, box.y + 8 + dy, { steps: 12 }); await page.mouse.up()
  await expect(editor).toBeVisible()
  await expect.poll(async () => (await editor.boundingBox())!.x).toBeCloseTo(Math.max(8, Math.min(initial.x + dx, viewport.width - initial.width - 8)), 0)
  await expect.poll(async () => (await editor.boundingBox())!.y).toBeCloseTo(Math.max(8, Math.min(initial.y + dy, viewport.height - initial.height - 8)), 0)
  const moved = (await editor.boundingBox())!
  expect(moved.x).toBeGreaterThanOrEqual(7); expect(moved.y).toBeGreaterThanOrEqual(7)
  expect(moved.x + moved.width).toBeLessThanOrEqual(viewport.width - 7); expect(moved.y + moved.height).toBeLessThanOrEqual(viewport.height - 7)
  return moved
}

test('version edge editor drags without moving cards or writing drafts and stays usable after resize', async () => {
  const run = await launch('dockitty-draggable-version-'), { page, temporary } = run
  try {
    await fs.mkdir(output, { recursive: true })
    const source = path.join(temporary, '稿件.txt'); await fs.writeFile(source, '第一稿')
    const first = (await page.evaluate(source => window.wordgit.doc.import(source), source)).commitId
    const root = (await page.evaluate(() => window.wordgit.repo.bootstrap())).repoRoot
    await fs.writeFile(path.join(root, 'workspace', '稿件.txt'), '第二稿'); const second = (await page.evaluate(() => window.wordgit.commit.create('稿件.txt', '第二稿', '测试'))).commitId!
    for (const [id, x] of [[first, 40], [second, 440]] as const) await page.evaluate(({ id, x }) => window.wordgit.library.mutate({ type: 'version', docName: '稿件.txt', versionId: id, position: { x, y: 100 } }), { id, x })
    await page.getByRole('listitem', { name: '文档 稿件.txt', exact: true }).click(); await page.getByRole('button', { name: '版本关系图', exact: true }).click()
    const line = page.locator(`.wg-edge-line[data-from="${first}"][data-to="${second}"]`), editor = page.getByRole('dialog', { name: '编辑连线', exact: true }), detail = () => page.evaluate(() => window.wordgit.library.detail('稿件.txt'))
    const before = await detail()
    for (const [theme, label] of themes) {
      await page.getByLabel('主题风格').click(); await page.getByRole('option', { name: new RegExp(label) }).click()
      await editWire(page, line, 'right'); const initial = (await editor.boundingBox())!
      await editor.getByLabel('关系标签').fill('拖动不会改稿'); await editor.getByLabel('箭头大小').fill('18')
      const moved = await dragEditor(page, 370, -190); expect(moved.x).toBeGreaterThan(initial.x + 300)
      await expect(editor.getByLabel('关系标签')).toHaveValue('拖动不会改稿'); await expect(line).toHaveAttribute('data-arrow-size', '18')
      expect(await detail()).toEqual(before)
      await captureGraph(run.app, path.join(output, theme + '-version-dragged.png'))
      await dragEditor(page, 3000, 3000); await expect(editor.getByRole('button', { name: '保存', exact: true })).toBeInViewport()
      await dragEditor(page, -3000, -3000)
      await editor.getByRole('button', { name: '取消', exact: true }).click(); await expect(editor).toHaveCount(0); await expect(line).toHaveAttribute('data-arrow-size', '8')
    }
    await editWire(page, line); await dragEditor(page, 400, 180)
    await run.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(900, 600))
    await expect.poll(async () => { const b = (await editor.boundingBox())!; return b.x + b.width <= 893 && b.y + b.height <= 593 }).toBe(true)
    await expect(editor.getByRole('button', { name: '保存', exact: true })).toBeInViewport(); await captureGraph(run.app, path.join(output, 'compact-draggable-editor.png'))
    await editor.getByLabel('关系备注').fill('拖动之后仍能保存'); await editor.getByRole('button', { name: '保存', exact: true }).click(); await expect(editor).toHaveCount(0)
    expect((await detail()).versions.find(v => v.id === second)?.parentNotes?.[first]).toBe('拖动之后仍能保存')
    expect((await detail()).versions.map(v => [v.id, v.position, v.parents])).toEqual(before.versions.map(v => [v.id, v.position, v.parents]))
    expect(await fs.readFile(source, 'utf8')).toBe('第一稿'); expect(run.errors).toEqual([])
    await fs.writeFile(path.join(output, 'version-verification.json'), JSON.stringify({ passed: true, headerDrag: true, keepsDraftAndLivePreview: true, viewportBounds: true, resizeBounds: true, cardsAndConnectionsUnchanged: true, saveAfterDrag: true, cancelAfterDrag: true, themes: 7, sourceUnchanged: true, errors: run.errors }, null, 2))
  } finally { await run.close() }
})

test('project edge menus drag and expanded previews preserve current and historical content across views, formats and themes', async () => {
  const run = await launch('dockitty-draggable-project-'), { page, temporary } = run
  try {
    await fs.mkdir(output, { recursive: true }); await run.app.evaluate(({ shell }) => { shell.openPath = async () => '' })
    const source = path.join(temporary, '资料'); await fs.mkdir(source)
    const manuscript = path.join(source, '正文.md'), html = path.join(source, '页面.html'), css = path.join(source, '页面.css'), word = path.join(source, '论文.docx'), sheet = path.join(source, '数据.xlsx')
    const text = '# 受管正文\n' + Array.from({ length: 100 }, (_, i) => `第 ${i + 1} 段：展开预览内容。`).join('\n')
    await fs.writeFile(manuscript, text); await fs.writeFile(css, 'h1{color:rgb(180,50,40)}')
    await fs.writeFile(html, '<link rel="stylesheet" href="页面.css"><h1>安全页面展开</h1><script>window.bad=true</script><img src="https://example.com/must-not-load.png">')
    await page.evaluate(() => window.wordgit.library.mutate({ type: 'createDocument', name: 'Word预览', format: 'docx' }))
    const root = (await page.evaluate(() => window.wordgit.repo.bootstrap())).repoRoot
    const parts = unzipSync(await fs.readFile(path.join(root, 'workspace', 'Word预览.docx')))
    parts['word/document.xml'] = new TextEncoder().encode(new TextDecoder().decode(parts['word/document.xml']).replace('<w:p/>', '<w:p><w:r><w:t>Word展开预览测试</w:t></w:r></w:p>'))
    await fs.writeFile(word, zipSync(parts)); const book = new ExcelJS.Workbook(); book.addWorksheet('工作表1').getCell('B2').value = 'Excel展开预览测试'; book.addWorksheet('工作表2').getCell('C3').value = 2026; await book.xlsx.writeFile(sheet)
    const originals = await Promise.all([manuscript, html, css, word, sheet].map(file => fs.readFile(file)))
    const projectId = await page.evaluate(async source => { const project = await window.wordgit.projects!.request({ action: 'create', name: '预览测试' }) as ProjectLibrary; await window.wordgit.projects!.request({ action: 'import', projectId: project.id, paths: [source], unpackFolder: true }); return project.id }, source)
    await page.getByLabel('管理模式').click(); await page.getByRole('option', { name: /项目管理/ }).click(); await page.getByRole('listitem', { name: '文档库 预览测试', exact: true }).click()
    const read = () => page.evaluate(projectId => window.wordgit.projects!.request({ action: 'get', projectId }) as Promise<ProjectLibrary>, projectId)
    const project = await read(), from = project.nodes.find(n => n.name === '正文.md')!.id, to = project.nodes.find(n => n.name === '页面.html')!.id
    await page.evaluate(async ({ projectId, ids }) => { for (const [index, nodeId] of ids.entries()) await window.wordgit.projects!.request({ action: 'updateNode', projectId, nodeId, position: { x: 40 + (index % 3) * 310, y: 310 + Math.floor(index / 3) * 190 } }) }, { projectId, ids: project.nodes.filter(n => n.id !== from && n.id !== to).map(n => n.id) })
    await page.evaluate(async ({ projectId, from, to }) => { await window.wordgit.projects!.request({ action: 'updateNode', projectId, nodeId: from, position: { x: 40, y: 100 } }); await window.wordgit.projects!.request({ action: 'updateNode', projectId, nodeId: to, position: { x: 440, y: 100 } }); await window.wordgit.projects!.request({ action: 'setRelation', projectId, relation: { from, to, label: '', note: '' } }) }, { projectId, from, to })
    await page.getByRole('button', { name: '文件关系图', exact: true }).click()
    const line = page.locator('.wg-project-edges .wg-edge-line'), editor = page.getByRole('dialog', { name: '编辑连线', exact: true }), before = await read()
    for (const [theme, label] of themes) {
      await page.getByLabel('主题风格').click(); await page.getByRole('option', { name: new RegExp(label) }).click()
      await editWire(page, line, 'right'); await editor.getByLabel('关系备注').fill('保持编辑内容'); await dragEditor(page, 350, -180)
      expect(await read()).toEqual(before); await expect(editor.getByLabel('关系备注')).toHaveValue('保持编辑内容')
      await captureGraph(run.app, path.join(output, theme + '-project-dragged.png')); await page.keyboard.press('Escape'); await expect(editor).toHaveCount(0)
    }
    for (const [view, role, prefix] of [['文件浏览', 'listitem', '资料'], ['文件关系图', 'button', '项目节点'], ['分类看板', 'button', '看板资料']] as const) {
      await page.getByRole('button', { name: view, exact: true }).click(); await page.getByRole(role, { name: `${prefix} 正文.md`, exact: true }).click()
      await page.getByRole('button', { name: '展开预览', exact: true }).click(); const preview = page.getByRole('dialog', { name: '预览 · 正文.md', exact: true })
      await expect(preview.locator('pre')).toHaveText(text); await page.keyboard.press('Escape'); await expect(preview).toHaveCount(0)
    }
    await page.getByRole('button', { name: '文件浏览', exact: true }).click()
    for (const [theme, label] of themes) {
      await page.getByLabel('主题风格').click(); await page.getByRole('option', { name: new RegExp(label) }).click()
      for (const [name, format] of [['正文.md', 'text'], ['页面.html', 'html'], ['论文.docx', 'word'], ['数据.xlsx', 'excel']]) {
        await page.getByRole('listitem', { name: `资料 ${name}`, exact: true }).click(); await page.getByRole('button', { name: '展开预览', exact: true }).click()
        const preview = page.getByRole('dialog', { name: `预览 · ${name}`, exact: true })
        await expect(preview.getByRole('button', { name: '关闭', exact: true })).toBeInViewport(); expect((await preview.boundingBox())!.width).toBeGreaterThan(800)
        if (format === 'text') { await expect(preview.locator('pre')).toHaveText(text); await preview.locator('pre').evaluate(e => { e.scrollTop = e.scrollHeight }); expect(await preview.locator('pre').evaluate(e => e.scrollTop)).toBeGreaterThan(0) }
        if (format === 'html') { await expect(preview.frameLocator('iframe').getByRole('heading', { name: '安全页面展开' })).toHaveCSS('color', 'rgb(180, 50, 40)'); await expect(preview.frameLocator('iframe').locator('script')).toHaveCount(0); expect(await preview.locator('iframe').getAttribute('sandbox')).toBe('') }
        if (format === 'word') await expect(preview.locator('.wg-docx-preview')).toContainText('Word展开预览测试')
        if (format === 'excel') { await expect(preview.locator('.wg-xlsx-preview')).toContainText('Excel展开预览测试'); await preview.getByRole('tab', { name: '工作表2', exact: true }).click(); await expect(preview.locator('.wg-xlsx-preview')).toContainText('2026') }
        await captureGraph(run.app, path.join(output, theme + '-preview-' + format + '.png')); await preview.getByRole('button', { name: '关闭', exact: true }).click(); await expect(preview).toHaveCount(0)
      }
    }
    await run.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(900, 600))
    await page.getByRole('listitem', { name: '资料 论文.docx', exact: true }).click(); await page.getByRole('button', { name: '展开预览', exact: true }).click()
    const compact = page.getByRole('dialog', { name: '预览 · 论文.docx', exact: true })
    await expect(compact.getByRole('button', { name: '关闭', exact: true })).toBeInViewport(); await expect(compact.locator('.wg-docx-preview')).toContainText('Word展开预览测试')
    const bounds = (await compact.boundingBox())!; expect(bounds.x).toBeGreaterThanOrEqual(0); expect(bounds.y).toBeGreaterThanOrEqual(0); expect(bounds.x + bounds.width).toBeLessThanOrEqual(900); expect(bounds.y + bounds.height).toBeLessThanOrEqual(600)
    await captureGraph(run.app, path.join(output, 'compact-project-preview.png')); await page.keyboard.press('Escape')
    await run.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1600, 1000))
    await fs.writeFile(manuscript, '# 第二轮新内容')
    await page.evaluate(({ projectId, nodeId }) => window.wordgit.projects!.request({ action: 'recordIteration', projectId, nodeId, title: '第二轮', requestId: 'preview-history' }), { projectId, nodeId: from })
    await page.getByRole('listitem', { name: '资料 正文.md', exact: true }).click(); await page.getByRole('button', { name: '展开预览', exact: true }).click(); await expect(page.getByRole('dialog').locator('pre')).toHaveText(text); await page.keyboard.press('Escape')
    await page.getByRole('listitem', { name: '资料 第二轮', exact: true }).click(); await page.getByRole('button', { name: '展开预览', exact: true }).click(); await expect(page.getByRole('dialog').locator('pre')).toHaveText('# 第二轮新内容'); await page.keyboard.press('Escape')
    const remaining = await Promise.all([html, css, word, sheet].map(file => fs.readFile(file))); remaining.forEach((bytes, index) => expect(bytes.equals(originals[index + 1])).toBe(true)); expect(await fs.readFile(manuscript, 'utf8')).toBe('# 第二轮新内容')
    expect(run.errors).toEqual([])
    await fs.writeFile(path.join(output, 'project-verification.json'), JSON.stringify({ passed: true, headerDrag: true, draggingNeverWrites: true, previewFromAllViews: true, formats: ['text', 'safeHtml', 'docx', 'xlsx'], themes: 7, minimumWindowPreview: true, scrollable: true, closeAndEscape: true, safeLocalHtmlAssets: true, historyAndCurrentPreview: true, sourceUnchangedByPreview: true, errors: run.errors }, null, 2))
  } finally { await run.close() }
})
