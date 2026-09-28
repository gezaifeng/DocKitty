import { promises as fs } from 'node:fs'
import path from 'node:path'
import { deflateSync, inflateSync } from 'fflate'
import { sha256 } from './hashes.js'

// 内容寻址 + deflate 压缩落盘（等价 git loose object）：
// id = 原始字节 sha256；磁盘存 deflateSync(原始字节)，get 时 inflateSync 还原。
// 文本 chunk/manifest/commit 压缩率 3-7×，已压缩的媒体字节膨胀 <0.5%，可忽略。
export class ObjectStore {
  constructor(readonly dir: string) {}

  private pathFor(id: string): string {
    return path.join(this.dir, id.slice(0, 2), id.slice(2, 4), id.slice(4))
  }

  async put(buf: Uint8Array): Promise<string> {
    const id = await sha256(buf)
    const target = this.pathFor(id)
    if (await this.has(id)) return id
    await fs.mkdir(path.dirname(target), { recursive: true })
    const tmp = `${target}.tmp-${process.pid}-${Math.random().toString(36).slice(2)}`
    const fh = await fs.open(tmp, 'w')
    try {
      await fh.write(deflateSync(buf))
      await fh.sync()
    } finally {
      await fh.close()
    }
    try {
      await fs.rename(tmp, target)
    } catch (e) {
      // 并发/重复写入：目标已存在则清理临时文件即可（内容寻址保证同 id 同内容）
      await fs.rm(tmp, { force: true })
      if (!(await this.has(id))) throw e
    }
    return id
  }

  async get(id: string): Promise<Uint8Array> {
    return inflateSync(await fs.readFile(this.pathFor(id)))
  }

  async has(id: string): Promise<boolean> {
    try {
      await fs.access(this.pathFor(id))
      return true
    } catch {
      return false
    }
  }
}
