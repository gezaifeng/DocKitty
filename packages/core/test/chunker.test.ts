import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { chunkStream, type Chunk } from '../src/chunker.js'

async function collect(stream: AsyncIterable<Uint8Array>): Promise<Chunk[]> {
  const out: Chunk[] = []
  for await (const c of chunkStream(stream)) out.push(c)
  return out
}

async function* fromBuffer(buf: Uint8Array, block = 1024): AsyncGenerator<Uint8Array> {
  for (let i = 0; i < buf.length; i += block) yield buf.subarray(i, Math.min(i + block, buf.length))
}

describe('CDC 分块器', () => {
  it('重组后与原内容逐字节一致（属性测试，随机二进制）', async () => {
    await fc.assert(fc.asyncProperty(fc.uint8Array({ minLength: 1, maxLength: 500_000 }), async (buf) => {
      const chunks = await collect(fromBuffer(buf))
      const total = chunks.reduce((n, c) => n + c.data.length, 0)
      expect(total).toBe(buf.length)
      const merged = new Uint8Array(total)
      let off = 0
      for (const c of chunks) { merged.set(c.data, off); off += c.data.length }
      expect([...merged]).toEqual([...buf])
    }), { numRuns: 50 })
  })

  it('块大小落在 [min, max]，均值接近 avg', async () => {
    const buf = new Uint8Array(500_000)
    let s = 7
    for (let i = 0; i < buf.length; i++) { s = (s * 1664525 + 1013904223) >>> 0; buf[i] = s >>> 24 }
    const chunks = await collect(fromBuffer(buf))
    expect(chunks.length).toBeGreaterThan(3)
    const avg = chunks.reduce((n, c) => n + c.data.length, 0) / chunks.length
    expect(avg).toBeGreaterThan(3000)
    expect(avg).toBeLessThan(8000)
    for (const c of chunks.slice(0, -1)) {
      expect(c.data.length).toBeGreaterThanOrEqual(2048)
      expect(c.data.length).toBeLessThanOrEqual(16384)
    }
    // 尾部块是流末尾剩余内容，允许小于 min
    expect(chunks[chunks.length - 1].data.length).toBeGreaterThan(0)
    expect(chunks[chunks.length - 1].data.length).toBeLessThanOrEqual(16384)
  })

  it('内容确定性：同一内容块边界完全一致', async () => {
    const buf = new Uint8Array(200_000)
    for (let i = 0; i < buf.length; i++) buf[i] = (i * 13 + 5) & 0xff
    const a = (await collect(fromBuffer(buf))).map(c => c.data.length)
    const b = (await collect(fromBuffer(buf, 4096))).map(c => c.data.length)
    expect(a).toEqual(b)
  })

  it('中部插入只影响插入点附近的分块（前缀块大量复用）', async () => {
    const enc = new TextEncoder()
    // 用非周期序列（LCG 高字节，周期长且确定性）：低字节 LCG 周期只有 256，
    // 周期数据会让边界取决于绝对位置而非内容，插入后的位置偏移会使后续块全部失效，
    // 无法验证 CDC 的内容定义性质
    const base = new Uint8Array(200_000)
    let s = 42
    for (let i = 0; i < base.length; i++) { s = (s * 1664525 + 1013904223) >>> 0; base[i] = s >>> 24 }
    const insertAt = 100_000
    const head = base.subarray(0, insertAt)
    const tail = base.subarray(insertAt)
    const ins = enc.encode('在论文第三章补充的整整一段新内容，包含足够长的文本以改变边界。'.repeat(20))
    const edited = new Uint8Array(head.length + ins.length + tail.length)
    edited.set(head, 0); edited.set(ins, head.length); edited.set(tail, head.length + ins.length)

    const baseChunks = await collect(fromBuffer(base))
    const editedChunks = await collect(fromBuffer(edited))
    const baseSet = new Map(baseChunks.map(c => [Buffer.from(c.data).toString('hex'), true]))
    const reused = editedChunks.filter(c => baseSet.has(Buffer.from(c.data).toString('hex')))
    // 插入点之后的内容虽然整体后移，但内容定义的边界使绝大多数块仍可复用
    expect(reused.length).toBeGreaterThan(baseChunks.length * 0.8)
  })
})
