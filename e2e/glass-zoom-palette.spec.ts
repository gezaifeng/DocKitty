import { auditPath } from './auditPath'
import { test, expect, _electron as electron } from '@playwright/test'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import os from 'node:os'

test('glass zoom keeps stationary material stable', async () => {
  test.setTimeout(120000)
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'dockitty-glass-zoom-')), output = auditPath('glass-zoom-palette-audit')
  const env = { ...process.env, WORDGIT_LIBRARY_HOME: temporary }; delete env.ELECTRON_RUN_AS_NODE
  const app = await electron.launch({ executablePath: process.env.WORDGIT_ELECTRON ?? path.resolve('node_modules/.cache/electron-runtime/dist/electron.exe'), args: [process.env.WORDGIT_APP ?? path.resolve('apps/desktop'), '--user-data-dir=' + path.join(temporary, 'profile')], env })
  try {
    const page = await app.firstWindow(); page.setDefaultTimeout(12000)
    await fs.mkdir(output, { recursive: true })
    await app.evaluate(({ BrowserWindow }) => { const win = BrowserWindow.getAllWindows()[0]; win.setContentSize(1600, 1000); win.webContents.setBackgroundThrottling(false) })
    await expect(page.getByLabel('主题风格')).toBeVisible()
    const source = path.join(temporary, '缩放测试.txt'); await fs.writeFile(source, '测试文档，不涉及真实论文')
    await page.evaluate(source => window.wordgit.doc.import(source), source)
    const root = (await page.evaluate(() => window.wordgit.repo.bootstrap())).repoRoot
    for (let i = 1; i < 8; i++) { await fs.writeFile(path.join(root, 'workspace/缩放测试.txt'), '测试文档 ' + i); await page.evaluate(i => window.wordgit.commit.create('缩放测试.txt', '修订 ' + i, '测试'), i) }
    await page.locator('.wg-document-card').click()
    await page.getByLabel('主题风格').click(); await page.getByRole('option').filter({ has: page.getByText('琉璃', { exact: true }) }).click()
    await page.getByRole('button', { name: '版本关系图', exact: true }).click(); await expect(page.locator('.wg-main-view')).toHaveCSS('transform', 'none')
    const filters = await page.locator('.wg-graph-world').evaluate(el => [...el.querySelectorAll('*')].filter(e => getComputedStyle(e).backdropFilter !== 'none').map(e => e.className))
    const rows = []
    async function sample(label: string, mode: string) {
      await app.evaluate(({ BrowserWindow }) => { const win = BrowserWindow.getAllWindows()[0]; if (win.isMinimized()) win.restore(); win.showInactive() })
      await page.getByLabel('主题风格').click(); await page.getByRole('option').filter({ has: page.getByText(label, { exact: true }) }).click()
      await page.locator('.wg-features-menu summary').click(); await page.getByRole('menuitemcheckbox', { name: '背景流动', exact: true }).click(); await page.keyboard.press('Escape')
      const patches = await page.locator('.wg-inspector,.wg-graph-controls,.wg-menubar').evaluateAll(elements => elements.map(el => { const r = el.getBoundingClientRect(); return { x: r.left + r.width - 28, y: r.top + r.height * .4, width: 12, height: 12 } }))
      const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }))
      const frame = () => app.evaluate(async ({ BrowserWindow }, { patches, viewport }) => {
        const win = BrowserWindow.getAllWindows()[0], pic = await win.webContents.capturePage(), size = pic.getSize(), { width, height } = viewport
        return patches.map(p => { const area = { x: Math.round(p.x * size.width / width), y: Math.round(p.y * size.height / height), width: Math.round(p.width * size.width / width), height: Math.round(p.height * size.height / height) }, bitmap = pic.crop(area).getBitmap(); if (!bitmap.length) throw new Error('Empty zoom capture: ' + JSON.stringify({ size, width, height, area, scales: pic.getScaleFactors() })); const rgb = [0, 0, 0]; for (let i = 0; i < bitmap.length; i += 4) for (let j = 0; j < 3; j++) rgb[j] += bitmap[i + j]; return rgb.map(n => n / (bitmap.length / 4)) })
      }, { patches, viewport })
      const graph = (await page.locator('.wg-graph-canvas').boundingBox())!; await page.mouse.move(graph.x + graph.width * .45, graph.y + graph.height * .65); await page.waitForTimeout(900)
      const reference = await frame(); let maximumChange = 0
      for (let i = 0; i < 20; i++) { await page.mouse.wheel(0, i < 10 ? -50 : 50); const colors = await frame(); maximumChange = Math.max(maximumChange, ...colors.flatMap((rgb, n) => rgb.map((v, c) => Math.abs(v - reference[n][c])))) }
      await expect(page.locator('.wg-liquid-background')).toHaveAttribute('data-paused', 'true')
      await page.locator('.wg-features-menu summary').click(); await page.getByRole('menuitemcheckbox', { name: '背景流动', exact: true }).click(); await page.keyboard.press('Escape')
      await expect(page.locator('.wg-liquid-background')).toHaveAttribute('data-paused', 'false')
      await page.mouse.move(graph.x + graph.width * .45, graph.y + graph.height * .65)
      await page.evaluate(() => {
        (window as any).glassWheelSample = null
        document.addEventListener('wheel', () => {
          const layer = document.querySelector<HTMLElement>('.wg-liquid-background')!, svg = layer.querySelector('svg')!
          ;(window as any).glassWheelSample = { paused: layer.dataset.paused, svgPaused: svg.animationsPaused(), time: svg.getCurrentTime() }
        }, { capture: true, once: true })
      })
      await page.mouse.wheel(0, -40)
      await expect.poll(() => page.evaluate(() => (window as any).glassWheelSample)).not.toBeNull()
      const stopped = await page.evaluate(() => (window as any).glassWheelSample)
      expect(stopped.paused).toBe('true'); expect(stopped.svgPaused).toBe(true)
      const stoppedTime = stopped.time
      await expect(page.locator('.wg-liquid-background')).toHaveAttribute('data-paused', 'false')
      await expect.poll(() => page.locator('.wg-liquid-background svg').evaluate(el => (el as SVGSVGElement).getCurrentTime())).toBeGreaterThan(stoppedTime + .2)
      rows.push({ theme: label, mode, frames: 20, maximumStationaryPixelChange: maximumChange, motionPausesForWheelAndResumes: true })
      console.log(mode, label, 'stationary glass drift', maximumChange)
    }
    for (const label of ['琉璃', '夜璃']) await sample(label, 'versions')
    const folder = path.join(temporary, '项目资料'); await fs.mkdir(folder)
    for (let i = 0; i < 6; i++) await fs.writeFile(path.join(folder, `资料${i}.txt`), '项目资料 ' + i)
    await page.evaluate(async folder => { const p = await window.wordgit.projects!.request({ action: 'create', name: '关系图测试' }) as { id: string }; await window.wordgit.projects!.request({ action: 'import', projectId: p.id, paths: [folder], unpackFolder: true }) }, folder)
    await page.getByLabel('管理模式').click(); await page.getByRole('option', { name: /项目管理/ }).click(); await page.getByRole('listitem', { name: '文档库 关系图测试', exact: true }).click(); await page.getByRole('button', { name: '文件关系图', exact: true }).click()
    await page.getByRole('button', { name: '项目节点 资料0.txt', exact: true }).click()
    expect(await page.locator('.wg-graph-world').evaluate(el => [...el.querySelectorAll('*')].filter(e => getComputedStyle(e).backdropFilter !== 'none').map(e => e.className))).toEqual([])
    for (const label of ['琉璃', '夜璃']) await sample(label, 'projects')
    await fs.writeFile(path.join(output, 'zoom.json'), JSON.stringify({ filtersInScaledContent: filters, samples: rows }, null, 2))
    expect(filters).toEqual([])
    expect(Math.max(...rows.map(r => r.maximumStationaryPixelChange))).toBeLessThan(3)
  } finally { await app.close(); if (path.dirname(temporary) === os.tmpdir() && path.basename(temporary).startsWith('dockitty-glass-zoom-')) await fs.rm(temporary, { recursive: true, force: true }) }
})
