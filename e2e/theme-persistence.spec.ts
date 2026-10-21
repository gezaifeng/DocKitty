import { auditPath } from './auditPath'
import { test, expect, _electron as electron } from '@playwright/test'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import os from 'node:os'

test('theme survives complete restarts and a changed application folder', async () => {
  test.setTimeout(120000)
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'dockitty-theme-memory-')), profile = path.join(temporary, 'profile')
  const env = { ...process.env, WORDGIT_LIBRARY_HOME: path.join(temporary, 'library') }; delete env.ELECTRON_RUN_AS_NODE
  const first = path.join(temporary, 'application-A'), second = path.join(temporary, 'application-B')
  const application = process.env.WORDGIT_APP ?? path.resolve('apps/desktop')
  for (const destination of [first, second]) { await fs.mkdir(destination); await fs.copyFile(path.join(application, 'package.json'), path.join(destination, 'package.json')); await fs.cp(path.join(application, 'out'), path.join(destination, 'out'), { recursive: true }); await fs.cp(path.join(application, 'resources'), path.join(destination, 'resources'), { recursive: true }) }
  let app: Awaited<ReturnType<typeof electron.launch>> | undefined
  try {
    async function launch(folder: string) {
      app = await electron.launch({ executablePath: folder === first && process.env.WORDGIT_ELECTRON || path.resolve('node_modules/.cache/electron-runtime/dist/electron.exe'), args: [folder, '--user-data-dir=' + profile], env })
      const page = await app.firstWindow(); page.setDefaultTimeout(10000)
      await expect(page.getByLabel('主题风格')).toBeVisible()
      return page
    }
    let page = await launch(first)
    const choices = [['light', '素白'], ['dark', '石墨'], ['paper', '暖纸'], ['system', '系统'], ['blockframe', '积木'], ['raw', '粉绿'], ['retro', '视窗'], ['capsule', '胶囊'], ['liquid', '琉璃'], ['liquid-dark', '夜璃']]
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
    await fs.mkdir(auditPath('theme-persistence-audit'), { recursive: true })
    await fs.writeFile(auditPath('theme-persistence-audit/verification.json'), JSON.stringify({ passed: true, completeProcessRestarts: true, packagedExecutable: process.env.WORDGIT_ELECTRON ?? null, themes: choices.map(([id]) => id), legacyPreferenceMigration: true, changedApplicationFolder: true, isolatedProfile: true }, null, 2))
  } finally { await app?.close(); if (path.dirname(temporary) === os.tmpdir() && path.basename(temporary).startsWith('dockitty-theme-memory-')) await fs.rm(temporary, { recursive: true, force: true }) }
})
