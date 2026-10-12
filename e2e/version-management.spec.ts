import { test, expect, _electron as electron } from '@playwright/test'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import os from 'node:os'

test('editable version connections, branch membership, confirmed source deletion, cards and pet interactions', async () => {
 test.setTimeout(180000)
 const temporary=await fs.mkdtemp(path.join(os.tmpdir(),'gaomiao-management-')),env={...process.env,WORDGIT_LIBRARY_HOME:temporary};delete env.ELECTRON_RUN_AS_NODE
 const app=await electron.launch({executablePath:process.env.WORDGIT_ELECTRON??path.resolve('node_modules/.cache/electron-runtime/dist/electron.exe'),args:[process.env.WORDGIT_APP??path.resolve('apps/desktop'),'--user-data-dir='+path.join(temporary,'profile')],env})
 const output=path.resolve('docs/management-audit');await fs.mkdir(output,{recursive:true})
 try{
  const page=await app.firstWindow(),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.emulateMedia({reducedMotion:'reduce'})
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentSize(1600,1000))
  await expect(page.getByRole('button',{name:'总览工作台',exact:true})).toBeVisible()
  const original=path.join(temporary,'原目录保留.txt'),source=path.join(temporary,'测试导入稿.txt'),name='投稿论文.txt'
  await fs.writeFile(original,'原论文内容');await fs.copyFile(original,source)
  const first=(await page.evaluate(({source,name})=>window.wordgit.doc.import(source,name),{source,name})).commitId
  const repository=await page.evaluate(()=>window.wordgit.repo.bootstrap())
  const workspace=path.join(repository.repoRoot,'workspace',name)
  await fs.writeFile(workspace,'第二稿修改');const second=(await page.evaluate(name=>window.wordgit.commit.create(name,'第二稿','测试'),name)).commitId!
  await fs.writeFile(workspace,'第三稿修改');const third=(await page.evaluate(name=>window.wordgit.commit.create(name,'第三稿','测试'),name)).commitId!
  await page.evaluate(({name,first})=>window.wordgit.branch.create(name,'TIP投稿',{fromCommitId:first}),{name,first})
  for(const [id,x] of [[first,60],[second,340],[third,620]] as const)await page.evaluate(({name,id,x})=>window.wordgit.library.mutate({type:'version',docName:name,versionId:id,position:{x,y:100}}),{name,id,x})
  for(const [file,text] of [['研究数据.csv','值\n1\n2'],['文献笔记.md','# 笔记']] as const){const filePath=path.join(temporary,file);await fs.writeFile(filePath,text);await page.evaluate(source=>window.wordgit.doc.import(source),filePath)}
  const category=(await page.evaluate(name=>window.wordgit.library.mutate({type:'category',docName:name,action:'create',name:'投稿稿'}),name)).categoryId!
  await page.evaluate(({name,id,categoryId})=>window.wordgit.library.mutate({type:'version',docName:name,versionId:id,categoryId}),{name,id:second,categoryId:category})
  const detail=()=>page.evaluate(name=>window.wordgit.library.detail(name),name)
  await expect(page.locator('.wg-document-card')).toHaveCount(3)
  await page.locator('.wg-document-card').filter({hasText:name}).click()
  const themes=(process.env.WORDGIT_NEW_THEMES ? [['raw','粉绿方块'],['retro','经典视窗'],['capsule','胶囊文具']] : [['blockframe','BlockFrame'],['light','浅色办公'],['paper','纸张书房'],['dark','石墨暗色']]) as Array<[string,string]>
  for(const [theme,label] of themes){await page.getByLabel('主题风格').click();await page.getByRole('option',{name:new RegExp(label)}).click();await expect(page.locator('.wg-main-view')).toHaveCSS('opacity','1');await page.screenshot({animations:'disabled',path:path.join(output,theme+'-cards.png')});const cat=page.getByRole('button',{name:'稿喵小猫，右键抚摸'});await cat.hover();await expect(cat).toHaveCSS('background-color','rgba(0, 0, 0, 0)');await expect(cat).toHaveCSS('box-shadow','none');await expect(cat.locator('img')).not.toHaveCSS('transform','none');expect(await cat.locator('img').evaluate(img=>img.getAnimations().filter(a=>a instanceof CSSAnimation).length)).toBe(0);await page.screenshot({animations:'disabled',path:path.join(output,theme+'-cat-hover.png')});await cat.click({button:'right'});await expect(page.getByRole('menu',{name:'抚摸小猫'})).toBeVisible();await page.screenshot({animations:'disabled',path:path.join(output,theme+'-pet.png')});await page.getByRole('menuitem',{name:'轻轻挠下巴'}).click();await expect(page.locator('.wg-cat-reaction')).toHaveText('呼噜呼噜…')}
  await page.getByLabel('主题风格').click();await page.getByRole('option',{name:/BlockFrame/}).click()
  await page.emulateMedia({reducedMotion:'no-preference'})
  for(const gesture of ['摸摸脑袋','顺顺毛','轻轻挠下巴']){
   await page.getByRole('button',{name:'稿喵小猫，右键抚摸'}).click({button:'right'});await page.getByRole('menuitem',{name:gesture,exact:true}).click()
   const frames=await page.locator('.wg-sidebar-cat img').evaluate(async img=>{const samples=[];for(let i=0;i<55;i++){await new Promise(requestAnimationFrame);samples.push(getComputedStyle(img).transform)}return samples})
   expect(frames.some(frame=>frame!=='none')).toBe(true);expect(frames.at(-1)).toBe('none');await expect(page.locator('.wg-sidebar-cat img')).toHaveCount(1)
  }
  await page.emulateMedia({reducedMotion:'reduce'})
  await page.getByRole('button',{name:'版本关系图',exact:true}).click();await page.getByLabel('查看分支').selectOption('all')
  const right=async(title:string,action:string)=>{await page.getByRole('button',{name:'版本节点 '+title,exact:true}).click({button:'right'});await page.getByRole('menuitem',{name:action,exact:true}).click()}
  const confirm=async()=>{await page.getByRole('button',{name:'确认',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0)}
  for(const [theme,label] of themes){
   await page.getByLabel('主题风格').click();await page.getByRole('option',{name:new RegExp(label)}).click()
   await right('第二稿','编辑备注');await page.getByRole('textbox',{name:'版本备注',exact:true}).fill('TIP 投稿格式调整\n待导师确认摘要。');await page.screenshot({animations:'disabled',path:path.join(output,theme+'-note-dialog.png')});await confirm()
   await expect(page.getByRole('region',{name:'版本备注'})).toContainText('待导师确认摘要。');await page.screenshot({animations:'disabled',path:path.join(output,theme+'-note-detail.png')})
  }
  expect((await detail()).versions.find(v=>v.id===second)?.note).toBe('TIP 投稿格式调整\n待导师确认摘要。')
  await page.getByRole('button',{name:'分类看板',exact:true}).click();await page.locator('.wg-version-card').filter({hasText:'第二稿'}).click({button:'right'});await page.getByRole('menuitem',{name:'编辑备注',exact:true}).click();await expect(page.getByRole('textbox',{name:'版本备注',exact:true})).toHaveValue('TIP 投稿格式调整\n待导师确认摘要。');await page.getByRole('button',{name:'取消',exact:true}).click()
  await page.getByRole('button',{name:'总览工作台',exact:true}).click();await page.locator('.wg-history-rows button').filter({hasText:'第二稿'}).click({button:'right'});await page.getByRole('menuitem',{name:'编辑备注',exact:true}).click();await expect(page.getByRole('textbox',{name:'版本备注',exact:true})).toHaveValue('TIP 投稿格式调整\n待导师确认摘要。');await page.getByRole('button',{name:'取消',exact:true}).click()
  await page.getByRole('button',{name:'版本关系图',exact:true}).click()
  await expect(page.locator('.wg-graph-node').filter({hasText:'第二稿'}).locator('.wg-category-tag')).toHaveText('投稿稿');await expect(page.locator('.wg-graph-node').filter({hasText:'第三稿'}).locator('.wg-category-tag')).toHaveCount(0)
  await page.screenshot({animations:'disabled',path:path.join(output,'branch-category-tags.png')})
  const positionsBefore=(await detail()).versions.map(v=>[v.id,v.position])
  const cardBoxesBefore=await page.locator('.wg-node-body').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y}}))
  await right('第二稿','断开与前版本的连接');await confirm()
  await right('第二稿','断开与后版本的连接');await confirm()
  await expect.poll(async()=>(await detail()).versions.every(v=>!v.parents.length)).toBe(true)
  await expect(page.locator('.wg-edges path')).toHaveCount(0)
  expect((await detail()).versions.map(v=>[v.id,v.position])).toEqual(positionsBefore)
  expect(await page.locator('.wg-node-body').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y}}))).toEqual(cardBoxesBefore)
  await expect(page.locator('.wg-node-body')).toHaveCount(3)
  await right('第二稿','整理布局');await expect.poll(async()=>new Set((await detail()).versions.map(v=>JSON.stringify(v.position))).size).toBe(3)
  await page.locator('.wg-graph-canvas').click({button:'right',position:{x:1000,y:400}});await expect(page.getByRole('menu',{name:'关系图操作'})).toBeVisible();await page.screenshot({animations:'disabled',path:path.join(output,'tidy-layout-menu.png')});await page.getByRole('menuitem',{name:'整理布局',exact:true}).click()
  await page.screenshot({animations:'disabled',path:path.join(output,'independent-versions.png')})
  await right('第二稿','手动连接到前版本');await expect(page.getByRole('button',{name:'取消连接',exact:true})).toBeVisible();await page.getByRole('button',{name:'版本节点 第二稿',exact:true}).click();await page.getByRole('button',{name:'版本节点 导入',exact:true}).click();await expect(page.getByRole('button',{name:'取消连接',exact:true})).toHaveCount(0)
  await right('第二稿','手动连接到后版本');await page.getByRole('button',{name:'取消连接',exact:true}).click();await expect(page.getByRole('button',{name:'取消连接',exact:true})).toHaveCount(0);await right('第二稿','手动连接到后版本');await page.getByRole('button',{name:'版本节点 第二稿',exact:true}).click();await page.screenshot({animations:'disabled',path:path.join(output,'click-connect.png')});await page.getByRole('button',{name:'版本节点 第三稿',exact:true}).click();await expect(page.getByRole('button',{name:'取消连接',exact:true})).toHaveCount(0)
  await expect(page.locator('.wg-edges path')).toHaveCount(2)
  for(const [theme,label] of themes){
   await page.getByLabel('主题风格').click();await page.getByRole('option',{name:new RegExp(label)}).click()
   await right('第二稿','修改分支归属');await page.screenshot({animations:'disabled',path:path.join(output,theme+'-relations-dialog.png')});await page.getByRole('button',{name:'取消',exact:true}).click()
   await right('导入','删除版本…');await page.getByText('彻底删除该版本和文件',{exact:true}).click();await page.screenshot({animations:'disabled',path:path.join(output,theme+'-delete-dialog.png')});await page.getByRole('button',{name:'取消',exact:true}).click()
  }
  await page.getByLabel('主题风格').click();await page.getByRole('option',{name:/BlockFrame/}).click()
  await right('导入','手动连接到前版本');await page.getByRole('button',{name:'版本节点 导入',exact:true}).click();await page.getByRole('button',{name:'版本节点 第三稿',exact:true}).click();await expect(page.locator('.wg-error')).toContainText('循环');await page.getByRole('button',{name:'取消连接',exact:true}).click()
  await right('第二稿','修改分支归属');await page.getByLabel('新的分支归属').selectOption('TIP投稿');await expect(page.getByLabel('连接版本')).toHaveValue('');await page.getByLabel('连接版本').selectOption('');await page.screenshot({animations:'disabled',path:path.join(output,'move-branch-dialog.png')});await confirm()
  await expect.poll(async()=>(await detail()).versions.find(v=>v.id===second)?.branches).toEqual(['TIP投稿'])
  expect((await detail()).versions.find(v=>v.id===third)?.parents).toEqual([])
  await page.getByLabel('查看分支').selectOption('TIP投稿');await expect(page.locator('.wg-node-body')).toHaveCount(1);await expect(page.locator('.wg-owner-tag')).toHaveText('TIP投稿');await page.getByLabel('查看分支').selectOption('all');await page.screenshot({animations:'disabled',path:path.join(output,'moved-branch.png')})
  await page.getByRole('button',{name:'版本统计',exact:true}).click();await page.locator('.wg-stat-sidebar select').selectOption('main');await expect(page.locator('.wg-stat-content')).toContainText('范围内版本');await page.screenshot({animations:'disabled',path:path.join(output,'independent-statistics.png')})
  await page.getByRole('button',{name:'版本关系图',exact:true}).click()
  await right('第三稿','删除版本…');await confirm();await expect.poll(async()=>(await detail()).versions.find(v=>v.id===third)?.deletedAt).toBeTruthy();expect(await fs.readFile(source,'utf8')).toBe('原论文内容')
  await page.evaluate(({name,id})=>window.wordgit.library.mutate({type:'version',docName:name,versionId:id,deleted:false}),{name,id:third})
  await expect(page.getByRole('button',{name:'版本节点 第三稿',exact:true})).toBeVisible()
  await right('导入','删除版本…');await page.getByText('彻底删除该版本和文件',{exact:true}).click()
  await page.getByLabel('同时删除导入到软件时的那份文件').check();await expect(page.locator('.wg-delete-details code')).toHaveText(source)
  await page.getByRole('button',{name:'确认',exact:true}).click();await expect(page.getByRole('dialog').getByRole('alert')).toContainText('勾选永久删除确认')
  await page.getByLabel('我确认永久删除该版本及以上勾选的文件').check();await page.screenshot({animations:'disabled',path:path.join(output,'confirmed-deletion.png')});await confirm()
  await expect(fs.access(source)).rejects.toThrow();expect(await fs.readFile(original,'utf8')).toBe('原论文内容')
  expect((await detail()).versions.map(v=>v.id)).not.toContain(first)
  expect((await detail()).versions.find(v=>v.id===second)?.parents).toEqual([])
  const configFile=path.join(repository.repoRoot,'repo.yaml'),configuration=JSON.parse(await fs.readFile(configFile,'utf8'));configuration.isolatedSources=true;await fs.writeFile(configFile,JSON.stringify(configuration))
  const added=(await page.evaluate(source=>window.wordgit.doc.import(source,'隔离新增.txt'),original)).commitId
  const isolated=await page.evaluate(()=>window.wordgit.library.detail('隔离新增.txt')),isolatedSource=isolated.versions[0].sourcePath!
  expect(isolatedSource.startsWith(path.join(repository.repoRoot,'imports')+path.sep)).toBe(true)
  await page.evaluate(({id,source})=>window.wordgit.library.mutate({type:'purgeVersion',docName:'隔离新增.txt',versionId:id,deleteSource:true,confirmedSourcePath:source}),{id:added,source:isolatedSource})
  expect(await fs.readFile(original,'utf8')).toBe('原论文内容');await expect(fs.access(isolatedSource)).rejects.toThrow()
  expect(errors).toEqual([])
  await fs.writeFile(path.join(output,'verification.json'),JSON.stringify({passed:true,originalUnchanged:true,testSourceDeleted:true,futureImportsIsolated:true,cycleRejected:true,branchReassigned:true,disconnectedVersionsRetained:true,themes:themes.map(t=>t[0])},null,2))
 }finally{await app.close();if(path.dirname(temporary)===os.tmpdir()&&path.basename(temporary).startsWith('gaomiao-management-'))await fs.rm(temporary,{recursive:true,force:true})}
})


