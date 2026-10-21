import { promises as fs } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { blankDocument } from './documentTemplate.js'
import {
  documentDetail, updateDocument, updateVersion, updateCategory, arrangeVersions,
  importVersion, saveWorkspace, undoReplacement, exportVersion, 
  moveBranchHead, validateDocName, importDoc, startDraft, recordDraftSave, editVersionRelations, tidyVersionLayout, purgeVersion,
  withUndoableAction, clearEditHistory, refreshWorkspaceDocuments, type Repo,
} from '@wordgit/core'
import { LibraryMutationSchema } from '@wordgit/shared'
import type { LibraryMutationResult } from '@wordgit/shared'

async function executeMutation(repo: Repo, args: unknown, openFile?: (file: string) => Promise<void>): Promise<LibraryMutationResult> {
  const request = LibraryMutationSchema.parse(args)
  switch (request.type) {
    case 'refreshWorkspace': return refreshWorkspaceDocuments(repo)
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
      await openFile?.(workspacePath)
      return { workspacePath }
    }
    case 'openCopy': {
      const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'wordgit-preview-'))
      const copy = path.join(temporary, validateDocName(request.docName))
      await exportVersion(repo, request.docName, request.versionId, copy)
      await openFile?.(copy)
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

const labels: Record<string, string> = { document: '编辑文档信息', version: '编辑版本信息或位置', layout: '整理卡片布局', relations: '编辑版本连线', category: '编辑版本分类', arrange: '移动分类卡片', importVersion: '导入版本', save: '保存版本', undoReplacement: '还原版本内容', moveBranch: '移动分支起点', createDocument: '新建文档', edit: '准备独立编辑稿', refreshWorkspace: '刷新工作目录' }

export async function mutateLibrary(repo: Repo, args: unknown, openFile?: (file: string) => Promise<void>): Promise<LibraryMutationResult> {
  const request = LibraryMutationSchema.parse(args)
  if (request.type === 'purgeVersion') {
    const result = await executeMutation(repo, request, openFile)
    clearEditHistory(repo)
    return result
  }
  let workspaceName: string | undefined
  if (request.type === 'createDocument') workspaceName = request.name.trim().toLowerCase().endsWith('.' + request.format) ? request.name.trim() : request.name.trim() + '.' + request.format
  else if ('docName' in request && ['importVersion', 'save', 'undoReplacement', 'moveBranch', 'edit'].includes(request.type)) workspaceName = request.docName
  const label = labels[request.type]
  return label ? withUndoableAction(repo, label, () => executeMutation(repo, request, openFile), workspaceName) : executeMutation(repo, request, openFile)
}
