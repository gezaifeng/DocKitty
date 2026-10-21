import { promises as fs } from 'node:fs'
import path from 'node:path'
import { Repo } from './repo.js'
import { withRepoWrite } from './writeLock.js'
import { writeFileAtomic } from './fsutil.js'
import { scrub } from './scrub.js'
import { streamBackupFiles, extractBackupArchive, validateBackupPath } from './backupArchive.js'

export interface BackupManifest {
  version: 1
  createdAt: string
  repoName: string
  files: Array<{ path: string; sha256: string }>
}

export async function exportBackup(repo: Repo, destPath: string): Promise<{ fileCount: number }> {
  destPath = path.resolve(destPath)
  const relative = path.relative(repo.root, destPath)
  if (!relative || !relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative)) throw new Error('备份文件必须保存在仓库之外')
  await fs.mkdir(path.dirname(destPath), { recursive: true })
  const parent = await fs.realpath(path.dirname(destPath)), actualRoot = await fs.realpath(repo.root), actual = path.relative(actualRoot, parent)
  if (!actual || !path.isAbsolute(actual) && actual !== '..' && !actual.startsWith('..' + path.sep)) throw new Error('备份文件不能通过链接写入仓库')
  return withRepoWrite(repo, async () => {
    const manifest: BackupManifest = { version: 1, createdAt: new Date().toISOString(), repoName: path.basename(repo.root), files: [] }
    await writeFileAtomic(destPath, streamBackupFiles(repo.root, manifest))
    return { fileCount: manifest.files.length }
  })
}

export async function importBackup(srcPath: string, destRoot: string): Promise<Repo> {
  destRoot = path.resolve(destRoot)
  let existed = false
  try {
    const stat = await fs.lstat(destRoot)
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('恢复位置必须为空的普通目录')
    if ((await fs.readdir(destRoot)).length) throw new Error('恢复位置必须为空目录，避免覆盖现有文件')
    existed = true
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
  const parent = path.dirname(destRoot)
  await fs.mkdir(parent, { recursive: true })
  const stage = await fs.mkdtemp(path.join(parent, '.wordgit-restore-'))
  let removedEmptyTarget = false, published = false
  try {
    const hashes = await extractBackupArchive(srcPath, stage)
    if (!hashes.has('_manifest.json')) throw new Error('备份包缺少 _manifest.json')
    const manifest = JSON.parse(await fs.readFile(path.join(stage, '_manifest.json'), 'utf8')) as BackupManifest
    if (manifest.version !== 1 || !Array.isArray(manifest.files)) throw new Error('备份清单格式无效')
    const listed = new Set<string>()
    for (const entry of manifest.files) {
      validateBackupPath(entry.path)
      const key = entry.path.toLowerCase()
      if (listed.has(key) || key === '_manifest.json') throw new Error('备份包含重复或保留路径')
      listed.add(key)
      const actual = hashes.get(entry.path)
      if (!actual) throw new Error(`备份包缺少文件：${entry.path}`)
      if (actual !== entry.sha256) throw new Error(`备份包文件校验失败：${entry.path}`)
    }
    if ([...hashes.keys()].some(name => name !== '_manifest.json' && !listed.has(name.toLowerCase()))) throw new Error('备份含有未校验的文件')
    if (!hashes.has('repo.yaml')) throw new Error('备份缺少仓库配置')
    await fs.rm(path.join(stage, '_manifest.json'))
    await fs.mkdir(path.join(stage, 'journal'), { recursive: true })
    const restored = await Repo.open(stage), result = await scrub(restored)
    if (result.corrupted.length) throw new Error('备份中的历史引用或文件快照不完整，未发布恢复结果')
    if (existed) { await fs.rmdir(destRoot); removedEmptyTarget = true }
    await fs.rename(stage, destRoot); published = true
    return Repo.open(destRoot)
  } catch (error) {
    if (removedEmptyTarget && !published) await fs.mkdir(destRoot).catch(failure => { if (failure.code !== 'EEXIST') throw failure })
    throw error
  } finally {
    if (path.dirname(stage) !== parent || !path.basename(stage).startsWith('.wordgit-restore-')) throw new Error('恢复暂存路径无效')
    await fs.rm(stage, { recursive: true, force: true })
  }
}
