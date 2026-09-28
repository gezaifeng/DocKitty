import path from 'node:path'
import { ipcMain, shell } from 'electron'
import {
  importDoc as coreImportDoc,
  listCommits,
  checkoutDoc,
  docIds,
  listBranches,
  readCurrentBranch,
  docIdOf,
} from '@wordgit/core'
import {
  CH,
  DocImportReq, DocInfoSchema, DocEditReq,
} from '@wordgit/shared'
import type { DocInfo } from '@wordgit/shared'
import { getRepo } from '../repoState.js'
import { watchDoc } from '../watcher.js'

export async function listDocs(_args: unknown): Promise<DocInfo[]> {
  const repo = getRepo()
  const names = await docIds(repo)
  const out: DocInfo[] = []
  for (const docName of names) {
    const id = docIdOf(docName)
    const [branches, currentBranch, commits] = await Promise.all([
      listBranches(repo, id),
      readCurrentBranch(repo, id),
      listCommits(repo, docName),
    ])
    out.push(DocInfoSchema.parse({
      docId: id,
      docName,
      currentBranch,
      branches,
      commitCount: commits.length,
      lastCommitAt: commits[0]?.createdAt ?? null,
    }))
  }
  return out
}

export async function importDocHandler(args: unknown): Promise<{ docId: string; commitId: string }> {
  const { sourcePath, name } = DocImportReq.parse(args)
  const repo = getRepo()
  return coreImportDoc(repo, sourcePath, name)
}

export async function editDoc(args: unknown): Promise<{ workspacePath: string }> {
  const { docName } = DocEditReq.parse(args)
  const repo = getRepo()
  await checkoutDoc(repo, docName, {})
  const workspacePath = path.join(repo.root, 'workspace', docName)
  await shell.openPath(workspacePath)
  watchDoc(docName, workspacePath)
  return { workspacePath }
}

export function registerDocHandlers(): void {
  ipcMain.handle(CH.DOC_LIST, (_e, arg: unknown) => listDocs(arg))
  ipcMain.handle(CH.DOC_IMPORT, (_e, arg: unknown) => importDocHandler(arg))
  ipcMain.handle(CH.DOC_EDIT, (_e, arg: unknown) => editDoc(arg))
}
