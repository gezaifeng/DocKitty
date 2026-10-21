import { chromium, expect } from '@playwright/test'
import { promises as fs } from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const root = process.cwd(), folder = path.resolve('docs/liquid-glass-lab'), output = path.join(folder, 'audit')
await fs.mkdir(output, { recursive: true })
const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true })
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 })
const errors = [], warnings = [], requests = [], screenshots = [], materials = []
page.on('pageerror', e => errors.push(e.message))
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); if (message.type() === 'warning') warnings.push(message.text()) })
page.on('request', request => { if (/^https?:/.test(request.url())) requests.push(request.url()) })
const url = pathToFileURL(path.join(folder, 'index.html')).href
async function capture(name) {
  await page.evaluate(() => document.fonts.ready)
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  const audit = await page.evaluate(() => {
    const blue = Array.from(document.querySelectorAll('body *')).filter(e => e.getClientRects().length && Array.from(e.childNodes).some(n => n.nodeType === 3 && n.textContent?.trim())).filter(e => { const rgb = getComputedStyle(e).color.match(/[\d.]+/g)?.map(Number); return rgb && rgb[2] > rgb[0] + 25 && rgb[2] > rgb[1] + 15 }).map(e => e.textContent?.slice(0, 30))
    return { width: innerWidth, scrollWidth: document.documentElement.scrollWidth, blue }
  })
  expect(audit.blue, name).toEqual([])
  expect(audit.scrollWidth, name).toBeLessThanOrEqual(audit.width)
  const wasPaused = await page.locator('.ambient svg').evaluate(element => { const paused = element.animationsPaused(); element.pauseAnimations(); return paused })
  await page.screenshot({ path: path.join(output, name + '.png'), animations: 'disabled' })
  if (!wasPaused) await page.locator('.ambient svg').evaluate(element => element.unpauseAnimations())
  screenshots.push(name + '.png')
}
try {
  await page.goto(url)
  await expect(page.getByRole('heading', { name: '我的文档', exact: true })).toBeVisible()
  await expect(page.locator('.doc-card')).toHaveCount(4)
  await expect(page.locator('img')).toHaveCount(2)
  expect(await page.locator('img').evaluateAll(images => images.every(image => image.complete && image.naturalWidth > 0))).toBe(true)
  const controls = await page.evaluate(() => {
    const read = selector => { const c = getComputedStyle(document.querySelector(selector)); return { background: c.backgroundColor, blur: c.backdropFilter } }
    return { ordinary: read('.action-group .button:not(.primary)'), primary: read('.button.primary'), selected: read('.selection-plate') }
  })
  for (const c of Object.values(controls)) { expect(c.background).toContain('rgba'); expect(c.blur).toContain('blur') }
  expect(Number(controls.ordinary.background.match(/[\d.]+/g).at(-1))).toBeLessThan(0.1)
  expect(Number(controls.selected.background.match(/[\d.]+/g).at(-1))).toBeLessThan(0.2)
  const readCurve = () => page.locator('.jade-ribbon').evaluate(element => { const p = element.getPointAtLength(element.getTotalLength() * .25); return {x:p.x,y:p.y} })
  const curveBefore = await readCurve()
  const flowingBefore = await page.locator('.ambient svg').evaluate(element => ({ transform: getComputedStyle(element).transform, animation: getComputedStyle(element).animationName }))
  await page.waitForTimeout(1200)
  const flowingAfter = await page.locator('.ambient svg').evaluate(element => getComputedStyle(element).transform)
  expect(flowingBefore.animation).toBe('ambient-flow'); expect(flowingAfter).not.toBe(flowingBefore.transform)
  const curveAfter = await readCurve(), morphDistance = Math.hypot(curveAfter.x - curveBefore.x, curveAfter.y - curveBefore.y)
  expect(morphDistance).toBeGreaterThan(8)
  const contentBounds = await page.locator('#main-content').boundingBox()
  await page.evaluate(() => clearGlassLights())
  await page.mouse.move(contentBounds.x + 70, contentBounds.y + 80)
  await page.mouse.move(contentBounds.x + 480, contentBounds.y + 250)
  const readLight = () => page.locator('#main-content').evaluate(element => ({ headX: parseFloat(element.style.getPropertyValue('--mx')), points: glassLights.get(element).samples.map(point => ({x:point.x,y:point.y})), paint: element.style.getPropertyValue('--light-traces'), filter: getComputedStyle(element,'::after').filter }))
  const immediateLight = await readLight()
  expect(immediateLight.headX).toBeCloseTo(480, 0)
  expect(immediateLight.points.at(-1).x).toBeCloseTo(70, 0)
  await page.waitForTimeout(100)
  const lightStart = await readLight()
  await page.waitForTimeout(200)
  const lightTrail = await readLight()
  expect(lightTrail.points).toEqual(lightStart.points)
  expect(lightTrail.paint).not.toBe(lightStart.paint)
  expect(lightTrail.filter).toBe('blur(14px)')
  await expect.poll(() => page.evaluate(() => lightFrame)).toBe(0)
  await page.getByRole('heading', { name: '我的文档', exact: true }).hover()
  await expect(page.locator('[data-light]')).toHaveCount(0)
  const frameTiming = await page.evaluate(() => new Promise(resolve => {
    const gaps = []; let first = 0, previous = 0
    function frame(time) { if (!first) first = time; if (previous) gaps.push(time - previous); previous = time; if (time - first < 1500) requestAnimationFrame(frame); else { gaps.sort((a, b) => a - b); resolve({ frames: gaps.length, medianMs: gaps[Math.floor(gaps.length / 2)], p95Ms: gaps[Math.floor(gaps.length * .95)] }) } }
    requestAnimationFrame(frame)
  }))
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect.poll(() => page.locator('.ambient svg').evaluate(element => getComputedStyle(element).animationName)).toBe('none')
  expect(await page.locator('.ambient svg').evaluate(element => element.animationsPaused())).toBe(true)
  await page.mouse.move(contentBounds.x + 170, contentBounds.y + 160)
  await expect(page.locator('[data-light]')).toHaveCount(0)
  await page.emulateMedia({ reducedMotion: 'no-preference' })

  for (const appearance of ['light', 'dark']) {
    if (appearance === 'dark') await page.getByRole('button', { name: '切换到深色外观', exact: true }).click()
    for (const [name, suffix] of [['总览工作台', 'overview'], ['版本关系图', 'graph'], ['分类看板', 'board'], ['版本统计', 'stats']]) {
      await page.getByRole('button', { name, exact: true }).click()
      await capture(appearance + '-' + suffix)
    }
    for (const name of ['增删字数', '修改强度', '结构变化', '保存活动', '字数趋势']) {
      await page.getByRole('button', { name, exact: true }).click()
      await expect(page.locator('.stats-head h2')).toHaveText(name)
    }
    await page.getByRole('button', { name: '总览工作台', exact: true }).click()
    await page.getByRole('button', { name: '查看毛玻璃叠层', exact: true }).click()
    const sample = page.getByRole('dialog', { name: '毛玻璃叠层', exact: true })
    await expect(sample).toBeVisible()
    await capture(appearance + '-glass-over-text')
    materials.push(await sample.evaluate(element => ({ appearance: document.documentElement.dataset.appearance, fill: getComputedStyle(element).backgroundColor, backdrop: getComputedStyle(element).backdropFilter, textFilter: getComputedStyle(element.querySelector('h3')).filter })))
    if (appearance === 'light') {
      await page.evaluate(() => { document.documentElement.dataset.motion = 'reduced'; document.querySelector('.ambient svg').pauseAnimations(); clearGlassLights() })
      await sample.screenshot({ path: path.join(output, 'glass-filter-on.png'), animations: 'disabled' })
      await sample.evaluate(element => { element.style.backdropFilter = 'none'; element.style.webkitBackdropFilter = 'none' })
      await sample.screenshot({ path: path.join(output, 'glass-filter-off.png'), animations: 'disabled' })
      await sample.evaluate(element => { element.style.removeProperty('backdrop-filter'); element.style.removeProperty('-webkit-backdrop-filter') })
      screenshots.push('glass-filter-on.png', 'glass-filter-off.png')
      await page.evaluate(() => { document.documentElement.dataset.motion = 'normal'; document.querySelector('.ambient svg').unpauseAnimations() })
    }
    await sample.getByRole('button', { name: '收起', exact: true }).click()
    await page.getByRole('button', { name: '展开预览', exact: true }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await capture(appearance + '-preview')
    await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).not.toBeVisible()
    await page.getByRole('button', { name: '外观与辅助设置', exact: true }).click()
    await expect(page.locator('.popover')).toBeVisible()
    await page.getByLabel('减少透明度', { exact: true }).check()
    await expect(page.locator('html')).toHaveAttribute('data-transparency', 'reduced')
    await capture(appearance + '-reduced-transparency')
    await page.getByLabel('减少透明度', { exact: true }).uncheck()
    await page.keyboard.press('Escape')
  }
  await page.getByRole('button', { name: '切换到浅色外观', exact: true }).click()
  await page.getByRole('button', { name: '版本关系图', exact: true }).click()
  const line = page.locator('.wire-hit').first()
  const point = await line.evaluate(element => {
    const p = element.getPointAtLength(element.getTotalLength() / 2), screen = new DOMPoint(p.x, p.y).matrixTransform(element.getScreenCTM())
    return { x: screen.x, y: screen.y }
  })
  await page.mouse.click(point.x, point.y, { button: 'right' })
  const editor = page.getByRole('dialog', { name: '编辑连线', exact: true })
  await expect(editor).toBeVisible()
  await editor.getByLabel('关系标签').fill('内容修订')
  await editor.getByLabel('关系备注').fill('液态玻璃主题中的编辑示例')
  await editor.getByLabel('线条格式').selectOption('dashed')
  await editor.getByLabel('箭头大小').fill('18')
  await editor.getByLabel('线条粗细').fill('3')
  await capture('light-edge-editor')
  const editorBounds = await editor.boundingBox()
  expect(editorBounds.y + editorBounds.height).toBeLessThanOrEqual(990)
  await editor.locator('.pop-head').hover({ position: { x: 50, y: 10 } })
  const box = await editor.locator('.pop-head').boundingBox(), initial = await editor.boundingBox()
  await page.mouse.down(); await page.mouse.move(box.x + 230, box.y + 110, { steps: 10 }); await page.mouse.up()
  await expect.poll(async () => (await editor.boundingBox()).x).toBeGreaterThan(initial.x + 150)
  await editor.getByRole('button', { name: '保存', exact: true }).click()
  await expect(editor).toHaveCount(0)
  await expect(page.locator('.wire-label').first()).toHaveText('内容修订')
  await page.keyboard.press('Control+z'); await expect(page.locator('.wire-label').filter({ hasText: '内容修订' })).toHaveCount(0)
  await page.keyboard.press('Control+Shift+z'); await expect(page.locator('.wire-label').first()).toHaveText('内容修订')
  await expect(page.locator('.notice')).toHaveCount(0, { timeout: 3500 })
  await page.getByRole('button', { name: '版本管理', exact: true }).click(); await page.getByRole('menuitem', { name: '项目管理', exact: true }).click()
  for (const [name, suffix] of [['文件浏览', 'overview'], ['文件关系图', 'graph'], ['分类看板', 'board']]) {
    await page.getByRole('button', { name, exact: true }).click(); await capture('light-project-' + suffix)
  }
  await page.getByRole('button', { name: '文件浏览', exact: true }).click()
  await page.getByRole('button', { name: '展开预览', exact: true }).click(); await expect(page.getByRole('dialog')).toBeVisible(); await page.keyboard.press('Escape')
  await page.getByRole('button', { name: '项目管理', exact: true }).click(); await page.getByRole('menuitem', { name: '版本管理', exact: true }).click()
  await page.getByRole('button', { name: '文件', exact: true }).click(); await expect(page.locator('.popover')).toBeVisible(); await page.mouse.click(1050, 95); await expect(page.locator('.popover')).toHaveCount(0)
  await page.getByRole('textbox', { name: '查找文档', exact: true }).fill('不存在的稿件'); await expect(page.getByRole('heading', { name: '没有找到匹配的资料' })).toBeVisible(); await capture('light-empty')
  await page.getByRole('button', { name: '显示全部文档', exact: true }).click()
  await page.getByRole('button', { name: '新建文档', exact: true }).click(); await page.getByLabel('文档名称', { exact: true }).fill('主题测试稿'); await page.getByRole('button', { name: '创建示例文档', exact: true }).click(); await expect(page.locator('.doc-card')).toHaveCount(5)
  await page.keyboard.press('Control+z'); await expect(page.locator('.doc-card')).toHaveCount(4)
  await page.getByRole('button', { name: '外观与辅助设置', exact: true }).click(); await page.getByLabel('减少动态效果', { exact: true }).check(); await page.keyboard.press('Escape')
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduced')
  expect(await page.locator('.ambient svg').evaluate(element => getComputedStyle(element).animationName)).toBe('none')
  expect(await page.evaluate(() => lightFrame)).toBe(0)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(page.locator('.notice')).toHaveCount(0, { timeout: 3500 })
  for (const viewport of [{ width: 900, height: 600 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport); await capture(viewport.width + '-overview')
    await page.getByRole('button', { name: '版本关系图', exact: true }).click(); await capture(viewport.width + '-graph')
    await page.getByRole('button', { name: '版本统计', exact: true }).click(); await capture(viewport.width + '-stats')
    if (viewport.width === 390) {
      await page.getByRole('button', { name: '展开侧边栏', exact: true }).click(); await expect(page.locator('#sidebar')).toBeVisible(); await page.getByRole('button', { name: '修改强度', exact: true }).click(); await page.keyboard.press('Escape')
      const detailsToggle = page.getByRole('button', { name: '显示或隐藏详情栏', exact: true })
      if (await detailsToggle.getAttribute('aria-pressed') === 'false') await detailsToggle.click()
      await expect(page.locator('#inspector')).toBeVisible(); await page.getByRole('button', { name: '展开预览', exact: true }).click(); await capture('390-preview'); await page.keyboard.press('Escape')
    }
    await page.getByRole('button', { name: '总览工作台', exact: true }).click()
  }
  expect(errors).toEqual([]); expect(warnings).toEqual([]); expect(requests).toEqual([])
  for (const material of materials) { expect(material.backdrop).toContain('blur'); expect(material.textFilter).toBe('none') }
  const materialPixels = JSON.parse(execFileSync('python', ['-X', 'utf8', '-c', `
import sys,json
from pathlib import Path
from PIL import Image,ImageChops,ImageStat
p=Path(sys.argv[1])
a=Image.open(p/'glass-filter-on.png').convert('RGB')
b=Image.open(p/'glass-filter-off.png').convert('RGB')
assert a.size==b.size
d=ImageChops.difference(a,b)
print(json.dumps({'meanDifference':sum(ImageStat.Stat(d).mean)/3,'changedPixelRatio':sum(max(pixel)>6 for pixel in d.getdata())/(d.width*d.height),'foregroundFilter':'none'}))
`, output], { encoding: 'utf8' }))
  expect(materialPixels.meanDifference).toBeGreaterThan(1)
  expect(materialPixels.changedPixelRatio).toBeGreaterThan(0.1)
  const proof = { revision: 4, passed: true, controls, immediateLight, lightTrail, morphDistance, frameTiming, flowingBackground: true, lightSchedulerSettles: true, materialPixels, materials, consoleWarnings: warnings, offline: true, consoleErrors: errors, externalRequests: requests, views: 4, projectViews: 3, appearances: 2, responsiveWidths: [1600, 900, 390], motionReduction: true, transparencyReduction: true, edgeEditor: true, menuDragging: true, undoRedoDemo: true, realAppModified: false, screenshots }
  await fs.writeFile(path.join(output, 'verification.json'), JSON.stringify(proof, null, 2)); console.log(JSON.stringify(proof, null, 2))
} finally { await browser.close() }
