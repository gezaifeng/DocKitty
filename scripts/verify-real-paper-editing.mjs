import { _electron as electron, expect } from '@playwright/test'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { createHash } from 'node:crypto'
const hash=b=>createHash('sha256').update(b).digest('hex')
const manifest=JSON.parse(await fs.readFile('docs/paper-import-audit/import-manifest.json','utf8'))
const inventory=JSON.parse(await fs.readFile('docs/paper-import-inventory.json','utf8'))
const sources=[...new Set([...inventory.map(s=>s.path),...manifest.attachments.map(s=>s.source)])]
const before=new Map(await Promise.all(sources.map(async file=>[file,hash(await fs.readFile(file))])))
const config=JSON.parse(await fs.readFile('C:/Users/29807/AppData/Roaming/稿喵/library-settings.json','utf8'))
const temporary=await fs.mkdtemp(path.join(os.tmpdir(),'gaomiao-real-paper-')),copy=path.join(temporary,'稿喵文档库.wg')
await fs.cp(config.root,copy,{recursive:true,filter:file=>path.basename(file)!=='.write.lock'&&!file.includes('.tmp-')})
const env={...process.env,WORDGIT_LIBRARY_HOME:temporary};delete env.ELECTRON_RUN_AS_NODE
const app=await electron.launch({executablePath:path.resolve('dist/gaomiao-0.3.4-windows-x64/稿喵.exe'),args:[path.resolve('dist/gaomiao-0.3.4-windows-x64/resources/app'),'--user-data-dir='+path.join(temporary,'profile')],env})
const output=path.resolve('docs/editing-audit')
try{
 const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.emulateMedia({reducedMotion:'reduce'})
 await app.evaluate(({BrowserWindow,shell})=>{BrowserWindow.getAllWindows()[0].setContentSize(1600,1000);shell.openPath=async file=>{globalThis.actualDraft=file;return ''}})
 await expect(page.getByRole('button',{name:'总览工作台',exact:true})).toBeVisible()
 await page.locator('.wg-document-card').filter({hasText:manifest.docName}).click()
 await page.getByRole('button',{name:'版本关系图',exact:true}).click();await page.getByLabel('查看分支').selectOption('all');await page.getByRole('button',{name:'总览工作台',exact:true}).click()
 await page.locator('.wg-history-rows button').filter({hasText:manifest.versions.at(-1).id.slice(0,7)}).click()
 const separator=page.getByRole('separator',{name:'调整详情栏宽度'});await separator.focus();for(let i=0;i<14;i++)await separator.press('ArrowLeft')
 await expect(page.locator('.wg-inspector .wg-docx-preview section').first()).toBeVisible({timeout:30000})
 expect(Number(await page.locator('.wg-inspector .wg-docx-preview>div').evaluate(e=>e.style.zoom))).toBeGreaterThan(.5)
 await fs.writeFile(path.join(output,'preview-diagnostics.json'),JSON.stringify(await page.locator('.wg-inspector .wg-docx-preview').evaluate(e=>({host:e.getBoundingClientRect().toJSON(),html:e.innerHTML.slice(0,4000),pages:[...e.querySelectorAll('section')].slice(0,4).map(s=>({text:s.innerText.slice(0,180),length:s.innerText.length,rect:s.getBoundingClientRect().toJSON(),style:s.getAttribute('style'),article:s.querySelector('article')?.getBoundingClientRect().toJSON()}))})),null,2))
 expect(await page.locator('.wg-inspector .wg-docx-preview').evaluate(host=>{const p=[...host.querySelectorAll('article p')].find(p=>p.textContent?.includes('Lightweight'));const r=p.getBoundingClientRect(),h=host.getBoundingClientRect();return r.width>300&&r.top>=h.top&&r.bottom<=h.bottom})).toBe(true)
 await page.screenshot({path:path.join(output,'真实论文_侧栏加宽与原文缩放.png')})
 await page.getByRole('button',{name:'展开预览',exact:true}).click();await expect(page.getByRole('dialog').locator('.wg-docx-preview section').first()).toBeVisible();expect(await page.getByRole('dialog').locator('.wg-docx-preview').evaluate(host=>{const p=[...host.querySelectorAll('article p')].find(p=>p.textContent?.includes('Lightweight'));const r=p.getBoundingClientRect(),h=host.getBoundingClientRect();return r.width>500&&r.top>=h.top&&r.bottom<=h.bottom})).toBe(true);await page.screenshot({path:path.join(output,'真实论文_展开预览.png')});await page.getByRole('dialog').locator('.wg-docx-preview').evaluate(host=>{const p=[...host.querySelectorAll('article p')].find(p=>p.textContent?.startsWith('Abstract'));if(!p)throw new Error('未找到论文摘要');host.scrollTop+=p.getBoundingClientRect().top-host.getBoundingClientRect().top-24});await page.screenshot({path:path.join(output,'真实论文_正文布局.png')});await page.getByRole('button',{name:'关闭',exact:true}).click()
 await page.getByRole('button',{name:'版本关系图',exact:true}).click();await page.getByLabel('查看分支').selectOption('all')
 await page.evaluate(({name,id})=>window.wordgit.library.mutate({type:'edit',docName:name,versionId:id,branch:'隔离验证-不写原库',title:'隔离测试稿'}),{name:manifest.docName,id:manifest.versions.at(-1).id})
 const file=await app.evaluate(()=>globalThis.actualDraft);expect(file.startsWith(copy+path.sep)).toBe(true)
 const detail=()=>page.evaluate(name=>window.wordgit.library.detail(name),manifest.docName)
 const count=(await detail()).versions.length
 // A valid different historical manuscript simulates an editor saving the isolated draft.
 await fs.writeFile(file,await fs.readFile(manifest.versions[12].source))
 await expect.poll(async()=>(await detail()).versions.length,{timeout:30000}).toBe(count+1)
 const node=(await detail()).branchHeads['隔离验证-不写原库']
 await fs.writeFile(file,await fs.readFile(manifest.versions[14].source))
 await expect.poll(async()=>(await detail()).versions.find(v=>v.id===node)?.revisionCount,{timeout:30000}).toBe(1)
 expect((await detail()).versions).toHaveLength(count+1)
 await page.evaluate(name=>window.wordgit.library.mutate({type:'document',docName:name,deleted:true}),manifest.docName)
 await fs.writeFile(file,await fs.readFile(manifest.versions[12].source));await page.waitForTimeout(1800)
 expect((await detail()).versions).toHaveLength(count+1)
 for(const [source,sha] of before)expect(hash(await fs.readFile(source)),source).toBe(sha)
 expect(errors).toEqual([])
 await fs.writeFile(path.join(output,'real-source-isolation.json'),JSON.stringify({passed:true,sourceFilesVerified:before.size,sourceFilesUnchanged:true,originalLibraryUsedForWrites:false,independentDraftInsideCopy:true,firstSaveCreatedOne:true,subsequentSaveUpdatedSame:true,recycledDocumentDidNotRevive:true},null,2))
 console.log(`Real paper clone verified; ${before.size} original files unchanged; original library was only copied.`)
}finally{await app.close();if(path.dirname(temporary)===os.tmpdir()&&path.basename(temporary).startsWith('gaomiao-real-paper-'))await fs.rm(temporary,{recursive:true,force:true})}
