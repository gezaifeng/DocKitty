import { promises as fs } from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const delivery=path.resolve('dist/gaomiao-0.3.6-windows-x64')
const settings='C:/Users/29807/AppData/Roaming/稿喵/library-settings.json'
const current=JSON.parse(await fs.readFile(settings,'utf8')).root
if(!path.resolve(current).startsWith(delivery+path.sep))throw new Error('只能恢复本次交付目录内的测试库')
const manifest=JSON.parse(await fs.readFile('docs/paper-import-audit/import-manifest.json','utf8'))
const resume=process.argv.find(arg=>arg.startsWith('--resume='))?.slice(9)
if(resume&&!/^[0-9TZ-]+$/.test(resume))throw new Error('无效恢复标识')
const stamp=resume??new Date().toISOString().replace(/[:.]/g,'-')
const backup=path.join(delivery,'测试恢复前备份-'+stamp+'.wg')
const target=path.join(delivery,'测试文档库-初始历史-'+stamp+'.wg')
if(!resume)await fs.cp(current,backup,{recursive:true,filter:file=>path.basename(file)!=='.write.lock'})
if(!resume)await fs.cp(manifest.targetRoot,target,{recursive:true,filter:file=>path.basename(file)!=='.write.lock'})
// Remove only metadata and working copies inside the newly created test copy.
for(const name of ['library','refs','workspace','quarantine','journal','imports','drafts']){
 const folder=path.resolve(target,name)
 if(!folder.startsWith(target+path.sep))throw new Error('恢复路径越界')
 await fs.rm(folder,{recursive:true,force:true});await fs.mkdir(folder,{recursive:true})
}
const pnpm=path.resolve('node_modules/.pnpm'),esbuildFolder=(await fs.readdir(pnpm)).find(s=>s.startsWith('esbuild@'))
const esbuild=createRequire(import.meta.url)(path.join(pnpm,esbuildFolder,'node_modules/esbuild'))
const bundle=path.resolve('docs/management-audit/reset-core.mjs')
await esbuild.build({entryPoints:['packages/core/src/index.ts'],outfile:bundle,bundle:true,platform:'node',format:'esm'})
const core=await import(pathToFileURL(bundle).href),repo=await core.Repo.open(target),ctx=core.StorageContext.forRepo(repo)
const configuration=JSON.parse(await fs.readFile(path.join(target,'repo.yaml'),'utf8'));configuration.isolatedSources=true
await fs.writeFile(path.join(target,'repo.yaml'),JSON.stringify(configuration,null,2))
const sha=b=>createHash('sha256').update(b).digest('hex')
async function restoreDocument(name,records,title,categories=[]){
 const versions={},heads={}
 for(const record of records){
  const baseline=manifest.detail.versions.find(v=>v.id===record.id)
  const branch=record.title?.includes('TIP 格式稿')?'TIP投稿':record.branch??'main'
  const source=path.join(target,'imports',record.id,name);await fs.mkdir(path.dirname(source),{recursive:true})
  const commit=await core.readCommit(ctx,record.id),tree=await core.readTree(ctx,commit.tree)
  await fs.writeFile(source,await core.materializeFile(ctx,await core.getManifest(ctx,tree.entries[''])))
  if(sha(await fs.readFile(source))!==record.sha256)throw new Error('最初导入内容校验失败：'+record.title)
  versions[record.id]={title:record.title??baseline?.title??title,note:baseline?.note??'',categoryId:baseline?.categoryId??'',parents:commit.parents,branchMembership:[branch],sourcePath:path.relative(target,source)}
  heads[branch]=record.id
 }
 await fs.mkdir(path.join(target,'library'),{recursive:true})
 await fs.writeFile(path.join(target,'library',core.docIdOf(name)+'.json'),JSON.stringify({format:1,title,categories,versions},null,2))
 for(const [branch,id] of Object.entries(heads))await core.writeHead(repo,core.docIdOf(name),branch,id)
 const branch=heads.Measurement投稿?'Measurement投稿':'main'
 await core.writeCurrentBranch(repo,core.docIdOf(name),branch)
 await core.switchBranch(repo,name,branch)
 return records.length
}
await restoreDocument(manifest.docName,manifest.versions,manifest.detail.title,manifest.detail.categories)
for(const attachment of manifest.attachments)await restoreDocument(attachment.docName,[attachment],attachment.docName)
const documents=await core.libraryDocuments(repo)
if(documents.length!==3||documents.reduce((sum,d)=>sum+d.versionCount,0)!==18)throw new Error('恢复数量不符合最初导入记录')
for(const doc of documents)for(const version of (await core.documentDetail(repo,doc.docName)).versions)if(version.branches.length!==1||!version.sourcePath.startsWith(target+path.sep))throw new Error('分支或来源隔离检查失败')
await core.writeFileAtomic(settings,Buffer.from(JSON.stringify({root:target})))
const result={passed:true,root:target,backup,documents:3,manuscriptVersions:16,attachments:2,sourceFilesIsolated:true}
await fs.writeFile('docs/management-audit/reset-result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2))
