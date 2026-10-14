import { promises as fs } from 'node:fs'
import { expect, type Page, type Locator, type ElectronApplication } from '@playwright/test'

export async function dragWire(page: Page, from: Locator, to: Locator, finish = true) {
  if (await page.locator('.wg-main-view').count()) await expect(page.locator('.wg-main-view')).toHaveCSS('opacity', '1')
  await from.click()
  await expect.poll(() => from.evaluate(element => element.closest('.wg-graph-node')?.classList.contains('selected'))).toBe(true)
  const cardBox = (node: Locator) => node.evaluate(element => { const r = element.closest('.wg-graph-node')!.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height } })
  const a = await cardBox(from), b = await cardBox(to)
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2); await page.mouse.down({ button: 'right' })
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 8 })
  await expect(page.locator('.wg-connection-preview')).toHaveCount(1)
  const held = await cardBox(from); expect(held.x).toBeCloseTo(a.x); expect(held.y).toBeCloseTo(a.y)
  if (finish) await page.mouse.up({ button: 'right' })
}
export async function editWire(page: Page, path: Locator, button?: 'right') {
  const p = await path.evaluate((element: SVGPathElement) => {
    for (const fraction of [.5, .45, .55, .4, .6, .35, .65, .3, .7, .25, .75, .2, .8, .15, .85, .1, .9]) {
      const point = element.getPointAtLength(element.getTotalLength() * fraction), transformed = new DOMPoint(point.x, point.y).matrixTransform(element.getScreenCTM()!)
      if (document.elementFromPoint(transformed.x, transformed.y)?.closest('g') === element.closest('g')) return { x: transformed.x, y: transformed.y }
    }
    throw new Error('没有可见连线段，请调整测试布局')
  })
  if (button === 'right') await page.mouse.click(p.x, p.y, { button })
  else await page.mouse.dblclick(p.x, p.y)
}

export async function captureGraph(app: ElectronApplication, destination: string) {
  const bytes = await app.evaluate(async ({ BrowserWindow }) => (await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64'))
  await fs.writeFile(destination, Buffer.from(bytes, 'base64'))
}
