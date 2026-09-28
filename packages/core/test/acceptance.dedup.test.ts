import { describe, it, expect } from 'vitest'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { Repo } from '../src/repo.js'
import { commitDoc, checkoutDoc, listCommits } from '../src/ops.js'
import { tmpDir, cleanup, makeDocxBuf, editDocxAddParagraph } from './helpers.js'

async function dirSize(p: string): Promise<number> {
  let n = 0
  for (const e of await fs.readdir(p, { withFileTypes: true })) {
    const full = path.join(p, e.name)
    n += e.isDirectory() ? await dirSize(full) : (await fs.stat(full)).size
  }
  return n
}

// 确定性伪随机句子（不用 Math.random，保证测试可复现）
const WORDS = '的 了 在 是 我 有 和 就 不 人 都 一 上 也 很 到 说 要 去 会 着 看 好 这 那 与 及 或 但 而 因为 所以'.split(' ')
function randomSentence(seed: number): string {
  let s = (seed * 2654435761) % 2147483647
  const out: string[] = []
  for (let i = 0; i < 14; i++) {
    s = (s * 48271) % 2147483647
    out.push(WORDS[s % WORDS.length])
  }
  return out.join('')
}

describe('验收：50 个相似版本的存储去重', () => {
  it('每个版本字节可还原，且对象总量 < 50 份全量的 10%', async () => {
    const dir = await tmpDir()
    try {
      const repo = await Repo.init(path.join(dir, '库.wg'), 't')
      const wsFile = path.join(repo.root, 'workspace', '论文.docx')
      const versions: Uint8Array[] = []

      // 约 4000 段不可高压缩的正文（≈130KB 文本），模拟真实论文第一章
      let buf = makeDocxBuf(Array.from({ length: 4000 }, (_, i) => `段落 ${i}：${randomSentence(i)}`))
      versions.push(buf)
      await fs.writeFile(wsFile, buf)
      await commitDoc(repo, '论文.docx', { message: 'v0', author: 't' })

      // 49 个版本：每次只在文末加一句话
      for (let v = 1; v < 50; v++) {
        buf = editDocxAddParagraph(buf, `版本 ${v} 只新增这一句话。`)
        versions.push(buf)
        await fs.writeFile(wsFile, buf)
        await commitDoc(repo, '论文.docx', { message: `v${v}`, author: 't' })
      }

      // 去重效果：objects/ 总量 < 50 × 最终版本大小的 10%（即至少 10× 节省）
      const finalSize = versions[49].length
      const stored = await dirSize(path.join(repo.root, 'objects'))
      expect(stored).toBeLessThan(finalSize * 50 * 0.1)

      // 正确性：50 个版本逐个字节还原
      const commits = await listCommits(repo, '论文.docx')
      expect(commits).toHaveLength(50)
      for (let i = 0; i < 50; i++) {
        await checkoutDoc(repo, '论文.docx', { commitId: commits[49 - i].id })
        expect([...(await fs.readFile(wsFile))]).toEqual([...versions[i]])
      }
    } finally {
      await cleanup(dir)
    }
  }, 120000)
})
