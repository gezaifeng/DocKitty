import { auditPath } from './auditPath'
import { test, expect, _electron as electron } from '@playwright/test'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
const require=createRequire(path.resolve('apps/desktop/package.json')), {zipSync}=require('fflate')
const hash=(data:Uint8Array)=>createHash('sha256').update(data).digest('hex')

test('independent editing sessions, Git tips, viewport controls and source isolation',async()=>{
 test.setTimeout(180000)
 const temporary=await fs.mkdtemp(path.join(os.tmpdir(),'gaomiao-drafts-')), env={...process.env,WORDGIT_LIBRARY_HOME:temporary};delete env.ELECTRON_RUN_AS_NODE
 const launch=()=>electron.launch({executablePath:process.env.WORDGIT_ELECTRON??path.resolve('node_modules/.cache/electron-runtime/dist/electron.exe'),args:[process.env.WORDGIT_APP??path.resolve('apps/desktop'),'--user-data-dir='+path.join(temporary,'profile')],env})
 const enc=new TextEncoder(),name='投稿论文.docx',source=path.join(temporary,'源稿-勿改.docx')
 const docx=(text:string)=>zipSync({'[Content_Types].xml':enc.encode('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'),'_rels/.rels':enc.encode('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'),'word/document.xml':enc.encode('<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>'+text+'</w:t></w:r></w:p><w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:left="1440" w:right="1440"/></w:sectPr></w:body></w:document>')})
 const original=docx('原始主稿：独立副本，原目录保留。');await fs.writeFile(source,original)
 let app=await launch(),page=await app.firstWindow();const errors:string[]=[]
 const connect=async()=>{page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));await page.emulateMedia({reducedMotion:'reduce'});await expect(page.getByRole('button',{name:'总览工作台',exact:true})).toBeVisible();await app.evaluate(({shell})=>{shell.openPath=async file=>{(globalThis as any).editCopy=file;return ''}})}
 const detail=()=>page.evaluate(name=>window.wordgit.library.detail(name),name)
 const output=auditPath('editing-audit');await fs.mkdir(output,{recursive:true})
 try{
  await connect();await page.evaluate(({source,name})=>window.wordgit.doc.import(source,name),{source,name})
  await expect(page.locator('.wg-document-card')).toHaveCount(1);await page.locator('.wg-document-card').click()
  const first=(await detail()).versions[0].id
  await page.getByRole('button',{name:'版本关系图',exact:true}).click()
  await expect(page.locator('.wg-main-view')).toHaveCSS('opacity','1')
  const canvas=page.locator('.wg-graph-canvas'),box=await canvas.boundingBox();await page.mouse.move(box!.x+300,box!.y+250)
  await page.mouse.wheel(0,-250);await expect.poll(()=>page.locator('.wg-graph-controls span').innerText()).not.toBe('85%')
  const before=await page.locator('.wg-inspector').boundingBox(),separator=page.getByRole('separator',{name:'调整详情栏宽度'}),handle=await separator.boundingBox()
  await page.mouse.move(handle!.x+4,handle!.y+150);await page.mouse.down();await page.mouse.move(handle!.x-180,handle!.y+150,{steps:10});await page.mouse.up()
  expect((await page.locator('.wg-inspector').boundingBox())!.width).toBeGreaterThan(before!.width+100)
  await page.getByRole('button',{name:'重置视角',exact:true}).click()
  const graphNode=page.locator('.wg-graph-node').first()
  for(let attempt=0;attempt<2;attempt++){
   const at=await graphNode.boundingBox()
   await page.mouse.move(at!.x+80,at!.y+60);await page.mouse.down();await page.mouse.move(at!.x+150,at!.y+100,{steps:12})
   const drop=await graphNode.boundingBox();await page.mouse.up()
   const frames=await graphNode.evaluate(async node=>{const result=[];for(let i=0;i<45;i++){await new Promise(requestAnimationFrame);const r=node.getBoundingClientRect();result.push({x:r.x,y:r.y})}return result})
   expect(frames.every(p=>Math.abs(p.x-drop!.x)<1&&Math.abs(p.y-drop!.y)<1)).toBe(true)
  }
  const location=await graphNode.evaluate(e=>({x:parseFloat((e as HTMLElement).style.left),y:parseFloat((e as HTMLElement).style.top)}))
  await expect.poll(async()=>{const p=(await detail()).versions.find(v=>v.id===first)?.position;return p?Math.abs(p.x-location.x)+Math.abs(p.y-location.y):Infinity}).toBeLessThan(.01)
  await page.getByRole('button',{name:'版本节点 导入',exact:true}).dblclick();await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByRole('button',{name:'版本节点 导入',exact:true}).click({button:'right'});await expect(page.getByRole('menu')).toBeVisible();await page.screenshot({path:path.join(output,'右键版本菜单.png')})
  await page.getByRole('menuitem',{name:'沿现有分支创建下一稿'}).click();await page.getByLabel('新稿名称（可留空自动命名）').fill('杂志A下一稿')
  await page.screenshot({path:path.join(output,'独立新稿规则.png')});await page.getByRole('button',{name:'打开并继续编辑',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0)
  const file=await app.evaluate(()=>(globalThis as any).editCopy)
  expect(file).toContain(path.sep+'drafts'+path.sep);expect(file).not.toBe(source);expect(hash(await fs.readFile(file))).toBe(hash(original))
  expect((await detail()).versions).toHaveLength(1)
  // Word-like atomic replacement; watcher must handle add/change coalescing.
  await fs.writeFile(file+'.word-save',docx('第一次Ctrl+S：补充实验说明'));await fs.rename(file+'.word-save',file)
  await expect.poll(async()=>(await detail()).versions.length,{timeout:15000}).toBe(2)
  const child=(await detail()).branchHeads.main;expect((await detail()).versions.find(v=>v.id===child)?.parents).toEqual([first])
  await fs.writeFile(file,docx('第二次Ctrl+S：润色这同一稿'))
  await expect.poll(async()=>(await detail()).versions.find(v=>v.id===child)?.revisionCount,{timeout:15000}).toBe(1)
  expect((await detail()).versions).toHaveLength(2);expect(hash(await fs.readFile(source))).toBe(hash(original))
  await page.screenshot({path:path.join(output,'首次保存后的子版本.png')})
  await app.close();await fs.writeFile(file,docx('软件关闭期间Word保存的内容'));app=await launch();await connect()
  await expect.poll(async()=>(await detail()).versions.find(v=>v.id===child)?.revisionCount,{timeout:15000}).toBe(2)
  await page.locator('.wg-document-card').click();await page.getByRole('button',{name:'版本关系图',exact:true}).click()
  await page.getByRole('button',{name:'版本节点 导入',exact:true}).click({button:'right'})
  await expect(page.getByRole('menuitem',{name:'沿现有分支创建下一稿'})).toBeDisabled()
  await page.getByRole('menuitem',{name:'从此版本新建分支并编辑'}).click();await page.getByLabel('新分支名称',{exact:true}).fill('杂志B投稿')
  await page.getByRole('button',{name:'打开并继续编辑',exact:true}).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  const bfile=await app.evaluate(()=>(globalThis as any).editCopy);expect(bfile).not.toBe(file)
  await fs.writeFile(bfile,docx('杂志B独立投稿格式'))
  await expect.poll(async()=>(await detail()).versions.length,{timeout:15000}).toBe(3)
  const b=(await detail()).branchHeads['杂志B投稿'];expect((await detail()).versions.find(v=>v.id===b)?.parents).toEqual([first]);expect((await detail()).branchHeads.main).toBe(child)
  await expect(page.getByLabel('查看范围')).toHaveValue('current');await expect(page.locator('.wg-graph-node')).toHaveCount(1)
  await page.getByLabel('查看范围').selectOption('all');await expect(page.locator('.wg-graph-node')).toHaveCount(3)
  await page.screenshot({path:path.join(output,'主稿与并列投稿分支.png')})
  await page.getByRole('button',{name:'展开预览',exact:true}).click();await expect(page.getByRole('dialog').locator('.wg-docx-preview section').first()).toBeVisible();await page.screenshot({path:path.join(output,'展开文档预览.png')});await page.getByRole('button',{name:'关闭',exact:true}).click()
  await page.getByRole('button',{name:'总览工作台',exact:true}).click();await expect(page.locator('.wg-document-grid')).toBeVisible();await expect(page.locator('.wg-main-view')).toHaveCSS('opacity','1');await page.screenshot({path:path.join(output,'文档主题边框与完整分割线.png')})
  expect(await page.locator('.wg-document-grid').evaluate(e=>getComputedStyle(e).display)).toBe('grid')
  await page.evaluate(name=>window.wordgit.library.mutate({type:'document',docName:name,deleted:true}),name)
  await fs.writeFile(bfile,docx('回收后，Word旧窗口再次保存'));await page.waitForTimeout(1500)
  expect((await detail()).versions).toHaveLength(3);expect(hash(await fs.readFile(source))).toBe(hash(original));expect(errors).toEqual([])
  await fs.writeFile(path.join(output,'result.json'),JSON.stringify({passed:true,sourceUnchanged:true,initialVersions:1,finalVersions:3,gitParentsCorrect:true,restartResumed:true},null,2))
 }finally{await app.close();if(path.dirname(temporary)===os.tmpdir()&&path.basename(temporary).startsWith('gaomiao-drafts-'))await fs.rm(temporary,{recursive:true,force:true})}
})
