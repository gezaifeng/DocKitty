import { promises as fs } from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { Zip, ZipDeflate, Unzip, UnzipInflate } from 'fflate'
import { readFileBlocks } from './fsutil.js'
import { containedPath } from './names.js'
import type { BackupManifest } from './backup.js'

export function validateBackupPath(name: unknown): asserts name is string {
  if (typeof name !== 'string' || !name || name.includes('\\') || name.split('/').some(part => !part || part === '.' || part === '..' || /[<>:"|?*\x00-\x1f]/.test(part))) throw new Error('备份包含无效路径')
}

export async function* streamBackupFiles(root: string, manifest: BackupManifest): AsyncGenerator<Uint8Array> {
  const output: Uint8Array[] = []
  let failure: Error | null = null
  const zip = new Zip((error, bytes) => { if (error) failure = error; else output.push(bytes) })
  async function* files(dir: string): AsyncGenerator<string> {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      if (dir === root && ['journal', 'index', '.write.lock'].includes(entry.name)) continue
      const file = path.join(dir, entry.name)
      if (entry.isDirectory()) yield* files(file)
      else if (entry.isFile()) yield file
      else if (entry.isSymbolicLink()) throw new Error('库内存在未受管链接，请移出该链接后重试备份')
    }
  }
  for await (const file of files(root)) {
    const name = path.relative(root, file).split(path.sep).join('/'); validateBackupPath(name)
    if (name.toLowerCase() === '_manifest.json') throw new Error('文档库根目录的 _manifest.json 为备份保留名称，请移出该文件后重试')
    const before = await fs.stat(file), hash = createHash('sha256'), entry = new ZipDeflate(name)
    let size = 0
    zip.add(entry)
    while (output.length) yield output.shift()!
    for await (const bytes of readFileBlocks(file, 64 * 1024)) {
      hash.update(bytes); size += bytes.length; entry.push(bytes, false)
      if (failure) throw failure
      while (output.length) yield output.shift()!
    }
    const after = await fs.stat(file)
    if (before.size !== size || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ino !== after.ino) throw new Error(`备份期间文件发生变化，请保存编辑内容后重试：${name}`)
    entry.push(new Uint8Array(), true)
    if (failure) throw failure
    while (output.length) yield output.shift()!
    manifest.files.push({ path: name, sha256: hash.digest('hex') })
  }
  const metadata = new ZipDeflate('_manifest.json'); zip.add(metadata)
  metadata.push(new TextEncoder().encode(JSON.stringify(manifest)), true); zip.end()
  if (failure) throw failure
  while (output.length) yield output.shift()!
}

export async function extractBackupArchive(source: string, stage: string): Promise<Map<string, string>> {
  const hashes = new Map<string, string>(), names = new Set<string>()
  const handles = new Map<string, { file: Awaited<ReturnType<typeof fs.open>>; hash: ReturnType<typeof createHash> }>()
  const output: Array<{ name: string; bytes: Uint8Array; final: boolean }> = []
  let failure: Error | null = null
  const unzip = new Unzip(entry => {
    validateBackupPath(entry.name)
    const key = entry.name.toLowerCase()
    if (names.has(key)) throw new Error('备份包含重复路径')
    names.add(key)
    entry.ondata = (error, bytes, final) => { if (error) failure = error; else output.push({ name: entry.name, bytes, final }) }
    entry.start()
  })
  unzip.register(UnzipInflate)
  async function flush() {
    if (failure) throw failure
    for (const item of output.splice(0)) {
      let current = handles.get(item.name)
      if (!current) {
        const target = containedPath(stage, item.name)
        await fs.mkdir(path.dirname(target), { recursive: true })
        current = { file: await fs.open(target, 'wx'), hash: createHash('sha256') }; handles.set(item.name, current)
      }
      current.hash.update(item.bytes); await current.file.writeFile(item.bytes)
      if (item.final) { await current.file.sync(); await current.file.close(); hashes.set(item.name, current.hash.digest('hex')); handles.delete(item.name) }
    }
  }
  try {
    for await (const bytes of readFileBlocks(source, 16 * 1024)) { unzip.push(bytes, false); await flush() }
    unzip.push(new Uint8Array(), true); await flush()
    if (handles.size) throw new Error('备份包内容未完整解压')
    return hashes
  } catch (error) { throw new Error(`备份包解压失败：${(error as Error).message}`, { cause: error }) }
  finally { for (const current of handles.values()) await current.file.close() }
}
