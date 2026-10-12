import { test, expect, _electron as electron } from '@playwright/test'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import os from 'node:os'

for(const system of ['light','dark'] as const)test(`visual theme matrix under system ${system}`,async()=>{
 test.setTimeout(240000)
 const temporary=await fs.mkdtemp(path.join(os.tmpdir(),'wordgit-visual-')),env={...process.env,WORDGIT_LIBRARY_HOME:temporary}
 delete env.ELECTRON_RUN_AS_NODE
 const app=await electron.launch({executablePath:process.env.WORDGIT_ELECTRON??path.resolve('node_modules/.cache/electron-runtime/dist/electron.exe'),args:[process.env.WORDGIT_APP??path.resolve('apps/desktop'),'--user-data-dir='+path.join(temporary,'profile')],env})
 try{
  const page=await app.firstWindow(),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message))
  await page.emulateMedia({colorScheme:system,reducedMotion:'reduce'})
  await expect(page.locator('.wg-startup')).toHaveCount(0)
  const output=path.resolve('docs/visual-audit',system);await fs.mkdir(output,{recursive:true})
  const report:Array<unknown>=[]
  async function capture(theme:string,screen:string){
   await page.waitForTimeout(650)
   const audit=await page.evaluate(()=>{
    const css=getComputedStyle(document.documentElement),surface=css.getPropertyValue('--wg-surface').trim(),ink=css.getPropertyValue('--wg-text').trim()
    const blueText=Array.from(document.querySelectorAll('body *')).filter(e=>e.getClientRects().length&&Array.from(e.childNodes).some(n=>n.nodeType===3&&n.textContent?.trim())).filter(e=>{const rgb=getComputedStyle(e).color.match(/[\d.]+/g)?.map(Number);return rgb&&rgb[2]>rgb[0]+25&&rgb[2]>rgb[1]+15}).map(e=>e.textContent?.slice(0,35))
    const context=document.querySelector('.wg-file-center,.wg-stat-content,.wg-settings,.wg-board,.wg-graph-canvas')
    return {theme:document.documentElement.dataset.theme,scheme:css.colorScheme,surface,ink,blueText,bodyBg:getComputedStyle(document.body).backgroundColor,contentBg:context?getComputedStyle(context).backgroundColor:null,width:innerWidth,scrollWidth:document.documentElement.scrollWidth}
   })
   expect(audit.blueText,theme+'/'+screen).toEqual([])
   expect(audit.scrollWidth).toBeLessThanOrEqual(audit.width)
   expect(audit.theme).toBe(theme==='system'?system:theme)
   expect(audit.scheme).toBe((theme==='system'?system:theme)==='dark'?'dark':'light')
   if(theme==='blockframe'){expect(audit.ink).toBe('#171717');expect(audit.surface).toBe('#fff')}
   await page.screenshot({path:path.join(output,theme+'-'+screen+'.png'),scale:'css'})
   report.push({theme,screen,...audit})
  }
  const themes=(process.env.WORDGIT_NEW_THEMES ? [['raw','粉绿方块'],['retro','经典视窗'],['capsule','胶囊文具']] : [['blockframe','BlockFrame'],['light','浅色办公'],['paper','纸张书房'],['dark','石墨暗色'],['system','跟随系统']])
  async function pick(label:string){await page.getByLabel('主题风格').click();await page.getByRole('option',{name:new RegExp(label)}).click()}
  for(const [id,label] of themes){
   await pick(label);await capture(id,'empty')
   for(const [name,filter] of [['文稿','docx'],['表格与数据','xlsx'],['演示资料','pptx'],['全部文档','all']]){
    const button=page.locator('.wg-nav').getByRole('button',{name:new RegExp(name)})
    await button.click();await expect(button).toHaveAttribute('aria-pressed','true')
    await expect(page.locator('.wg-nav button.active')).toHaveCount(1)
    await expect(page.getByLabel('文件类型')).toHaveValue(filter)
    await expect(page.locator('.wg-files-heading strong')).toHaveText(name)
    await capture(id,'filter-'+filter)
   }
   await page.getByLabel('文件类型').selectOption('pptx')
   await expect(page.locator('.wg-nav').getByRole('button',{name:'演示资料'})).toHaveAttribute('aria-pressed','true')
   await page.locator('.wg-nav').getByRole('button',{name:/全部文档/}).click()
   for(const [name,screen] of [['版本关系图','graph'],['分类看板','board'],['版本统计','statistics']]){
    const button=page.getByRole('button',{name,exact:true});await button.click()
    await expect(button).toHaveAttribute('aria-pressed','true')
    await expect(page.getByRole('heading',{name,exact:true})).toBeVisible()
    await expect(page.getByRole('heading',{name:'选择要查看的文档'})).toBeVisible()
    await capture(id,'empty-'+screen)
   }
   await page.getByRole('button',{name:'总览工作台',exact:true}).click()
   await page.getByLabel('主题风格').click();await capture(id,'theme-menu');await page.keyboard.press('Escape')
  }
  const source=path.join(temporary,'视觉验收.txt');await fs.writeFile(source,'第一稿：研究背景与实验设计。')
  await page.evaluate(source=>window.wordgit.doc.import(source,'视觉验收.txt'),source)
  await fs.writeFile(path.join(temporary,'稿喵文档库.wg','workspace','视觉验收.txt'),'第二稿：研究背景、实验设计与讨论。')
  await page.evaluate(()=>window.wordgit.library.mutate({type:'save',docName:'视觉验收.txt',mode:'new',message:'补充讨论'}))
  await expect(page.locator('.wg-document-card')).toHaveCount(1);await page.locator('.wg-document-card').click()
  await app.evaluate(({shell})=>{shell.openPath=async()=>''})
  for(const format of ['docx','xlsx'] as const)await page.evaluate(format=>window.wordgit.library.mutate({type:'createDocument',name:'类型筛选验收',format}),format)
  await expect(page.locator('.wg-document-card')).toHaveCount(3)
  for(const [id,label] of themes){
   await pick(label)
   await page.getByRole('button',{name:'总览工作台',exact:true}).click()
   for(const [name,filter] of [['文稿','docx'],['表格与数据','xlsx'],['演示资料','pptx']]){
    const button=page.locator('.wg-nav').getByRole('button',{name,exact:true});await button.click()
    await expect(button).toHaveAttribute('aria-pressed','true')
    await expect(page.locator('.wg-document-card')).toHaveCount(filter==='pptx'?0:1)
    await capture(id,'populated-'+filter)
   }
   await page.locator('.wg-nav').getByRole('button',{name:/全部文档/}).click()
   const activeFilter=page.locator('.wg-nav button.active')
   await activeFilter.hover();await capture(id,'nav-hover')
   await activeFilter.focus();await expect(activeFilter).toBeFocused();await capture(id,'nav-focus')
   if(id==='blockframe'){
    const state=await activeFilter.evaluate(e=>{const s=getComputedStyle(e);return{border:s.borderTopWidth,shadow:s.boxShadow}})
    expect(state.border).toBe('2px');expect(state.shadow).not.toBe('none')
   }
   await page.getByRole('button',{name:'总览工作台',exact:true}).click();await capture(id,'overview')
   await page.getByRole('button',{name:'版本关系图',exact:true}).click();await capture(id,'graph')
   await page.getByRole('button',{name:'分类看板',exact:true}).click();await capture(id,'board')
   await page.getByRole('button',{name:'版本统计',exact:true}).click();await expect(page.locator('.wg-stat-cards')).toBeVisible();await capture(id,'statistics')
   const indicators=page.locator('.wg-stat-sidebar section button')
   for(let i=0;i<await indicators.count();i++){
    const button=indicators.nth(i),label=(await button.locator('span').count())?await button.locator('span').innerText():await button.innerText()
    await button.click();await expect(button).toHaveAttribute('aria-pressed','true')
    await expect(page.locator('.wg-stat-heading h1')).toHaveText(label.trim())
    await expect(page.locator('.wg-stat-heading h1')).toBeInViewport()
    await expect(page.locator('.wg-stat-sidebar button.active')).toHaveCount(1)
   }
   await page.getByLabel('保存与备份设置').click();await expect(page.getByRole('heading',{name:'存储统计',exact:true})).toBeVisible();await capture(id,'settings')
   await page.getByRole('button',{name:'返回工作台',exact:true}).click()
   await page.getByRole('button',{name:'使用帮助',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();await capture(id,'help');await expect(page.getByRole('button',{name:'关闭',exact:true})).toBeInViewport();await page.getByRole('button',{name:'关闭',exact:true}).click()
   await page.getByRole('button',{name:'新建文档',exact:true}).click();await capture(id,'new-dialog');await page.getByRole('button',{name:'取消',exact:true}).click()
   await page.getByText('文件',{exact:true}).click();await capture(id,'file-menu');await page.getByText('文件',{exact:true}).click()
  }
  await pick(process.env.WORDGIT_NEW_THEMES ? '胶囊文具' : 'BlockFrame');await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentSize(900,650));await capture(process.env.WORDGIT_NEW_THEMES ? 'capsule' : 'blockframe','compact')
  expect(await app.evaluate(({Menu})=>Menu.getApplicationMenu())).toBeNull()
  expect(errors).toEqual([])
  await fs.writeFile(path.join(output,'report.json'),JSON.stringify({screens:report,errors},null,2))
 }finally{await app.close();if(path.dirname(temporary)===os.tmpdir()&&path.basename(temporary).startsWith('wordgit-visual-'))await fs.rm(temporary,{recursive:true,force:true})}
})
