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

export async function writeFileAtomic(target: string, data: Uint8Array): Promise<void> {
  await fs.mkdir(path.dirname(target), { recursive: true })
  const tmp = `${target}.tmp-${process.pid}-${Math.random().toString(36).slice(2)}`
  const fh = await fs.open(tmp, 'w')
  try {
    await fh.write(data)
    await fh.sync()
  } finally {
    await fh.close()
  }
  await fs.rename(tmp, target)
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
