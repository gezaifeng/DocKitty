import path from 'node:path'
import { ipcMain } from 'electron'
import { z } from 'zod'
import { documentDetail, versionBytes, writeFileAtomic } from '@wordgit/core'
import type { VersionStatistics, LibraryVersion } from '@wordgit/shared'
import { getRepo } from '../repoState.js'
import { analyzeVersion, type Analysis } from '../versionAnalysis.js'
import { compareAnalyses } from '../versionChanges.js'

const cache = new Map<string, Analysis>()
const definitions = [
 ['size','文件大小','字节','版本'], ['revisions','覆盖修订次数','次','版本'],
 ['characters','文本字符数','字符','文本'], ['hanzi','汉字数','字','文本'], ['words','英文词数','词','文本'],
 ['inserted','新增内容','字符','改动'], ['deleted','删除内容','字符','改动'], ['changed','总改动量','字符','改动'], ['net','净变化','字符','改动'], ['retained','文本保留率','%','改动'],
 ['paragraphs','段落数','段','Word'], ['tables','表格数','个','Word'], ['images','绘图对象数','个','Word'], ['comments','批注数','条','Word'],
 ['sheets','工作表数','张','Excel'], ['cells','非空单元格数','格','Excel'], ['formulas','公式数','个','Excel'], ['errors','错误值单元格','格','Excel'],
 ['slides','幻灯片数','页','PPT'], ['notes','备注字符数','字符','PPT'],
 ['wordCount','中英混合字数','字/词','文本'],['digits','数字字符数','字符','文本'],
 ['sizeDelta','体积变化','字节','版本'],['sizeGrowth','体积增长率','%','版本'],['interval','相邻记录间隔','小时','版本'],
 ['intensity','修改强度','%','改动'],['insertedRatio','新增占比','%','改动'],['deletedRatio','删除占比','%','改动'],
 ['headings','标题数','个','Word'],['sections','章节区间数','个','Word'],['footnotes','脚注数','条','Word'],['endnotes','尾注数','条','Word'],['commentsOpen','未解决批注','条','Word'],['commentsResolved','已解决批注','条','Word'],
 ['paragraphsAdded','新增/改写后段落','段','Word'],['paragraphsDeleted','删除/改写前段落','段','Word'],['paragraphsChanged','修改段落（稳定标识）','段','Word'],['paragraphsMoved','移动段落（稳定标识）','段','Word'],
 ['rows','有效行数','行','Excel'],['columns','有效列数','列','Excel'],['sheetsAdded','新增工作表','张','Excel'],['sheetsDeleted','删除工作表','张','Excel'],['sheetsRenamed','工作表重命名','张','Excel'],
 ['cellsAdded','新增单元格','格','Excel'],['cellsCleared','清空单元格','格','Excel'],['cellsChanged','单元格改值','格','Excel'],['rowsMoved','对齐的行位置变化','行','Excel'],
 ['formulasAdded','新增公式','个','Excel'],['formulasDeleted','删除公式','个','Excel'],['formulasChanged','改写公式','个','Excel'],
 ['emptyRatio','有效行列交叉空值比例','%','Excel'],
 ['slidesAdded','新增幻灯片文本','页','PPT'],['slidesDeleted','删除幻灯片文本','页','PPT'],['slidesChanged','幻灯片文本修改','页','PPT'],['slidesMoved','幻灯片文本换序','页','PPT'],
].map(([id,label,unit,group]) => ({id,label,unit,group}))

const request = z.object({docName:z.string().min(1),branch:z.string().min(1),baselineId:z.string().regex(/^[a-f0-9]{64}$/).optional(),compareBranch:z.string().min(1).optional(),onlyExclusive:z.boolean().optional()})

export async function versionStatsHandler(args: unknown): Promise<VersionStatistics> {
 const { docName, branch, baselineId, compareBranch, onlyExclusive } = request.parse(args)
 const repo = getRepo(), detail = await documentDetail(repo,docName), head = detail.branchHeads[branch]
 if (!head) throw new Error('所选统计分支不存在')
 const byId = new Map(detail.versions.map(v => [v.id,v]))
 const branchLine=(name:string)=>{
  const members=detail.versions.filter(v=>!v.deletedAt&&v.branches.includes(name)).sort((a,b)=>a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id))
  const ids=new Set(members.map(v=>v.id)),seen=new Set<string>(),ordered:LibraryVersion[]=[]
  const visit=(v:LibraryVersion)=>{if(seen.has(v.id))return;seen.add(v.id);for(const p of v.parents){const previous=byId.get(p);if(previous&&ids.has(p))visit(previous)}ordered.push(v)}
  members.forEach(visit);return ordered
 }
 const line=branchLine(branch)
 if(compareBranch&&!detail.branchHeads[compareBranch])throw new Error('对照分支不存在')
 if(onlyExclusive&&!compareBranch)throw new Error('仅分叉后统计需要选择对照分支')
 const other=new Set(compareBranch?branchLine(compareBranch).map(v=>v.id):[])
 const baselineVersion=baselineId?byId.get(baselineId):line[0]
 if(baselineId&&!baselineVersion)throw new Error('基准版本不属于当前文档')
 const read=async(v:LibraryVersion)=>{const key=[repo.root,docName,v.contentId].join('\0');let a=cache.get(key);if(!a){a=await analyzeVersion(await versionBytes(repo,docName,v.id),path.extname(docName).toLowerCase());if((a.values.cells??0)<20000&&(a.paragraphs?.length??0)<10000){if(cache.size>=256)cache.delete(cache.keys().next().value!);cache.set(key,a)}}return a}
 const baseline=baselineVersion?await read(baselineVersion):undefined
 const versions: VersionStatistics['versions'] = []
 for (const v of line) {
  if (v.deletedAt) continue
  const analysis=await read(v)
  const values: Record<string,number> = { ...analysis.values, revisions:v.revisionCount }
  const parent=byId.get(v.parents[0]); const previous=parent&&!parent.deletedAt?await read(parent):undefined
  const comparison=previous?compareAnalyses(previous,analysis):undefined
  if(comparison)Object.assign(values,comparison.values)
  if(versions.length)values.interval=(Date.parse(v.createdAt)-Date.parse(versions.at(-1)!.createdAt))/3600000
  versions.push({id:v.id,title:v.title,createdAt:v.createdAt,values,unavailable:analysis.unavailable,author:v.author,category:detail.categories.find(c=>c.id===v.categoryId)?.name??'未分类',contentId:v.contentId,baselineValues:baseline?compareAnalyses(baseline,analysis).values:undefined,sections:analysis.sections,columns:analysis.columns,changes:comparison?.changes,changeCount:comparison?.changeCount})
 }
 const visible=onlyExclusive?versions.filter(v=>!other.has(v.id)):versions
 const countBy=(field:'category'|'author')=>{const map=new Map<string,number>();for(const v of visible){const label=v[field]||'未标注';map.set(label,(map.get(label)??0)+1)}return Array.from(map,([label,count])=>({label,count}))}
 const intervals=visible.slice(1).map((v,i)=>(Date.parse(v.createdAt)-Date.parse(visible[i].createdAt))/3600000).sort((a,b)=>a-b),middle=Math.floor(intervals.length/2)
 const dates=new Map<string,number>();for(const v of visible){const date=new Date(v.createdAt).toLocaleDateString('en-CA');dates.set(date,(dates.get(date)??0)+1)}
 return { branch,versions:visible,metrics:definitions.filter(m=>versions.some(v=>m.id in v.values)),activity:Array.from(dates,([date,count])=>({date,count})),baselineId:baselineVersion?.id,baseline:baseline&&baselineVersion?{title:baselineVersion.title,values:{...baseline.values,revisions:baselineVersion.revisionCount},sections:baseline.sections}:undefined,distribution:{categories:countBy('category'),authors:countBy('author')},summary:{firstAt:visible[0]?.createdAt,lastAt:visible.at(-1)?.createdAt,spanDays:visible.length?(Date.parse(visible.at(-1)!.createdAt)-Date.parse(visible[0].createdAt))/86400000:0,averageHours:intervals.length?intervals.reduce((a,b)=>a+b,0)/intervals.length:undefined,medianHours:intervals.length?intervals.length%2?intervals[middle]:(intervals[middle-1]+intervals[middle])/2:undefined,duplicateVersions:visible.length-new Set(visible.map(v=>v.contentId)).size,commonVersions:compareBranch?line.filter(v=>other.has(v.id)).length:undefined,exclusiveVersions:compareBranch?line.filter(v=>!other.has(v.id)).length:undefined},scope:'按单一分支归属统计，独立版本保留，不计回收版本；增删指标对比实际前版本。字数=汉字+英文词；字符数计标点和数字，均不等同Word/WPS字数。逐字差异超过160000字符、改动过大或超时显示“—”。章节按稳定段落标识或同名标题匹配；无段落标识时改写计为删除+新增。Excel优先对齐内容完全相同的唯一行，其余按工作表标识及地址比较；插列和重建表的对齐可能不确定。PPT只比较文本，不计图片和布局。' }
}

export async function exportStatistics(args:unknown) {
 const parsed=request.extend({destination:z.string().min(1),versionIds:z.array(z.string().regex(/^[a-f0-9]{64}$/)),png:z.string().max(20000000).optional()}).parse(args)
 if(!path.isAbsolute(parsed.destination))throw new Error('导出位置需要是绝对路径')
 const relative=path.relative(getRepo().root,path.resolve(parsed.destination))
 if(relative===''||(!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative)))throw new Error('请把统计结果导出到文档库之外，避免覆盖历史或工作稿')
 const data=await versionStatsHandler(parsed),ids=new Set(parsed.versionIds),rows=data.versions.filter(v=>ids.has(v.id))
 let bytes:Uint8Array
 if(parsed.png){if(path.extname(parsed.destination).toLowerCase()!=='.png'||!parsed.png.startsWith('data:image/png;base64,'))throw new Error('请使用PNG图片路径');bytes=Buffer.from(parsed.png.split(',')[1],'base64');if(Buffer.from(bytes.subarray(0,8)).toString('hex')!=='89504e470d0a1a0a')throw new Error('无效PNG图片')}
 else{
  if(path.extname(parsed.destination).toLowerCase()!=='.csv')throw new Error('请使用CSV文件路径')
  const cell=(v:unknown)=>{let text=String(v??'');if(typeof v==='string'&&/^[=+@-]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"'}
  const header=['版本ID','版本名称','分支','记录时间','分类','作者',...data.metrics.map(m=>m.label+'（'+m.unit+'）'),...data.metrics.map(m=>'相对基准/'+m.label+'（'+m.unit+'）')]
  const csv=[header,...rows.map(v=>[v.id,v.title,data.branch,v.createdAt,v.category,v.author,...data.metrics.map(m=>v.values[m.id]),...data.metrics.map(m=>v.baselineValues?.[m.id])])].map(r=>r.map(cell).join(',')).join('\r\n')
  bytes=new TextEncoder().encode('\uFEFF'+csv)
 }
 await writeFileAtomic(parsed.destination,bytes)
}
export function registerVersionStatsHandlers() { ipcMain.handle('stats.versions',(_e,args:unknown)=>versionStatsHandler(args));ipcMain.handle('stats.export',(_e,args:unknown)=>exportStatistics(args)) }
