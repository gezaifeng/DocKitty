import { chromium } from '@playwright/test'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
const dir=path.resolve('docs/stats-style-lab'),runtime=path.join(dir,'runtime')
await fs.mkdir(runtime,{recursive:true})
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true})
try {
 const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[],failed=[],report={layouts:[],themes:[],gallery:[]}
 page.on('pageerror',e=>errors.push(e.message));page.on('requestfailed',r=>failed.push(r.url()))
 const mock=pathToFileURL(path.join(dir,'mock.html')).href
 await page.goto(mock)
 const {layouts,themes}=await page.evaluate(()=>({layouts:labLayouts,themes:labThemes}))
 async function geometry(){return page.evaluate(()=>({width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight,overflow:Array.from(document.querySelectorAll('.detail,.pane,.document-card,.metric,.section-title')).filter(el=>el.scrollWidth>el.clientWidth+2).map(el=>el.className)}))}
 for(const layout of layouts){
  await page.goto(`${mock}?layout=${layout.id}&theme=${layout.theme}`)
  await page.locator('.brand img,.stamp img,.carddesk-head img,.gazette-cat img').evaluateAll(imgs=>Promise.all(imgs.map(i=>i.decode())))
  const initial=await geometry()
  if(initial.scrollWidth>1280||initial.scrollHeight>802||initial.overflow.length)throw new Error('Layout overflow '+layout.id+' '+JSON.stringify(initial))
  await page.screenshot({path:path.join(runtime,`layout-${layout.id}.png`)})
  await page.locator('#branch').selectOption('精简投稿')
  if(!(await page.locator('body').innerText()).includes('6,100'))throw new Error('Branch did not update '+layout.id)
  await page.locator('[data-version="5"]').first().click()
  const detail=await page.locator('.detail').first().innerText()
  if(!detail.includes('第 06 稿')||!(await page.locator('body').innerText()).includes('7,600'))throw new Error('Version did not update '+layout.id)
  await page.locator('[data-action="compare"]').first().click()
  if(!await page.locator('dialog').isVisible())throw new Error('Comparison did not open '+layout.id)
  await page.locator('dialog button').click()
  if(layout.id==='H'){await page.locator('[data-section="4"][data-version="3"]').click();if(!(await page.locator('.matrix-caption').innerText()).includes('结论展望'))throw new Error('Section selection failed')}
  if(layout.id==='E'){const win=page.locator('.files-window'),before=await win.boundingBox(),handle=page.locator('.files-window .window-title');const r=await handle.boundingBox();await page.mouse.move(r.x+40,r.y+12);await page.mouse.down();await page.mouse.move(r.x+90,r.y+52);await page.mouse.up();const after=await win.boundingBox();if(Math.abs(after.x-before.x-50)>2||Math.abs(after.y-before.y-40)>2)throw new Error('Desktop window did not drag')}
  if(layout.id==='F'){await page.locator('#scrub').fill('2');await page.locator('#scrub').dispatchEvent('input');if(!(await page.locator('.detail').innerText()).includes('第 03 稿'))throw new Error('Version scrubber failed')}
  report.layouts.push({id:layout.id,initial,branchAndVersion:true,comparison:true})
 }
 for(const theme of themes){
  await page.goto(`${mock}?view=library&theme=${theme.id}`)
  await page.locator('img').evaluateAll(imgs=>Promise.all(imgs.map(i=>i.decode())))
  const initial=await geometry()
  if(initial.scrollWidth>1280||initial.scrollHeight>802||initial.overflow.length)throw new Error('Theme overflow '+theme.id+' '+JSON.stringify(initial))
  await page.screenshot({path:path.join(runtime,`theme-${theme.id}.png`)})
  await page.locator('#search').fill('研究')
  if(await page.locator('.document-card:visible').count()!==1)throw new Error('Search failed '+theme.id)
  await page.locator('[data-tab="版本"]').click();if(await page.locator('.library-versions').count()!==1)throw new Error('Version tab failed '+theme.id)
  await page.locator('[data-tab="统计"]').click();if(await page.locator('.library-stats').count()!==1)throw new Error('Statistics tab failed '+theme.id)
  report.themes.push({id:theme.id,initial,search:true,tabs:true})
 }
 const gallery=pathToFileURL(path.join(dir,'index.html')).href
 for(const viewport of [{width:1440,height:1000},{width:1024,height:768},{width:390,height:844}]){
  await page.setViewportSize(viewport);await page.goto(gallery);await page.locator('#preview').contentFrame().locator('.notebook').waitFor()
  await page.waitForTimeout(100)
  if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1))throw new Error('Gallery horizontal overflow '+viewport.width)
  await page.screenshot({path:path.join(runtime,`gallery-${viewport.width}.png`),fullPage:true});report.gallery.push(viewport)
 }
 await page.setViewportSize({width:1440,height:1000})
 await page.goto(gallery);await page.locator('#choose').click();await page.locator('#preferences').click()
 if(!(await page.locator('#selection-text').inputValue()).includes('统计布局 A'))throw new Error('Shortlist failed')
 await page.locator('#close-dialog').click();await page.locator('[data-mode="themes"]').click();await page.locator('[data-pick="forest"]').first().click();await page.locator('#preview').contentFrame().locator('[data-theme="forest"]').waitFor()
 await page.locator('#choose').click();await page.locator('#preferences').click();if(!(await page.locator('#selection-text').inputValue()).includes('森林书房'))throw new Error('Theme shortlist failed');await page.locator('#close-dialog').click()
 await page.locator('[data-mode="sources"]').click();if(await page.locator('.source-card').count()!==34)throw new Error('Source catalog incomplete')
 const links=await page.locator('.source-card').evaluateAll(els=>els.map(e=>({href:e.getAttribute('href'),image:e.querySelector('img').getAttribute('src')})))
 for(const link of links){await fs.access(path.resolve(dir,link.href));await fs.access(path.resolve(dir,link.image))}
 await page.emulateMedia({reducedMotion:'reduce'});await page.goto(mock+'?layout=A');if(await page.locator('[data-version]').count()===0)throw new Error('Reduced motion render failed')
 if(errors.length||failed.length)throw new Error(JSON.stringify({errors,failed}))
 report.errors=errors;report.failedRequests=failed;report.sourceTemplates=links.length;report.shortlist=true
 await fs.writeFile(path.join(runtime,'verification.json'),JSON.stringify(report,null,2))
 console.log('Verified 8 layouts, 13 themes, 34 template links, branch/version interaction, comparison, search, desktop drag, shortlist and 3 gallery sizes')
} finally {await browser.close()}
