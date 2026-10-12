import { describe,it,expect } from 'vitest'
import ExcelJS from 'exceljs'
import { zipSync } from 'fflate'
import { analyzeVersion } from './versionAnalysis.js'
import { compareAnalyses } from './versionChanges.js'

describe('structured statistics',()=>{
 it('aligns stable Word paragraphs and separates a rewrite from a move',async()=>{
  const enc=new TextEncoder(),make=(body:string)=>zipSync({'word/document.xml':enc.encode('<w:document xmlns:w="urn:w" xmlns:w14="urn:w14"><w:body>'+body+'</w:body></w:document>'),'word/footnotes.xml':enc.encode('<w:footnotes xmlns:w="urn:w"><w:footnote w:id="-1"/><w:footnote w:id="0"/><w:footnote w:id="1"/></w:footnotes>')})
  const p=(id:string,text:string,heading=false)=>'<w:p w14:paraId="'+id+'">'+(heading?'<w:pPr><w:pStyle w:val="Heading1"/></w:pPr>':'')+'<w:r><w:t>'+text+'</w:t></w:r></w:p>'
  const a=await analyzeVersion(make(p('a','研究背景',true)+p('b','甲乙')+p('c','实验数据',true)),'.docx')
  const b=await analyzeVersion(make(p('a','研究背景',true)+p('c','实验数据',true)+p('b','甲乙丙')+p('d','新段落')),'.docx')
  expect(a.values.footnotes).toBe(1);expect(a.values.headings).toBe(2);expect(a.sections?.[0].characters).toBe(6)
  const diff=compareAnalyses(a,b);expect(diff.values.paragraphsChanged).toBe(1);expect(diff.values.paragraphsAdded).toBe(1);expect(diff.values.paragraphsDeleted).toBe(0);expect(diff.values.paragraphsMoved).toBe(2)
 })
 it('does not count inserted Excel rows as rewriting all shifted values',async()=>{
  const make=async(insert:boolean)=>{const book=new ExcelJS.Workbook(),sheet=book.addWorksheet('数据');sheet.getCell(insert?'A2':'A1').value=10;sheet.getCell(insert?'A3':'A2').value=20;if(insert)sheet.getCell('A1').value=5;return analyzeVersion(new Uint8Array(await book.xlsx.writeBuffer()),'.xlsx')}
  const a=await make(false),b=await make(true),diff=compareAnalyses(a,b)
  expect(diff.values.cellsAdded).toBe(1);expect(diff.values.cellsCleared).toBe(0);expect(diff.values.cellsChanged).toBe(0);expect(diff.values.rowsMoved).toBe(2)
  expect(b.columns?.[0]).toMatchObject({column:'A',count:3,sum:35,min:5,max:20})
 })
 it('separates formula rewrites from cached result changes and includes new sheets',async()=>{
  const make=async(next:boolean)=>{const book=new ExcelJS.Workbook(),sheet=book.addWorksheet('计算');sheet.getCell('A1').value={formula:next?'2+3':'2+2',result:next?5:4};if(next)book.addWorksheet('新增').getCell('B5').value=9;return analyzeVersion(new Uint8Array(await book.xlsx.writeBuffer()),'.xlsx')}
  const diff=compareAnalyses(await make(false),await make(true))
  expect(diff.values.formulasChanged).toBe(1);expect(diff.values.cellsChanged).toBe(1);expect(diff.values.sheetsAdded).toBe(1);expect(diff.values.cellsAdded).toBe(1)
 })
 it('recognizes slide reordering and does not call an inserted first slide a move',()=>{
  const a={values:{size:10},slides:[{id:'1',text:'甲'},{id:'2',text:'乙'}]},b={values:{size:12},slides:[{id:'1',text:'乙'},{id:'2',text:'甲'}]}
  expect(compareAnalyses(a,b).values).toMatchObject({slidesAdded:0,slidesDeleted:0,slidesChanged:0,slidesMoved:2})
  expect(compareAnalyses(a,{values:{size:12},slides:[{id:'0',text:'新'},...a.slides]}).values).toMatchObject({slidesAdded:1,slidesMoved:0})
 })
 it('leaves empty denominators unavailable, and caps detail output without truncating totals',()=>{
  const a={text:'',values:{size:0,characters:0},paragraphs:[]},b={text:'甲',values:{size:1,characters:1},paragraphs:Array.from({length:100},(_,i)=>({id:String(i),text:'新'+i}))}
  const diff=compareAnalyses(a,b)
  expect(diff.values.retained).toBeUndefined();expect(diff.values.sizeGrowth).toBeUndefined();expect(diff.values.paragraphsAdded).toBe(100);expect(diff.changes).toHaveLength(80);expect(diff.changeCount).toBe(100)
 })
})
