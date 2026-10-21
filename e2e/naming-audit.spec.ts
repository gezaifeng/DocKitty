import { auditPath } from './auditPath'
import { test, expect, _electron as electron } from '@playwright/test'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { themeOptions } from '../apps/desktop/src/renderer/src/lib/themes'
import type { ProjectLibrary } from '../packages/shared/src/projects'

const output = auditPath('consistency-audit-0.5.13')

test('two-character themes retain ids, data and the saved choice across modes and restart', async () => {
  test.setTimeout(120000)
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'dockitty-naming-'))
  const env = { ...process.env, WORDGIT_LIBRARY_HOME: path.join(temporary, 'library') }; delete env.ELECTRON_RUN_AS_NODE
  const launch = () => electron.launch({ executablePath: process.env.WORDGIT_ELECTRON ?? path.resolve('node_modules/.cache/electron-runtime/dist/electron.exe'), args: [process.env.WORDGIT_APP ?? path.resolve('apps/desktop'), '--user-data-dir=' + path.join(temporary, 'profile')], env })
  let app = await launch()
  try {
    await fs.mkdir(output, { recursive: true })
    let page = await app.firstWindow(); page.setDefaultTimeout(10000)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await expect(page.getByLabel('主题风格')).toBeVisible()
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1440, 1000))
    const source = path.join(temporary, '名称验收.txt'), content = '主题改名不改变源文件、已存历史和分支。'
    await fs.writeFile(source, content)
    await page.evaluate(source => window.wordgit.doc.import(source), source)
    const before = await page.evaluate(() => window.wordgit.library.detail('名称验收.txt'))
    for (const mode of ['versions', 'projects']) {
      if (mode === 'projects') {
        await page.getByLabel('管理模式').click()
        await page.getByRole('option', { name: /项目管理/ }).click()
      }
      for (const theme of themeOptions) {
        await page.getByLabel('主题风格').click()
        const names = await page.locator('#wg-theme-options strong').allTextContents()
        expect(names).toEqual(themeOptions.map(option => option.label))
        expect(names.every(name => /^[\u4e00-\u9fff]{2}$/.test(name))).toBe(true)
        await page.getByRole('option').filter({ has: page.getByText(theme.label, { exact: true }) }).click()
        await expect(page.getByLabel('主题风格')).toHaveText(theme.label)
        await expect(page.locator('html')).toHaveAttribute('data-theme-preference', theme.id)
      }
    }
    await page.getByLabel('主题风格').click()
    await page.getByRole('option').filter({ has: page.getByText('方舟', { exact: true }) }).click()
    await page.getByLabel('主题风格').click()
    await page.screenshot({ path: path.join(output, 'themes-projects.png') })
    await page.keyboard.press('Escape')
    await page.getByLabel('管理模式').click()
    await page.getByRole('option', { name: /版本管理/ }).click()
    await page.getByRole('button', { name: '使用帮助', exact: true }).click()
    await expect(page.getByRole('list', { name: '主题列表' })).toBeVisible()
    expect(await page.getByRole('list', { name: '主题列表' }).locator('strong').allTextContents()).toEqual(themeOptions.map(option => option.label))
    const after = await page.evaluate(() => window.wordgit.library.detail('名称验收.txt'))
    expect(after.versions).toEqual(before.versions)
    expect(after.branchHeads).toEqual(before.branchHeads)
    expect(await fs.readFile(source, 'utf8')).toBe(content)
    await app.close(); app = await launch()
    page = await app.firstWindow()
    await expect(page.getByLabel('主题风格')).toHaveText('方舟')
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'arknights')
    await fs.writeFile(path.join(output, 'themes.json'), JSON.stringify({ passed: true, themes: themeOptions.map(({ id, label }) => ({ id, label })), modes: ['versions', 'projects'], sourceAndHistoryUnchanged: true, completeRestart: true, executable: process.env.WORDGIT_ELECTRON ?? 'development runtime' }, null, 2))
  } finally {
    await app.close()
    if (path.dirname(temporary) === os.tmpdir() && path.basename(temporary).startsWith('dockitty-naming-')) await fs.rm(temporary, { recursive: true, force: true })
  }
})

test('audit evidence distinguishes branch statistics wording, display titles and mode context', async () => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'dockitty-audit-'))
  const env = { ...process.env, WORDGIT_LIBRARY_HOME: path.join(temporary, 'library') }; delete env.ELECTRON_RUN_AS_NODE
  const app = await electron.launch({ executablePath: process.env.WORDGIT_ELECTRON ?? path.resolve('node_modules/.cache/electron-runtime/dist/electron.exe'), args: [process.env.WORDGIT_APP ?? path.resolve('apps/desktop'), '--user-data-dir=' + path.join(temporary, 'profile')], env })
  try {
    const page = await app.firstWindow(); page.setDefaultTimeout(10000)
    await page.emulateMedia({ reducedMotion: 'reduce' }); await expect(page.getByLabel('主题风格')).toBeVisible()
    const source = path.join(temporary, '审查样例.txt'); await fs.writeFile(source, '这是审查样例。')
    await page.evaluate(source => window.wordgit.doc.import(source), source)
    await page.locator('.wg-document-card').click()
    await page.getByRole('button', { name: '版本统计', exact: true }).click()
    await expect(page.locator('.wg-stat-cards section').first()).toContainText('本分支归属版本，含独立稿')
    const stats = await page.evaluate(async () => {
      const detail = await window.wordgit.library.detail('审查样例.txt')
      return window.wordgit.stats.versions(detail.docName, detail.currentBranch)
    })
    expect(stats.scope).toContain('单一分支归属')
    await page.getByLabel('管理模式').click(); await page.getByRole('option', { name: /项目管理/ }).click()
    const projectId = await page.evaluate(async source => {
      const project = await window.wordgit.projects!.request({ action: 'create', name: '审查项目' }) as ProjectLibrary
      await window.wordgit.projects!.request({ action: 'import', projectId: project.id, paths: [source] })
      const loaded = await window.wordgit.projects!.request({ action: 'get', projectId: project.id }) as ProjectLibrary
      await window.wordgit.projects!.request({ action: 'updateNode', projectId: project.id, nodeId: loaded.nodes[0].id, title: '展示标题' })
      return project.id
    }, source)
    await page.getByRole('listitem', { name: '文档库 审查项目', exact: true }).click()
    await page.getByRole('button', { name: '文件关系图', exact: true }).click()
    await expect(page.getByRole('button', { name: '项目节点 展示标题', exact: true })).toBeVisible()
    const project = await page.evaluate(id => window.wordgit.projects!.request({ action: 'get', projectId: id }) as Promise<ProjectLibrary>, projectId)
    expect(project.nodes[0].name).toBe('审查样例.txt')
    expect(project.nodes[0].sourcePath).toBe(source)
    await page.getByLabel('管理模式').click(); await page.getByRole('option', { name: /版本管理/ }).click()
    await expect(page.getByRole('button', { name: '版本统计', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await page.getByLabel('管理模式').click(); await page.getByRole('option', { name: /项目管理/ }).click()
    await expect(page.getByRole('button', { name: '项目节点 展示标题', exact: true })).toBeVisible()
    await fs.mkdir(output, { recursive: true })
    await fs.writeFile(path.join(output, 'findings.json'), JSON.stringify({ passed: true, statistics: { displayed: '本分支归属版本，含独立稿', actualScope: stats.scope }, projectRename: { displayTitle: project.nodes[0].title, diskName: project.nodes[0].name, originalUnchanged: await fs.readFile(source, 'utf8') === '这是审查样例。' }, modeSwitch: { versionStatisticsPreserved: true, projectGraphPreserved: true }, isolatedFixtures: true }, null, 2))
  } finally {
    await app.close()
    if (path.dirname(temporary) === os.tmpdir() && path.basename(temporary).startsWith('dockitty-audit-')) await fs.rm(temporary, { recursive: true, force: true })
  }
})
