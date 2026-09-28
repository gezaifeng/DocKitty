export interface Chunk { data: Uint8Array }

export interface CdcOptions { min?: number; avg?: number; max?: number }

const WINDOW = 32

// 固定种子的确定性随机表：保证任何机器上同一内容产生同一分块边界
function mulberry32(seed: number): () => number {
  let a = seed | 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const TABLE = (() => {
  const rnd = mulberry32(0x9e3779b9)
  const t = new Uint32Array(256)
  for (let i = 0; i < 256; i++) t[i] = (rnd() * 0xffffffff) >>> 0
  return t
})()

function maskFor(avg: number): number {
  // 期望块长 ≈ 2^bits
  const bits = Math.max(8, Math.min(24, Math.round(Math.log2(avg))))
  return (1 << bits) - 1
}

function rotl(x: number, n: number): number {
  return ((x << n) | (x >>> (32 - n))) | 0
}

class Buzhash {
  private h = 0
  private window = new Uint8Array(WINDOW)
  private pos = 0
  private filled = false

  push(b: number): void {
    this.h = rotl(this.h, 1) ^ TABLE[b]
    const old = this.window[this.pos]
    this.window[this.pos] = b
    this.pos = (this.pos + 1) % WINDOW
    if (this.filled) this.h = this.h ^ rotl(TABLE[old], WINDOW)
    else if (this.pos === 0) this.filled = true
  }

  value(): number {
    // murmur3 fmix32 雪崩：全程 32 位整数运算（Math.imul），
    // 双精度乘法会损失低位精度，导致低位熵不足、边界概率远低于 1/2^bits
    let x = this.h
    x = Math.imul(x ^ (x >>> 16), 0x7feb352d)
    x = Math.imul(x ^ (x >>> 15), 0x846ca68b)
    x ^= x >>> 16
    return x >>> 0
  }
}

export async function* chunkStream(stream: AsyncIterable<Uint8Array>, opts: CdcOptions = {}): AsyncGenerator<Chunk> {
  const min = opts.min ?? 2048
  const avg = opts.avg ?? 4096
  const max = opts.max ?? 16384
  const mask = maskFor(avg)

  let buf: number[] = []
  const hasher = new Buzhash()
  const flush = (): Chunk => {
    const data = new Uint8Array(buf)
    buf = []
    return { data }
  }

  for await (const block of stream) {
    for (const byte of block) {
      buf.push(byte)
      hasher.push(byte)
      const len = buf.length
      if ((len >= min && (hasher.value() & mask) === 0) || len >= max) {
        yield flush()
      }
    }
  }
  if (buf.length > 0) yield flush()
}
