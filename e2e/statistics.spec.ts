import { test,expect,_electron as electron } from '@playwright/test'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import os from 'node:os'

test('real branch statistics, left navigation, staggered transitions and BlockFrame branding',async()=>{
 const temporary=await fs.mkdtemp(path.join(os.tmpdir(),'wordgit-stats-e2e-')),env={...process.env,WORDGIT_LIBRARY_HOME:temporary}
 delete env.ELECTRON_RUN_AS_NODE
 const app=await electron.launch({executablePath:process.env.WORDGIT_ELECTRON??path.resolve('node_modules/.cache/electron-runtime/dist/electron.exe'),args:[process.env.WORDGIT_APP??path.resolve('apps/desktop'),'--user-data-dir='+path.join(temporary,'profile')],env})
 try{
  await app.evaluate(({shell})=>{shell.openPath=async()=>''})
  const page=await app.firstWindow(),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message))
  await expect(page.locator('.wg-startup')).toHaveCount(0)
  await expect(page.getByLabel('主题风格')).toHaveAttribute('data-value','blockframe')
  const name='统计验收.txt',source=path.join(temporary,name);await fs.writeFile(source,'甲乙丙')
  await page.evaluate(async({source,name})=>window.wordgit.doc.import(source,name),{source,name})
  let detail=await page.evaluate(name=>window.wordgit.library.detail(name),name)
  const branch=detail.currentBranch
  await page.evaluate(async({name,branch})=>window.wordgit.branch.create(name,'精简路线',{fromBranch:branch}),{name,branch})
  const root=path.join(temporary,'稿喵文档库.wg');await fs.writeFile(path.join(root,'workspace',name),'甲乙丙丁戊')
  await page.evaluate(async name=>window.wordgit.library.mutate({type:'save',docName:name,mode:'new',message:'补充内容'}),name)
  await page.getByRole('button',{name:'总览工作台'}).click()
  await expect(page.locator('.wg-document-card')).toHaveCount(1)
  await page.locator('.wg-document-card').click()
  await page.getByRole('button',{name:'版本统计',exact:true}).click()
  await expect(page.locator('.wg-stat-sidebar')).toBeVisible()
  await expect(page.locator('.wg-stat-heading h1')).toHaveText('文本字符数')
  await expect(page.locator('.wg-stat-cards section').nth(1).locator('strong')).toHaveText('5')
  const sidebar=await page.locator('.wg-stat-sidebar').boundingBox(),content=await page.locator('.wg-stat-content').boundingBox()
  expect(sidebar!.x).toBeLessThan(content!.x)
  await page.getByRole('button',{name:'新增内容'}).click()
  await expect(page.locator('.wg-stat-heading h1')).toHaveText('新增内容')
  await expect(page.locator('.wg-stat-cards section').nth(1).locator('strong')).toHaveText('2')
  const motion=await page.locator('.wg-stat-cards section').evaluateAll(nodes=>nodes.map(n=>({name:getComputedStyle(n).animationName,delay:getComputedStyle(n).animationDelay})))
  expect(motion.map(m=>m.delay)).toEqual(['0s','0.045s','0.09s'])
  await page.getByLabel('统计分支').selectOption('精简路线')
  await expect(page.locator('.wg-stat-cards section').first().locator('strong')).toHaveText('0')
  expect((await page.evaluate(name=>window.wordgit.library.detail(name),name)).currentBranch).toBe(branch)
  await page.getByLabel('统计分支').selectOption(branch)
  await page.getByRole('button',{name:'文件大小'}).click()
  await expect(page.locator('.wg-stat-heading h1')).toHaveText('文件大小')
  await page.getByRole('button',{name:'保存活动',exact:true}).click();await expect(page.locator('.wg-stat-activity')).toBeVisible()
  await page.getByRole('button',{name:'文本字符数'}).click()
  await page.locator('.wg-stat-sidebar').evaluate(el=>el.scrollTop=0)
  await page.waitForTimeout(550)
  await fs.mkdir('docs/brand-lab/runtime',{recursive:true});await page.screenshot({path:'docs/brand-lab/runtime/statistics-blockframe.png',scale:'css'})
  await page.evaluate(async()=>{await Promise.all(document.getAnimations().filter(animation=>Number.isFinite(Number(animation.effect?.getTiming().iterations))).map(animation=>animation.finished.catch(()=>{})))})
  const first=await page.screenshot();await page.waitForTimeout(200);expect((await page.screenshot()).equals(first)).toBeTruthy()
  await page.emulateMedia({reducedMotion:'reduce'});await page.getByRole('button',{name:'覆盖修订次数'}).click()
  expect(await page.locator('.wg-stat-cards section').first().evaluate(n=>getComputedStyle(n).animationName)).toBe('none')
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentSize(900,650))
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy()
  for(const format of ['docx','xlsx'] as const){
   const created=await page.evaluate(async format=>window.wordgit.library.mutate({type:'createDocument',name:'格式统计-'+format,format}),format)
   const office=await page.evaluate(async name=>{const d=await window.wordgit.library.detail(name);return window.wordgit.stats.versions(name,d.currentBranch)},created.docName!)
   expect(office.metrics.some(m=>m.id===(format==='docx'?'paragraphs':'sheets'))).toBeTruthy()
   expect(office.versions[0].unavailable).toBeUndefined()
  }
  expect(errors).toEqual([])
 }finally{await app.close();if(path.dirname(temporary)===os.tmpdir()&&path.basename(temporary).startsWith('wordgit-stats-e2e-'))await fs.rm(temporary,{recursive:true,force:true})}
})
