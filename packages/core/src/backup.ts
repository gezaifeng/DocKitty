import { promises as fs } from 'node:fs'
import path from 'node:path'
import { zipSync, unzipSync } from 'fflate'
import { Repo } from './repo.js'
import { sha256 } from './hashes.js'

export interface BackupManifest {
  version: 1
  createdAt: string
  repoName: string
  files: Array<{ path: string; sha256: string }>
}

const EXCLUDE_DIRS = new Set(['journal', 'index'])

export async function exportBackup(repo: Repo, destPath: string): Promise<{ fileCount: number }> {
  const manifest: BackupManifest = {
    version: 1,
    createdAt: new Date().toISOString(),
    repoName: path.basename(repo.root),
    files: [],
  }
  const fileMap: Record<string, Uint8Array> = {}
  await collectFiles(repo.root, repo.root, fileMap, manifest)
  fileMap['_manifest.json'] = new TextEncoder().encode(JSON.stringify(manifest, null, 2))
  await fs.writeFile(destPath, zipSync(fileMap))
  return { fileCount: manifest.files.length }
}

async function collectFiles(
  root: string,
  dir: string,
  out: Record<string, Uint8Array>,
  manifest: BackupManifest,
): Promise<void> {
  let entries: import('node:fs').Dirent[]
  try { entries = await fs.readdir(dir, { withFileTypes: true }) } catch { return }
  for (const e of entries) {
    const abs = path.join(dir, e.name)
    const rel = path.relative(root, abs).split(path.sep).join('/')
    if (e.isDirectory()) {
      if (EXCLUDE_DIRS.has(e.name)) continue
      await collectFiles(root, abs, out, manifest)
    } else if (e.isFile() && !e.name.includes('.tmp-')) {
      const data = new Uint8Array(await fs.readFile(abs))
      const hash = await sha256(data)
      out[rel] = data
      manifest.files.push({ path: rel, sha256: hash })
    }
  }
}

export async function importBackup(srcPath: string, destRoot: string): Promise<Repo> {
  const raw = new Uint8Array(await fs.readFile(srcPath))
  let all: Record<string, Uint8Array>
  try {
    all = unzipSync(raw)
  } catch (e) {
    throw new Error(`备份包解压失败：${(e as Error).message}`)
  }
  const manifestBytes = all['_manifest.json']
  if (!manifestBytes) throw new Error('备份包缺少 _manifest.json')
  const manifest = JSON.parse(new TextDecoder().decode(manifestBytes)) as BackupManifest
  for (const entry of manifest.files) {
    const data = all[entry.path]
    if (!data) throw new Error(`备份包缺少文件：${entry.path}`)
    const actual = await sha256(data)
    if (actual !== entry.sha256) {
      throw new Error(`备份包文件校验失败：${entry.path}（期望 ${entry.sha256}，实际 ${actual}）`)
    }
  }
  await fs.mkdir(destRoot, { recursive: true })
  for (const [relPath, data] of Object.entries(all)) {
    if (relPath === '_manifest.json') continue
    const target = path.join(destRoot, ...relPath.split('/'))
    await fs.mkdir(path.dirname(target), { recursive: true })
    await fs.writeFile(target, data)
  }
  await fs.mkdir(path.join(destRoot, 'journal'), { recursive: true })
  return Repo.open(destRoot)
}
