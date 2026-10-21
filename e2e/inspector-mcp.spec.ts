import { test, expect, _electron as electron } from '@playwright/test'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { createRequire } from 'node:module'
import { auditPath } from './auditPath'
import { captureGraph } from './graphHelpers'

const require = createRequire(path.resolve('packages/mcp/package.json'))
const { Client } = require('@modelcontextprotocol/client'), { StdioClientTransport } = require('@modelcontextprotocol/client/stdio')

test('bundled version MCP appears in desktop and organized inspectors remain usable across modes, themes and compact sizes', async () => {
  test.setTimeout(180000)
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'dockitty-inspector-'))
  const env = { ...process.env, WORDGIT_LIBRARY_HOME: temporary }; delete env.ELECTRON_RUN_AS_NODE
  const app = await electron.launch({ executablePath: process.env.WORDGIT_ELECTRON ?? path.resolve('node_modules/.cache/electron-runtime/dist/electron.exe'), args: [process.env.WORDGIT_APP ?? path.resolve('apps/desktop'), '--user-data-dir=' + path.join(temporary, 'profile')], env })
  const client = new Client({ name: 'desktop-version-bridge', version: '1.0.0' })
  try {
    const page = await app.firstWindow(); page.setDefaultTimeout(12000); await page.emulateMedia({ reducedMotion: 'reduce' })
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message))
    await expect(page.getByLabel('主题风格')).toBeVisible()
    const root = (await page.evaluate(() => window.wordgit.repo.bootstrap())).repoRoot
    const config = await page.evaluate(() => window.wordgit.projects!.request({ action: 'mcpConfig' })) as { server: { command: string; args: string[]; env: Record<string, string> } }
    await client.connect(new StdioClientTransport({ ...config.server, stderr: 'pipe' }))
    const call = async <T,>(name: string, args: Record<string, unknown> = {}): Promise<T> => { const result = await client.callTool({ name, arguments: args }); if (result.isError) throw new Error(JSON.stringify(result.content)); return (result.structuredContent as { result: T }).result }
    expect(await call('dockitty_get_capabilities')).toMatchObject({ version: '0.5.13', repoRoot: root })
    const source = path.join(temporary, '资料.txt'); await fs.writeFile(source, '原稿内容与来源保护。')
    const first = (await call<{ commitId: string }>('dockitty_import_document', { sourcePath: source })).commitId
    await expect(page.getByRole('listitem', { name: '文档 资料.txt', exact: true })).toBeVisible()
    await page.getByRole('listitem', { name: '文档 资料.txt', exact: true }).click()
    await call('dockitty_update_version', { docName: '资料.txt', versionId: first, note: 'Agent 版本备注', title: '论文原稿' })
    const aside = page.locator('.wg-inspector-organized')
    await expect(aside.getByRole('heading', { name: '论文原稿', exact: true })).toBeVisible()
    await aside.getByRole('tab', { name: '信息', exact: true }).click(); await expect(aside.getByRole('region', { name: '版本备注' })).toContainText('Agent 版本备注')
    await page.getByRole('button', { name: '版本关系图', exact: true }).click()
    const canvas = page.locator('.wg-graph-canvas'), box = (await canvas.boundingBox())!
    await page.mouse.move(box.x + 200, box.y + 120); await page.mouse.wheel(0, -300)
    const viewport = await page.locator('.wg-graph-world').getAttribute('style').catch(() => null)
    const project = await call<{ id: string }>('dockitty_create_library', { name: '侧栏项目' })
    await call('dockitty_import_items', { projectId: project.id, paths: [source] })
    const output = auditPath('inspector-mcp'); await fs.mkdir(output, { recursive: true })
    for (const [theme, label] of [['arknights', '方舟'], ['redline', '赤幕'], ['liquid', '琉璃'], ['liquid-dark', '夜璃'], ['blockframe', '积木'], ['raw', '粉绿'], ['retro', '视窗'], ['capsule', '胶囊'], ['light', '素白'], ['paper', '暖纸'], ['dark', '石墨']]) {
      await page.getByLabel('主题风格').click(); await page.getByRole('option').filter({ has: page.getByText(label, { exact: true }) }).click()
      for (const width of [1440, 1000]) {
        await app.evaluate(({ BrowserWindow }, width) => BrowserWindow.getAllWindows()[0].setContentSize(width, width === 1000 ? 700 : 1000), width)
        await expect(aside.getByRole('button', { name: '展开预览', exact: true })).toBeInViewport()
        await aside.getByRole('tab', { name: '信息', exact: true }).click(); await expect(aside.getByRole('button', { name: '编辑版本信息', exact: true })).toBeInViewport()
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
        await captureGraph(app, path.join(output, theme + '-versions-' + width + '.png'))
      }
    }
    await page.getByLabel('管理模式').click(); await page.getByRole('option', { name: /项目管理/ }).click()
    await page.getByRole('listitem', { name: '文档库 侧栏项目', exact: true }).click(); await page.getByRole('listitem', { name: '资料 资料.txt', exact: true }).click()
    await aside.getByRole('tab', { name: '信息', exact: true }).click(); await expect(aside.getByRole('button', { name: '编辑显示名称与备注', exact: true })).toBeVisible()
    await aside.getByRole('tab', { name: '关系', exact: true }).click(); await expect(aside.getByRole('button', { name: '添加关系', exact: true })).toBeInViewport()
    await page.getByRole('button', { name: '文件关系图', exact: true }).click(); await expect(page.getByRole('button', { name: '项目节点 资料.txt', exact: true })).toBeVisible()
    for (const [theme, label] of [['arknights', '方舟'], ['liquid', '琉璃'], ['redline', '赤幕'], ['retro', '视窗']]) {
      await page.getByLabel('主题风格').click(); await page.getByRole('option').filter({ has: page.getByText(label, { exact: true }) }).click()
      await expect(aside.getByRole('button', { name: '展开预览', exact: true })).toBeInViewport(); await expect(aside.getByRole('button', { name: '更多操作', exact: true })).toBeInViewport()
      await captureGraph(app, path.join(output, theme + '-projects-1000.png'))
    }
    const separator = page.getByRole('separator', { name: '调整项目详情栏宽度' }); await separator.focus(); await page.keyboard.press('ArrowLeft')
    const width = await aside.evaluate(element => element.getBoundingClientRect().width)
    await page.getByLabel('管理模式').click(); await page.getByRole('option', { name: /版本管理/ }).click()
    await expect(page.getByRole('button', { name: '版本关系图', exact: true })).toHaveAttribute('aria-pressed', 'true')
    if (viewport) await expect(page.locator('.wg-graph-world')).toHaveAttribute('style', viewport)
    await page.getByLabel('管理模式').click(); await page.getByRole('option', { name: /项目管理/ }).click()
    await expect(page.getByRole('button', { name: '文件关系图', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect(aside.getByRole('heading', { name: '资料.txt', exact: true })).toBeVisible(); expect(await aside.evaluate(element => element.getBoundingClientRect().width)).toBeCloseTo(width)
    expect(await fs.readFile(source, 'utf8')).toBe('原稿内容与来源保护。'); expect(errors).toEqual([])
    await fs.writeFile(path.join(output, 'result.json'), JSON.stringify({ passed: true, bundledMcpToDesktop: true, independentModeSelection: true, themes: 11, compactWidth: 1000, screenshots: 26, errors }, null, 2))
  } finally {
    await client.close(); await app.close()
    if (path.dirname(temporary) === os.tmpdir() && path.basename(temporary).startsWith('dockitty-inspector-')) await fs.rm(temporary, { recursive: true, force: true })
  }
})
