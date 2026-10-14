import { test, expect, _electron as electron } from '@playwright/test'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import os from 'node:os'

test('theme survives complete restarts and a changed application folder', async () => {
  test.setTimeout(120000)
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'dockitty-theme-memory-')), profile = path.join(temporary, 'profile')
  const env = { ...process.env, WORDGIT_LIBRARY_HOME: path.join(temporary, 'library') }; delete env.ELECTRON_RUN_AS_NODE
  const first = path.join(temporary, 'application-A'), second = path.join(temporary, 'application-B')
  const application = process.env.WORDGIT_APP ?? path.resolve('dist/gaomiao-windows-TJ4Okd/resources/app')
  await fs.cp(application, first, { recursive: true }); await fs.cp(application, second, { recursive: true })
  let app: Awaited<ReturnType<typeof electron.launch>> | undefined
  try {
    async function launch(folder: string) {
      app = await electron.launch({ executablePath: folder === first && process.env.WORDGIT_ELECTRON || path.resolve('node_modules/.cache/electron-runtime/dist/electron.exe'), args: [folder, '--user-data-dir=' + profile], env })
      const page = await app.firstWindow(); page.setDefaultTimeout(10000)
      await expect(page.getByLabel('主题风格')).toBeVisible()
      return page
    }
    let page = await launch(first)
    const choices = [['light', '浅色办公'], ['dark', '石墨暗色'], ['paper', '纸张书房'], ['system', '跟随系统'], ['blockframe', 'BlockFrame 黑框积木'], ['raw', '粉绿方块'], ['retro', '经典视窗'], ['capsule', '胶囊文具'], ['liquid', '液态玻璃'], ['liquid-dark', '液态玻璃 · 深色']]
    for (const [value, label] of choices) {
      await page.getByLabel('主题风格').click(); await page.getByRole('option').filter({ has: page.getByText(label, { exact: true }) }).click()
      await expect(page.getByLabel('主题风格')).toHaveAttribute('data-value', value)
      await app!.close(); app = undefined
      page = await launch(first); await expect(page.getByLabel('主题风格')).toHaveAttribute('data-value', value)
      await expect(page.locator('html')).toHaveAttribute('data-theme-preference', value)
    }
    await page.evaluate(() => localStorage.setItem('word-git-ui-v1', JSON.stringify({ version: 1, state: { theme: 'raw', themeButtonPos: null } })))
    await app!.close(); app = undefined
    page = await launch(second); await expect(page.getByLabel('主题风格')).toHaveAttribute('data-value', 'raw')
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'raw')
    await fs.mkdir(path.resolve('docs/theme-persistence-audit'), { recursive: true })
    await fs.writeFile(path.resolve('docs/theme-persistence-audit/verification.json'), JSON.stringify({ passed: true, completeProcessRestarts: true, packagedExecutable: process.env.WORDGIT_ELECTRON ?? null, themes: choices.map(([id]) => id), legacyPreferenceMigration: true, changedApplicationFolder: true, isolatedProfile: true }, null, 2))
  } finally { await app?.close(); if (path.dirname(temporary) === os.tmpdir() && path.basename(temporary).startsWith('dockitty-theme-memory-')) await fs.rm(temporary, { recursive: true, force: true }) }
})
