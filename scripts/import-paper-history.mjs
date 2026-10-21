import { promises as fs } from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { Repo, libraryDocuments, documentDetail, versionBytes, exportBackup, importDoc, importVersion, updateDocument, updateVersion, updateCategory, createBranch, switchBranch } from '../packages/core/src/index.ts'

const sourceRoot='D:/Desktop/基于轻量残差卷积神经网络从照片中获取溶液光谱信息'
const audit=path.resolve('docs/paper-import-audit')
await fs.mkdir(audit,{recursive:true})
const settings=JSON.parse(await fs.readFile('C:/Users/29807/AppData/Roaming/稿喵/library-settings.json','utf8'))
const target=await Repo.open(settings.root),old=await Repo.open(path.join(sourceRoot,'毕业论文.wg'))
const hash=b=>createHash('sha256').update(b).digest('hex')
const inventory=JSON.parse(await fs.readFile('docs/paper-import-inventory.json','utf8'))
const oldVersions=[]
for(const doc of await libraryDocuments(old))for(const v of (await documentDetail(old,doc.docName)).versions){
 const bytes=await versionBytes(old,doc.docName,v.id),digest=hash(bytes),matches=inventory.filter(s=>s.sha256===digest)
 oldVersions.push({docName:doc.docName,id:v.id,title:v.title,createdAt:v.createdAt,sha256:digest,matches:matches.map(m=>m.path)})
 if(!matches.length)await fs.writeFile(path.join(audit,`原库-${v.id.slice(0,12)}.docx`),bytes)
}
const before=await libraryDocuments(target)
await fs.writeFile(path.join(audit,'preflight.json'),JSON.stringify({targetRoot:target.root,before,oldVersions},null,2))
console.log(JSON.stringify({targetRoot:target.root,before,oldVersions},null,2))
if(!process.argv.includes('--import'))process.exit(0)

const docName='溶液光谱重建论文-完整历史.docx'
if(before.some(d=>d.docName===docName))throw new Error('目标论文已经存在；禁止重复导入或覆盖，请检查已有导入记录。')
const record={targetRoot:target.root,docName,importedAt:new Date().toISOString(),versions:[],attachments:[],duplicates:[],oldVersions}
const persist=()=>fs.writeFile(path.join(audit,'import-manifest.json'),JSON.stringify(record,null,2))
const backup=path.join(audit,'导入前文档库备份.wgbackup')
try{await fs.access(backup);throw new Error('备份已存在，禁止覆盖')}catch(e){if(e.code!=='ENOENT')throw e}
await exportBackup(target,backup)
const list=[
 ['基于轻量残差卷积神经网络_11.1.docx','2025-11-01 · 中文初稿（11.1）','中文早期稿'],
 ['基于轻量残差卷积神经网络_11.2.docx','2025-11-02 · 中文修改稿（11.2）','中文早期稿'],
 ['基于轻量残差卷积神经网络_11.18.docx','2025-11-18 · 中文修改稿','中文早期稿'],
 ['基于轻量残差卷积神经网络_11.20.docx','2025-11-20 · 中文修改稿','中文早期稿'],
 ['251125_基于轻量残差卷积神经网络.docx','2025-11-25 · 中文修改稿','中文早期稿'],
 ['基于轻量残差卷积神经网络_11.29.docx','2025-11-29 · 中文修改稿','中文早期稿'],
 ['基于轻量残差卷积神经网络_12.02.docx','2025-12-02 · 中文修改稿（12.02）','中文早期稿'],
 ['251202_基于轻量残差卷积神经网络.docx','2025-12-02 · 中文修改稿（251202）','中文早期稿'],
 ['基于轻量残差卷积神经网络_12.03.docx','2025-12-03 · 中文整理稿','中文早期稿'],
 ['基于轻量残差卷积神经网络_12.03 英文.docx','2025-12-03 · 英文初稿','英文改稿'],
 ['基于轻量残差卷积神经网络_12.09 英文.docx','2025-12-09 · 英文修改稿','英文改稿'],
 ['基于轻量残差卷积神经网络_01.16英文 .docx','2026-01-16 · 英文修改稿','英文改稿'],
 ['TIP_Lightweight_Spectral_Reconstruction_RGB_ColorChart.docx','2026-01-23 · TIP 格式稿','TIP 投稿稿'],
 ['SAA投稿/01_SAA_Manuscript.docx','2026-09-05 · SAA 投稿稿','SAA 投稿稿','SAA投稿'],
 ['Measurement投稿/01_Measurement_Anonymous_Manuscript.docx','2026-09-17 · Measurement 匿名稿','Measurement 修改稿','Measurement投稿'],
 ['Measurement投稿/2026-10-11_老师意见修改版/01_Measurement_Anonymous_Manuscript_Revised_20261011.docx','2026-10-11 · 老师意见整合修改稿（最新）','Measurement 修改稿','Measurement投稿'],
]
const categories=new Map(),heads=new Map();let tipId
for(let i=0;i<list.length;i++){
 const [relative,title,category,branch='main']=list[i],source=path.join(sourceRoot,relative),bytes=await fs.readFile(source),digest=hash(bytes)
 const inventoried=inventory.find(s=>path.resolve(s.path)===path.resolve(source))
 if(!inventoried||inventoried.sha256!==digest)throw new Error('原稿在整理过程中发生变化，请重新核对：'+relative)
 if(branch!=='main'&&!heads.has(branch))await createBranch(target,docName,branch,{commitId:tipId})
 const id=i===0?(await importDoc(target,source,docName)).commitId:await importVersion(target,docName,source,{message:title,branch})
 if(!categories.has(category))categories.set(category,await updateCategory(target,docName,'create',category))
 const aliases=inventory.filter(s=>s.sha256===digest&&path.resolve(s.path)!==path.resolve(source)).map(s=>s.path)
 const stat=await fs.stat(source)
 const note=`来源：${source}\nSHA-256：${digest}\n原文件最后修改时间：${stat.mtime.toISOString()}\n标题日期以文件名/投稿目录为依据；衔接与分支为本次整理，不代表原生提交历史。版本记录时间为实际导入时间。${aliases.length?'\n完全相同副本：'+aliases.join('；'):''}${i===15?'\n直接基线：2026-09-17 Measurement匿名稿。依据原目录03_修改说明与逐段对照_20261011.md；方法背景移入独立SI，正文缩短不表示全部内容丢失。':''}`
 await updateVersion(target,docName,id,{title,note,categoryId:categories.get(category),order:i,position:{x:65+(i<13?i:i===13?13:i-1)*265,y:65+(branch==='SAA投稿'?1:branch==='Measurement投稿'?2:0)*170}})
 if(hash(await versionBytes(target,docName,id))!==digest)throw new Error('导入内容校验失败：'+relative)
 record.versions.push({id,title,category,branch,source,sha256:digest,aliases});heads.set(branch,id)
 if(i===8)await createBranch(target,docName,'中文早期稿',{commitId:id})
 if(i===11)await createBranch(target,docName,'英文改稿',{commitId:id})
 if(i===12){tipId=id;await createBranch(target,docName,'TIP投稿',{commitId:id})}
 await persist();console.log(`Imported ${i+1}/${list.length}: ${title}`)
}
for(const v of oldVersions.filter(v=>!v.matches.length)){
 const branch='旧库存档';if(!heads.has(branch))await createBranch(target,docName,branch,{commitId:record.versions[11].id})
 const source=path.join(audit,`原库-${v.id.slice(0,12)}.docx`),id=await importVersion(target,docName,source,{message:'旧库保留稿 · '+v.title,branch})
 await updateVersion(target,docName,id,{note:`原库：${old.root}\n原版本ID：${v.id}\n原记录时间：${v.createdAt}\n此路线为本次整理，原库未覆盖。`,categoryId:categories.get('英文改稿')})
 record.versions.push({id,title:'旧库保留稿 · '+v.title,branch,source,sha256:v.sha256});heads.set(branch,id);await persist()
}
await updateDocument(target,docName,{title:'溶液光谱重建论文 · 从初稿到投稿修改'})
await switchBranch(target,docName,'Measurement投稿')
for(const [relative,name,title] of [
 ['Measurement投稿/2026-10-11_老师意见修改版/02_Measurement_Supporting_Information_20261011.docx','溶液光谱重建论文-SI补充材料.docx','溶液光谱重建论文 · 最新SI补充材料'],
 ['Measurement投稿/2026-10-11_老师意见修改版/03_修改说明与逐段对照_20261011.md','溶液光谱重建论文-修改说明.md','溶液光谱重建论文 · 老师意见修改说明'],
]){
 if(before.some(d=>d.docName===name))throw new Error('附件已存在，禁止覆盖：'+name)
 const source=path.join(sourceRoot,relative),bytes=await fs.readFile(source),id=(await importDoc(target,source,name)).commitId
 if(hash(await versionBytes(target,name,id))!==hash(bytes))throw new Error('附件校验失败')
 await updateDocument(target,name,{title});await updateVersion(target,name,id,{title:'2026-10-11 · '+title,note:'原文件：'+source})
 record.attachments.push({docName:name,id,source,sha256:hash(bytes)});await persist()
}
const detail=await documentDetail(target,docName)
if(detail.workspace.dirty||detail.currentBranch!=='Measurement投稿')throw new Error('最新稿工作区状态错误')
for(const v of record.versions)if(hash(await fs.readFile(v.source))!==v.sha256)throw new Error('导入期间原稿发生变化：'+v.source)
record.detail=detail;await persist()
console.log(JSON.stringify({complete:true,versions:detail.versions.length,attachments:record.attachments.length,currentBranch:detail.currentBranch,root:target.root}))
