import { auditPath } from './auditPath'
import { test, expect, _electron as electron } from '@playwright/test'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { captureGraph } from './graphHelpers.js'

test('six background colors preserve layout, motion state and persisted selection', async () => {
  test.setTimeout(120000)
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'dockitty-palettes-')), output = auditPath('glass-zoom-palette-audit')
  const env = { ...process.env, WORDGIT_LIBRARY_HOME: temporary }; delete env.ELECTRON_RUN_AS_NODE
  let app: Awaited<ReturnType<typeof electron.launch>> | undefined
  const choices = [['jade', '玉绿珍珠'], ['blue-white', '蓝白'], ['pink-green', '粉绿'], ['yellow-black', '黄黑'], ['lavender', '紫白'], ['peach', '橙米']]
  try {
    async function launch() {
      app = await electron.launch({ executablePath: process.env.WORDGIT_ELECTRON ?? path.resolve('node_modules/.cache/electron-runtime/dist/electron.exe'), args: [process.env.WORDGIT_APP ?? path.resolve('apps/desktop'), '--user-data-dir=' + path.join(temporary, 'profile')], env })
      const page = await app.firstWindow(); page.setDefaultTimeout(12000); await expect(page.getByLabel('主题风格')).toBeVisible(); return page
    }
    let page = await launch(); await fs.mkdir(output, { recursive: true })
    const source = path.join(temporary, '版本文稿.txt'); await fs.writeFile(source, '测试配色和缩放，不修改原文件')
    await page.evaluate(source => window.wordgit.doc.import(source), source); await page.locator('.wg-document-card').click()
    await page.getByRole('button', { name: '版本关系图', exact: true }).click(); await expect(page.locator('.wg-main-view')).toHaveCSS('transform', 'none')
    for (const label of ['琉璃', '夜璃']) {
      await page.getByLabel('主题风格').click(); await page.getByRole('option').filter({ has: page.getByText(label, { exact: true }) }).click()
      await page.waitForTimeout(450)
      await page.locator('.wg-features-menu summary').click()
      const geometry = await page.locator('.wg-graph-node').boundingBox()
      await page.locator('.wg-liquid-background svg').evaluate(el => { (window as any).paletteSvg = el; (el as SVGSVGElement).pauseAnimations(); (el as SVGSVGElement).setCurrentTime(3) })
      for (const [id, name] of choices) {
        await page.getByRole('menuitemradio', { name, exact: true }).click(); await expect(page.locator('.wg-liquid-background')).toHaveAttribute('data-palette', id)
        await expect(page.getByRole('menuitemradio', { name, exact: true })).toHaveAttribute('aria-checked', 'true')
        expect(await page.locator('.wg-graph-node').boundingBox()).toEqual(geometry)
        expect(await page.locator('.wg-liquid-background svg').evaluate(el => (window as any).paletteSvg === el)).toBe(true)
        const typography = await page.locator('.wg-menubar').evaluate(el => getComputedStyle(el).getPropertyValue('--wg-text'))
        expect(typography.trim()).toBe(label === '夜璃' ? '#f2f7ea' : '#192620')
        await page.waitForTimeout(150); await captureGraph(app!, path.join(output, (label === '夜璃' ? 'dark-' : 'light-') + id + '.png'))
      }
      await page.keyboard.press('Escape')
    }
    await app!.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(900, 600)); await page.locator('.wg-features-menu summary').click()
    await page.getByRole('menuitemradio', { name: '橙米', exact: true }).scrollIntoViewIfNeeded(); await expect(page.getByRole('menuitemradio', { name: '橙米', exact: true })).toBeInViewport()
    await page.getByRole('menuitemradio', { name: '粉绿', exact: true }).click(); await page.keyboard.press('Escape')
    await app!.close(); app = undefined; page = await launch()
    await expect(page.locator('.wg-liquid-background')).toHaveAttribute('data-palette', 'pink-green'); await expect(page.getByLabel('主题风格')).toHaveAttribute('data-value', 'liquid-dark')
    expect(await fs.readFile(source, 'utf8')).toBe('测试配色和缩放，不修改原文件')
    await fs.writeFile(path.join(output, 'palettes.json'), JSON.stringify({ passed: true, palettes: choices.map(([id]) => id), bothAppearances: true, geometryUnchanged: true, svgRetained: true, completeRestartRetainsSelection: true, sourceUnchanged: true }, null, 2))
  } finally { await app?.close(); if (path.dirname(temporary) === os.tmpdir() && path.basename(temporary).startsWith('dockitty-palettes-')) await fs.rm(temporary, { recursive: true, force: true }) }
})
