import { chromium } from '@playwright/test'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import { promises as fs } from 'node:fs'
const dir=path.resolve('docs/brand-lab/runtime')
await fs.mkdir(dir,{recursive:true})
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true})
try {
 const page=await browser.newPage({viewport:{width:1280,height:800}})
 const errors=[];page.on('pageerror',e=>errors.push(e.message))
 await page.addInitScript(()=>{
  window.startupTrace=[]
  window.catFrames=[];const started=performance.now();let firstImage;
  function sampleCat(){const root=document.querySelector('.wg-mascot'),img=root?.querySelector('img');
   if(img){firstImage??=img;window.catFrames.push({time:performance.now(),sameImage:img===firstImage,count:root.querySelectorAll('img').length,loaded:img.complete&&img.naturalWidth>0,opacity:Number(root.style.opacity)})}
   if(performance.now()-started<1500)requestAnimationFrame(sampleCat)
  }requestAnimationFrame(sampleCat)

  new MutationObserver(()=>{const splash=document.querySelector('.wg-startup');const phase=splash?.getAttribute('data-phase')??'entered';if(window.startupTrace.at(-1)?.phase!==phase)window.startupTrace.push({phase,time:performance.now()})}).observe(document,{subtree:true,childList:true,attributes:true,attributeFilter:['data-phase']})
 })
 const url=pathToFileURL(path.resolve('docs/brand-lab/startup-preview.html')).href
 await page.goto(url+'?load=slow')
 await page.waitForFunction(()=>document.querySelector('.wg-startup')?.getAttribute('data-phase')==='waiting')
 if(await page.locator('.wg-mascot img').count()!==1)throw new Error('Mascot must be one complete generated image');
 const connectionAudit=await page.evaluate(()=>({frames:window.catFrames,source:document.querySelector('[data-version-paper]').getBoundingClientRect().toJSON()}));
 if(connectionAudit.frames.length<15||connectionAudit.frames.some(f=>!f.sameImage||f.count!==1))throw new Error('Complete image was replaced or split');
 if(connectionAudit.frames.some(f=>f.opacity>.01&&!f.loaded))throw new Error('Image displayed before decoding');
 if(Math.abs(connectionAudit.source.width-99/1280*250)>.1||Math.abs(connectionAudit.source.height-123/1280*250)>.1)throw new Error('Badge bounds do not match image crop');
 await page.screenshot({path:path.join(dir,'startup-cat.png')})
 if(await page.locator('.wg-app-reveal').count())throw new Error('Workspace entered before library loaded')
 await page.waitForFunction(()=>!document.querySelector('.wg-startup'))
 if(await page.locator('.wg-document-card').count()!==2)throw new Error('Actual workspace failed to render')
 await page.goto(url+'?load=fast')
 await page.waitForFunction(()=>document.querySelector('.wg-startup')?.getAttribute('data-phase')==='expanding')
 const bounds=await page.evaluate(()=>{
  const source=document.querySelector('[data-version-paper]').getBoundingClientRect(),sheet=document.querySelector('.wg-app-reveal');window.actualPage=sheet;
  const nums=sheet.querySelector('.wg-page-origin').style.transform.match(/-?[\d.]+/g).map(Number);
  const result={source:{left:source.left,top:source.top,width:source.width,height:source.height},sheet:{left:nums[0],top:nums[1],width:nums[2]*innerWidth,height:nums[3]*innerHeight}};
  window.openingAnimations=document.getAnimations().filter(a=>a.effect.target.matches('.wg-page-content,.wg-page-origin,.wg-startup-backdrop,.wg-app-reveal'));
  for(const a of window.openingAnimations){a.pause();a.currentTime=180}  return result
 })
 for(const key of ['left','top','width','height'])if(Math.abs(bounds.source[key]-bounds.sheet[key])>.1)throw new Error('Paper origin mismatch: '+key)
 await page.screenshot({path:path.join(dir,'startup-expansion.png')})
 await page.evaluate(()=>window.openingAnimations.forEach(a=>a.play()))
 await page.waitForFunction(()=>!document.querySelector('.wg-startup'))
 await page.screenshot({path:path.join(dir,'startup-entered.png')})
 const finalFrames=await page.evaluate(async()=>{
  const frames=[];for(let i=0;i<120;i++){await new Promise(requestAnimationFrame);const p=document.querySelector('.wg-app-reveal'),c=p.querySelector('.wg-page-content');frames.push({sameNode:p===window.actualPage,transform:getComputedStyle(p).transform,visibility:getComputedStyle(p).visibility,opacity:getComputedStyle(c).opacity})}return frames
 });
 if(finalFrames.some(f=>!f.sameNode||f.transform!=='none'||f.visibility!=='visible'||f.opacity!=='1'))throw new Error('Final frame reset or hidden content');
 const stableShot=await page.screenshot();
 for(let i=0;i<8;i++){await page.waitForTimeout(150);if(!(await page.screenshot()).equals(stableShot))throw new Error('Pixels changed after workspace entry')}
 const trace=await page.evaluate(()=>window.startupTrace)
 if(!trace.some(s=>s.phase==='connecting')||!trace.some(s=>s.phase==='expanding'))throw new Error('Startup phases missing')
 await page.emulateMedia({reducedMotion:'reduce'})
 await page.reload()
 await page.waitForFunction(()=>document.querySelector('.wg-brand')&&!document.querySelector('.wg-startup'))
 if(await page.locator('.wg-app-reveal').getAttribute('inert')!==null)throw new Error('Workspace still inert after entry')
 if(errors.length)throw new Error(errors.join('\n'))
 await fs.writeFile(path.join(dir,'startup-verification.json'),JSON.stringify({bounds,trace,connectionAudit,finalFrames,stableScreenshots:9,errors},null,2))
 console.log('Actual renderer verified: wait for loading, paper origin matches icon, expansion reveals workspace, reduced motion enters directly')
}finally{await browser.close()}



