import { test, expect, _electron as electron } from '@playwright/test'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import type { ProjectLibrary } from '../packages/shared/src/projects.js'
import { dragWire, editWire } from './graphHelpers.js'

test('project categories, center connections, directed labels and MCP synchronize in all themes', async () => {
  test.setTimeout(180000)
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'dockitty-category-ui-')), source = path.join(temporary, '投稿项目')
  await fs.mkdir(path.join(source, '主稿'), { recursive: true }); await fs.mkdir(path.join(source, '演示'))
  const manuscript = path.join(source, '主稿', '正文.md')
  await fs.writeFile(manuscript, '# 文稿内容'); await fs.writeFile(path.join(source, '演示', '提纲.md'), '# 演示内容')
  const env = { ...process.env, WORDGIT_LIBRARY_HOME: temporary }; delete env.ELECTRON_RUN_AS_NODE
  const runtime = process.env.WORDGIT_ELECTRON ?? path.resolve('node_modules/.cache/electron-runtime/dist/electron.exe')
  const app = await electron.launch({ executablePath: runtime, args: [process.env.WORDGIT_APP ?? path.resolve('apps/desktop'), '--user-data-dir=' + path.join(temporary, 'profile')], env })
  const require = createRequire(path.resolve('packages/mcp/package.json')), { Client } = require('@modelcontextprotocol/client'), { StdioClientTransport } = require('@modelcontextprotocol/client/stdio')
  const client = new Client({ name: 'project-category-acceptance', version: '1.0.0' })
  try {
    const page = await app.firstWindow(), errors: string[] = []; page.on('pageerror', e => errors.push(e.message))
    await page.emulateMedia({ reducedMotion: 'reduce' }); await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1600, 1000))
    await page.getByRole('button', { name: '总览工作台', exact: true }).waitFor()
    const root = (await page.evaluate(() => window.wordgit.repo.bootstrap())).repoRoot
    const projectId = await page.evaluate(async source => {
      const project = await window.wordgit.projects!.request({ action: 'create', name: '投稿项目分类验收' }) as ProjectLibrary
      await window.wordgit.projects!.request({ action: 'import', projectId: project.id, paths: [source], unpackFolder: true }); return project.id
    }, source)
    const read = () => page.evaluate(projectId => window.wordgit.projects!.request({ action: 'get', projectId }) as Promise<ProjectLibrary>, projectId)
    await page.getByLabel('管理模式').click(); await page.getByRole('option', { name: /项目管理/ }).click(); await page.getByRole('listitem', { name: '文档库 投稿项目分类验收', exact: true }).click()
    await page.getByRole('button', { name: '文件关系图', exact: true }).click()
    await dragWire(page, page.getByRole('button', { name: '项目节点 主稿', exact: true }), page.getByRole('button', { name: '项目节点 演示', exact: true }))
    await expect(page.locator('.wg-project-edges .wg-edge-line')).toHaveCount(1)
    await editWire(page, page.locator('.wg-project-edges .wg-edge-line'))
    await expect(page.getByLabel('关系类型')).toHaveCount(0)
    await page.getByLabel('关系标签').fill('演示文稿'); await page.getByRole('dialog').getByRole('button', { name: '保存', exact: true }).click()
    const relation = page.getByRole('button', { name: '关系 演示文稿', exact: true })
    await relation.locator('text').dblclick(); await page.getByLabel('关系标签').fill('依赖关系'); await page.getByRole('dialog').getByRole('button', { name: '保存', exact: true }).click()
    const p = await read(), from = p.nodes.find(n => n.name === '主稿')!, to = p.nodes.find(n => n.name === '演示')!
    const geometry = await page.locator('.wg-project-edges .wg-edge-line').evaluate(e => ({ d: e.getAttribute('d'), marker: e.parentElement?.querySelector('.wg-edge-marker')?.getAttribute('marker-mid'), edgeZ: getComputedStyle(e.closest('svg')!).zIndex, nodeZ: getComputedStyle(document.querySelector('.wg-project-graph .wg-graph-node')!).zIndex }))
    const coordinates = geometry.d!.match(/-?\d+(?:\.\d+)?/g)!.map(Number)
    expect(coordinates.slice(0, 2)).toEqual([from.position.x + 112.5, from.position.y + 56]); expect(coordinates.slice(-2)).toEqual([to.position.x + 112.5, to.position.y + 56])
    expect(geometry.marker).toMatch(/^url\(#edge-/); expect(Number(geometry.edgeZ)).toBeLessThan(Number(geometry.nodeZ))
    await page.getByRole('button', { name: '分类看板', exact: true }).click(); await page.getByRole('button', { name: '添加分类', exact: true }).click()
    await page.getByLabel('项目分类名称').fill('投稿材料'); await page.getByRole('dialog').getByRole('button', { name: '保存', exact: true }).click()
    await page.getByRole('button', { name: '看板资料 主稿', exact: true }).dragTo(page.getByRole('region', { name: '项目分类 投稿材料', exact: true }), { targetPosition: { x: 120, y: 220 } })
    await expect.poll(async () => (await read()).nodes.find(n => n.id === from.id)?.categoryId).toBe((await read()).categories![0].id)
    await page.getByRole('button', { name: '文件关系图', exact: true }).click(); await expect(page.getByRole('button', { name: '项目节点 主稿', exact: true }).locator('.wg-category-tag')).toHaveText('投稿材料')
    await page.getByRole('button', { name: '项目节点 主稿', exact: true }).dblclick(); await page.getByRole('button', { name: '分类看板', exact: true }).click()
    await expect(page.getByRole('button', { name: '看板资料 演示', exact: true })).toHaveCount(0)
    await page.getByRole('button', { name: '看板资料 正文.md', exact: true }).click(); await page.getByLabel('资料分类', { exact: true }).selectOption((await read()).categories![0].id)
    await page.getByLabel('重命名项目分类 投稿材料').click(); await page.getByLabel('项目分类名称').fill('送审材料'); await page.getByRole('dialog').getByRole('button', { name: '保存', exact: true }).click()
    await page.getByRole('button', { name: '文件关系图', exact: true }).click(); await expect(page.getByRole('button', { name: '项目节点 正文.md', exact: true }).locator('.wg-category-tag')).toHaveText('送审材料')
    await fs.writeFile(manuscript, '# 刷新内容'); await page.getByRole('button', { name: '刷新', exact: true }).click(); await expect(page.locator('.wg-project-preview')).toContainText('# 刷新内容')
    await expect(page.getByRole('button', { name: '项目节点 正文.md', exact: true }).locator('.wg-category-tag')).toHaveText('送审材料')
    await page.getByRole('button', { name: '返回上一级', exact: true }).click()
    await client.connect(new StdioClientTransport({ command: runtime, args: [path.resolve('apps/desktop/out/mcp/server.cjs'), '--repo', root], env: { ELECTRON_RUN_AS_NODE: '1' }, stderr: 'pipe' }))
    const names = (await client.listTools()).tools.map((t: { name: string }) => t.name); expect(names).toEqual(expect.arrayContaining(['dockitty_set_category', 'dockitty_list_categories', 'dockitty_remove_category']))
    const categoryId = (await read()).categories![0].id
    const mcpResult = await client.callTool({ name: 'dockitty_update_item', arguments: { projectId, nodeId: to.id, categoryId } }); expect(mcpResult.isError).not.toBe(true)
    await expect(page.getByRole('button', { name: '项目节点 演示', exact: true }).locator('.wg-category-tag')).toHaveText('送审材料')
    const output = path.resolve('docs/project-categories-audit'); await fs.mkdir(output, { recursive: true })
    const screenshots: string[] = []
    for (const [theme, label] of [['blockframe', 'BlockFrame 黑框积木'], ['light', '浅色办公'], ['paper', '纸张书房'], ['dark', '石墨暗色'], ['raw', '粉绿方块'], ['retro', '经典视窗'], ['capsule', '胶囊文具']]) {
      await page.getByLabel('主题风格').click(); await page.getByRole('option', { name: new RegExp(label) }).click()
      for (const view of ['graph', 'board', 'dialog', 'browse']) {
        if (view === 'graph') await page.getByRole('button', { name: '文件关系图', exact: true }).click()
        if (view === 'board') await page.getByRole('button', { name: '分类看板', exact: true }).click()
        if (view === 'dialog') { await page.getByLabel('重命名项目分类 送审材料').click(); await expect(page.getByLabel('项目分类名称')).toBeInViewport() }
        if (view === 'browse') { await page.getByRole('dialog').getByRole('button', { name: '取消', exact: true }).click(); await page.getByRole('button', { name: '文件浏览', exact: true }).click() }
        expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false)
        if (view === 'board') await expect(page.locator('.wg-project-board .wg-card-eyebrow > span').first()).toBeVisible()
        const name = `${theme}-${view}.png`; screenshots.push(name); await page.screenshot({ path: path.join(output, name), animations: 'disabled', scale: 'css' })
      }
    }
    await page.getByRole('button', { name: '分类看板', exact: true }).click(); await page.getByLabel('删除项目分类 送审材料').click(); await page.getByRole('dialog').getByRole('button', { name: '保存', exact: true }).click()
    await expect.poll(async () => (await read()).categories).toEqual([])
    await page.getByRole('button', { name: '文件关系图', exact: true }).click(); await expect(page.locator('.wg-project-graph .wg-category-tag')).toHaveCount(0)
    expect((await read()).nodes).toHaveLength(4); expect((await read()).relations).toHaveLength(1); expect(await fs.readFile(manuscript, 'utf8')).toBe('# 刷新内容'); expect(errors).toEqual([])
    await fs.writeFile(path.join(output, 'verification.json'), JSON.stringify({ version: '0.5.1', passed: true, screenshots, renderedThemes: 7, centerEndpoints: true, arrowOutsideCard: true, cardAboveConnection: true, actualDragClassification: true, folderLevelBoard: true, sharedRename: true, refreshPreservesCategory: true, bundledMcpCategorySync: true, deletePreservesNodesAndEdges: true, errors }, null, 2))
  } finally { await client.close(); await app.close(); if (path.dirname(temporary) === os.tmpdir() && path.basename(temporary).startsWith('dockitty-category-ui-')) await fs.rm(temporary, { recursive: true, force: true }) }
})
