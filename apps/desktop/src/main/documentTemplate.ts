import { promises as fs } from 'node:fs'
import ExcelJS from 'exceljs'
import { zipSync } from 'fflate'

export async function blankDocument(filePath: string, format: 'docx' | 'xlsx' | 'txt' | 'md'): Promise<void> {
  if (format === 'txt' || format === 'md') { await fs.writeFile(filePath, ''); return }
  if (format === 'xlsx') {
    const book = new ExcelJS.Workbook()
    book.addWorksheet('工作表1').getCell('A1').value = ''
    await book.xlsx.writeFile(filePath)
    return
  }
  const enc = new TextEncoder()
  await fs.writeFile(filePath, zipSync({
    '[Content_Types].xml': enc.encode('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'),
    '_rels/.rels': enc.encode('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'),
    'word/document.xml': enc.encode('<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p/><w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>'),
  }, { mtime: new Date(1980, 0, 1) }))
}

