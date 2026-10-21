import { promises as fs } from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'

export async function* readFileBlocks(filePath: string, blockSize = 1024 * 1024): AsyncGenerator<Uint8Array> {
  const fh = await fs.open(filePath, 'r')
  try {
    const buf = Buffer.allocUnsafe(blockSize)
    for (;;) {
      const { bytesRead } = await fh.read(buf, 0, blockSize, null)
      if (bytesRead === 0) return
      yield new Uint8Array(buf.subarray(0, bytesRead))
    }
  } finally {
    await fh.close()
  }
}

export async function writeFileAtomic(target: string, data: Uint8Array | AsyncIterable<Uint8Array>): Promise<void> {
  await fs.mkdir(path.dirname(target), { recursive: true })
  const tmp = `${target}.tmp-${process.pid}-${Math.random().toString(36).slice(2)}`
  try {
    const fh = await fs.open(tmp, 'w')
    try {
      if (Symbol.asyncIterator in data) for await (const block of data) await fh.writeFile(block)
      else await fh.writeFile(data)
      await fh.sync()
    } finally { await fh.close() }
    for (let attempt = 0; ; attempt++) {
      try { await fs.rename(tmp, target); break }
      catch (error) {
        if (attempt >= 4 || !['EPERM', 'EBUSY', 'EACCES'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error
        await new Promise(resolve => setTimeout(resolve, 25 * 2 ** attempt))
      }
    }
  } finally { await fs.rm(tmp, { force: true }) }
}

export function teeHash(stream: AsyncIterable<Uint8Array>): { stream: AsyncIterable<Uint8Array>; digest: () => Promise<string> } {
  const hash = createHash('sha256')
  const wrapped = (async function* () {
    for await (const b of stream) {
      hash.update(b)
      yield b
    }
  })()
  return {
    stream: wrapped,
    digest: async () => hash.digest('hex'),
  }
}
