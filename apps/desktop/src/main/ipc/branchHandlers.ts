import { ipcMain } from 'electron'
import {
  createBranch as coreCreateBranch,
  switchBranch as coreSwitchBranch,
  deleteBranchSafe,
  withUndoableAction,
} from '@wordgit/core'
import {
  CH, BranchCreateReq, BranchSwitchReq, BranchDeleteReq,
} from '@wordgit/shared'
import type { QuarantineEntry } from '@wordgit/shared'
import { getRepo } from '../repoState.js'

export async function createBranchHandler(args: unknown): Promise<void> {
  const { docName, branch, fromBranch, fromCommitId } = BranchCreateReq.parse(args)
  const repo = getRepo()
  const from = (fromBranch || fromCommitId) ? { branch: fromBranch, commitId: fromCommitId } : undefined
  await coreCreateBranch(repo, docName, branch, from)
}

export async function switchBranchHandler(args: unknown): Promise<void> {
  const { docName, branch } = BranchSwitchReq.parse(args)
  const repo = getRepo()
  await coreSwitchBranch(repo, docName, branch)
}

export async function deleteBranchHandler(args: unknown): Promise<QuarantineEntry> {
  const { docName, branch } = BranchDeleteReq.parse(args)
  const repo = getRepo()
  return deleteBranchSafe(repo, docName, branch)
}

export function registerBranchHandlers(): void {
  ipcMain.handle(CH.BRANCH_CREATE, (_e, arg: unknown) => withUndoableAction(getRepo(), '新建分支', () => createBranchHandler(arg)))
  ipcMain.handle(CH.BRANCH_SWITCH, (_e, arg: unknown) => { const req = BranchSwitchReq.parse(arg); return withUndoableAction(getRepo(), '切换分支', () => switchBranchHandler(req), req.docName) })
  ipcMain.handle(CH.BRANCH_DELETE, (_e, arg: unknown) => withUndoableAction(getRepo(), '回收分支', () => deleteBranchHandler(arg)))
}
