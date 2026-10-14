import { promises as fs } from 'node:fs'
import path from 'node:path'
import { AsyncLocalStorage } from 'node:async_hooks'
import type { Repo } from './repo.js'

const pending = new Map<string, Promise<unknown>>()
const held = new AsyncLocalStorage<Set<string>>()

export async function withRepoWrite<T>(repo: Repo, action: () => Promise<T>): Promise<T> {
  const root = path.resolve(repo.root)
  if (held.getStore()?.has(root)) return action()
  const previous = pending.get(root) ?? Promise.resolve()
  const task = previous.catch(() => {}).then(async () => {
    const lockPath = path.join(root, '.write.lock')
    let lock: Awaited<ReturnType<typeof fs.open>>
    try {
      lock = await fs.open(lockPath, 'wx')
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e
      let alive = true
      const owner = Number(await fs.readFile(lockPath, 'utf8'))
      if (Number.isInteger(owner) && owner > 0) {
        try { process.kill(owner, 0) } catch (error) {
          alive = (error as NodeJS.ErrnoException).code !== 'ESRCH'
        }
      }
      if (alive) throw new Error('仓库正在被另一个进程写入，请稍后重试或关闭另一窗口')
      await fs.rm(lockPath)
      lock = await fs.open(lockPath, 'wx')
    }
    try {
      await lock.writeFile(String(process.pid))
      await lock.sync()
      return await held.run(new Set([...(held.getStore() ?? []), root]), action)
    } finally {
      await lock.close()
      await fs.rm(lockPath, { force: true })
    }
  })
  pending.set(root, task)
  try { return await task } finally { if (pending.get(root) === task) pending.delete(root) }
}
