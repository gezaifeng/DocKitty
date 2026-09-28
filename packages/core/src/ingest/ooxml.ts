import { unzipSync, zipSync, type Zippable } from 'fflate'
import { chunkStream } from '../chunker.js'
import { sha256 } from '../hashes.js'
import type { StorageContext } from '../storageContext.js'
import type { OoxmlEntry, OoxmlManifest, StoredRef } from './types.js'

const TEXT_PART_MAX = 4096
const TEXT_EXT = /\.(xml|rels)$/i

export function isOoxml(buf: Uint8Array): boolean {
  if (buf.length < 4 || buf[0] !== 0x50 || buf[1] !== 0x4b || buf[2] !== 3 || buf[3] !== 4) return false
  try {
    const parts = unzipSync(buf, { filter: (f) => f.name === '[Content_Types].xml' })
    return '[Content_Types].xml' in parts
  } catch {
    return false
  }
}

async function* single(buf: Uint8Array): AsyncGenerator<Uint8Array> {
  yield buf
}

async function storeRef(ctx: StorageContext, data: Uint8Array, asText: boolean): Promise<StoredRef> {
  if (asText && data.length < TEXT_PART_MAX) {
    return { blob: await ctx.blobs.put(data) }
  }
  const ids: string[] = []
  for await (const c of chunkStream(single(data))) ids.push(await ctx.chunks.put(c.data))
  return { chunks: ids }
}

async function loadRef(ctx: StorageContext, ref: StoredRef): Promise<Uint8Array> {
  if ('blob' in ref) return ctx.blobs.get(ref.blob)
  const sizes = await Promise.all(ref.chunks.map(async id => (await ctx.chunks.get(id)).length))
  const total = sizes.reduce((a, b) => a + b, 0)
  const out = new Uint8Array(total)
  let off = 0
  for (const id of ref.chunks) {
    const data = await ctx.chunks.get(id)
    out.set(data, off)
    off += data.length
  }
  return out
}

export async function encodeOoxml(ctx: StorageContext, buf: Uint8Array, prev?: OoxmlManifest): Promise<OoxmlManifest> {
  const parts = unzipSync(buf)
  const order = Object.keys(parts)
  const entries: Record<string, OoxmlEntry> = {}
  for (const name of order) {
    const data = parts[name]
    const hash = await sha256(data)
    const prevEntry = prev?.entries[name]
    if (prevEntry && prevEntry.sha256 === hash) {
      entries[name] = { name, sha256: hash, size: data.length, ref: prevEntry.ref }
      continue
    }
    entries[name] = { name, sha256: hash, size: data.length, ref: await storeRef(ctx, data, TEXT_EXT.test(name)) }
  }
  return { encoding: 'ooxml', size: buf.length, sha256: await sha256(buf), order, entries }
}

export async function decodeOoxml(ctx: StorageContext, m: OoxmlManifest): Promise<Uint8Array> {
  const zippable: Zippable = {}
  for (const name of m.order) {
    zippable[name] = await loadRef(ctx, m.entries[name].ref)
  }
  return zipSync(zippable, { mtime: new Date(1980, 0, 1) })
}
