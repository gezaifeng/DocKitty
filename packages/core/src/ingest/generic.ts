import { chunkStream } from '../chunker.js'
import { teeHash } from '../fsutil.js'
import type { StorageContext } from '../storageContext.js'
import type { GenericManifest } from './types.js'

export async function encodeGeneric(ctx: StorageContext, stream: AsyncIterable<Uint8Array>): Promise<GenericManifest> {
  const tee = teeHash(stream)
  const chunks: string[] = []
  let size = 0
  for await (const c of chunkStream(tee.stream)) {
    chunks.push(await ctx.chunks.put(c.data))
    size += c.data.length
  }
  return { encoding: 'generic', size, sha256: await tee.digest(), ref: { chunks } }
}

export async function materializeGeneric(ctx: StorageContext, m: GenericManifest): Promise<Uint8Array> {
  const out = new Uint8Array(m.size)
  let off = 0
  for (const id of m.ref.chunks) {
    const data = await ctx.chunks.get(id)
    out.set(data, off)
    off += data.length
  }
  return out
}
