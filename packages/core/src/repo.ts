import { promises as fs } from 'node:fs'
import path from 'node:path'
import { recoverJournal } from './journal.js'
import { withRepoWrite } from './writeLock.js'

export const FORMAT_VERSION = 1

export interface RepoConfig { formatVersion: number; name: string; createdAt: string; isolatedSources?: boolean }

const LAYOUT_DIRS = ['journal', 'objects/blobs', 'objects/chunks', 'objects/ooxml',
  'refs/heads', 'quarantine', 'workspace', 'index']

export class Repo {
  private constructor(readonly root: string) {}

  static async init(root: string, name: string): Promise<Repo> {
    try {
      if ((await fs.readdir(root)).length) throw new Error('仓库位置已有文件，请使用空目录或打开已有仓库')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    await fs.mkdir(root, { recursive: true })
    for (const d of LAYOUT_DIRS) await fs.mkdir(path.join(root, d), { recursive: true })
    const config: RepoConfig = { formatVersion: FORMAT_VERSION, name, createdAt: new Date().toISOString() }
    const tmp = path.join(root, '.repo.yaml.tmp')
    await fs.writeFile(tmp, JSON.stringify(config, null, 2), 'utf8')
    await fs.rename(tmp, path.join(root, 'repo.yaml'))
    return new Repo(root)
  }

  static async open(root: string): Promise<Repo> {
    let raw: string
    try {
      raw = await fs.readFile(path.join(root, 'repo.yaml'), 'utf8')
    } catch {
      throw new Error(`不是 word_git 仓库：${root}（缺少 repo.yaml）`)
    }
    const config = JSON.parse(raw) as RepoConfig
    if (config.formatVersion > FORMAT_VERSION) {
      throw new Error(`仓库格式版本 ${config.formatVersion} 高于本软件支持的 ${FORMAT_VERSION}，请升级 word_git`)
    }
    if (config.formatVersion < FORMAT_VERSION) {
      throw new Error(`仓库格式版本过旧（${config.formatVersion}），需要迁移工具（M2 提供）`)
    }
    const repo = new Repo(root)
    await withRepoWrite(repo, () => recoverJournal(repo))
    return repo
  }

  objectsDir(sub: 'blobs' | 'chunks' | 'ooxml'): string {
    return path.join(this.root, 'objects', sub)
  }
}
