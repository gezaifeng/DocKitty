import { auditPath } from './auditPath'
import { test, expect, _electron as electron } from '@playwright/test'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import os from 'node:os'

test('five native figures switch, persist and never react to canvas dragging', async () => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'gaomiao-riffle-'))
  const env = { ...process.env, WORDGIT_LIBRARY_HOME: temporary }; delete env.ELECTRON_RUN_AS_NODE
  const app = await electron.launch({ executablePath: process.env.WORDGIT_ELECTRON ?? path.resolve('node_modules/.cache/electron-runtime/dist/electron.exe'), args: [process.env.WORDGIT_APP ?? path.resolve('apps/desktop'), '--user-data-dir=' + path.join(temporary, 'profile')], env })
  try {
    const page = await app.firstWindow(), errors: string[] = []; page.on('pageerror', e => errors.push(e.message))
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1600, 1000))
    await expect(page.getByRole('button', { name: '总览工作台', exact: true })).toBeVisible()
    const source = path.join(temporary, '版本互动.txt'); await fs.writeFile(source, '一份测试文稿')
    await page.evaluate(source => window.wordgit.doc.import(source), source)
    await page.locator('.wg-document-card').click(); await page.getByRole('button', { name: '版本关系图', exact: true }).click()
    await expect(page.locator('.wg-main-view')).toHaveCSS('opacity', '1')
    const figure = page.locator('.wg-riffle-figure'), art = page.locator('.wg-graph-riffle')
    await expect(figure.locator('svg')).toHaveCount(1)
    const shape = () => figure.locator('path').evaluateAll(paths => paths.map(p => p.getAttribute('d')).join('|'))
    await expect.poll(async () => (await shape()).length).toBeGreaterThan(100)
    await page.waitForTimeout(300)
    const resting = await shape(), box = (await page.locator('.wg-graph-canvas').boundingBox())!
    await page.mouse.move(box.x + 500, box.y + 370); await page.mouse.down()
    for (let i = 0; i < 10; i++) await page.mouse.move(box.x + 500 + i * 25, box.y + 370, { steps: 2 })
    await page.mouse.up();expect(await shape()).toBe(resting)
    for (const name of ['Riffle', 'Drawer', 'Terminal', 'Cabinet', 'Turntable']) {
      await figure.click({button:'right'});await expect(page.getByRole('menu',{name:'切换视效'})).toBeVisible();await expect(page.getByRole('menuitemradio')).toHaveCount(5)
      await page.getByRole('menuitemradio',{name:new RegExp('^'+name+' ·')}).click()
      await expect(figure).toHaveAttribute('data-hairline',name.toLowerCase());await expect(figure.locator('svg')).toHaveCount(1)
      await page.mouse.move(box.x+900,box.y+300);await page.waitForTimeout(400)
      const before = await shape(), r=(await figure.boundingBox())!
      await page.mouse.move(r.x+r.width*.5,r.y+r.height*.5);await page.mouse.move(r.x+r.width*.65,r.y+r.height*.4,{steps:8})
      await expect.poll(shape).not.toBe(before)
      await page.screenshot({path:`docs/management-audit/figure-${name.toLowerCase()}.png`})
      await page.mouse.move(box.x+900,box.y+300)
    }
    await figure.click({button:'right'});await page.screenshot({path: auditPath('management-audit/figure-switch-menu.png')});await page.getByRole('menuitemradio',{name:/^Riffle ·/}).click()
    for (const [theme, label] of [['blockframe', '积木'], ['light', '素白'], ['paper', '暖纸'], ['dark', '石墨']]) {
      await page.getByLabel('主题风格').click(); await page.getByRole('option').filter({ has: page.getByText(label, { exact: true }) }).click()
      await page.waitForTimeout(300) // Allow the existing theme color transition to settle before visual capture.
      await page.screenshot({ path: auditPath(`management-audit/riffle-${theme}.png`) })
      const colors = await figure.evaluate(el => ({ figure: getComputedStyle(el).getPropertyValue('--hl-hi'), text: getComputedStyle(el).getPropertyValue('--wg-text') }))
      expect(colors.figure.trim()).toBe(colors.text.trim())
    }
    const figureBox=(await figure.boundingBox())!;await figure.hover({position:{x:figureBox.width/2,y:figureBox.height/2}});await expect.poll(() => figure.locator('[data-hairline-live]').textContent()).not.toBe('rest')
    await page.emulateMedia({reducedMotion:'reduce'});await figure.focus(); await page.keyboard.press('ArrowRight'); await expect.poll(() => figure.locator('[data-hairline-live]').textContent()).not.toBe('rest')
    await figure.click({button:'right'});await page.getByRole('menuitemradio',{name:/^Drawer ·/}).click()
    await page.getByRole('button', { name: '总览工作台', exact: true }).click(); await expect(art).toHaveCount(0)
    await page.getByRole('button', { name: '版本关系图', exact: true }).click();await expect(figure).toHaveAttribute('data-hairline','drawer');await expect(figure.locator('svg')).toHaveCount(1)
    expect(errors).toEqual([])
  } finally { await app.close(); if (path.dirname(temporary) === os.tmpdir() && path.basename(temporary).startsWith('gaomiao-riffle-')) await fs.rm(temporary, { recursive: true, force: true }) }
})

