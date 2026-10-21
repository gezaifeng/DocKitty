import { _electron as electron } from '@playwright/test'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'

const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'dockitty-layers-'))
const env = { ...process.env, WORDGIT_LIBRARY_HOME: temporary }; delete env.ELECTRON_RUN_AS_NODE
const app = await electron.launch({ executablePath: process.env.WORDGIT_ELECTRON ?? path.resolve('node_modules/.cache/electron-runtime/dist/electron.exe'), args: [process.env.WORDGIT_APP ?? path.resolve('apps/desktop'), '--user-data-dir=' + path.join(temporary, 'profile')], env })
try {
  const page = await app.firstWindow(); page.setDefaultTimeout(12000)
  const report = []
  const luminance = rgb => rgb.map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0)
  async function contrast(theme, phase, view = 'overview', palette = 'jade') {
    const samples = await page.evaluate(() => {
      const selectors = '.wg-brand strong,.wg-features-menu summary,.wg-help-trigger,.wg-viewbar nav button,.wg-document-card strong,.wg-document-card>p,.wg-document-card footer,.wg-inspector h2,.wg-inspector small,.wg-features-menu>div button,.wg-feature-heading,.wg-node-body,.wg-graph-node small,.wg-version-card strong,.wg-stat-heading,.wg-stat-cards section,.wg-stat-sidebar button,.wg-settings h3,.wg-settings p,.wg-settings button'
      const samples = [], walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
      for (let text = walker.nextNode(); text; text = walker.nextNode()) {
        const el = text.parentElement, value = text.textContent.trim(); if (!value || !el?.closest(selectors)) continue
        const range = document.createRange(); range.selectNodeContents(text); const r = range.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2
        if (!r.width || x < 0 || y < 0 || x >= innerWidth || y >= innerHeight || !el.contains(document.elementFromPoint(x, y))) continue
        const s = getComputedStyle(el); samples.push({ text: value, x, y, color: s.color.match(/[\d.]+/g).slice(0, 3).map(Number), minimum: parseFloat(s.fontSize) >= 24 || parseFloat(s.fontSize) >= 18.66 && parseInt(s.fontWeight) >= 700 ? 3 : 4.5 })
      }
      return samples
    })
    const mask = await page.addStyleTag({ content: '*{color:transparent!important;-webkit-text-fill-color:transparent!important;text-shadow:none!important}' })
    try {
      const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }))
      const backgrounds = await app.evaluate(async ({ BrowserWindow }, { points, viewport }) => {
        const win = BrowserWindow.getAllWindows()[0], image = await win.webContents.capturePage(), size = image.getSize(), { width, height } = viewport
        return points.map(point => { const bytes = image.crop({ x: Math.round(point.x * size.width / width), y: Math.round(point.y * size.height / height), width: 3, height: 3 }).getBitmap(), rgb = [0, 0, 0]; if (!bytes.length) throw new Error('Empty contrast sample'); for (let i = 0; i < bytes.length; i += 4) { rgb[0] += bytes[i + 2]; rgb[1] += bytes[i + 1]; rgb[2] += bytes[i] } return rgb.map(v => v / (bytes.length / 4)) })
      }, { points: samples, viewport })
      for (let i = 0; i < samples.length; i++) { const fg = luminance(samples[i].color), bg = luminance(backgrounds[i]), ratio = (Math.max(fg, bg) + .05) / (Math.min(fg, bg) + .05); report.push({ theme, phase, view, palette, text: samples[i].text, ratio: +ratio.toFixed(2), minimum: samples[i].minimum }) }
    } finally { await mask.evaluate(el => el.remove()); await page.waitForTimeout(50) }
  }
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1600, 1000))
  await page.getByRole('button', { name: '总览工作台', exact: true }).waitFor()
  const source = path.join(temporary, '审阅.txt'); await fs.writeFile(source, '用于检查材质层次的测试文稿')
  await page.evaluate(source => window.wordgit.doc.import(source), source)
  await page.locator('.wg-document-card').click()
  await page.getByLabel('主题风格').click(); await page.getByRole('option').filter({ has: page.getByText('液态玻璃 · 深色', { exact: true }) }).click()
  await page.locator('.wg-features-menu summary').click(); await page.waitForTimeout(350)
  const layers = await page.locator('.wg-features-menu>div').evaluate(el => { const layers = []; for (let node = el; node; node = node.parentElement) { const s = getComputedStyle(node); layers.push({ name: node.className || node.tagName, backdrop: s.backdropFilter, filter: s.filter, opacity: s.opacity, clip: s.clipPath, willChange: s.willChange, isolation: s.isolation }) } return layers })
  console.log(JSON.stringify(layers))
  assert.equal(layers.find(l => l.name === 'wg-menubar').backdrop, 'none')
  assert(layers[0].backdrop.includes('blur'))
  for (const label of ['液态玻璃', '液态玻璃 · 深色']) {
    await page.keyboard.press('Escape'); await page.getByLabel('主题风格').click(); await page.getByRole('option').filter({ has: page.getByText(label, { exact: true }) }).click()
    await page.locator('.wg-features-menu summary').click()
    for (const phase of [0, 3, 7, 11]) { await page.locator('.wg-liquid-background svg').evaluate((el, time) => { el.pauseAnimations(); el.setCurrentTime(time) }, phase); await page.waitForTimeout(150); await contrast(label, phase) }
    await page.keyboard.press('Escape')
    for (const view of ['版本关系图', '分类看板', '版本统计']) {
      await page.getByRole('button', { name: view, exact: true }).click(); await page.waitForTimeout(550)
      for (const phase of [0, 7]) { await page.locator('.wg-liquid-background svg').evaluate((el, time) => el.setCurrentTime(time), phase); await page.waitForTimeout(150); await contrast(label, phase, view) }
      if (view === '版本关系图') { const node = page.locator('.wg-graph-node').first(); await node.hover(); await contrast(label, 'pointer-light', view) }
    }
    await page.getByRole('button', { name: '总览工作台', exact: true }).click(); await page.waitForTimeout(500)
    await page.getByRole('button', { name: '保存与备份设置', exact: true }).click(); await page.waitForTimeout(700); await contrast(label, 'settings', '设置'); await page.getByRole('button', { name: '返回工作台' }).click()
  }
  if (process.env.GLASS_PALETTE_AUDIT) {
    for (const label of ['液态玻璃', '液态玻璃 · 深色']) {
      await page.getByLabel('主题风格').click(); await page.getByRole('option').filter({ has: page.getByText(label, { exact: true }) }).click()
      for (const [id, name] of [['jade','玉绿珍珠'],['blue-white','蓝白'],['pink-green','粉绿'],['yellow-black','黄黑'],['lavender','紫白'],['peach','橙米']]) {
        await page.getByRole('button', { name: '总览工作台', exact: true }).click(); await page.waitForTimeout(500)
        await page.locator('.wg-features-menu summary').click(); await page.getByRole('menuitemradio', { name, exact: true }).click()
        for (const phase of [0, 7]) { await page.locator('.wg-liquid-background svg').evaluate((el, time) => { el.pauseAnimations(); el.setCurrentTime(time) }, phase); await page.waitForTimeout(100); await contrast(label, phase, 'overview', id) }
        await page.keyboard.press('Escape'); await page.getByRole('button', { name: '版本关系图', exact: true }).click(); await page.waitForTimeout(500)
        for (const phase of [0, 7]) { await page.locator('.wg-liquid-background svg').evaluate((el, time) => el.setCurrentTime(time), phase); await page.waitForTimeout(100); await contrast(label, phase, '版本关系图', id) }
      }
      console.log('palette contrast sampled', label)
    }
  }
  const failures = report.filter(r => r.ratio < r.minimum)
  await fs.mkdir('docs/glass-zoom-palette-audit', { recursive: true })
  await fs.writeFile(process.env.GLASS_PALETTE_AUDIT ? 'docs/glass-zoom-palette-audit/materials.json' : 'docs/liquid-glass-integration-audit/materials.json', JSON.stringify({ layers, samples: report, failures }, null, 2))
  console.log('contrast samples', report.length, 'failures', JSON.stringify(failures))
  assert.equal(failures.length, 0, 'Glass text contrast below target')
  await fs.writeFile('docs/liquid-glass-integration-audit/layering-diagnostic.png', Buffer.from(await app.evaluate(async ({ BrowserWindow }) => (await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64')), 'base64'))
  await page.keyboard.press('Escape'); await page.getByRole('button', { name: '版本关系图', exact: true }).click(); await page.waitForTimeout(500)
  await page.locator('.wg-riffle-figure').click({ button: 'right' }); await page.getByRole('menuitemradio', { name: /^Drawer ·/ }).click()
  await page.locator('.wg-riffle-figure').click({ button: 'right' }); await page.waitForTimeout(250)
  await page.evaluate(() => { document.addEventListener('pointerdown', e => { window.__lastTarget = e.target?.outerHTML?.slice(0, 160) }, true) })
  try { await page.getByRole('menuitem', { name: '关闭小组件', exact: true }).click(); console.log('widget closed', await page.locator('.wg-graph-riffle').count()) }
  catch (e) { console.log('failed', e.message, await page.evaluate(() => ({ target: window.__lastTarget, menus: [...document.querySelectorAll('[role=menu]')].map(m => m.textContent) }))) }
} finally { await app.close(); if (path.dirname(temporary) === os.tmpdir() && path.basename(temporary).startsWith('dockitty-layers-')) await fs.rm(temporary, { recursive: true, force: true }) }
