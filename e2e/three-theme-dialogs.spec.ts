import { revealInspector } from './inspectorHelpers'
import { auditPath } from './auditPath'
import { test, expect, _electron as electron } from '@playwright/test'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import os from 'node:os'

test('three themes cover all document dialogs, figure menus, compact picker and persisted reload', async () => {
 test.setTimeout(120000)
 const temporary=await fs.mkdtemp(path.join(os.tmpdir(),'gaomiao-theme-dialogs-')),env={...process.env,WORDGIT_LIBRARY_HOME:temporary};delete env.ELECTRON_RUN_AS_NODE
 const app=await electron.launch({executablePath:process.env.WORDGIT_ELECTRON??path.resolve('node_modules/.cache/electron-runtime/dist/electron.exe'),args:[process.env.WORDGIT_APP??path.resolve('apps/desktop'),'--user-data-dir='+path.join(temporary,'profile')],env})
 try{
  const page=await app.firstWindow(),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.emulateMedia({reducedMotion:'reduce'})
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentSize(1440,950))
  await expect(page.getByRole('button',{name:'总览工作台',exact:true})).toBeVisible()
  const source=path.join(temporary,'完整验收.txt');await fs.writeFile(source,'第一稿背景。')
  await page.evaluate(source=>window.wordgit.doc.import(source),source)
  const root=(await page.evaluate(()=>window.wordgit.repo.bootstrap())).repoRoot
  await fs.writeFile(path.join(root,'workspace','完整验收.txt'),'第二稿背景与讨论。');await page.evaluate(()=>window.wordgit.commit.create('完整验收.txt','第二稿','测试'))
  await page.locator('.wg-document-card').click()
  const output=auditPath('three-theme-audit');await fs.mkdir(output,{recursive:true})
  const capture=async(theme:string,screen:string)=>{
   const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();await expect(dialog.getByRole('button',{name:/^(取消|关闭)$/}).first()).toBeInViewport()
   expect(await dialog.evaluate(el=>getComputedStyle(el).backgroundColor)).toBe(await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--wg-surface').trim()).then(v=>v.startsWith('#')?({ '#fff':'rgb(255, 255, 255)','#d4d0c8':'rgb(212, 208, 200)' }[v]??v):v))
   await page.screenshot({animations:'disabled',path:path.join(output,theme+'-'+screen+'.png')});await dialog.getByRole('button',{name:/^(取消|关闭)$/}).first().click()
  }
  for(const [theme,label] of [['raw','粉绿'],['retro','视窗'],['capsule','胶囊']]){
   await page.getByLabel('主题风格').click();await page.getByRole('option').filter({ has: page.getByText(label, { exact: true }) }).click()
   await page.getByRole('button',{name:'新建文档',exact:true}).click();await capture(theme,'new')
   await page.getByRole('button',{name:'导入文档 / 版本',exact:true}).click();await capture(theme,'import')
   await page.getByRole('button',{name:'保存工作区修改',exact:true}).click();await capture(theme,'save')
   await revealInspector(page, '改名称'); await page.getByRole('button',{name:'改名称',exact:true}).click();await capture(theme,'document')
   await revealInspector(page, '编辑版本信息'); await page.getByRole('button',{name:'编辑版本信息',exact:true}).click();await capture(theme,'version')
   await revealInspector(page, '建分支'); await page.getByRole('button',{name:'建分支',exact:true}).click();await capture(theme,'branch')
   await page.getByRole('button',{name:'分类看板',exact:true}).click();await page.getByRole('button',{name:'添加分类',exact:true}).click();await capture(theme,'category')
   await page.getByRole('button',{name:'版本关系图',exact:true}).click()
   await page.getByRole('button',{name:'版本节点 第二稿',exact:true}).click({button:'right'});await page.getByRole('menuitem',{name:'沿现有分支创建下一稿',exact:true}).click();await capture(theme,'edit')
   await page.getByRole('button',{name:'版本节点 第二稿',exact:true}).click({button:'right'});await page.getByRole('menuitem',{name:'展开只读预览',exact:true}).click();await capture(theme,'preview')
   await revealInspector(page, '选择两版比较'); await page.getByRole('button',{name:'选择两版比较',exact:true}).click();await page.getByRole('button',{name:'版本节点 第二稿',exact:true}).click();await page.getByRole('button',{name:'版本节点 导入',exact:true}).click();await revealInspector(page, '开始对比'); await page.getByRole('button',{name:'开始对比',exact:true}).click();await capture(theme,'compare');await page.getByRole('button',{name:/选择中 2\/2/}).click()
   await page.locator('.wg-riffle-figure').click({button:'right'});await expect(page.getByRole('menu',{name:'切换视效'})).toBeVisible();await page.screenshot({path:path.join(output,theme+'-figure-menu.png')});await page.keyboard.press('Escape')
   await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentSize(900,650));await page.getByLabel('主题风格').click();await page.getByRole('option',{name:'系统'}).scrollIntoViewIfNeeded();await expect(page.getByRole('option',{name:'系统'})).toBeInViewport();await page.keyboard.press('Escape')
   await page.reload();await expect(page.getByLabel('主题风格')).toHaveAttribute('data-value',theme);await expect(page.locator('.wg-startup')).toHaveCount(0)
   await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentSize(1440,950));await page.getByRole('button',{name:'总览工作台',exact:true}).click();await page.locator('.wg-document-card').click()
  }
  expect(errors).toEqual([])
 }finally{await app.close();if(path.dirname(temporary)===os.tmpdir()&&path.basename(temporary).startsWith('gaomiao-theme-dialogs-'))await fs.rm(temporary,{recursive:true,force:true})}
})

