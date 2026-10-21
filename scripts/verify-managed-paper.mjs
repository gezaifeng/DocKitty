import { _electron as electron, expect } from '@playwright/test'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { createHash } from 'node:crypto'

const delivery=path.resolve('dist/gaomiao-0.3.6-windows-x64'),temporary=await fs.mkdtemp(path.join(os.tmpdir(),'gaomiao-paper-management-'))
const record=JSON.parse(await fs.readFile(path.join(delivery,'测试导入文件说明.json'),'utf8'))
const repository=path.join(temporary,'稿喵文档库.wg')
await fs.cp(record.testLibrary,repository,{recursive:true,filter:p=>path.basename(p)!=='.write.lock'})
const hash=bytes=>createHash('sha256').update(bytes).digest('hex')
const baseline=new Map(await Promise.all(record.sourceFiles.map(async s=>[s.sourcePath,hash(await fs.readFile(s.sourcePath))])))
// All external source paths in this verification point at an extra disposable copy.
for(const file of await fs.readdir(path.join(repository,'library'))){
 const metaFile=path.join(repository,'library',file),meta=JSON.parse(await fs.readFile(metaFile,'utf8'))
 for(const [id,v] of Object.entries(meta.versions))if(v.sourcePath){const local=path.join(temporary,id+'-'+path.basename(v.sourcePath));await fs.copyFile(v.sourcePath,local);v.sourcePath=local}
 await fs.writeFile(metaFile,JSON.stringify(meta,null,2))
}
const env={...process.env,WORDGIT_LIBRARY_HOME:temporary};delete env.ELECTRON_RUN_AS_NODE
const app=await electron.launch({executablePath:path.join(delivery,'稿喵.exe'),args:[path.join(delivery,'resources/app'),'--user-data-dir='+path.join(temporary,'profile')],env})
try{
 const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.emulateMedia({reducedMotion:'reduce'})
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentSize(1600,1000))
 await expect(page.locator('.wg-document-card')).toHaveCount(3)
 await page.locator('.wg-document-card').filter({hasText:'溶液光谱重建论文-完整历史.docx'}).click()
 await expect(page.locator('.wg-inspector')).toContainText('溶液光谱重建论文')
 const output=path.resolve('docs/management-audit')
 await expect(page.locator('.wg-main-view')).toHaveCSS('opacity','1');await page.screenshot({path:path.join(output,'real-paper-cards.png')})
 const name='溶液光谱重建论文-完整历史.docx',detail=()=>page.evaluate(name=>window.wordgit.library.detail(name),name)
 const initial=await detail(),version=initial.versions.find(v=>v.id===initial.branchHeads[initial.currentBranch])
 await page.getByRole('button',{name:'版本关系图',exact:true}).click();await page.getByLabel('查看分支').selectOption('all')
 await page.evaluate(({name,id})=>window.wordgit.library.mutate({type:'relations',docName:name,versionId:id,action:'disconnectPrevious'}),{name,id:version.id})
 expect((await detail()).versions.find(v=>v.id===version.id).parents).toEqual([])
 await page.evaluate(({name,id,source})=>window.wordgit.library.mutate({type:'purgeVersion',docName:name,versionId:id,deleteSource:true,confirmedSourcePath:source}),{name,id:version.id,source:version.sourcePath})
 await expect(fs.access(version.sourcePath)).rejects.toThrow()
 expect((await detail()).versions).toHaveLength(initial.versions.length-1)
 for(const [file,sha] of baseline)expect(hash(await fs.readFile(file)),file).toBe(sha)
 expect(errors).toEqual([])
 await fs.writeFile(path.join(output,'real-paper-verification.json'),JSON.stringify({passed:true,testSourceFilesVerified:baseline.size,testSourceFilesUnchanged:true,operationsOnExtraDisposableCopy:true,originalPaperNeverUsedAsWriteTarget:true,docxPermanentDeletionVerified:true},null,2))
 console.log('Real manuscript operations verified in a disposable clone; all '+baseline.size+' delivery test source files remain unchanged.')
}finally{await app.close();if(path.dirname(temporary)===os.tmpdir()&&path.basename(temporary).startsWith('gaomiao-paper-management-'))await fs.rm(temporary,{recursive:true,force:true})}
