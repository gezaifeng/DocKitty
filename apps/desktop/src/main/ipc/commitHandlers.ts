import { ipcMain } from 'electron'
import {
  commitDoc, listCommits as coreListCommits, checkoutDoc,
} from '@wordgit/core'
import {
  CH, CommitCreateReq, CommitListReq, CommitCheckoutReq,
} from '@wordgit/shared'
import type { CommitResult, CommitNode } from '@wordgit/shared'
import { getRepo } from '../repoState.js'

export async function createCommitHandler(args: unknown): Promise<CommitResult> {
  const { docName, message, author, branch } = CommitCreateReq.parse(args)
  const repo = getRepo()
  return commitDoc(repo, docName, { message, author, branch })
}

export async function listCommitsHandler(args: unknown): Promise<CommitNode[]> {
  const { docName, branch } = CommitListReq.parse(args)
  const repo = getRepo()
  try {
    return await coreListCommits(repo, docName, branch)
  } catch {
    return []
  }
}

export async function checkoutCommitHandler(args: unknown): Promise<{ docId: string; commitId: string }> {
  const { docName, commitId, branch } = CommitCheckoutReq.parse(args)
  const repo = getRepo()
  return checkoutDoc(repo, docName, { commitId, branch })
}

export function registerCommitHandlers(): void {
  ipcMain.handle(CH.COMMIT_CREATE, (_e, arg: unknown) => createCommitHandler(arg))
  ipcMain.handle(CH.COMMIT_LIST, (_e, arg: unknown) => listCommitsHandler(arg))
  ipcMain.handle(CH.COMMIT_CHECKOUT, (_e, arg: unknown) => checkoutCommitHandler(arg))
}
