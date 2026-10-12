import { unzipSync } from 'fflate'
import { SaxesParser } from 'saxes'
import ExcelJS from 'exceljs'

export interface Analysis {
 text?: string; values: Record<string, number>; unavailable?: string
 paragraphs?: Array<{ id: string; text: string }>
 sections?: Array<{ id: string; title: string; characters: number }>
 sheets?: Array<{ id: string; name: string; cells: Record<string,{ value: string; formula?: string }> }>
 columns?: Array<{ sheet: string; column: string; count: number; sum: number; mean: number; min: number; max: number }>
 slides?: Array<{ id: string; text: string }>
}
const characters = (text: string) => Array.from(text.normalize('NFC').replace(/\s/gu,'')).length
function wordStructure(xml: string, styles?: string) {
 const headings=new Set<string>();let styleId=''
 if(styles){const parser=new SaxesParser({xmlns:true});parser.on('opentag',tag=>{if(tag.name==='w:style')styleId=String(tag.attributes['w:styleId']?.value??'');if(tag.name==='w:name'&&/^(heading\s*\d|标题\s*\d)/i.test(String(tag.attributes['w:val']?.value??'')))headings.add(styleId);if(tag.name==='w:outlineLvl'&&Number(tag.attributes['w:val']?.value)<9)headings.add(styleId)});parser.write(styles).close()}
 const paragraphs:Array<{id:string;text:string;heading:boolean}>=[];let current:{id:string;text:string;heading:boolean}|undefined,capture=false
 const parser=new SaxesParser({xmlns:true})
 parser.on('opentag',tag=>{
  if(tag.name==='w:p')current={id:String(tag.attributes['w14:paraId']?.value??''),text:'',heading:false}
  if(tag.name==='w:t')capture=true
  if(current&&tag.name==='w:pStyle'){const id=String(tag.attributes['w:val']?.value??'');current.heading=headings.has(id)||/^Heading\d$/i.test(id)}
  if(current&&tag.name==='w:outlineLvl'&&Number(tag.attributes['w:val']?.value)<9)current.heading=true
  if(current&&['w:tab','w:br'].includes(tag.name))current.text+=' '
 })
 parser.on('text',value=>{if(current&&capture)current.text+=value})
 parser.on('closetag',tag=>{if(tag.name==='w:t')capture=false;if(tag.name==='w:p'&&current){paragraphs.push(current);current=undefined}})
 parser.write(xml).close()
 const sections:Array<{id:string;title:string;characters:number}>=[];const seen=new Map<string,number>()
 for(const p of paragraphs){if(p.heading||!sections.length){const title=p.heading?p.text.trim():'正文（首个标题前）',n=(seen.get(title)??0)+1;seen.set(title,n);sections.push({id:p.id||title+'#'+n,title,characters:0})}sections.at(-1)!.characters+=characters(p.text)}
 return {paragraphs:paragraphs.filter(p=>p.text.trim()).map(p=>({id:p.id,text:p.text})),sections,headings:paragraphs.filter(p=>p.heading).length}
}
function xmlStats(xml: string, textTag: string) {
  const counts: Record<string, number> = {}, texts: string[] = []
  const parser = new SaxesParser({ xmlns: true })
  let capture = false
  parser.on('opentag', tag => { counts[tag.name] = (counts[tag.name] ?? 0) + 1; if (tag.name === textTag) capture = true })
  parser.on('text', value => { if (capture) texts.push(value) })
  parser.on('closetag', tag => { if (tag.name === textTag) capture = false; if (['w:p', 'a:p'].includes(tag.name)) texts.push('\n') })
  parser.write(xml).close()
  return { counts, text: texts.join('') }
}
export async function analyzeVersion(bytes: Uint8Array, ext: string): Promise<Analysis> {
  const values: Record<string, number> = { size: bytes.byteLength }
  try {
    let text: string | undefined
    const structure: Pick<Analysis,'paragraphs'|'sections'|'sheets'|'columns'|'slides'> = {}
    if (['.txt', '.md', '.csv', '.json', '.xml', '.html'].includes(ext)) text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    else if (ext === '.docx' || ext === '.pptx') {
      const files = unzipSync(bytes), decode = (key: string) => { if (!files[key]) throw new Error('缺少文档正文'); return new TextDecoder().decode(files[key]) }
      if (ext === '.docx') {
        const body = xmlStats(decode('word/document.xml'), 'w:t')
        text = body.text
        values.paragraphs = body.counts['w:p'] ?? 0
        values.tables = body.counts['w:tbl'] ?? 0
        values.images = body.counts['w:drawing'] ?? 0
        values.comments = files['word/comments.xml'] ? xmlStats(decode('word/comments.xml'), 'w:t').counts['w:comment'] ?? 0 : 0
        const parts=wordStructure(decode('word/document.xml'),files['word/styles.xml']?decode('word/styles.xml'):undefined)
        structure.paragraphs=parts.paragraphs;structure.sections=parts.sections;values.headings=parts.headings;values.sections=parts.sections.length
        for(const [part,tag,metric] of [['footnotes','w:footnote','footnotes'],['endnotes','w:endnote','endnotes']]){
         values[metric]=0;if(files[`word/${part}.xml`]){const parser=new SaxesParser({xmlns:true});parser.on('opentag',t=>{if(t.name===tag&&Number(t.attributes['w:id']?.value)>0)values[metric]++});parser.write(decode(`word/${part}.xml`)).close()}
        }
        if(files['word/commentsExtended.xml']){let done=0,total=0;const parser=new SaxesParser({xmlns:true});parser.on('opentag',t=>{if(t.name==='w15:commentEx'){total++;if(['1','true'].includes(String(t.attributes['w15:done']?.value)))done++}});parser.write(decode('word/commentsExtended.xml')).close();if(total===values.comments){values.commentsResolved=done;values.commentsOpen=total-done}}
      } else {
        const slides = Object.keys(files).filter(k => /^ppt\/slides\/slide\d+\.xml$/.test(k)).sort((a,b) => a.localeCompare(b,undefined,{numeric:true}))
        if (!slides.length) throw new Error('缺少幻灯片')
        text = slides.map(k => xmlStats(decode(k), 'a:t').text).join('\n')
        structure.slides=slides.map(k=>({id:k,text:xmlStats(decode(k),'a:t').text}))
        values.slides = slides.length
        const notes = Object.keys(files).filter(k => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(k))
        values.notes = Array.from(notes.map(k => xmlStats(decode(k),'a:t').text).join('').replace(/\s/gu,'')).length
      }
    } else if (ext === '.xlsx') {
      const book = new ExcelJS.Workbook()
      await book.xlsx.load(new Uint8Array(bytes).buffer)
      values.sheets = book.worksheets.length; values.cells = 0; values.formulas = 0; values.errors = 0
      values.rows=0;values.columns=0;let effectiveSlots=0;structure.sheets=[];structure.columns=[]
      for (const sheet of book.worksheets) {
       const cells:NonNullable<Analysis['sheets']>[number]['cells']={},usedRows=new Set<number>(),usedCols=new Set<number>(),numbers=new Map<string,number[]>()
       sheet.eachRow(row => row.eachCell(cell => {
        if (cell.value === null || cell.value === '') return
        values.cells++;usedRows.add(Number(cell.row));usedCols.add(Number(cell.col))
        if (cell.type === ExcelJS.ValueType.Formula) values.formulas++
        if (cell.type === ExcelJS.ValueType.Error || typeof cell.value === 'object' && cell.value !== null && 'result' in cell.value && typeof cell.value.result === 'object' && cell.value.result !== null && 'error' in cell.value.result) values.errors++
        const raw=cell.value,formula=cell.type===ExcelJS.ValueType.Formula?cell.formula:undefined
        const resolved=typeof raw==='object'&&raw!==null&&'result' in raw?raw.result:raw
        cells[cell.address]={value:JSON.stringify(resolved)??'',formula}
        if(typeof resolved==='number'&&Number.isFinite(resolved)){const col=cell.address.replace(/\d/g,'');if(!numbers.has(col))numbers.set(col,[]);numbers.get(col)!.push(resolved)}
      }))
       values.rows+=usedRows.size;values.columns+=usedCols.size
       effectiveSlots+=usedRows.size*usedCols.size
       structure.sheets.push({id:String(sheet.id),name:sheet.name,cells})
       for(const [column,nums] of numbers){const sum=nums.reduce((a,b)=>a+b,0);structure.columns.push({sheet:sheet.name,column,count:nums.length,sum,mean:sum/nums.length,min:nums.reduce((a,b)=>Math.min(a,b)),max:nums.reduce((a,b)=>Math.max(a,b))})}
      }
      if(effectiveSlots)values.emptyRatio=(effectiveSlots-values.cells)/effectiveSlots*100
    } else return { values, unavailable: '此格式暂支持文件大小与版本记录统计；内容解析尚不支持。' }
    if (text !== undefined) {
      text = text.normalize('NFC').replace(/\s+/gu, ' ').trim()
      values.characters = Array.from(text.replace(/\s/gu, '')).length
      values.hanzi = (text.match(/\p{Script=Han}/gu) ?? []).length
      values.words = (text.match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g) ?? []).length
      values.digits=(text.match(/\p{Number}/gu)??[]).length
      values.wordCount=values.hanzi+values.words
    }
    return { text, values, ...structure }
  } catch { return { values: { size: bytes.byteLength }, unavailable: '文件内容无法解析；保留文件大小与版本记录统计，内容指标显示不可用。' } }
}
