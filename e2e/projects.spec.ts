import { test, expect, _electron as electron } from '@playwright/test'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { ProjectLibrary } from '../packages/shared/src/projects.js'
import { createRequire } from 'node:module'
import { dragWire, editWire } from './graphHelpers.js'

test('project UI: batch/folder imports, hierarchy, cross-folder links, static HTML, refresh and graph editing', async () => {
  test.setTimeout(120000)
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'dockitty-project-ui-')), source = path.join(temporary, 'Agent项目')
  await fs.mkdir(path.join(source, 'iteration-01', '深层'), { recursive: true }); await fs.mkdir(path.join(source, '资料')); await fs.mkdir(path.join(source, 'node_modules'))
  await fs.writeFile(path.join(source, 'iteration-01', 'main.py'), 'print("第一轮")')
  await fs.writeFile(path.join(source, 'iteration-01', '深层', 'core.cpp'), 'int main() {return 0;}')
  await fs.writeFile(path.join(source, '资料', '说明.md'), '# 参考算法说明')
  await fs.writeFile(path.join(source, 'node_modules', '包.json'), '{"imported":true}')
  await fs.symlink(source, path.join(source, '循环链接'), process.platform === 'win32' ? 'junction' : 'dir')
  await fs.writeFile(path.join(source, '页面.html'), '<html><body onload="window.bad=true"><h1>安全页面效果</h1><script>window.bad=true</script><img src="https://example.com/should-not-load.png"></body></html>')
  const env = { ...process.env, WORDGIT_LIBRARY_HOME: temporary }; delete env.ELECTRON_RUN_AS_NODE
  const app = await electron.launch({ executablePath: process.env.WORDGIT_ELECTRON ?? path.resolve('node_modules/.cache/electron-runtime/dist/electron.exe'), args: [process.env.WORDGIT_APP ?? path.resolve('apps/desktop'), '--user-data-dir=' + path.join(temporary, 'profile')], env })
  try {
    const page = await app.firstWindow(), errors: string[] = []; page.on('pageerror', e => errors.push(e.message))
    await page.emulateMedia({ reducedMotion: 'reduce' }); await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1600, 1000))
    await page.getByRole('button', { name: '总览工作台', exact: true }).waitFor()
    await page.getByLabel('管理模式').click(); await page.getByRole('option', { name: /项目管理/ }).click()
    await app.evaluate(({ dialog }, source) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [source] }) }, source)
    await page.getByRole('button', { name: '导入文件夹', exact: true }).click()
    await page.getByLabel('新文档库名称').fill('Agent 示例项目'); await page.getByRole('button', { name: '开始导入', exact: true }).click()
    await expect(page.getByRole('listitem', { name: '资料 iteration-01', exact: true })).toBeVisible()
    const read = () => page.evaluate(async () => (await window.wordgit.projects!.request({ action: 'list' }) as ProjectLibrary[])[0])
    let p = await read(); expect(p.nodes.some(n => n.name === '包.json')).toBe(true)
    await page.getByRole('listitem', { name: '资料 循环链接', exact: true }).click()
    await expect(page.locator('.wg-project-preview')).toContainText('只记录目标路径')
    await page.getByRole('listitem', { name: '资料 页面.html', exact: true }).click()
    const frame = page.frameLocator('iframe[title="HTML 页面预览 页面.html"]')
    await expect(frame.getByRole('heading', { name: '安全页面效果' })).toBeVisible()
    expect(await frame.locator('body').evaluate(() => (window as Window & { bad?: boolean }).bad)).toBeUndefined()
    await expect(frame.locator('script')).toHaveCount(0)
    await expect(frame.locator('img')).not.toHaveAttribute('src', /https:/)
    await page.getByRole('listitem', { name: '资料 iteration-01', exact: true }).dblclick()
    await expect(page.getByRole('listitem', { name: '资料 main.py', exact: true })).toBeVisible()
    await page.getByRole('listitem', { name: '资料 main.py', exact: true }).click()
    p = await read(); const reference = p.nodes.find(n => n.name === '说明.md')!
    await page.evaluate(({ projectId, from, to }) => window.wordgit.projects!.request({ action: 'setRelation', projectId, relation: { from, to, label: '参考算法', note: '' } }), { projectId: p.id, from: p.nodes.find(n => n.name === 'main.py')!.id, to: reference.id })
    await expect(page.locator('.wg-project-relation')).toContainText('参考算法')
    await page.getByLabel('筛选项目文件类型').click(); await page.getByRole('group', { name: '项目文件类型' }).getByLabel('脚本与代码', { exact: true }).check(); await page.keyboard.press('Escape')
    await page.locator('.wg-project-relation > button').first().click()
    await expect(page.locator('.wg-project-inspector h2')).toHaveText('说明.md')
    await expect(page.getByRole('listitem', { name: '资料 说明.md', exact: true })).toBeVisible()
    await page.getByRole('button', { name: '文件关系图', exact: true }).click()
    const viewport = (await page.locator('.wg-project-graph .wg-graph-canvas').boundingBox())!
    await page.mouse.move(viewport.x + 100, viewport.y + 310); await page.mouse.down(); await page.mouse.move(viewport.x + viewport.width - 10, viewport.y + 400, { steps: 5 }); await page.mouse.up()
    await page.locator('.wg-project-relation > button').first().click(); await expect(page.getByRole('button', { name: '项目节点 main.py', exact: true })).toBeInViewport()
    await page.getByRole('button', { name: '返回上一级', exact: true }).click()
    await page.getByRole('button', { name: '文件关系图', exact: true }).click()
    await dragWire(page, page.getByRole('button', { name: '项目节点 iteration-01', exact: true }), page.getByRole('button', { name: '项目节点 资料', exact: true }))
    await expect(page.locator('.wg-project-edges .wg-edge-line')).toHaveCount(1)
    await editWire(page, page.locator('.wg-project-edges .wg-edge-line'))
    await page.getByLabel('关系标签').fill('使用资料'); await page.getByRole('dialog').getByRole('button', { name: '保存', exact: true }).click()
    await page.getByRole('button', { name: '关系 使用资料', exact: true }).locator('text').dblclick()
    await page.getByLabel('关系标签').fill('参考材料'); await page.getByRole('dialog').getByRole('button', { name: '保存', exact: true }).click()
    await expect(page.getByRole('button', { name: '关系 参考材料', exact: true })).toBeVisible()
    await page.getByRole('button', { name: '适应项目关系图', exact: true }).click()
    const beforeDrag = (await read()).nodes.find(n => n.name === 'iteration-01')!.position.x
    const card = page.getByRole('button', { name: '项目节点 iteration-01', exact: true }), box = (await card.boundingBox())!
    await page.mouse.move(box.x + 80, box.y + 55); await page.mouse.down(); await page.mouse.move(box.x + 130, box.y + 80, { steps: 8 }); await page.mouse.up()
    const dropped = (await card.boundingBox())!; await page.waitForTimeout(600); expect(Math.abs((await card.boundingBox())!.x - dropped.x)).toBeLessThan(1)
    await expect.poll(async () => (await read()).nodes.find(n => n.name === 'iteration-01')!.position.x).toBeGreaterThan(beforeDrag)
    await page.getByLabel('筛选项目文件类型').click(); await page.getByRole('group', { name: '项目文件类型' }).getByLabel('网页', { exact: true }).check(); await page.keyboard.press('Escape')
    await expect(page.getByRole('button', { name: '项目节点 iteration-01', exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: '项目节点 页面.html', exact: true })).toBeVisible()
    await page.getByLabel('筛选项目文件类型').click(); await page.getByRole('button', { name: '显示全部', exact: true }).click(); await page.keyboard.press('Escape')
    await fs.writeFile(path.join(source, '资料', '说明.md'), '# 更新后的参考资料')
    const old = (await read()).nodes.find(n => n.name === '说明.md')!, count = (await read()).nodes.length
    await page.getByRole('button', { name: '刷新', exact: true }).click(); await expect.poll(async () => (await read()).nodes.find(n => n.id === old.id)?.contentHash).not.toBe(old.contentHash)
    expect((await read()).nodes).toHaveLength(count)
    const extra = path.join(temporary, '附加.py'); await fs.writeFile(extra, 'print("批量文件")')
    await app.evaluate(({ dialog }, source) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [source] }) }, extra)
    await page.getByRole('button', { name: '批量导入文件', exact: true }).click(); await page.getByLabel('导入目标文档库').selectOption(p.id); await page.getByRole('button', { name: '开始导入', exact: true }).click()
    await expect.poll(async () => (await read()).nodes.some(n => n.name === '附加.py')).toBe(true)
    const output = path.resolve('docs/project-audit'); await fs.mkdir(output, { recursive: true })
    await page.screenshot({ path: path.join(output, 'project-workflow.png'), scale: 'css', animations: 'disabled' })
    await page.getByLabel('管理模式').click(); await page.getByRole('option', { name: /版本管理/ }).click(); await expect(page.getByRole('button', { name: '总览工作台', exact: true })).toBeVisible()
    expect(errors).toEqual([])
  } finally { await app.close(); if (path.dirname(temporary) === os.tmpdir() && path.basename(temporary).startsWith('dockitty-project-ui-')) await fs.rm(temporary, { recursive: true, force: true }) }
})

test('desktop manages authenticated local MCP, preserves its address after restart, and stops it on exit', async () => {
  test.setTimeout(60000)
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'dockitty-local-mcp-'))
  const runtime = process.env.WORDGIT_ELECTRON ?? path.resolve('node_modules/.cache/electron-runtime/dist/electron.exe'), env = { ...process.env, WORDGIT_LIBRARY_HOME: temporary }; delete env.ELECTRON_RUN_AS_NODE
  const launch = () => electron.launch({ executablePath: runtime, args: [process.env.WORDGIT_APP ?? path.resolve('apps/desktop'), '--user-data-dir=' + path.join(temporary, 'profile')], env })
  let app = await launch(), client: any
  try {
    let page = await app.firstWindow(); await page.getByRole('button', { name: '总览工作台', exact: true }).waitFor()
    await page.getByLabel('管理模式').click(); await page.getByRole('option', { name: /项目管理/ }).click()
    await page.getByRole('button', { name: '接入 Agent', exact: true }).click(); await page.getByRole('button', { name: 'DSH', exact: true }).click()
    await page.getByRole('button', { name: '开启本机连接', exact: true }).click(); await page.getByRole('button', { name: '关闭本机连接', exact: true }).waitFor()
    const endpoint = await page.evaluate(async () => (await window.wordgit.projects!.request({ action: 'mcpConfig' }) as any).local)
    expect((await fetch(endpoint.url, { method: 'POST' })).status).toBe(401)
    const require = createRequire(path.resolve('packages/mcp/package.json')), { Client, StreamableHTTPClientTransport } = require('@modelcontextprotocol/client')
    client = new Client({ name: 'desktop-http-acceptance', version: '1.0.0' })
    await client.connect(new StreamableHTTPClientTransport(new URL(endpoint.url), { requestInit: { headers: { Authorization: 'Bearer ' + endpoint.token } } }))
    expect((await client.listTools()).tools.length).toBeGreaterThanOrEqual(12)
    const response = await client.callTool({ name: 'dockitty_create_library', arguments: { name: '本机 MCP 实际写入' } }); expect(response.isError).not.toBe(true)
    await page.getByRole('dialog').getByRole('button', { name: '关闭', exact: true }).click(); await expect(page.getByRole('listitem', { name: '文档库 本机 MCP 实际写入', exact: true })).toBeVisible()
    await client.close(); client = undefined; await app.close()
    await expect.poll(async () => fetch(endpoint.url).then(() => false, () => true)).toBe(true)
    app = await launch(); page = await app.firstWindow(); await page.getByRole('listitem', { name: '文档库 本机 MCP 实际写入', exact: true }).waitFor()
    const restarted = await page.evaluate(async () => (await window.wordgit.projects!.request({ action: 'mcpConfig' }) as any).local)
    expect(restarted.running).toBe(true); expect(restarted.url).toBe(endpoint.url); expect(restarted.token).toBe(endpoint.token)
    await page.getByRole('button', { name: '接入 Agent', exact: true }).click(); await page.getByRole('button', { name: 'DSH', exact: true }).click(); await page.getByRole('button', { name: '关闭本机连接', exact: true }).click()
    await expect(page.getByRole('button', { name: '开启本机连接', exact: true })).toBeVisible()
    await expect.poll(async () => fetch(endpoint.url).then(() => false, () => true)).toBe(true)
  } finally {
    if (client) await client.close(); await app.close()
    if (path.dirname(temporary) === os.tmpdir() && path.basename(temporary).startsWith('dockitty-local-mcp-')) await fs.rm(temporary, { recursive: true, force: true })
  }
})

test('HTML refresh reloads local styles and whole-folder history uses its own captured resources', async () => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'dockitty-html-history-')), source = path.join(temporary, '网页资料')
  await fs.mkdir(source); await fs.writeFile(path.join(source, 'index.html'), '<link rel="stylesheet" href="style.css"><h1>网页资料</h1>'); await fs.writeFile(path.join(source, 'style.css'), 'h1{color:rgb(145,25,35)}')
  const env = { ...process.env, WORDGIT_LIBRARY_HOME: temporary }; delete env.ELECTRON_RUN_AS_NODE
  const app = await electron.launch({ executablePath: process.env.WORDGIT_ELECTRON ?? path.resolve('node_modules/.cache/electron-runtime/dist/electron.exe'), args: [process.env.WORDGIT_APP ?? path.resolve('apps/desktop'), '--user-data-dir=' + path.join(temporary, 'profile')], env })
  try {
    const page = await app.firstWindow(); await page.getByRole('button', { name: '总览工作台', exact: true }).waitFor()
    await page.getByLabel('管理模式').click(); await page.getByRole('option', { name: /项目管理/ }).click()
    await app.evaluate(({ dialog }, source) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [source] }) }, source)
    await page.getByRole('button', { name: '导入文件夹', exact: true }).click(); await page.getByLabel('文件夹导入方式').selectOption('no'); await page.getByRole('button', { name: '开始导入', exact: true }).click()
    const openHtml = async (name: string) => { await page.getByRole('listitem', { name: '资料 ' + name, exact: true }).dblclick(); await page.getByRole('listitem', { name: '资料 index.html', exact: true }).click() }
    await openHtml('网页资料'); const heading = () => page.frameLocator('iframe').getByRole('heading', { name: '网页资料', exact: true })
    await expect(heading()).toHaveCSS('color', 'rgb(145, 25, 35)')
    await fs.writeFile(path.join(source, 'style.css'), 'h1{color:rgb(30,100,50)}'); await page.getByRole('button', { name: '刷新', exact: true }).click(); await expect(heading()).toHaveCSS('color', 'rgb(30, 100, 50)')
    await heading().evaluate(element => element.setAttribute('data-preview-stable', 'yes')); await page.getByRole('button', { name: '刷新', exact: true }).click(); await expect(heading()).toHaveAttribute('data-preview-stable', 'yes')
    await page.getByRole('button', { name: '返回上一级', exact: true }).click(); await page.getByRole('listitem', { name: '资料 网页资料', exact: true }).click()
    await fs.writeFile(path.join(source, 'style.css'), 'h1{color:rgb(110,50,60)}'); await page.getByRole('button', { name: '记录下一轮', exact: true }).click(); await page.getByLabel('资料名称').fill('第二轮网页'); await page.getByRole('dialog').getByRole('button', { name: '保存', exact: true }).click()
    await openHtml('网页资料'); await expect(heading()).toHaveCSS('color', 'rgb(30, 100, 50)')
    await expect(page.getByRole('button', { name: '批量导入文件', exact: true })).toBeDisabled()
    const disabled = await page.getByRole('button', { name: '导入文件夹', exact: true }).evaluate(element => ({ ink: getComputedStyle(element).color, muted: getComputedStyle(document.documentElement).getPropertyValue('--wg-muted').trim() }))
    const disabledColor = await page.evaluate(muted => { const node = document.createElement('span'); node.style.color = muted; document.body.append(node); const color = getComputedStyle(node).color; node.remove(); return color }, disabled.muted)
    await expect(page.getByRole('button', { name: '导入文件夹', exact: true })).toHaveCSS('color', disabledColor)
    await page.getByRole('button', { name: '返回上一级', exact: true }).click(); await openHtml('第二轮网页'); await expect(heading()).toHaveCSS('color', 'rgb(110, 50, 60)')
  } finally { await app.close(); if (path.dirname(temporary) === os.tmpdir() && path.basename(temporary).startsWith('dockitty-html-history-')) await fs.rm(temporary, { recursive: true, force: true }) }
})

test('actual bundled MCP runtime shares data with desktop, startup refreshes, and project surfaces cover all themes', async () => {
  test.setTimeout(180000)
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'dockitty-project-bridge-')), source = path.join(temporary, '项目资料')
  await fs.mkdir(source); await fs.writeFile(path.join(source, '任务.md'), '# 原内容'); await fs.writeFile(path.join(source, 'main.py'), 'print(1)')
  const runtime = process.env.WORDGIT_ELECTRON ?? path.resolve('node_modules/.cache/electron-runtime/dist/electron.exe'), env = { ...process.env, WORDGIT_LIBRARY_HOME: temporary }; delete env.ELECTRON_RUN_AS_NODE
  const app = await electron.launch({ executablePath: runtime, args: [process.env.WORDGIT_APP ?? path.resolve('apps/desktop'), '--user-data-dir=' + path.join(temporary, 'profile')], env })
  const require = createRequire(path.resolve('packages/mcp/package.json')), { Client } = require('@modelcontextprotocol/client'), { StdioClientTransport } = require('@modelcontextprotocol/client/stdio')
  const client = new Client({ name: 'desktop-bridge', version: '1.0.0' })
  try {
    const page = await app.firstWindow(); await page.emulateMedia({ reducedMotion: 'reduce' }); await page.getByRole('button', { name: '总览工作台', exact: true }).waitFor()
    const root = (await page.evaluate(() => window.wordgit.repo.bootstrap())).repoRoot
    await client.connect(new StdioClientTransport({ command: runtime, args: [path.resolve('apps/desktop/out/mcp/server.cjs'), '--repo', root], env: { ELECTRON_RUN_AS_NODE: '1' }, stderr: 'pipe' }))
    const call = async (name: string, args: Record<string, unknown>) => { const result = await client.callTool({ name, arguments: args }); if (result.isError) throw new Error(JSON.stringify(result.content)); return result.structuredContent.result }
    const projectId = (await call('dockitty_create_library', { name: 'Agent 联动示例' })).id
    await call('dockitty_import_items', { projectId, paths: [source], unpackFolder: true })
    await page.getByLabel('管理模式').click(); await page.getByRole('option', { name: /项目管理/ }).click()
    await expect(page.getByRole('listitem', { name: '文档库 Agent 联动示例', exact: true })).toBeVisible()
    await page.getByRole('listitem', { name: '文档库 Agent 联动示例', exact: true }).click()
    await page.getByRole('listitem', { name: '资料 任务.md', exact: true }).click()
    await expect(page.locator('.wg-project-preview')).toContainText('# 原内容')
    await fs.writeFile(path.join(source, '任务.md'), '# MCP 写入后同步')
    const nodes = (await call('dockitty_list_items', { projectId })).nodes, id = nodes.find((n: { name: string }) => n.name === '任务.md').id
    await call('dockitty_update_item', { projectId, nodeId: id, note: '由 Agent 记录' })
    await call('dockitty_set_relation', { projectId, relation: { from: id, to: nodes.find((n: { name: string }) => n.name === 'main.py').id, label: '参考资料' } })
    await expect(page.locator('.wg-project-preview')).toContainText('# MCP 写入后同步')
    await fs.writeFile(path.join(source, '任务.md'), '# 重新打开自动同步')
    await page.reload(); await expect(page.getByRole('listitem', { name: '文档库 Agent 联动示例', exact: true })).toBeVisible()
    await page.getByRole('listitem', { name: '文档库 Agent 联动示例', exact: true }).click(); await page.getByRole('listitem', { name: '资料 任务.md', exact: true }).click()
    await expect(page.locator('.wg-project-preview')).toContainText('# 重新打开自动同步')
    const output = path.resolve('docs/project-audit'); await fs.mkdir(output, { recursive: true })
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1440, 950))
    for (const [theme, label] of [['blockframe', 'BlockFrame'], ['raw', '粉绿方块'], ['retro', '经典视窗'], ['capsule', '胶囊文具'], ['light', '浅色办公'], ['paper', '纸张书房'], ['dark', '石墨暗色']]) {
      await page.getByLabel('主题风格').click(); await page.getByRole('option', { name: new RegExp(label) }).click()
      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
      expect(await page.evaluate(() => Array.from(document.querySelectorAll('body *')).filter(e => e.getClientRects().length && Array.from(e.childNodes).some(n => n.nodeType === 3 && n.textContent?.trim())).filter(e => { const rgb = getComputedStyle(e).color.match(/[\d.]+/g)?.map(Number); return rgb && rgb[2] > rgb[0] + 25 && rgb[2] > rgb[1] + 15 }).map(e => e.textContent?.slice(0, 35)))).toEqual([])
      await expect(page.getByRole('listitem', { name: '资料 任务.md', exact: true })).toBeVisible()
      await page.screenshot({ path: path.join(output, theme + '-browse.png'), scale: 'css', animations: 'disabled' })
      await page.getByRole('button', { name: '文件关系图', exact: true }).click()
      await page.screenshot({ path: path.join(output, theme + '-graph.png'), scale: 'css', animations: 'disabled' })
      await page.getByRole('button', { name: '项目节点 任务.md', exact: true }).click({ button: 'right' })
      await expect(page.getByRole('menu', { name: '项目资料操作' })).toBeVisible(); await page.screenshot({ path: path.join(output, theme + '-menu.png'), scale: 'css', animations: 'disabled' })
      await page.getByRole('menuitem', { name: '编辑名称与备注', exact: true }).click()
      await expect(page.getByRole('dialog').getByRole('button', { name: '保存', exact: true })).toBeInViewport()
      const field = await page.getByLabel('资料备注').boundingBox(); expect(field!.width).toBeGreaterThan(350)
      await page.screenshot({ path: path.join(output, theme + '-dialog.png'), scale: 'css', animations: 'disabled' }); await page.getByRole('button', { name: '取消', exact: true }).click()
      await page.getByRole('button', { name: '接入 Agent', exact: true }).click()
      await expect(page.getByRole('dialog')).toContainText('mcp_servers.dockitty'); await page.screenshot({ path: path.join(output, theme + '-mcp.png'), scale: 'css', animations: 'disabled' }); await page.getByRole('dialog').getByRole('button', { name: '关闭', exact: true }).click()
      await page.getByRole('button', { name: '使用帮助', exact: true }).click(); await page.screenshot({ path: path.join(output, theme + '-help.png'), scale: 'css', animations: 'disabled' }); await page.getByRole('button', { name: '知道了', exact: true }).click()
      await page.getByLabel('筛选项目文件类型').click(); expect((await page.getByRole('group', { name: '项目文件类型' }).getByLabel('表格与数据').boundingBox())!.width).toBeLessThan(25); expect((await page.getByRole('group', { name: '项目文件类型' }).locator('label').first().boundingBox())!.height).toBeLessThan(32); await page.screenshot({ path: path.join(output, theme + '-filter.png'), scale: 'css', animations: 'disabled' }); await page.getByRole('button', { name: '刷新', exact: true }).click(); await expect(page.getByRole('group', { name: '项目文件类型' })).toHaveCount(0)
      await editWire(page, page.locator('.wg-project-edges .wg-edge-line')); await page.screenshot({ path: path.join(output, theme + '-relation.png'), scale: 'css', animations: 'disabled' }); await page.getByRole('button', { name: '取消', exact: true }).click()
      await app.evaluate(({ dialog }, source) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [source] }) }, source)
      await page.getByRole('button', { name: '导入文件夹', exact: true }).click(); await page.screenshot({ path: path.join(output, theme + '-import.png'), scale: 'css', animations: 'disabled' }); await page.getByRole('button', { name: '取消', exact: true }).click()
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(900, 650))
      await page.getByLabel('管理模式').click(); await expect(page.getByRole('option', { name: /版本管理/ })).toBeInViewport(); await page.keyboard.press('Escape')
      await page.screenshot({ path: path.join(output, theme + '-compact.png'), scale: 'css', animations: 'disabled' })
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1440, 950)); await page.getByRole('button', { name: '文件浏览', exact: true }).click()
    }
  } finally { await client.close(); await app.close(); if (path.dirname(temporary) === os.tmpdir() && path.basename(temporary).startsWith('dockitty-project-bridge-')) await fs.rm(temporary, { recursive: true, force: true }) }
})
