import path from 'node:path'
import { ipcMain, app } from 'electron'
import { promises as fs } from 'node:fs'
import { Repo, withRepoWrite, writeFileAtomic } from '@wordgit/core'
import { CH, RepoCreateReq, RepoOpenReq, RepoBootstrapReq, RepoRelocateReq } from '@wordgit/shared'
import { setRepo, clearRepo, getRepo } from '../repoState.js'

const libraryName = '稿喵文档库.wg'
const settingsPath = () => path.join(app.getPath('userData'), 'library-settings.json')

async function rememberRoot(root: string): Promise<void> {
  await writeFileAtomic(settingsPath(), new TextEncoder().encode(JSON.stringify({ root })))
}

let starting: Promise<{ repoRoot: string; repoName: string; notice?: string }> | undefined
export function bootstrapRepo(args: unknown) {
  starting ??= bootstrapRepoOnce(args).finally(() => { starting = undefined })
  return starting
}

async function bootstrapRepoOnce(args: unknown): Promise<{ repoRoot: string; repoName: string; notice?: string }> {
  const { previousRoot } = RepoBootstrapReq.parse(args)
  let configured: string | undefined
  try {
    const config = JSON.parse(await fs.readFile(settingsPath(), 'utf8')) as { root?: unknown }
    if (typeof config.root !== 'string' || !path.isAbsolute(config.root)) throw new Error('文档库位置设置无效，请更改保存位置')
    configured = config.root
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  const installed = app.isPackaged && await fs.access(path.join(app.getAppPath(), 'resources/installer-mode.json')).then(() => true, () => false)
  const home = process.env.WORDGIT_LIBRARY_HOME ?? (installed ? app.getPath('userData') : app.isPackaged ? path.dirname(process.execPath) : app.getAppPath())
  let root = configured ?? previousRoot ?? path.join(home, libraryName)
  let repo: Repo
  let notice: string | undefined
  if (configured || previousRoot) repo = await Repo.open(root)
  else {
    const openOrCreate = async (target: string) => {
      try { await fs.access(path.join(target, 'repo.yaml')); return Repo.open(target) }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
      return Repo.init(target, '我的文档')
    }
    try { repo = await openOrCreate(root) }
    catch (error) {
      if (!['EACCES', 'EPERM'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error
      root = path.join(app.getPath('userData'), libraryName)
      repo = await openOrCreate(root)
      notice = '软件所在目录不可写，文档暂存到用户目录。可在文件菜单中更改保存位置。'
    }
  }
  await rememberRoot(repo.root)
  setRepo(repo)
  return { repoRoot: repo.root, repoName: '我的文档', notice }
}

export async function relocateRepo(args: unknown): Promise<{ repoRoot: string; repoName: string }> {
  const { parent } = RepoRelocateReq.parse(args)
  const repo = getRepo()
  const root = path.resolve(parent, libraryName)
  const source = path.resolve(repo.root)
  if (root.toLowerCase() === source.toLowerCase()) return { repoRoot: repo.root, repoName: '我的文档' }
  if (root.toLowerCase().startsWith(source.toLowerCase() + path.sep)) throw new Error('新位置不能位于当前文档库内部')
  await withRepoWrite(repo, async () => {
    await fs.mkdir(path.dirname(root), { recursive: true })
    if (await fs.stat(root).then(() => true, () => false)) throw new Error('新位置已有文档库，请选择其他文件夹')
    const staging = await fs.mkdtemp(path.join(path.dirname(root), '.稿喵搬迁-'))
    try {
      await fs.cp(repo.root, staging, { recursive: true, filter: file => path.basename(file) !== '.write.lock' && !path.basename(file).includes('.tmp-') })
      await Repo.open(staging)
      await fs.rename(staging, root)
      await rememberRoot(root)
    } finally {
      if (path.dirname(staging) !== path.dirname(root) || !path.basename(staging).startsWith('.稿喵搬迁-')) throw new Error('搬迁临时目录位置无效')
      await fs.rm(staging, { recursive: true, force: true })
    }
  })
  setRepo(await Repo.open(root))
  return { repoRoot: root, repoName: '我的文档' }
}

export async function createRepo(args: unknown): Promise<{ repoRoot: string }> {
  const { root, name } = RepoCreateReq.parse(args)
  const repo = await Repo.init(root, name)
  setRepo(repo)
  return { repoRoot: repo.root }
}

export async function openRepo(args: unknown): Promise<{ repoRoot: string; repoName: string }> {
  const { root } = RepoOpenReq.parse(args)
  const repo = await Repo.open(root)
  await rememberRoot(repo.root)
  setRepo(repo)
  return { repoRoot: root, repoName: path.basename(root) }
}

export function registerRepoHandlers(): void {
  ipcMain.handle(CH.REPO_BOOTSTRAP, (_event, args: unknown) => bootstrapRepo(args))
  ipcMain.handle(CH.REPO_RELOCATE, (_event, args: unknown) => relocateRepo(args))
  ipcMain.handle(CH.REPO_CLOSE, () => clearRepo())
  ipcMain.handle(CH.REPO_CREATE, (_e, arg: unknown) => createRepo(arg))
  ipcMain.handle(CH.REPO_OPEN, (_e, arg: unknown) => openRepo(arg))
}
