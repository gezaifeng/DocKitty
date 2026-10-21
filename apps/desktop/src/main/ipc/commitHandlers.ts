import { ipcMain } from 'electron'
import {
  commitDoc, listCommits as coreListCommits, checkoutDoc,
  withUndoableAction,
} from '@wordgit/core'
import {
  CH, CommitCreateReq, CommitListReq, CommitCheckoutReq,
} from '@wordgit/shared'
import type { CommitResult, CommitNode, DiffResult } from '@wordgit/shared'
import { compareVersions } from '../versionComparison.js'
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

export async function diffTextHandler(args: unknown): Promise<DiffResult[]> { return compareVersions(getRepo(), args) }

export function registerCommitHandlers(): void {
  ipcMain.handle(CH.COMMIT_CREATE, (_e, arg: unknown) => { const req = CommitCreateReq.parse(arg); return withUndoableAction(getRepo(), '记录版本', () => createCommitHandler(req), req.docName) })
  ipcMain.handle(CH.COMMIT_LIST, (_e, arg: unknown) => listCommitsHandler(arg))
  ipcMain.handle(CH.COMMIT_CHECKOUT, (_e, arg: unknown) => { const req = CommitCheckoutReq.parse(arg); return withUndoableAction(getRepo(), '恢复工作区', () => checkoutCommitHandler(req), req.docName) })
  ipcMain.handle(CH.COMMIT_DIFF_TEXT, (_e, arg: unknown) => diffTextHandler(arg))
}
