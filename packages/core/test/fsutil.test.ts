import { it, expect, vi } from 'vitest'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { writeFileAtomic } from '../src/fsutil.js'
import { tmpDir, cleanup } from './helpers.js'

it('短暂文件占用后可替换；持续占用保留原文件且不遗留临时文件', async () => {
  const dir = await tmpDir()
  const target = path.join(dir, '当前稿.txt')
  await fs.writeFile(target, '原稿')
  const locked = Object.assign(new Error('file busy'), { code: 'EPERM' })
  const rename = vi.spyOn(fs, 'rename')
  try {
    rename.mockRejectedValueOnce(locked)
    await writeFileAtomic(target, new TextEncoder().encode('新稿'))
    expect(await fs.readFile(target, 'utf8')).toBe('新稿')
    rename.mockRejectedValue(locked)
    await expect(writeFileAtomic(target, new TextEncoder().encode('未能替换的稿'))).rejects.toThrow('file busy')
    expect(await fs.readFile(target, 'utf8')).toBe('新稿')
    expect(await fs.readdir(dir)).toEqual(['当前稿.txt'])
  } finally { rename.mockRestore(); await cleanup(dir) }
})

it('failed streaming input preserves the old file and removes its partial temporary file', async () => {
  const dir = await tmpDir(), target = path.join(dir, 'current.txt')
  await fs.writeFile(target, 'original')
  async function* broken() { yield Buffer.from('partial'); throw new Error('source read failed') }
  try {
    await expect(writeFileAtomic(target, broken())).rejects.toThrow('source read failed')
    expect(await fs.readFile(target, 'utf8')).toBe('original')
    expect(await fs.readdir(dir)).toEqual(['current.txt'])
  } finally { await cleanup(dir) }
})
