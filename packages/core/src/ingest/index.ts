import { promises as fsp } from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { readFileBlocks, writeFileAtomic } from '../fsutil.js'
import type { StorageContext } from '../storageContext.js'
import { encodeGeneric, materializeGeneric } from './generic.js'
import { decodeOoxml, encodeOoxml, isOoxml } from './ooxml.js'
import type { FileManifest } from './types.js'

export async function encodeFile(ctx: StorageContext, filePath: string, prev?: FileManifest): Promise<FileManifest> {
  const size = (await fsp.stat(filePath)).size
  if (size > 64 * 1024 * 1024) return encodeGeneric(ctx, readFileBlocks(filePath))
  const buf = new Uint8Array(await fsp.readFile(filePath))

  if (isOoxml(buf)) {
    try {
      const prevOoxml = prev?.encoding === 'ooxml' ? prev : undefined
      const m = await encodeOoxml(ctx, buf, prevOoxml)
      return m
    } catch {
      // OOXML 解析失败 → 回退通用编码（spec §5.3 第 4 条）
    }
  }
  return encodeGeneric(ctx, streamOnce(buf))
}

async function* streamOnce(buf: Uint8Array): AsyncGenerator<Uint8Array> {
  yield buf
}

export async function materializeFile(ctx: StorageContext, m: FileManifest): Promise<Uint8Array> {
  return m.encoding === 'ooxml' ? decodeOoxml(ctx, m) : materializeGeneric(ctx, m)
}

export async function* materializeFileStream(ctx: StorageContext, m: FileManifest): AsyncGenerator<Uint8Array> {
  if (m.encoding === 'ooxml') { yield await decodeOoxml(ctx, m); return }
  if (!Number.isSafeInteger(m.size) || m.size < 0) throw new Error('历史文件大小无效')
  const hash = createHash('sha256'); let size = 0
  for (const id of m.ref.chunks) {
    const block = await ctx.chunks.get(id); hash.update(block); size += block.length
    if (size > m.size) throw new Error('历史文件大小校验失败')
    yield block
  }
  if (size !== m.size || hash.digest('hex') !== m.sha256) throw new Error('历史文件内容校验失败')
}

function canonical(m: FileManifest): string {
  return JSON.stringify(m)
}

export async function putManifest(ctx: StorageContext, m: FileManifest): Promise<string> {
  const id = await ctx.blobs.put(new TextEncoder().encode(canonical(m)))
  // 内容索引：fileSha → manifest blob id（同内容文件跨版本/跨文档去重的关键，spec §5.4）
  await writeFileAtomic(path.join(ctx.blobs.dir, 'index', m.sha256), new TextEncoder().encode(id))
  return id
}

export async function getManifest(ctx: StorageContext, blobId: string): Promise<FileManifest> {
  const raw = await ctx.blobs.get(blobId)
  return JSON.parse(new TextDecoder().decode(raw)) as FileManifest
}

export async function getManifestByContent(ctx: StorageContext, fileSha: string): Promise<FileManifest | null> {
  try {
    const blobId = await fsp.readFile(path.join(ctx.blobs.dir, 'index', fileSha), 'utf8')
    return await getManifest(ctx, blobId.trim())
  } catch {
    return null
  }
}
