import { promises as fs } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { ipcMain, shell } from 'electron'
import ExcelJS from 'exceljs'
import { zipSync } from 'fflate'
import {
  libraryDocuments, documentDetail, updateDocument, updateVersion, updateCategory, arrangeVersions,
  importVersion, saveWorkspace, undoReplacement, exportVersion, 
  moveBranchHead, validateDocName, importDoc, startDraft, recordDraftSave, editVersionRelations, tidyVersionLayout, purgeVersion,
  withUndoableAction, clearEditHistory,
} from '@wordgit/core'
import { CH, LibraryDetailReq, LibraryMutationSchema } from '@wordgit/shared'
import type { LibraryMutationResult } from '@wordgit/shared'
import { getRepo } from '../repoState.js'

export async function libraryListHandler() { return libraryDocuments(getRepo()) }
export async function libraryDetailHandler(args: unknown) {
  return documentDetail(getRepo(), LibraryDetailReq.parse(args).docName)
}

async function openFile(filePath: string): Promise<void> {
  const error = await shell.openPath(filePath)
  if (error) throw new Error('无法打开系统编辑器：' + error)
}

async function blankDocument(filePath: string, format: 'docx' | 'xlsx' | 'txt'): Promise<void> {
  if (format === 'txt') { await fs.writeFile(filePath, ''); return }
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

export async function libraryMutationHandler(args: unknown): Promise<LibraryMutationResult> {
  const request = LibraryMutationSchema.parse(args)
  const repo = getRepo()
  switch (request.type) {
    case 'document':
      await updateDocument(repo, request.docName, request)
      break
    case 'version':
      await updateVersion(repo, request.docName, request.versionId, request)
      break
    case 'layout':
      await tidyVersionLayout(repo, request.docName)
      break
    case 'relations':
      await editVersionRelations(repo, request.docName, request.versionId, request)
      break
    case 'purgeVersion':
      return purgeVersion(repo, request.docName, request.versionId, request)
    case 'category':
      return { categoryId: await updateCategory(repo, request.docName, request.action, request.name, request.categoryId) }
    case 'arrange':
      await arrangeVersions(repo, request.docName, request.categoryId, request.versionIds)
      break
    case 'importVersion':
      return { versionId: await importVersion(repo, request.docName, request.sourcePath, request) }
    case 'save': {
      const detail = await documentDetail(repo, request.docName)
      if (detail.draft && !detail.workspace.dirty) {
        const saved = await recordDraftSave(repo, path.join(repo.root, detail.draft.path))
        return { versionId: saved?.versionId ?? detail.draft.versionId ?? detail.draft.baseVersionId, changed: !!saved }
      }
      return saveWorkspace(repo, request.docName, request.mode, request.message)
    }
    case 'undoReplacement':
      await undoReplacement(repo, request.docName, request.versionId)
      break
    case 'export':
      await exportVersion(repo, request.docName, request.versionId, request.destination)
      break
    case 'edit': {
      const detail = await documentDetail(repo, request.docName)
      const branch = request.branch ?? detail.currentBranch
      const versionId = request.versionId ?? detail.branchHeads[branch]
      const workspacePath = !request.versionId && detail.draft?.branch === branch
        ? path.join(repo.root, detail.draft.path)
        : (await startDraft(repo, request.docName, versionId, branch, request.mode, request.title)).workspacePath
      await fs.access(workspacePath)
      await openFile(workspacePath)
      return { workspacePath }
    }
    case 'openCopy': {
      const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'wordgit-preview-'))
      const copy = path.join(temporary, validateDocName(request.docName))
      await exportVersion(repo, request.docName, request.versionId, copy)
      await openFile(copy)
      return { workspacePath: copy }
    }
    case 'moveBranch':
      return moveBranchHead(repo, request.docName, request.branch, request.versionId)
    case 'createDocument': {
      const requested = request.name.trim()
      const name = validateDocName(requested.toLowerCase().endsWith('.' + request.format) ? requested : requested + '.' + request.format)
      const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'wordgit-new-'))
      try {
        const source = path.join(temporary, name)
        await blankDocument(source, request.format)
        const result = await importDoc(repo, source, name)
        return { docName: name, versionId: result.commitId }
      } finally {
        const resolved = path.resolve(temporary)
        if (!resolved.startsWith(path.resolve(os.tmpdir()) + path.sep) || !path.basename(resolved).startsWith('wordgit-new-')) throw new Error('临时目录位置无效')
        await fs.rm(resolved, { recursive: true, force: true })
      }
    }
  }
  return {}
}

export function registerLibraryHandlers(): void {
  ipcMain.handle(CH.LIBRARY_LIST, () => libraryListHandler())
  ipcMain.handle(CH.LIBRARY_DETAIL, (_event, args: unknown) => libraryDetailHandler(args))
  const labels: Record<string, string> = { document: '编辑文档信息', version: '编辑版本信息或位置', layout: '整理布局', relations: '编辑版本连线', category: '编辑版本分类', arrange: '移动分类卡片', importVersion: '导入版本', save: '保存版本', undoReplacement: '还原版本内容', moveBranch: '移动分支起点', createDocument: '新建文档', edit: '准备独立编辑稿' }
  ipcMain.handle(CH.LIBRARY_MUTATE, (_event, args: unknown) => {
    const request = LibraryMutationSchema.parse(args), repo = getRepo()
    if (request.type === 'purgeVersion') { clearEditHistory(repo); return libraryMutationHandler(request) }
    let workspaceName: string | undefined
    if (request.type === 'createDocument') workspaceName = request.name.trim().toLowerCase().endsWith('.' + request.format) ? request.name.trim() : request.name.trim() + '.' + request.format
    else if (['importVersion', 'save', 'undoReplacement', 'moveBranch'].includes(request.type)) workspaceName = request.docName
    const label = labels[request.type]
    return label ? withUndoableAction(repo, label, () => libraryMutationHandler(request), workspaceName) : libraryMutationHandler(request)
  })
}
