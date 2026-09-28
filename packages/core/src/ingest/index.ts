import { promises as fsp } from 'node:fs'
import path from 'node:path'
import { readFileBlocks, teeHash, writeFileAtomic } from '../fsutil.js'
import type { StorageContext } from '../storageContext.js'
import { encodeGeneric, materializeGeneric } from './generic.js'
import { decodeOoxml, encodeOoxml, isOoxml } from './ooxml.js'
import type { FileManifest } from './types.js'

export async function encodeFile(ctx: StorageContext, filePath: string, prev?: FileManifest): Promise<FileManifest> {
  // 单遍流式计算全文件 sha256
  const tee = teeHash(readFileBlocks(filePath))
  let buf: Uint8Array | null = null
  for await (const block of tee.stream) {
    if (buf === null) {
      buf = block.slice()
    } else {
      const merged = new Uint8Array(buf.length + block.length)
      merged.set(buf, 0)
      merged.set(block, buf.length)
      buf = merged
    }
    if (buf.length > 64 * 1024 * 1024) {
      // 超大文件：放弃 OOXML 路径，走流式 generic（防内存爆炸）
      const rest: Uint8Array[] = [buf]
      for await (const b of tee.stream) rest.push(b)
      const total = rest.reduce((n, b) => n + b.length, 0)
      const merged = new Uint8Array(total)
      let off = 0
      for (const b of rest) { merged.set(b, off); off += b.length }
      return encodeGeneric(ctx, streamOnce(merged))
    }
  }
  if (buf === null) buf = new Uint8Array(0)
  const fileSha = await tee.digest()

  if (isOoxml(buf)) {
    try {
      const prevOoxml = prev?.encoding === 'ooxml' ? prev : undefined
      const m = await encodeOoxml(ctx, buf, prevOoxml)
      if (m.sha256 !== fileSha) throw new Error('sha256 不一致')
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
