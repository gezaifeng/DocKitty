import { ipcMain } from 'electron'
import {
  Repo,
  commitDoc, listCommits as coreListCommits, checkoutDoc,
  StorageContext, readCommit, readTree, getManifest, materializeFile,
  diffText, extractDocxText,
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

async function getCommitBytes(repo: Repo, commitId: string): Promise<Uint8Array> {
  const ctx = StorageContext.forRepo(repo)
  const commit = await readCommit(ctx, commitId)
  const tree = await readTree(ctx, commit.tree)
  const manifestId = tree.entries[''] ?? Object.values(tree.entries)[0]
  if (!manifestId) throw new Error(`提交 ${commitId} 中没有文件`)
  const manifest = await getManifest(ctx, manifestId)
  return materializeFile(ctx, manifest)
}

export async function diffTextHandler(args: unknown): Promise<DiffResult[]> {
  const { docName: _docName, commitIdA, commitIdB } = CommitDiffTextReq.parse(args)
  const repo = getRepo()
  const [bufA, bufB] = await Promise.all([
    getCommitBytes(repo, commitIdA),
    getCommitBytes(repo, commitIdB),
  ])
  const [textA, textB] = await Promise.all([
    extractDocxText(bufA),
    extractDocxText(bufB),
  ])
  return diffText(textA, textB)
}

export function registerCommitHandlers(): void {
  ipcMain.handle(CH.COMMIT_CREATE, (_e, arg: unknown) => createCommitHandler(arg))
  ipcMain.handle(CH.COMMIT_LIST, (_e, arg: unknown) => listCommitsHandler(arg))
  ipcMain.handle(CH.COMMIT_CHECKOUT, (_e, arg: unknown) => checkoutCommitHandler(arg))
  ipcMain.handle(CH.COMMIT_DIFF_TEXT, (_e, arg: unknown) => diffTextHandler(arg))
}
