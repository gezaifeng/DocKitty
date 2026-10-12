import { diffTextBounded } from '@wordgit/core'
import type { Analysis } from './versionAnalysis.js'
import type { VersionStatistic } from '@wordgit/shared'

export function compareAnalyses(before: Analysis, after: Analysis) {
 const values:Record<string,number>={},changes:NonNullable<VersionStatistic['changes']>=[]
 let changeCount=0
 const record=(kind:string,name:string,old?:string,next?:string)=>{changeCount++;if(changes.length<80)changes.push({kind,name,before:old?.slice(0,180),after:next?.slice(0,180)})}
 values.sizeDelta=after.values.size-before.values.size
 if(before.values.size)values.sizeGrowth=values.sizeDelta/before.values.size*100
 if(before.text!==undefined&&after.text!==undefined&&before.text.length+after.text.length<=160000){
  const chunks=diffTextBounded(before.text.replace(/\s/gu,''),after.text.replace(/\s/gu,''))
  if(chunks){
   const count=(kind:string)=>chunks.filter(c=>kind==='insert'?c.added:kind==='delete'?c.removed:!c.added&&!c.removed).reduce((n,c)=>n+Array.from(c.value).length,0)
   values.inserted=count('insert');values.deleted=count('delete');values.changed=values.inserted+values.deleted;values.net=values.inserted-values.deleted
   const total=before.values.characters+after.values.characters
   if(total)values.intensity=values.changed/total*100
   if(before.values.characters){values.retained=count('equal')/before.values.characters*100;values.deletedRatio=values.deleted/before.values.characters*100}
   if(after.values.characters)values.insertedRatio=values.inserted/after.values.characters*100
  }
 }
 if(before.paragraphs&&after.paragraphs){
  const a=before.paragraphs,b=after.paragraphs,stable=a.every(p=>p.id)&&b.every(p=>p.id)&&new Set(a.map(p=>p.id)).size===a.length&&new Set(b.map(p=>p.id)).size===b.length
  if(stable){
   const old=new Map(a.map(p=>[p.id,p])),next=new Map(b.map(p=>[p.id,p]))
   values.paragraphsAdded=0;values.paragraphsDeleted=0;values.paragraphsChanged=0;values.paragraphsMoved=0
   const commonA=new Map(a.filter(p=>next.has(p.id)).map((p,i)=>[p.id,i])),commonB=new Map(b.filter(p=>old.has(p.id)).map((p,i)=>[p.id,i]))
   for(const p of a)if(!next.has(p.id)){values.paragraphsDeleted++;record('删除段落',p.id,p.text)}
   for(const p of b){const prev=old.get(p.id);if(!prev){values.paragraphsAdded++;record('新增段落',p.id,undefined,p.text)}else{if(prev.text!==p.text){values.paragraphsChanged++;record('修改段落',p.id,prev.text,p.text)}if(commonA.get(p.id)!==commonB.get(p.id))values.paragraphsMoved++}}
  }else{
   const counts=(items:typeof a)=>{const map=new Map<string,number>();for(const p of items)map.set(p.text,(map.get(p.text)??0)+1);return map}
   const old=counts(a),next=counts(b);values.paragraphsAdded=0;values.paragraphsDeleted=0
   for(const [text,n] of old){const count=Math.max(0,n-(next.get(text)??0));values.paragraphsDeleted+=count;if(count)record('删除/改写前段落',String(count)+'段',text)}
   for(const [text,n] of next){const count=Math.max(0,n-(old.get(text)??0));values.paragraphsAdded+=count;if(count)record('新增/改写后段落',String(count)+'段',undefined,text)}
  }
 }
 if(before.sheets&&after.sheets){
  values.sheetsAdded=0;values.sheetsDeleted=0;values.sheetsRenamed=0;values.cellsAdded=0;values.cellsCleared=0;values.cellsChanged=0;values.formulasAdded=0;values.formulasDeleted=0;values.formulasChanged=0;values.rowsMoved=0
  const matched=new Set<string>()
  for(const sheet of after.sheets){
   const prev=before.sheets.find(s=>s.name===sheet.name&&!matched.has(s.id))??before.sheets.find(s=>s.id===sheet.id&&!matched.has(s.id))
   if(!prev){values.sheetsAdded++;values.cellsAdded+=Object.keys(sheet.cells).length;values.formulasAdded+=Object.values(sheet.cells).filter(c=>c.formula).length;record('新增工作表',sheet.name);continue}
   matched.add(prev.id);if(prev.name!==sheet.name){values.sheetsRenamed++;record('工作表重命名',sheet.name,prev.name,sheet.name)}
   // Unique unchanged row fingerprints align inserted/moved rows before comparing addresses.
   const rowSignatures=(cells:typeof sheet.cells)=>{const rows=new Map<string,string[]>();for(const [address,cell] of Object.entries(cells)){const row=address.match(/\d+$/)![0],col=address.replace(/\d+$/,'');if(!rows.has(row))rows.set(row,[]);rows.get(row)!.push(col+':'+JSON.stringify(cell))}return new Map([...rows].map(([row,list])=>[row,list.sort().join('|')]))}
   const oldRows=rowSignatures(prev.cells),newRows=rowSignatures(sheet.cells),mapping=new Map<string,string>(),claimed=new Set<string>(),positions=new Map<string,string[]>()
   for(const [row,signature] of newRows){if(!positions.has(signature))positions.set(signature,[]);positions.get(signature)!.push(row)}
   const oldCounts=new Map<string,number>();for(const signature of oldRows.values())oldCounts.set(signature,(oldCounts.get(signature)??0)+1)
   for(const [row,signature] of oldRows){const targets=positions.get(signature);if(targets?.length===1&&oldCounts.get(signature)===1){mapping.set(row,targets[0]);claimed.add(targets[0]);if(row!==targets[0])values.rowsMoved++}}
   const aligned:typeof prev.cells={}
   for(const [address,cell] of Object.entries(prev.cells)){const row=address.match(/\d+$/)![0];const target=mapping.get(row)??(claimed.has(row)?'old-'+row:row);aligned[address.replace(/\d+$/,target)]=cell}
   for(const address of new Set([...Object.keys(aligned),...Object.keys(sheet.cells)])){
    const a=aligned[address],b=sheet.cells[address],name=sheet.name+'!'+address
    if(!a&&b){values.cellsAdded++;record('新增单元格',name,undefined,b.value)}
    else if(a&&!b){values.cellsCleared++;record('清空单元格',name,a.value)}
    else if(a&&b&&a.value!==b.value){values.cellsChanged++;record('单元格改值',name,a.value,b.value)}
    if(!a?.formula&&b?.formula){values.formulasAdded++;record('新增公式',name,undefined,b.formula)}
    else if(a?.formula&&!b?.formula){values.formulasDeleted++;record('删除公式',name,a.formula)}
    else if(a?.formula&&b?.formula&&a.formula!==b.formula){values.formulasChanged++;record('改写公式',name,a.formula,b.formula)}
   }
  }
  for(const sheet of before.sheets)if(!matched.has(sheet.id)){values.sheetsDeleted++;values.cellsCleared+=Object.keys(sheet.cells).length;values.formulasDeleted+=Object.values(sheet.cells).filter(c=>c.formula).length;record('删除工作表',sheet.name)}
 }
 if(before.slides&&after.slides){
  values.slidesAdded=0;values.slidesDeleted=0;values.slidesChanged=0;values.slidesMoved=0
  const remaining=new Set(before.slides.map(s=>s.id)),matches=new Map<string,string>()
  // Match unchanged text first, so reordering does not become a content rewrite.
  for(const slide of after.slides){const exact=before.slides.find(s=>remaining.has(s.id)&&s.text===slide.text);if(exact){remaining.delete(exact.id);matches.set(slide.id,exact.id)}}
  const oldOrder=before.slides.filter(s=>[...matches.values()].includes(s.id)).map(s=>s.id),newOrder=after.slides.filter(s=>matches.has(s.id)).map(s=>matches.get(s.id)!)
  values.slidesMoved=newOrder.filter((id,i)=>oldOrder[i]!==id).length
  for(const slide of after.slides){if(matches.has(slide.id))continue;const prev=before.slides.find(s=>s.id===slide.id&&remaining.has(s.id));if(prev){remaining.delete(prev.id);values.slidesChanged++;record('幻灯片文本修改',slide.id,prev.text,slide.text)}else{values.slidesAdded++;record('新增幻灯片文本',slide.id,undefined,slide.text)}}
  for(const slide of before.slides)if(remaining.has(slide.id)){values.slidesDeleted++;record('删除幻灯片文本',slide.id,slide.text)}
 }
 return {values,changes,changeCount}
}
