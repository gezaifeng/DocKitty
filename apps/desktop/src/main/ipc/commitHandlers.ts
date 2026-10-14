import { ipcMain } from 'electron'
import path from 'node:path'
import ExcelJS from 'exceljs'
import { unzipSync } from 'fflate'
import {
  commitDoc, listCommits as coreListCommits, checkoutDoc,
  versionBytes,
  diffText, extractDocxText,
  withUndoableAction,
} from '@wordgit/core'
import {
  CH, CommitCreateReq, CommitListReq, CommitCheckoutReq, CommitDiffTextReq,
} from '@wordgit/shared'
import type { CommitResult, CommitNode, DiffResult } from '@wordgit/shared'
import { getRepo } from '../repoState.js'

export async function createCommitHandler(args: unknown): Promise<CommitResult> {
  const { docName, message, author, branch } = CommitCreateReq.parse(args)
  const repo = getRepo()
  return commitDoc(repo, docName, { message, author, branch })
}

export async function listCommitsHandler(args: unknown): Promise<CommitNode[]> {
  const { docName, branch } = CommitListReq.parse(args)
  const repo = getRepo()
  return coreListCommits(repo, docName, branch)
}

export async function checkoutCommitHandler(args: unknown): Promise<{ docId: string; commitId: string }> {
  const { docName, commitId, branch } = CommitCheckoutReq.parse(args)
  const repo = getRepo()
  return checkoutDoc(repo, docName, { commitId, branch })
}

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

export async function diffTextHandler(args: unknown): Promise<DiffResult[]> {
  const { docName, commitIdA, commitIdB } = CommitDiffTextReq.parse(args)
  const repo = getRepo()
  const [bufA, bufB] = await Promise.all([
    versionBytes(repo, docName, commitIdA),
    versionBytes(repo, docName, commitIdB),
  ])
  const [textA, textB] = await Promise.all([
    extractText(bufA, path.extname(docName).toLowerCase()),
    extractText(bufB, path.extname(docName).toLowerCase()),
  ])
  return diffText(textA, textB)
}

export function registerCommitHandlers(): void {
  ipcMain.handle(CH.COMMIT_CREATE, (_e, arg: unknown) => { const req = CommitCreateReq.parse(arg); return withUndoableAction(getRepo(), '记录版本', () => createCommitHandler(req), req.docName) })
  ipcMain.handle(CH.COMMIT_LIST, (_e, arg: unknown) => listCommitsHandler(arg))
  ipcMain.handle(CH.COMMIT_CHECKOUT, (_e, arg: unknown) => { const req = CommitCheckoutReq.parse(arg); return withUndoableAction(getRepo(), '恢复工作区', () => checkoutCommitHandler(req), req.docName) })
  ipcMain.handle(CH.COMMIT_DIFF_TEXT, (_e, arg: unknown) => diffTextHandler(arg))
}
