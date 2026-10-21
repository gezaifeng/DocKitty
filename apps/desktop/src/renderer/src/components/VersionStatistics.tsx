import { useSessionState } from '../store/useSessionState'
import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BarChart3, GitBranch, FileText, Layers, CalendarDays } from 'lucide-react'
import { api } from '../lib/ipc'
import { useRepoStore } from '../store/repoStore'
import type { DocumentDetail } from '@wordgit/shared'
import '../assets/version-stats.css'

export function VersionStatistics({ detail, onSelect, onOpenVersion, onCompare }: { detail: DocumentDetail; onSelect(id: string): void; onOpenVersion?(id:string):void; onCompare?(a:string,b:string):void }) {
 const repoRoot=useRepoStore(s=>s.repoRoot)
 const [branch,setBranch] = useSessionState(repoRoot, 'statistics.' + detail.docName + '.branch', detail.currentBranch)
 const [metric,setMetric] = useSessionState(repoRoot, 'statistics.' + detail.docName + '.metric', 'characters')
 const [selected,setSelected] = useSessionState<string | null>(repoRoot, 'statistics.' + detail.docName + '.selected', null)
 const [baselineId,setBaselineId]=useSessionState(repoRoot, 'statistics.' + detail.docName + '.baselineId', ''),[compareBranch,setCompareBranch]=useSessionState(repoRoot, 'statistics.' + detail.docName + '.compareBranch', '')
 const [from,setFrom]=useSessionState(repoRoot, 'statistics.' + detail.docName + '.from', ''),[until,setUntil]=useSessionState(repoRoot, 'statistics.' + detail.docName + '.until', ''),[fromDate,setFromDate]=useSessionState(repoRoot, 'statistics.' + detail.docName + '.fromDate', ''),[untilDate,setUntilDate]=useSessionState(repoRoot, 'statistics.' + detail.docName + '.untilDate', ''),[axis,setAxis]=useSessionState(repoRoot, 'statistics.' + detail.docName + '.axis', 'version')
 const [bucket,setBucket]=useSessionState(repoRoot, 'statistics.' + detail.docName + '.bucket', 'day'),[column,setColumn]=useSessionState(repoRoot, 'statistics.' + detail.docName + '.column', ''),[exporting,setExporting]=useState(false),[exportNotice,setExportNotice]=useState('')
 const targetKey='gaomiao-target:'+repoRoot+':'+detail.docName
 const [target,setTarget]=useState(()=>localStorage.getItem(targetKey)??'')
 const chart=useRef<SVGSVGElement>(null)
 const content=useRef<HTMLElement>(null)
 useEffect(()=>{if(content.current)content.current.scrollTop=0},[metric,branch])
 useEffect(()=>{if(!detail.branchHeads[branch]){setBranch(detail.branchHeads[detail.currentBranch] ? detail.currentBranch : Object.keys(detail.branchHeads)[0] ?? '');setCompareBranch('');setSelected(null)}},[detail.branchHeads,detail.currentBranch,branch])
 const options={baselineId:baselineId||undefined,compareBranch:compareBranch||undefined}
 const revisionKey = JSON.stringify(detail.versions.map(v=>[v.id,v.contentId,v.title,v.revisionCount,v.deletedAt,v.parents,v.branches]))+JSON.stringify(detail.branchHeads)
 const query=useQuery({queryKey:['stats','versions',repoRoot,detail.docName,branch,revisionKey,options],queryFn:()=>api.stats.versions(detail.docName,branch,options),retry:false,enabled:!!branch&&!!detail.branchHeads[branch]})
 const data=query.data, definitions=data?.metrics??[]
 const active=definitions.find(m=>m.id===metric)??definitions.find(m=>m.id==='size')
 const allRows=data?.versions??[],start=from?allRows.findIndex(v=>v.id===from):0,end=until?allRows.findIndex(v=>v.id===until):allRows.length-1
 const localDate=(value:string)=>new Date(value).toLocaleDateString('en-CA')
 const rows=allRows.slice(Math.max(0,start),end<0?allRows.length:end+1).filter(v=>(!fromDate||localDate(v.createdAt)>=fromDate)&&(!untilDate||localDate(v.createdAt)<=untilDate)), current=rows.find(v=>v.id===selected)??rows.at(-1)
 const values=rows.map(v=>active?v.values[active.id]:undefined), valid=values.filter((v):v is number=>v!==undefined)
 const min=Math.min(0,...valid), max=Math.max(1,...valid), span=max-min||1
 const times=rows.map(v=>Date.parse(v.createdAt)),tMin=Math.min(...times),tMax=Math.max(...times)
 const x=(i:number)=>60+(axis==='time'&&tMax>tMin?(times[i]-tMin)/(tMax-tMin):i/Math.max(1,rows.length-1))*680, y=(v:number)=>225-(v-min)/span*190
 const paths:string[]=[];let segment=''
 values.forEach((v,i)=>{if(v===undefined){if(segment)paths.push(segment);segment=''}else segment+=(segment?' L':'M')+x(i)+' '+y(v)})
 if(segment)paths.push(segment)
 const choose=(id:string)=>{setSelected(id);onSelect(id)}
 const unit=active?.unit??''
 const pretty=(v:number|undefined)=>v===undefined?'—':v.toLocaleString('zh-CN',{maximumFractionDigits:1})
 const first=data?.baseline?.values[active?.id??'']
 const value=current?.values[active?.id??'']
 const sectionList=Array.from(new Map([...(data?.baseline?.sections??[]),...(current?.sections??[])].map(s=>[s.id,s])).values())
 const specials:Record<string,string>={'view:activity':'保存活动','view:distribution':'分类与作者','view:ranking':'大改版本排行','view:sections':'章节变化','view:structure':'结构变化明细','view:columns':'数值列统计','view:target':'字数目标'}
 const activities=new Map<string,number>()
 for(const v of rows){const day=localDate(v.createdAt),key=bucket==='month'?day.slice(0,7):bucket==='week'?(()=>{const d=new Date(day+'T12:00:00');d.setDate(d.getDate()-(d.getDay()+6)%7);return localDate(d.toISOString())})():day;activities.set(key,(activities.get(key)??0)+1)}
 const distribution=(field:'author'|'category')=>{const counts=new Map<string,number>();for(const v of rows){const label=v[field]??'未标注';counts.set(label,(counts.get(label)??0)+1)}return [...counts].sort((a,b)=>b[1]-a[1])}
 const resetRange=()=>{setFrom('');setUntil('');setFromDate('');setUntilDate('');setSelected(null)}
 async function exportData(image=false){
  if(!data||!rows.length)return
  setExporting(true);setExportNotice('')
  try{
   let png:string|undefined
   if(image){if(!chart.current)throw new Error('请先选择一个趋势指标再导出图表');const svg=chart.current.cloneNode(true) as SVGSVGElement
    const sources=[chart.current,...Array.from(chart.current.querySelectorAll('*'))],targets=[svg,...Array.from(svg.querySelectorAll('*'))]
    sources.forEach((source,i)=>{const style=getComputedStyle(source);for(const key of ['fill','stroke','stroke-width','font-family','font-size','opacity'])targets[i].setAttribute(key,style.getPropertyValue(key))})
    svg.setAttribute('xmlns','http://www.w3.org/2000/svg');svg.setAttribute('width','1200');svg.setAttribute('height','405')
    const blob=new Blob([new XMLSerializer().serializeToString(svg)],{type:'image/svg+xml'}),url=URL.createObjectURL(blob)
    try{const img=new Image();img.src=url;await img.decode();const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=500;const ctx=canvas.getContext('2d')!;ctx.fillStyle=getComputedStyle(document.documentElement).getPropertyValue('--wg-surface');ctx.fillRect(0,0,1200,500);ctx.fillStyle=getComputedStyle(document.documentElement).getPropertyValue('--wg-text');ctx.font='24px Microsoft YaHei';ctx.fillText(detail.title+' · '+active?.label+' · '+branch,30,38);ctx.font='14px Microsoft YaHei';ctx.fillText('单位：'+unit+'；基于历史快照；'+rows.length+'个版本',30,65);ctx.drawImage(img,0,85,1200,405);png=canvas.toDataURL('image/png')}finally{URL.revokeObjectURL(url)}
   }
   const destination=await api.dialog.savePath(image?'导出趋势图':'导出版本统计',detail.title.replace(/[\\/:*?"<>|]/g,'_')+'-版本统计.'+(image?'png':'csv'))
   if(destination){await api.stats.export(detail.docName,branch,options,destination,rows.map(v=>v.id),png);setExportNotice('已导出到 '+destination)}
  }catch(error){setExportNotice((error as Error).message)}finally{setExporting(false)}
 }
 return <div className="wg-statistics">
  <aside className="wg-stat-sidebar" aria-label="统计指标与分支">
   <div className="wg-stat-sidebar-controls"><header><BarChart3 size={19}/><strong>版本统计</strong></header>
   <label><GitBranch size={14}/> 统计分支<select aria-label="统计分支" value={branch} onChange={e=>{setBranch(e.target.value);setCompareBranch('');resetRange()}}>{Object.keys(detail.branchHeads).map(b=><option key={b}>{b}</option>)}</select></label>
   <small>只改变统计范围，不切换编辑分支。</small></div>
   {['版本','文本','改动','Word','Excel','PPT'].map(group=>definitions.some(m=>m.group===group)&&<section key={group}><h3>{group}指标</h3>{definitions.filter(m=>m.group===group).map((m)=><button key={m.id} aria-pressed={!specials[metric]&&active?.id===m.id} className={!specials[metric]&&active?.id===m.id?'active':''} style={{animationDelay:`${Math.min(450,definitions.indexOf(m)*38)}ms`}} onClick={()=>setMetric(m.id)}><FileText size={13}/><span>{m.label}</span><small>{m.unit}</small></button>)}</section>)}
   <section><h3>综合视图</h3>{Object.entries(specials).filter(([id])=>!['view:sections','view:columns','view:structure','view:target'].includes(id)||id==='view:sections'&&allRows.some(v=>v.sections?.length)||id==='view:columns'&&allRows.some(v=>v.columns?.length)||id==='view:structure'&&allRows.some(v=>v.changes?.length)||id==='view:target'&&definitions.some(m=>m.id==='wordCount')).map(([id,label])=><button key={id} aria-pressed={metric===id} className={metric===id?'active':''} onClick={()=>setMetric(id)}><CalendarDays size={14}/>{label}</button>)}</section>
  </aside>
  <main ref={content} className="wg-stat-content">
   <div className="wg-stat-heading"><div><span>MANUSCRIPT / ANALYTICS</span><h1>{specials[metric]??active?.label??'正在分析版本'}</h1><p>{detail.title} / {branch}</p></div><span className="wg-stat-scope">真实历史快照 · 只读分析</span></div>
   <div className="wg-stat-actions"><button className="wg-button" disabled={exporting||!rows.length} onClick={()=>void exportData()}>导出表格 CSV</button><button className="wg-button" disabled={exporting||!!specials[metric]||!valid.length} onClick={()=>void exportData(true)}>导出趋势 PNG</button><button className="wg-button" disabled={!current} onClick={()=>current&&onOpenVersion?.(current.id)}>查看这份版本</button><button className="wg-button" disabled={!current||!data?.baselineId||current.id===data.baselineId} onClick={()=>current&&data?.baselineId&&onCompare?.(data.baselineId,current.id)}>与基准比较内容</button></div>
   {exportNotice&&<p className="wg-stat-footnote" role="status">{exportNotice}</p>}
   <details className="wg-stat-filters"><summary>统计范围与基准 <small>{rows.length} / {allRows.length} 个版本</small></summary><div>
    <label>基准版本<select aria-label="基准版本" value={baselineId} onChange={e=>setBaselineId(e.target.value)}><option value="">首个版本</option>{detail.versions.filter(v=>!v.deletedAt).map(v=><option key={v.id} value={v.id}>{v.title}</option>)}</select></label>
    <label>起始版本<select aria-label="起始版本" value={from} onChange={e=>setFrom(e.target.value)}><option value="">分支开头</option>{allRows.map(v=><option key={v.id} value={v.id}>{v.title}</option>)}</select></label>
    <label>结束版本<select aria-label="结束版本" value={until} onChange={e=>setUntil(e.target.value)}><option value="">分支末尾</option>{allRows.map(v=><option key={v.id} value={v.id}>{v.title}</option>)}</select></label>
    <label>起始日期<input type="date" aria-label="统计起始日期" value={fromDate} onChange={e=>setFromDate(e.target.value)}/></label><label>结束日期<input type="date" aria-label="统计结束日期" value={untilDate} onChange={e=>setUntilDate(e.target.value)}/></label>
    <label>横轴<select aria-label="趋势横轴" value={axis} onChange={e=>setAxis(e.target.value)}><option value="version">版本序号</option><option value="time">记录时间</option></select></label>
    <label>对照分支<select aria-label="对照分支" value={compareBranch} onChange={e=>{setCompareBranch(e.target.value);resetRange()}}><option value="">不对照</option>{Object.keys(detail.branchHeads).filter(b=>b!==branch).map(b=><option key={b}>{b}</option>)}</select></label>
    <button className="wg-button" onClick={resetRange}>清除范围</button>
   </div>{compareBranch&&<p>各分支按唯一归属分别统计；前版本比较仍依据实际连线。</p>}</details>
   {query.isLoading?<div role="status" className="wg-stat-loading">正在读取历史版本并分析内容…</div>:query.error?<div role="alert" className="wg-stat-loading">{(query.error as Error).message}<button className="wg-button" onClick={()=>void query.refetch()}>重试</button></div>:<div key={branch+metric} className="wg-stat-reveal">
    <div className="wg-stat-cards"><section><small>范围内版本</small><strong>{rows.length}</strong><span>本分支归属版本，含独立稿</span></section><section><small>{metric==='view:activity'?'有记录的周期':specials[metric]?'所选视图 / 数量':'所选版本 / '+unit}</small><strong>{metric==='view:activity'?activities.size:metric==='view:distribution'?distribution('category').length:metric==='view:ranking'?rows.filter(v=>v.values.changed!==undefined).length:metric==='view:sections'?current?.sections?.length??0:metric==='view:structure'?current?.changeCount??0:metric==='view:columns'?current?.columns?.length??0:metric==='view:target'?pretty(current?.values.wordCount):pretty(value)}</strong><span>{current?.title??'暂无版本'}</span></section><section><small>{metric==='view:activity'?'保留覆盖次数':specials[metric]?'相同内容的额外版本':'相对基准版本'}</small><strong>{metric==='view:activity'?rows.reduce((n,v)=>n+(v.values.revisions??0),0):specials[metric]?rows.length-new Set(rows.map(v=>v.contentId)).size:value!==undefined&&first!==undefined?(value-first>=0?'+':'')+pretty(value-first):pretty(current?.baselineValues?.[active?.id??''])}</strong><span>{metric==='view:activity'?'当前保留的修订深度':specials[metric]?'二进制内容完全相同':data?.baseline?.title??'相同计数规则'}</span></section></div>
    {metric==='view:activity'?<section className="wg-stat-chart-panel"><h2>记录活动<select aria-label="活动统计周期" value={bucket} onChange={e=>setBucket(e.target.value)}><option value="day">按日</option><option value="week">按周</option><option value="month">按月</option></select></h2><div className="wg-stat-activity">{[...activities].map(([date,count])=><div key={date}><span>{date}</span><i style={{width:Math.min(100,count*12)+'%'}}/><strong>{count} 次</strong></div>)}</div><div className="wg-stat-calendar">{[...activities].map(([date,count])=><span key={date} title={date+' · '+count+'个版本'} style={{background:'color-mix(in srgb,var(--wg-selected) '+(30+Math.min(1,count/5)*70)+'%,var(--wg-surface))'}}>{date.slice(-2)}<b>{count}</b></span>)}</div><p>完整统计分支：首稿 {data?.summary?.firstAt?localDate(data.summary.firstAt):'—'} · 末稿 {data?.summary?.lastAt?localDate(data.summary.lastAt):'—'} · 记录跨度 {pretty(data?.summary?.spanDays)} 天 · 平均间隔 {pretty(data?.summary?.averageHours)} 小时 · 中位间隔 {pretty(data?.summary?.medianHours)} 小时。统计新版本创建记录，不代表编辑次数或实际写作时长。</p></section>
    :metric==='view:distribution'?<section className="wg-stat-chart-panel"><h2>分类与作者分布</h2>{(['category','author'] as const).map(field=><div key={field}><h3>{field==='category'?'当前分类':'作者标签'}</h3><div className="wg-stat-bars">{distribution(field).map(([label,count])=><div key={label}><span>{label}</span><i style={{width:count/Math.max(1,rows.length)*100+'%'}}/><b>{count}</b></div>)}</div></div>)}<p>分类采用版本当前分类，作者为记录中的标签；相同二进制内容的额外版本 {data?.summary?.duplicateVersions??0} 个。</p></section>
    :metric==='view:ranking'?<section className="wg-stat-chart-panel"><h2>大改版本排行</h2><div className="wg-stat-bars">{rows.filter(v=>v.values.changed!==undefined).sort((a,b)=>b.values.changed-a.values.changed).slice(0,10).map(v=><button key={v.id} onClick={()=>choose(v.id)}><span>{v.title}</span><b>{pretty(v.values.changed)} 字符 · 强度 {pretty(v.values.intensity)}%</b></button>)}</div><p>按相邻版本的新增+删除量排行，净增量不能代替改动量。</p></section>
    :metric==='view:sections'?<section className="wg-stat-chart-panel"><h2>章节字数、占比与基准变化</h2><table><thead><tr><th>章节</th><th>所选版本</th><th>占正文</th><th>基准版本</th><th>变化</th></tr></thead><tbody>{sectionList.map(s=>{const now=current?.sections?.find(c=>c.id===s.id),baseline=data?.baseline?.sections?.find(b=>b.id===s.id),count=now?.characters;return <tr key={s.id}><td>{s.title}{!now?'（当前未匹配）':''}</td><td>{pretty(count)} 字符</td><td>{count!==undefined&&current?.values.characters?pretty(count/current.values.characters*100)+'%':'—'}</td><td>{baseline?.characters??'—'}</td><td>{baseline&&count!==undefined?(count-baseline.characters>=0?'+':'')+pretty(count-baseline.characters):'未匹配'}</td></tr>})}</tbody></table><div className="wg-section-heatmap"><h3>章节变化热区 · 最近12个范围内版本</h3><table><thead><tr><th>章节</th>{rows.slice(-12).map(v=><th key={v.id}>{v.title}</th>)}</tr></thead><tbody>{sectionList.map(s=><tr key={s.id}><td>{s.title}</td>{rows.slice(-12).map(v=>{const count=v.sections?.find(c=>c.id===s.id)?.characters;return <td key={v.id}><button title={v.title+' / '+s.title} style={{background:'color-mix(in srgb,var(--wg-selected) '+(count===undefined?0:Math.min(100,20+count/Math.max(1,v.values.characters)*100))+'%,var(--wg-surface))'}} onClick={()=>choose(v.id)}>{count??'—'}</button></td>})}</tr>)}</tbody></table></div><p>基于标题样式分段，按稳定段落标识或同名标题匹配。标题重命名且无稳定标识时显示未匹配，不推测章节含义；空白格不等于零字。</p></section>
    :metric==='view:structure'?<section className="wg-stat-chart-panel"><h2>与上一稿的结构变化 · {current?.changeCount??0} 项</h2><table><thead><tr><th>类型 / 位置</th><th>修改前</th><th>修改后</th></tr></thead><tbody>{current?.changes?.map((c,i)=><tr key={i}><td><b>{c.kind}</b><br/>{c.name}</td><td>{c.before??'—'}</td><td>{c.after??'—'}</td></tr>)}</tbody></table><p>最多展开80项、每项前后文字最多180字符；计数仍覆盖完整文件。首稿没有上一稿。</p></section>
    :metric==='view:columns'?<section className="wg-stat-chart-panel"><h2>指定数值列</h2><label>工作表 / 列<select aria-label="数值列" value={column} onChange={e=>setColumn(e.target.value)}><option value="">请选择，避免将无关数值相加</option>{Array.from(new Set(rows.flatMap(v=>v.columns?.map(c=>c.sheet+'!'+c.column)??[]))).map(c=><option key={c}>{c}</option>)}</select></label><table><thead><tr><th>版本</th><th>数值数量</th><th>合计</th><th>均值</th><th>最小 / 最大</th></tr></thead><tbody>{rows.map(v=>{const c=v.columns?.find(c=>c.sheet+'!'+c.column===column);return <tr key={v.id} onClick={()=>choose(v.id)}><td>{v.title}</td><td>{pretty(c?.count)}</td><td>{pretty(c?.sum)}</td><td>{pretty(c?.mean)}</td><td>{pretty(c?.min)} / {pretty(c?.max)}</td></tr>})}</tbody></table><p>只统计所选列的数值及公式缓存数值；缺少结果的公式不补算，不混合单位。</p></section>
    :metric==='view:target'?<section className="wg-stat-chart-panel"><h2>字数目标</h2><label>目标字数<input type="number" min="1" aria-label="目标字数" value={target} onChange={e=>{setTarget(e.target.value);localStorage.setItem(targetKey,e.target.value)}}/></label><p>当前 {pretty(current?.values.wordCount)} 字/词；{Number(target)>0&&current?.values.wordCount!==undefined?`达成 ${(current.values.wordCount/Number(target)*100).toFixed(1)}%，还差 ${Math.max(0,Number(target)-current.values.wordCount).toLocaleString()} 字/词`:'请设置目标'}</p><progress max={Number(target)||1} value={current?.values.wordCount??0}/><p>采用汉字+英文词，目标只表示数量，不评价论文质量。</p></section>
    :<section className="wg-stat-chart-panel"><h2>{active?.label}趋势 <small>单位：{unit} · 点击节点查看对应版本</small></h2>{valid.length?<svg ref={chart} viewBox="0 0 800 270" role="img" aria-label={`${active?.label}版本趋势`}>
     {[0,.5,1].map(f=><g key={f}><line x1="60" x2="745" y1={y(min+span*f)} y2={y(min+span*f)} className="wg-stat-grid"/><text x="4" y={y(min+span*f)+4}>{pretty(min+span*f)}</text></g>)}
     {paths.map((d,i)=><path key={i} d={d} className="wg-stat-line"/>)}
     {values.map((v,i)=>v!==undefined&&<g key={rows[i].id} tabIndex={0} role="button" aria-label={`选择${rows[i].title}`} onClick={()=>choose(rows[i].id)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();choose(rows[i].id)}}}><circle cx={x(i)} cy={y(v)} r={rows[i].id===current?.id?7:4} className="wg-stat-dot"/><circle cx={x(i)} cy={y(v)} r="16" fill="transparent"/><title>{rows[i].title}：{pretty(v)} {unit}</title></g>)}
     {rows.filter((_,i)=>rows.length<10||i%Math.ceil(rows.length/8)===0).map(v=><text key={v.id} x={x(rows.indexOf(v))} y="254" textAnchor="middle">{axis==='time'?localDate(v.createdAt):'v'+(rows.indexOf(v)+1)}</text>)}
    </svg>:<p>此分支尚无可计算数据。首稿没有上一稿，增删与保留率显示“—”。</p>}</section>}
    <section className="wg-stat-detail"><h2><Layers size={16}/>所选版本 · {current?.title??'—'}</h2>{current?.unavailable&&<p role="note">{current.unavailable}</p>}<div>{definitions.filter(m=>m.id in (current?.values??{})).map(m=><span key={m.id}><small>{m.label}</small><b>{pretty(current?.values[m.id])} {m.unit}</b></span>)}</div><p>相对基准 {detail.versions.find(v=>v.id===data?.baselineId)?.title??'—'}：新增 {pretty(current?.baselineValues?.inserted)}、删除 {pretty(current?.baselineValues?.deleted)} 字符；净变化 {pretty(current?.baselineValues?.net)}，体积变化 {pretty(current?.baselineValues?.sizeDelta)} 字节。</p></section>
    <section className="wg-stat-table"><h2>逐版核对</h2><table><thead><tr><th>版本</th><th>{active?.label??'记录日期'}</th><th>文件大小</th><th>覆盖修订</th></tr></thead><tbody>{rows.map(v=><tr key={v.id} className={v.id===current?.id?'selected':''} tabIndex={0} onClick={()=>choose(v.id)} onKeyDown={e=>{if(e.key==='Enter')choose(v.id)}}><td>{v.title}</td><td>{metric==='view:activity'?new Date(v.createdAt).toLocaleDateString('zh-CN'):pretty(v.values[active?.id??''])+' '+unit}</td><td>{pretty(v.values.size)} 字节</td><td>{v.values.revisions} 次</td></tr>)}</tbody></table></section>
    <p className="wg-stat-footnote">{data?.scope}</p>
   </div>}
  </main>
 </div>
}
