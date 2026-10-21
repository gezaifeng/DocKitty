import { chromium } from '@playwright/test'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true })
try {
 const page = await browser.newPage({ viewport: { width: 1280, height: 1050 }, deviceScaleFactor: 1 })
 const errors = []
 page.on('pageerror', e => errors.push(e.message))
 await page.goto(pathToFileURL(path.resolve('docs/brand-lab/index.html')).href)
 await page.locator('.grid').screenshot({path:'docs/brand-lab/icons-comparison.png'})
 for(const id of ['A','B','C','D']) {
  await page.getByRole('button',{name:'选择 '+id,exact:false}).click()
  await page.waitForTimeout(650)
  await page.locator('.stage').screenshot({path:'docs/brand-lab/'+id+'-preview.png',animations:'disabled'})
 }
 if(errors.length) throw new Error(errors.join('\n'))
 console.log('Four icon/animation directions render without page errors')
} finally { await browser.close() }

