import { it, expect } from 'vitest'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { Repo } from '../src/repo.js'
import { withRepoWrite } from '../src/writeLock.js'
import { tmpDir, cleanup } from './helpers.js'

it('rejects a real competing process, recovers its dead lock and serializes local writes', async () => {
  const directory = await tmpDir(), repo = await Repo.init(path.join(directory, 'library'), 'locks'), lock = path.join(repo.root, '.write.lock')
  const child = spawn(process.execPath, ['-e', "require('fs').writeFileSync(process.argv[1],String(process.pid),{flag:'wx'});process.stdout.write('READY');setInterval(()=>{},1000)", lock], { stdio: 'pipe', windowsHide: true })
  const closed = new Promise<void>(resolve => child.once('close', () => resolve()))
  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('competing writer did not become ready')), 5000)
      child.stdout!.once('data', () => { clearTimeout(timeout); resolve() })
      child.once('error', error => { clearTimeout(timeout); reject(error) })
    })
    let called = false
    await expect(withRepoWrite(repo, async () => { called = true })).rejects.toThrow('另一个进程')
    expect(called).toBe(false); child.kill(); await closed
    const order: number[] = []
    await Promise.all([1, 2, 3].map(number => withRepoWrite(repo, async () => { order.push(number); await new Promise(resolve => setTimeout(resolve, 5)); expect(order.at(-1)).toBe(number) })))
    expect(order).toEqual([1, 2, 3]); await expect(fs.stat(lock)).rejects.toThrow()
  } finally { if (child.exitCode === null && child.signalCode === null) { child.kill(); await closed }; await cleanup(directory) }
}, 10000)
