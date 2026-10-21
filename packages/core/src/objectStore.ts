import { promises as fs } from 'node:fs'
import path from 'node:path'
import { deflateSync, inflateSync } from 'fflate'
import { sha256 } from './hashes.js'
import { writeFileAtomic } from './fsutil.js'

// 内容寻址 + deflate 压缩落盘（等价 git loose object）：
// id = 原始字节 sha256；磁盘存 deflateSync(原始字节)，get 时 inflateSync 还原。
// 文本 chunk/manifest/commit 压缩率 3-7×，已压缩的媒体字节膨胀 <0.5%，可忽略。
export class ObjectStore {
  constructor(readonly dir: string) {}

  private pathFor(id: string): string {
    if (!/^[a-f0-9]{64}$/.test(id)) throw new Error('对象标识无效')
    return path.join(this.dir, id.slice(0, 2), id.slice(2, 4), id.slice(4))
  }

  async put(buf: Uint8Array): Promise<string> {
    const id = await sha256(buf)
    const target = this.pathFor(id)
    if (await this.has(id)) { await this.get(id); return id }
    await writeFileAtomic(target, deflateSync(buf))
    return id
  }

  async get(id: string): Promise<Uint8Array> {
    const raw = inflateSync(await fs.readFile(this.pathFor(id)))
    if (await sha256(raw) !== id) throw new Error(`历史对象校验失败：${id}`)
    return raw
  }

  async has(id: string): Promise<boolean> {
    try {
      await fs.access(this.pathFor(id))
      return true
    } catch {
      return false
    }
  }

  async remove(id: string): Promise<void> {
    if (!/^[a-f0-9]{64}$/.test(id)) throw new Error('对象标识无效')
    await fs.rm(this.pathFor(id), { force: true })
  }
}
