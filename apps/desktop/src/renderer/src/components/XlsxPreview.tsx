import { useEffect, useState } from 'react'
import ExcelJS from 'exceljs'

interface SheetData { name:string; columns:number[]; rows:Array<{number:number;cells:Record<number,string>;formulas:Record<number,string>}> }
function columnLabel(index:number){let label='';for(let n=index;n>0;n=Math.floor((n-1)/26))label=String.fromCharCode(65+(n-1)%26)+label;return label}

export function XlsxPreview({data}:{data:ArrayBuffer}){
 const [sheets,setSheets]=useState<SheetData[]>([]),[selected,setSelected]=useState(0),[error,setError]=useState('')
 useEffect(()=>{
  let active=true;setSheets([]);setSelected(0);setError('')
  const book=new ExcelJS.Workbook()
  void book.xlsx.load(data).then(()=>{
   if(!active)return
   if(!book.worksheets.length){setError('Excel 文件中没有工作表');return}
   setSheets(book.worksheets.map(sheet=>{
    const rows:SheetData['rows']=[],columns=new Set<number>()
    sheet.eachRow(row=>{const cells:Record<number,string>={},formulas:Record<number,string>={}
     row.eachCell(cell=>{const value=cell.value;if(value===null||value==='')return;const col=Number(cell.col);columns.add(col)
      if(typeof value==='object'&&'richText' in value)cells[col]=value.richText.map(r=>r.text).join('')
      else if(typeof value==='object'&&('formula' in value||'sharedFormula' in value)){formulas[col]='='+cell.formula;const result=value.result;cells[col]=typeof result==='object'&&result&&'error' in result?result.error:result===undefined?formulas[col]:String(result)}
      else if(value instanceof Date)cells[col]=value.toLocaleDateString('zh-CN')
      else if(typeof value==='object'&&'error' in value)cells[col]=value.error
      else cells[col]=cell.text
     });if(Object.keys(cells).length)rows.push({number:row.number,cells,formulas})
    })
    return {name:sheet.name,columns:[...columns].sort((a,b)=>a-b),rows}
   }))
  }).catch(e=>{if(active)setError((e as Error).message)})
  return()=>{active=false}
 },[data])
 if(error)return <p role="alert" className="text-destructive text-sm p-4">{error}</p>
 if(!sheets.length)return <p className="text-muted-foreground text-sm p-4">解析中…</p>
 const sheet=sheets[selected],cols=sheet.columns.slice(0,60),rows=sheet.rows.slice(0,300)
 return <div className="wg-xlsx-preview"><div role="tablist" aria-label="工作表">{sheets.map((s,i)=><button role="tab" key={s.name} aria-selected={i===selected} onClick={()=>setSelected(i)}>{s.name}</button>)}</div><p>只显示有内容的行列，保留真实坐标；鼠标停留查看公式。{sheet.rows.length>300||sheet.columns.length>60?'预览限前300个有效行、60列，完整内容请打开历史副本。':''}</p><div className="wg-xlsx-grid"><table><thead><tr><th></th>{cols.map(c=><th key={c}>{columnLabel(c)}</th>)}</tr></thead><tbody>{rows.map(row=><tr key={row.number}><th>{row.number}</th>{cols.map(c=><td key={c} title={columnLabel(c)+row.number+(row.formulas[c]?' · '+row.formulas[c]:'')}>{row.cells[c]??''}</td>)}</tr>)}</tbody></table>{!rows.length&&<p>这张工作表没有内容。</p>}</div></div>
}