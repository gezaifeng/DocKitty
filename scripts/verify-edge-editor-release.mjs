import { _electron as electron, expect } from '@playwright/test'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
const root = process.cwd(), version = JSON.parse(await fs.readFile('apps/desktop/package.json', 'utf8')).version, temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'dockitty-installed-project-'))
const desktopRequire = createRequire(path.resolve('apps/desktop/package.json')), builderRequire = createRequire(desktopRequire.resolve('electron-builder/package.json')), archiveRequire = createRequire(builderRequire.resolve('app-builder-lib/package.json'))
const installed = await fs.mkdtemp(path.resolve(`dist/installer-payload-${version}-`))
execFileSync(archiveRequire('7zip-bin').path7za, ['x', path.resolve(`dist/releases/DocKitty-Setup-${version}-x64.exe`), '-y', '-o' + installed], { windowsHide: true, stdio: 'ignore' })
const files = ['main/index.js', 'preload/index.cjs', 'renderer/index.html', 'mcp/server.cjs', ...(await fs.readdir('apps/desktop/out/renderer/assets')).map(name => 'renderer/assets/' + name)]
for (const file of files) expect((await fs.readFile(path.join(installed, 'resources/app/out', file))).equals(await fs.readFile(path.join(root, 'apps/desktop/out', file)))).toBe(true)
expect((await fs.readFile(path.join(installed, 'MCP/server.cjs'))).equals(await fs.readFile('apps/desktop/out/mcp/server.cjs'))).toBe(true)
const profile = path.join(temporary, 'profile'), env = { ...process.env, PATH: path.join(process.env.SystemRoot ?? 'C:/Windows', 'System32') }
for (const key of ['ELECTRON_RUN_AS_NODE', 'WORDGIT_LIBRARY_HOME', 'WORDGIT_APP', 'ELECTRON_RENDERER_URL']) delete env[key]
const runtime = path.join(installed, '稿喵.exe'), app = await electron.launch({ executablePath: runtime, args: ['--user-data-dir=' + profile], env })
const require = createRequire(path.resolve('packages/mcp/package.json')), { Client } = require('@modelcontextprotocol/client'), { StdioClientTransport } = require('@modelcontextprotocol/client/stdio')
const client = new Client({ name: 'installed-release-acceptance', version: '1.0.0' })
try {
  const page = await app.firstWindow(), errors = []; page.on('pageerror', error => errors.push(error.message)); await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.getByRole('button', { name: '总览工作台', exact: true }).waitFor()
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.setBackgroundThrottling(false))
  const info = await page.evaluate(() => window.wordgit.repo.bootstrap())
  expect(path.resolve(info.repoRoot)).toBe(path.resolve(profile, '稿喵文档库.wg'))
  const source = path.join(temporary, '示例项目'); await fs.mkdir(path.join(source, '迭代一'), { recursive: true }); await fs.mkdir(path.join(source, '资料'))
  const manuscript = path.join(source, '迭代一', '正文.md'); await fs.writeFile(manuscript, '# 第一轮'); await fs.writeFile(path.join(source, '资料', '参考.md'), '# 参考资料')
  await fs.writeFile(path.join(source, '页面.html'), '<h1>安装版安全页面</h1><script>window.bad=true</script>')
  await page.getByLabel('管理模式').click(); await page.getByRole('option', { name: /项目管理/ }).click()
  await app.evaluate(({ dialog }, source) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [source] }) }, source)
  await page.getByRole('button', { name: '导入文件夹', exact: true }).click(); await page.getByLabel('新文档库名称').fill('安装版项目验收'); await page.getByRole('button', { name: '开始导入', exact: true }).click()
  await expect(page.getByRole('listitem', { name: '资料 迭代一', exact: true })).toBeVisible()
  const project = (await page.evaluate(() => window.wordgit.projects.request({ action: 'list' })))[0]
  await client.connect(new StdioClientTransport({ command: runtime, args: [path.join(installed, 'MCP/server.cjs'), '--repo', info.repoRoot], env: { ...env, ELECTRON_RUN_AS_NODE: '1' }, stderr: 'pipe' }))
  const tools = (await client.listTools()).tools; expect(tools.length).toBe(15)
  expect(tools.map(tool => tool.name)).toEqual(expect.arrayContaining(['dockitty_set_category', 'dockitty_list_categories', 'dockitty_remove_category']))
  const categoryResult = await client.callTool({ name: 'dockitty_set_category', arguments: { projectId: project.id, category: { name: '送审资料' } } }); expect(categoryResult.isError).not.toBe(true)
  const categoryId = categoryResult.structuredContent.result.id, nodeId = project.nodes.find(n => n.name === '资料').id
  const assignResult = await client.callTool({ name: 'dockitty_update_item', arguments: { projectId: project.id, nodeId, categoryId } }); expect(assignResult.isError).not.toBe(true)
  await fs.writeFile(manuscript, '# 第二轮')
  const result = await client.callTool({ name: 'dockitty_record_iteration', arguments: { projectId: project.id, nodeId: project.nodes.find(n => n.name === '迭代一').id, title: '迭代二', requestId: 'installed-second-round' } }); expect(result.isError).not.toBe(true)
  await expect(page.getByRole('listitem', { name: '资料 迭代二', exact: true })).toBeVisible()
  await page.getByRole('listitem', { name: '资料 迭代一', exact: true }).dblclick(); await page.getByRole('listitem', { name: '资料 正文.md', exact: true }).click(); await expect(page.locator('.wg-project-preview')).toContainText('# 第一轮')
  await page.getByRole('button', { name: '返回上一级', exact: true }).click(); await page.getByRole('listitem', { name: '资料 迭代二', exact: true }).dblclick(); await page.getByRole('listitem', { name: '资料 正文.md', exact: true }).click(); await expect(page.locator('.wg-project-preview')).toContainText('# 第二轮')
  await page.getByRole('button', { name: '返回上一级', exact: true }).click(); await page.getByRole('listitem', { name: '资料 页面.html', exact: true }).click(); await expect(page.frameLocator('iframe').getByRole('heading', { name: '安装版安全页面' })).toBeVisible(); await expect(page.frameLocator('iframe').locator('script')).toHaveCount(0)
  await page.getByRole('button', { name: '文件关系图', exact: true }).click(); await expect(page.getByRole('button', { name: '关系 下一轮迭代', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '项目节点 资料', exact: true }).locator('.wg-category-tag')).toHaveText('送审资料')
  await expect(page.locator('.wg-project-edges .wg-edge-marker')).toHaveAttribute('marker-mid', /edge-/)
  const savedRelation = (await page.evaluate(projectId => window.wordgit.projects.request({ action: 'get', projectId }), project.id)).relations[0]
  const style = { arrow: 'chevron', arrowSize: 18, line: 'double', width: 3 }
  const formatting = await client.callTool({ name: 'dockitty_set_relation', arguments: { projectId: project.id, relation: { ...savedRelation, style } } }); expect(formatting.isError).not.toBe(true)
  const line = page.locator('.wg-project-edges .wg-edge-line'); await expect(line).toHaveAttribute('data-line', 'double')
  const point = await line.evaluate(element => {
    for (const fraction of [.5, .4, .6, .3, .7, .2, .8]) {
      const p = element.getPointAtLength(element.getTotalLength() * fraction), screen = new DOMPoint(p.x, p.y).matrixTransform(element.getScreenCTM())
      if (document.elementFromPoint(screen.x, screen.y)?.closest('g') === element.closest('g')) return { x: screen.x, y: screen.y }
    }
    throw new Error('No visible edge segment')
  })
  await page.mouse.click(point.x, point.y, { button: 'right' }); const styleMenu = page.getByRole('dialog', { name: '编辑连线', exact: true })
  await expect(styleMenu.getByLabel('箭头大小')).toHaveValue('18'); await styleMenu.getByLabel('线条格式').selectOption('dashed'); await styleMenu.getByLabel('关系备注').fill('安装包验证备注'); await expect(line).toHaveAttribute('data-line', 'dashed'); expect((await page.evaluate(projectId => window.wordgit.projects.request({ action: 'get', projectId }), project.id)).relations[0].style.line).toBe('double'); await styleMenu.getByRole('button', { name: '保存', exact: true }).click()
  await expect(styleMenu).toHaveCount(0); await expect(line).toHaveAttribute('data-line', 'dashed'); expect((await page.evaluate(projectId => window.wordgit.projects.request({ action: 'get', projectId }), project.id)).relations[0].note).toBe('安装包验证备注'); await page.keyboard.press('Control+z'); await expect(line).toHaveAttribute('data-line', 'double'); await page.keyboard.press('Control+Shift+z'); await expect(line).toHaveAttribute('data-line', 'dashed')
  await page.getByText('文件', { exact: true }).click(); await page.locator('.wg-projectbar').click({ position: { x: 250, y: 20 } }); await expect(page.locator('details.wg-menu')).not.toHaveAttribute('open', '')
  await page.getByRole('button', { name: '分类看板', exact: true }).click(); await expect(page.getByRole('region', { name: '项目分类 送审资料', exact: true }).getByRole('button', { name: '看板资料 资料', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '文件关系图', exact: true }).click()
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1440, 950))
  await page.waitForFunction(() => innerWidth === 1440 && innerHeight === 950)
  await expect(page.locator('.wg-notice')).toHaveCount(0, { timeout: 4000 })
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  const frame = await app.evaluate(async ({ BrowserWindow }) => (await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64')); await fs.writeFile(path.join(root, 'docs/edge-editor-audit/packaged-runtime.png'), Buffer.from(frame, 'base64'))
  await page.getByRole('button', { name: '接入 Agent', exact: true }).click(); await page.getByRole('button', { name: 'DSH', exact: true }).click(); await page.getByRole('button', { name: '开启本机连接', exact: true }).click(); await page.getByRole('button', { name: '关闭本机连接', exact: true }).waitFor()
  const endpoint = (await page.evaluate(() => window.wordgit.projects.request({ action: 'mcpConfig' }))).local; expect((await fetch(endpoint.url)).status).toBe(401)
  await page.getByRole('button', { name: '关闭本机连接', exact: true }).click(); await page.getByRole('dialog').getByRole('button', { name: '关闭', exact: true }).click()
  const legacy = path.join(temporary, '旧入口.txt'); await fs.writeFile(legacy, '原有功能仍在')
  await page.getByLabel('管理模式').click(); await page.getByRole('option', { name: /版本管理/ }).click(); await page.evaluate(source => window.wordgit.doc.import(source), legacy); await expect(page.locator('.wg-document-card')).toHaveCount(1)
  expect(await fs.readFile(manuscript, 'utf8')).toBe('# 第二轮'); expect(await fs.readFile(legacy, 'utf8')).toBe('原有功能仍在'); expect(errors).toEqual([])
  const proof = { passed: true, version, installerSHA256: createHash('sha256').update(await fs.readFile(`dist/releases/DocKitty-Setup-${version}-x64.exe`)).digest('hex'), packagedApp: installed, installationExecuted: false, existingUserAppLeftRunning: true, installerPayloadExtractedAndVerified: true, packagedEdgeFormatting: true, unifiedEdgeEditor: true, canvasPreviewBeforeSave: true, relationshipNoteSaved: true, packagedUndoRedo: true, outsideMenuDismissal: true, bundleMatchesBuild: true, verifiedBundleFiles: files.length, externalNodeRemovedFromPath: true, userDataOutsideInstall: true, folderImport: true, wholeFolderIteration: true, historicalAndCurrentBytes: true, safeHtml: true, bundledStdioTools: tools.length, installedMcpCategories: true, categoryBoard: true, graphCategoryTags: true, directedCenterConnections: true, localHttp: true, legacyEntry: true, rendererErrors: errors }
  await fs.writeFile('docs/edge-editor-audit/packaged-runtime-verification.json', JSON.stringify(proof, null, 2)); console.log(JSON.stringify(proof, null, 2))
} finally { await client.close(); await app.close(); if (path.dirname(temporary) === os.tmpdir() && path.basename(temporary).startsWith('dockitty-installed-project-')) await fs.rm(temporary, { recursive: true, force: true }) }
