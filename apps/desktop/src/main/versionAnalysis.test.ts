import { describe,it,expect } from 'vitest'
import { zipSync } from 'fflate'
import ExcelJS from 'exceljs'
import { analyzeVersion } from './versionAnalysis.js'

describe('real version analysis',()=>{
 it('decodes XML entities, separates paragraphs, and counts Unicode code points',async()=>{
  const bytes=zipSync({'word/document.xml':new TextEncoder().encode('<w:document xmlns:w="urn:w"><w:body><w:p><w:r><w:t>甲&amp;乙😀</w:t></w:r></w:p><w:p><w:r><w:t>Hello world</w:t></w:r></w:p><w:tbl/></w:body></w:document>')})
  const result=await analyzeVersion(bytes,'.docx')
  expect(result.text).toBe('甲&乙😀 Hello world');expect(result.values.characters).toBe(14);expect(result.values.paragraphs).toBe(2);expect(result.values.hanzi).toBe(2);expect(result.values.words).toBe(2);expect(result.values.tables).toBe(1)
 })
 it('does not report unreadable documents as zero characters',async()=>{
  const result=await analyzeVersion(new Uint8Array([1,2,3]),'.docx')
  expect(result.unavailable).toBeTruthy();expect(result.values.characters).toBeUndefined();expect(result.values.size).toBe(3)
 })
 it('counts actual Excel cells and formulas, ignoring empty formatted cells',async()=>{
  const book=new ExcelJS.Workbook(),sheet=book.addWorksheet('数据');sheet.getCell('A1').value=2;sheet.getCell('A2').value={formula:'A1*2',result:4};sheet.getCell('Z99').font={bold:true}
  const result=await analyzeVersion(new Uint8Array(await book.xlsx.writeBuffer()),'.xlsx')
  expect(result.values.sheets).toBe(1);expect(result.values.cells).toBe(2);expect(result.values.formulas).toBe(1);expect(result.values.characters).toBeUndefined()
 })
 it('counts slide content separately from notes',async()=>{
  const enc=new TextEncoder(),xml=(s:string)=>enc.encode(`<p:sld xmlns:p="urn:p" xmlns:a="urn:a"><a:p><a:t>${s}</a:t></a:p></p:sld>`)
  const result=await analyzeVersion(zipSync({'ppt/slides/slide1.xml':xml('标题'),'ppt/slides/slide2.xml':xml('内容'),'ppt/notesSlides/notesSlide1.xml':xml('演讲备注')}),'.pptx')
  expect(result.values.slides).toBe(2);expect(result.values.characters).toBe(4);expect(result.values.notes).toBe(4)
 })
})
