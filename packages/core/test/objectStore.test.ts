import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import path from 'node:path'
import { ObjectStore } from '../src/objectStore.js'
import { tmpDir, cleanup } from './helpers.js'

let dir: string
beforeEach(async () => { dir = await tmpDir() })
afterEach(async () => { await cleanup(dir) })

describe('ObjectStore', () => {
  it('put/get 往返，id 等于内容 sha256', async () => {
    const store = new ObjectStore(path.join(dir, 'chunks'))
    const data = new TextEncoder().encode('hello')
    const id = await store.put(data)
    expect(id).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824')
    expect([...await store.get(id)]).toEqual([...data])
  })

  it('相同内容重复 put 返回相同 id 且不报错', async () => {
    const store = new ObjectStore(path.join(dir, 'chunks'))
    const a = await store.put(new Uint8Array([1, 2, 3]))
    const b = await store.put(new Uint8Array([1, 2, 3]))
    expect(a).toBe(b)
    expect(await store.has(a)).toBe(true)
  })

  it('对象按 sha256 分桶存放（ab/cd/…）', async () => {
    const store = new ObjectStore(path.join(dir, 'chunks'))
    const id = await store.put(new TextEncoder().encode('hello'))
    const obj = await store.get(id)
    expect(obj).toBeDefined()
    const fs = await import('node:fs/promises')
    const st = await fs.stat(path.join(dir, 'chunks', id.slice(0, 2), id.slice(2, 4), id.slice(4)))
    expect(st.isFile()).toBe(true)
  })
})
