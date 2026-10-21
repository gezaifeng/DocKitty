import { chromium } from '@playwright/test'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import { promises as fs } from 'node:fs'
const dir=path.resolve('docs/brand-lab')
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true})
try {
 const page=await browser.newPage({viewport:{width:1280,height:950}})
 const errors=[];page.on('pageerror',e=>errors.push(e.message))
 await page.goto(pathToFileURL(path.join(dir,'motion-v3.html')).href)
 await page.waitForFunction(()=>!window.motionLab.getState().running)
 const data=await page.evaluate(()=>window.motionLab.studies.map(v=>({id:v.id,duration:v.duration})))
 if(data.length!==3||data.some(v=>v.duration>=1000))throw new Error('Expected three motions under one second')
 await page.screenshot({path:path.join(dir,'motion-v3-page.png'),fullPage:true})
 for(const v of data){
  await page.locator(`[data-play="${v.id}"]`).click()
  await page.waitForFunction(id=>window.motionLab.getState().activeIds.length===1&&window.motionLab.getState().activeIds[0]===id,v.id)
  await page.waitForFunction(()=>!window.motionLab.getState().running)
  await page.locator(`[data-pick="${v.id}"]`).click()
  if(await page.locator(`[data-pick="${v.id}"]`).getAttribute('aria-pressed')!=='true')throw new Error('Preference control failed')
 }
 const times=[0,240,460,680,960]
 for(const time of times){
  await page.evaluate(time=>window.motionLab.seek(time),time)
  for(const v of data)await page.locator('#canvas-'+v.id).screenshot({path:path.join(dir,`${v.id}-frame-${time}.png`)})
 }
 await page.getByLabel('播放速度').selectOption('.25')
 await page.waitForFunction(()=>window.motionLab.getState().speed===.25&&window.motionLab.getState().running)
 await page.getByRole('button',{name:'暂停',exact:true}).click()
 const paused=await page.evaluate(()=>window.motionLab.getState().elapsed)
 await page.waitForTimeout(80)
 if(await page.evaluate(()=>window.motionLab.getState().elapsed)!==paused)throw new Error('Pause failed')
 await page.emulateMedia({reducedMotion:'reduce'})
 await page.getByRole('button',{name:'↻ 同时重播三款'}).click()
 const reduced=await page.evaluate(()=>window.motionLab.getState())
 if(reduced.running||reduced.elapsed!==960)throw new Error('Reduced motion did not stay static')
 await page.setViewportSize({width:540,height:1000})
 if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw new Error('Mobile horizontal overflow')
 const sheet=`<!doctype html><meta charset="utf-8"><style>body{margin:0;padding:28px;background:#f5f3ed;color:#29463b;font:13px 'Microsoft YaHei',sans-serif}h1{font-size:25px;margin:0 0 10px}p{color:#84917b}section{display:grid;grid-template-columns:105px repeat(5,180px);gap:6px;align-items:center;margin:12px 0}img{width:180px;display:block}small{display:block;text-align:center;font-size:11px;color:#88967d}b{font-size:17px;line-height:1.9}</style><h1>稿喵 · 三款连贯互动动画</h1><p>动作前因 → 接触 → 响应 → 停稳。实际动作在 1 秒内完成，网页支持慢放。</p>${data.map((v,i)=>`<section><b>${v.id}<br><small>${['猫爪留稿','折纸成猫','接稿入怀'][i]}</small></b>${times.map(t=>`<div><img src="${v.id}-frame-${t}.png"><small>${t} ms</small></div>`).join('')}</section>`).join('')}`
 await fs.writeFile(path.join(dir,'motion-v3-contact.html'),sheet)
 await page.setViewportSize({width:1100,height:760})
 await page.goto(pathToFileURL(path.join(dir,'motion-v3-contact.html')).href)
 await page.screenshot({path:path.join(dir,'motion-v3-comparison.png'),fullPage:true})
 if(errors.length)throw new Error(errors.join('\n'))
 console.log('Three linked motions < 1s; replay, pause, slow playback, seek, selection, reduced motion and responsive layout verified')
} finally {await browser.close()}
