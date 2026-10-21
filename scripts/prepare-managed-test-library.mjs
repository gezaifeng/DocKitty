import { promises as fs } from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const root=path.resolve('dist/gaomiao-0.3.6-windows-x64')
const settingsPath='C:/Users/29807/AppData/Roaming/稿喵/library-settings.json'
const configuration=JSON.parse(await fs.readFile(settingsPath,'utf8'))
const target=path.join(root,'测试文档库.wg'),sources=path.join(root,'测试导入文件')
if(process.argv.includes('--activate-existing')){
 const record=JSON.parse(await fs.readFile(path.join(root,'测试导入文件说明.json'),'utf8'))
 if(path.resolve(configuration.root)!==path.resolve(record.previousLibrary))throw new Error('当前库已发生变化，不能覆盖设置')
 for(const file of record.sourceFiles){if(!path.resolve(file.sourcePath).startsWith(sources+path.sep))throw new Error('测试来源路径不在测试文件夹');if(createHash('sha256').update(await fs.readFile(file.sourcePath)).digest('hex')!==file.sha256)throw new Error('测试文件发生变化')}
 const temporary=settingsPath+'.tmp-managed'
 await fs.writeFile(temporary,JSON.stringify({root:target}));await fs.rename(temporary,settingsPath)
 console.log('Activated verified isolated test library: '+target)
 process.exit(0)
}
if(path.resolve(configuration.root)===target)throw new Error('已经在使用这份测试库，不重复覆盖')
await fs.access(root)
if(await fs.access(target).then(()=>true,()=>false))throw new Error('测试库已存在，不能覆盖用户的测试操作')
const originalFiles=[]
async function inventory(folder){for(const entry of await fs.readdir(folder,{withFileTypes:true})){const file=path.join(folder,entry.name);if(entry.isDirectory()&&!entry.name.endsWith('.wg')&&!['.git','node_modules'].includes(entry.name))await inventory(file);else if(entry.isFile()&&/\.(docx?|xlsx?|pptx?|md|csv|txt|pdf)$/i.test(entry.name))originalFiles.push(file)}}
await inventory('D:/Desktop/基于轻量残差卷积神经网络从照片中获取溶液光谱信息')
const digest=bytes=>createHash('sha256').update(bytes).digest('hex')
const before=new Map()
for(const file of originalFiles)before.set(file,digest(await fs.readFile(file)))
await fs.cp(configuration.root,target,{recursive:true,filter:file=>path.basename(file)!=='.write.lock'&&!file.includes('.tmp-')})
const testConfig=JSON.parse(await fs.readFile(path.join(target,'repo.yaml'),'utf8'));testConfig.isolatedSources=true;await fs.writeFile(path.join(target,'repo.yaml'),JSON.stringify(testConfig,null,2))
await fs.mkdir(sources,{recursive:true})
const pnpm=path.resolve('node_modules/.pnpm'),packageName=(await fs.readdir(pnpm)).find(s=>s.startsWith('esbuild@'))
const require=createRequire(import.meta.url),esbuild=require(path.join(pnpm,packageName,'node_modules/esbuild'))
const bundle=path.resolve('docs/management-audit/core-runtime.mjs')
await esbuild.build({entryPoints:['packages/core/src/index.ts'],outfile:bundle,bundle:true,platform:'node',format:'esm'})
const core=await import(pathToFileURL(bundle).href),repo=await core.Repo.open(target),copies=[]
for(const docName of await core.docIds(repo)){
 const detail=await core.documentDetail(repo,docName)
 const metaFile=path.join(target,'library',core.docIdOf(docName)+'.json'),meta=await core.readLibraryMeta(repo,docName)
 for(const version of detail.versions){
  const docFolder=path.join(sources,createHash('sha256').update(docName).digest('hex').slice(0,12));await fs.mkdir(docFolder,{recursive:true})
  const filename=path.join(docFolder,version.id.slice(0,12)+'-'+docName)
  await core.exportVersion(repo,docName,version.id,filename)
  ;(meta.versions[version.id]??={}).sourcePath=filename
  copies.push({docName,versionId:version.id,title:version.title,sourcePath:filename,sha256:digest(await fs.readFile(filename))})
 }
 await core.writeFileAtomic(metaFile,Buffer.from(JSON.stringify(meta,null,2)))
}
for(const [file,sha] of before)if(digest(await fs.readFile(file))!==sha)throw new Error('原来源文件校验发生变化：'+file)
await fs.writeFile(path.join(root,'原文档库位置.json'),JSON.stringify(configuration,null,2))
await fs.writeFile(path.join(root,'测试导入文件说明.json'),JSON.stringify({testLibrary:target,previousLibrary:configuration.root,sourceFiles:copies,originalFilesVerified:before.size,originalFilesUnchanged:true},null,2))
await fs.writeFile('docs/management-audit/test-library.json',JSON.stringify({testLibrary:target,previousLibrary:configuration.root,testSourceCount:copies.length,originalFilesVerified:before.size,originalFilesUnchanged:true},null,2))
if(process.argv.includes('--activate'))await core.writeFileAtomic(settingsPath,Buffer.from(JSON.stringify({root:target})))
console.log(JSON.stringify({testLibrary:target,testSourceCount:copies.length,originalFilesVerified:before.size,activated:process.argv.includes('--activate')}))
