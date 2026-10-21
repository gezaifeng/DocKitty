import { chromium } from '@playwright/test'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
const dir=path.resolve('docs/stats-style-lab')
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true})
try{
 const page=await browser.newPage({viewport:{width:1600,height:1000}})
 await page.goto(pathToFileURL(path.join(dir,'mock.html')).href)
 const data=await page.evaluate(()=>({layouts:labLayouts,themes:labThemes}))
 for(const type of ['stats','themes']){
  const items=type==='stats'?data.layouts:data.themes,columns=type==='stats'?2:3,width=type==='stats'?1600:1800
  await page.setViewportSize({width,height:1200})
  const cards=await Promise.all(items.map(async(item,i)=>{const file=path.join(dir,'runtime',`${type==='stats'?'layout':'theme'}-${item.id}.png`),uri='data:image/png;base64,'+(await fs.readFile(file)).toString('base64');return `<article><img src="${uri}"><div><b>${type==='stats'?item.id:String(i+1).padStart(2,'0')} · ${item.name}</b><span>${type==='stats'?item.subtitle:item.trait}</span></div></article>`}))
  await page.setContent(`<html lang="zh-CN"><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;padding:35px;background:#eeeee7;color:#24392a;font:14px 'Microsoft YaHei',sans-serif}header{display:flex;justify-content:space-between;align-items:end;margin-bottom:24px}h1{font:36px Georgia,'Microsoft YaHei',serif;margin:0}header span{font-size:13px;color:#71806d}main{display:grid;grid-template-columns:repeat(${columns},1fr);gap:20px}article{background:#fffdf7;border:1px solid #cad4c4;border-radius:8px;overflow:hidden}img{width:100%;display:block;border-bottom:1px solid #cad4c4}article div{padding:14px 18px;display:flex;align-items:center;justify-content:space-between;gap:12px}b{font-weight:500;font-size:17px}article span{color:#798774;font-size:11px}</style><header><h1>稿喵 · ${type==='stats'?'8 种统计布局':'12 种整体主题'}</h1><span>浏览器实际截图 · 演示数据 · 确认后再接入软件</span></header><main>${cards.join('')}</main></html>`)
  await page.locator('img').evaluateAll(imgs=>Promise.all(imgs.map(i=>i.decode())))
  await page.screenshot({path:path.join(dir,`${type}-overview.png`),fullPage:true})
 }
 console.log('Rendered both contact sheets from actual browser screenshots')
} finally{await browser.close()}
