import { chromium } from '@playwright/test'
import { promises as fs } from 'node:fs'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
const dir = path.resolve('docs/brand-lab')
const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true })
try {
 const page = await browser.newPage({ viewport:{width:1200,height:1100} })
 const errors=[];page.on('pageerror',e=>errors.push(e.message))
 await page.goto(pathToFileURL(path.join(dir,'motion-v2.html')).href)
 for(const id of ['A1','A2','A3']) {
  await page.locator(`[data-id="${id}"]`).click()
  if(await page.locator('#direction').textContent() !== `${id} / ${id==='A2'?'0.95':'0.85'} SECONDS`) throw new Error('Variant switch failed')
 }
 await page.locator('[data-id="A1"]').click()
 await page.waitForTimeout(1100)
 await page.screenshot({path:path.join(dir,'motion-v2-page.png')})
 const frames=[]
 for(const id of ['A1','A2','A3']) {
  await page.goto(pathToFileURL(path.join(dir,id+'-motion.svg')).href)
  await page.setViewportSize({width:170,height:170})
  const duration = await page.evaluate(() => Math.max(...document.getAnimations().map(a=>Number(a.effect.getTiming().delay)+Number(a.effect.getTiming().duration))))
  if(duration >= 1000) throw new Error(id+' exceeds one second: '+duration)
  for(const time of [0,120,300,550,950]) {
   await page.evaluate(time=>{for(const a of document.getAnimations()){a.pause();a.currentTime=time}},time)
   if(time===0) {
    const hidden=await page.evaluate(id=> id==='A2' ? ['.eye','.whiskers'].every(s=>Number(getComputedStyle(document.querySelector(s)).opacity)===0) : Number(getComputedStyle(document.querySelector('.sheet')).opacity)===0,id)
    if(!hidden) throw new Error(id+' face appears at start')
   }
   const file=id+'-'+time+'.png';await page.screenshot({path:path.join(dir,file),omitBackground:true});frames.push({id,time,file})
  }
  await page.emulateMedia({reducedMotion:'reduce'})
  const reduced=await page.evaluate(()=>document.getAnimations().length)
  if(reduced!==0) throw new Error('Reduced motion still animates')
  await page.emulateMedia({reducedMotion:'no-preference'})
 }
 const html=`<!doctype html><meta charset="utf-8"><style>body{margin:0;padding:32px;background:#f4f2eb;color:#283c35;font:14px 'Microsoft YaHei',sans-serif}h1{margin:0 0 12px;font-size:26px}p{color:#788575}section{display:grid;grid-template-columns:110px repeat(5,170px);align-items:center;margin:18px 0;gap:14px}img{width:170px;height:170px;display:block}small{display:block;text-align:center;color:#899183;padding-top:8px}b{font-size:18px}</style><h1>A 图标 · 三款整体入场动效</h1><p>起始画面 → 入场过程 → 完整图标；点击网页观看真实动作。</p>${['A1','A2','A3'].map((id,i)=>`<section><b>${id}<br><small>${['纸页展开','一笔成稿','轻落归档'][i]}</small></b>${frames.filter(f=>f.id===id).map(f=>`<div><img src="${f.file}"><small>${(f.time/1000).toFixed(2)} 秒</small></div>`).join('')}</section>`).join('')}`
 await fs.writeFile(path.join(dir,'motion-contact-sheet.html'),html)
 await page.setViewportSize({width:1100,height:820})
 await page.goto(pathToFileURL(path.join(dir,'motion-contact-sheet.html')).href)
 await page.screenshot({path:path.join(dir,'motion-comparison.png'),fullPage:true})
 if(errors.length) throw new Error(errors.join('\n'))
 console.log('All three variants finish under 1000ms; no floating face at t=0; reduced motion is static; switching and frames verified')
} finally {await browser.close()}
