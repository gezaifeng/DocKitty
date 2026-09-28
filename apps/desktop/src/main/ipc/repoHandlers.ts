import path from 'node:path'
import { ipcMain } from 'electron'
import { Repo } from '@wordgit/core'
import { CH, RepoCreateReq, RepoOpenReq } from '@wordgit/shared'
import { setRepo } from '../repoState.js'

export async function createRepo(args: unknown): Promise<{ repoRoot: string }> {
  const { root, name } = RepoCreateReq.parse(args)
  const repo = await Repo.init(root, name)
  setRepo(repo)
  return { repoRoot: repo.root }
}

export async function openRepo(args: unknown): Promise<{ repoRoot: string; repoName: string }> {
  const { root } = RepoOpenReq.parse(args)
  const repo = await Repo.open(root)
  setRepo(repo)
  return { repoRoot: root, repoName: path.basename(root) }
}

export function registerRepoHandlers(): void {
  ipcMain.handle(CH.REPO_CREATE, (_e, arg: unknown) => createRepo(arg))
  ipcMain.handle(CH.REPO_OPEN, (_e, arg: unknown) => openRepo(arg))
}
