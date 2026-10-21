import {chromium} from '@playwright/test'
import {pathToFileURL} from 'node:url'
import path from 'node:path'
import {promises as fs} from 'node:fs'
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true})
try{
 const page=await browser.newPage({viewport:{width:1280,height:800}})
 await page.addInitScript(()=>{
  window.flashAudit={frames:[],cancellations:[]};const native=Element.prototype.animate;
  Element.prototype.animate=function(...args){const animation=native.apply(this,args),cancel=animation.cancel.bind(animation),target=this;
   animation.cancel=()=>{cancel();const bg=document.querySelector('.wg-startup-backdrop');window.flashAudit.cancellations.push({target:target.className,time:performance.now(),backdropOpacity:bg?getComputedStyle(bg).opacity:null,pageZ:document.querySelector('.wg-app-reveal')?.style.zIndex})};return animation}
  const begin=performance.now();function sample(){const splash=document.querySelector('.wg-startup'),page=document.querySelector('.wg-app-reveal'),head=document.querySelector('[data-part=head]'),faces=['head','look','blink'].map(n=>document.querySelector('[data-part='+n+']')).filter(Boolean),bg=document.querySelector('.wg-startup-backdrop');
   window.flashAudit.frames.push({time:performance.now(),phase:splash?.getAttribute('data-phase')??'entered',headCoverage:faces.length?1-faces.reduce((a,n)=>a*(1-Number(getComputedStyle(n).opacity)),1):null,headOpacity:head?getComputedStyle(head).opacity:null,backdropOpacity:bg?getComputedStyle(bg).opacity:null,pageVisibility:page?getComputedStyle(page).visibility:null,pageOpacity:page?getComputedStyle(page.querySelector('.wg-page-content')).opacity:null,pageTransform:page?getComputedStyle(page).transform:null});if(performance.now()-begin<4500)requestAnimationFrame(sample)}requestAnimationFrame(sample)
 })
 await page.goto(pathToFileURL(path.resolve('docs/brand-lab/startup-preview.html')).href+'?load=slow');await page.waitForTimeout(4700)
 const result=await page.evaluate(()=>window.flashAudit);await fs.writeFile('docs/brand-lab/runtime/'+(process.argv[2]??'startup-flash-audit.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({samples:result.frames.length,minHeadCoverage:Math.min(...result.frames.filter(f=>f.headCoverage!==null).map(f=>f.headCoverage)),cancelledBackgroundRestore:result.cancellations.filter(c=>c.backdropOpacity==='1').map(c=>c.target),enteredHidden:result.frames.filter(f=>f.phase==='entered'&&f.pageVisibility==='visible'&&f.pageOpacity!=='1').length}))
}finally{await browser.close()}
