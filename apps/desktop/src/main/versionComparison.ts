import path from 'node:path'
import ExcelJS from 'exceljs'
import { unzipSync } from 'fflate'
import { diffText, extractDocxText, type Repo } from '@wordgit/core'
import { CommitDiffTextReq, type DiffResult } from '@wordgit/shared'
import { readVersionWithin } from './versionFile.js'

async function extractText(buf: Uint8Array, ext: string): Promise<string> {
  if (ext === '.docx') return extractDocxText(buf)
  if (ext === '.xlsx') {
    const book = new ExcelJS.Workbook()
    await book.xlsx.load(new Uint8Array(buf).buffer)
    const lines: string[] = []
    for (const sheet of book.worksheets) {
      lines.push('工作表：' + sheet.name)
      sheet.eachRow(row => row.eachCell(cell => {
        lines.push(sheet.name + '!' + cell.address + '：' + (typeof cell.value === 'object' ? JSON.stringify(cell.value) : String(cell.value ?? '')))
      }))
    }
    return lines.join('\n')
  }
  if (ext === '.pptx') {
    const parts = unzipSync(buf)
    return Object.keys(parts).filter(k => /^ppt\/slides\/slide\d+\.xml$/.test(k)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).map(k => {
      const xml = new TextDecoder().decode(parts[k])
      return k + '\n' + xml.replace(/<\/a:p>/g, '\n').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    }).join('\n\n')
  }
  if (['.txt', '.md', '.csv', '.json', '.xml', '.html'].includes(ext)) return new TextDecoder().decode(buf)
  throw new Error('该格式暂不支持文本对比，请导出两份历史副本用系统应用查看')
}

export async function compareVersions(repo: Repo, args: unknown): Promise<DiffResult[]> {
  const { docName, commitIdA, commitIdB } = CommitDiffTextReq.parse(args)
  const [bufA, bufB] = await Promise.all([
    readVersionWithin(repo, docName, commitIdA),
    readVersionWithin(repo, docName, commitIdB),
  ])
  const [textA, textB] = await Promise.all([
    extractText(bufA, path.extname(docName).toLowerCase()),
    extractText(bufB, path.extname(docName).toLowerCase()),
  ])
  return diffText(textA, textB)
}

