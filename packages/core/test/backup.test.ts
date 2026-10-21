import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { Repo } from '../src/repo.js'
import { commitDoc } from '../src/ops.js'
import { readHead, docIdOf } from '../src/refs.js'
import { exportBackup, importBackup } from '../src/backup.js'
import { StorageContext } from '../src/storageContext.js'
import { readCommit, readTree } from '../src/model.js'
import { scrub } from '../src/scrub.js'
import { tmpDir, cleanup, makeDocxBuf, editDocxAddParagraph } from './helpers.js'
import { zipSync, unzipSync } from 'fflate'

let dir: string, repo: Repo
beforeEach(async () => {
  dir = await tmpDir()
  repo = await Repo.init(path.join(dir, '库.wg'), 't')
})
afterEach(async () => { await cleanup(dir) })

describe('backup', () => {
  it('includes user folders named index and temporary-looking document names', async () => {
    const folder = path.join(repo.root, 'workspace', 'index'); await fs.mkdir(folder)
    await fs.writeFile(path.join(folder, 'notes.tmp-user.txt'), 'user data, not an internal temporary file')
    await commitDoc(repo, 'index', { message: 'v1', author: 'test' })
    const backup = path.join(dir, 'index.wgbak'); await exportBackup(repo, backup)
    const restored = await importBackup(backup, path.join(dir, 'index-restored'))
    expect(await fs.readFile(path.join(restored.root, 'workspace', 'index', 'notes.tmp-user.txt'), 'utf8')).toBe('user data, not an internal temporary file')
  })
  it('keeps the restore destination empty and removes staging when a write fails', async () => {
    await fs.writeFile(path.join(repo.root, 'workspace', 'draft.txt'), 'source must remain intact')
    await commitDoc(repo, 'draft.txt', { message: 'v1', author: 'test' })
    const backup = path.join(dir, 'atomic.zip'), target = path.join(dir, 'atomic-restore')
    await exportBackup(repo, backup); await fs.mkdir(target)
    const originalOpen = fs.open.bind(fs)
    const write = vi.spyOn(fs, 'open').mockImplementation(async (file, flags, mode) => {
      const handle = await originalOpen(file, flags, mode)
      if (flags === 'wx' && String(file).endsWith(path.join('workspace', 'draft.txt'))) handle.writeFile = vi.fn().mockRejectedValue(Object.assign(new Error('disk full fixture'), { code: 'ENOSPC' }))
      return handle
    })
    try {
      await expect(importBackup(backup, target)).rejects.toThrow('disk full fixture')
      expect(await fs.readdir(target)).toEqual([])
      expect((await fs.readdir(dir)).some(name => name.startsWith('.wordgit-restore-'))).toBe(false)
      expect(await fs.readFile(path.join(repo.root, 'workspace', 'draft.txt'), 'utf8')).toBe('source must remain intact')
    } finally { write.mockRestore() }
  })
  it('拒绝恢复覆盖已有目录，备份中不包含进程锁', async () => {
    const backupPath = path.join(dir, 'safe.zip')
    await exportBackup(repo, backupPath)
    const files = unzipSync(new Uint8Array(await fs.readFile(backupPath)))
    expect(files['.write.lock']).toBeUndefined()
    await expect(importBackup(backupPath, repo.root)).rejects.toThrow('为空目录')
    await expect(exportBackup(repo, path.join(repo.root, 'unsafe.zip'))).rejects.toThrow('仓库之外')
  })

  it('拒绝未校验的附加文件和逃逸路径，不写入恢复位置', async () => {
    const backupPath = path.join(dir, 'unsafe.zip')
    await exportBackup(repo, backupPath)
    const files = unzipSync(new Uint8Array(await fs.readFile(backupPath)))
    files['../escape.txt'] = new TextEncoder().encode('unsafe')
    await fs.writeFile(backupPath, zipSync(files))
    const target = path.join(dir, 'restore.wg')
    await expect(importBackup(backupPath, target)).rejects.toThrow(/未校验|无效路径/)
    await expect(fs.stat(target)).rejects.toThrow()
    const manifest = JSON.parse(new TextDecoder().decode(files['_manifest.json']))
    manifest.files.push({ path: '../escape.txt', sha256: 'unused' })
    files['_manifest.json'] = new TextEncoder().encode(JSON.stringify(manifest))
    await fs.writeFile(backupPath, zipSync(files))
    await expect(importBackup(backupPath, target)).rejects.toThrow('无效路径')
    await expect(fs.stat(path.join(dir, 'escape.txt'))).rejects.toThrow()
  })
  it('exportBackup 写出 zip；importBackup 还原后仓库对象完整、提交可访问', async () => {
    const buf1 = makeDocxBuf(['第一章'])
    const buf2 = editDocxAddParagraph(buf1, '新增段落，保证产生新对象')
    await fs.writeFile(path.join(repo.root, 'workspace', '论文.docx'), buf1)
    await commitDoc(repo, '论文.docx', { message: 'v1', author: 'test' })
    await fs.writeFile(path.join(repo.root, 'workspace', '论文.docx'), buf2)
    await commitDoc(repo, '论文.docx', { message: 'v2', author: 'test' })

    const backupPath = path.join(dir, 'backup.zip')
    const { fileCount } = await exportBackup(repo, backupPath)
    expect(fileCount).toBeGreaterThan(3)

    const restoreRoot = path.join(dir, 'restored.wg')
    const restored = await importBackup(backupPath, restoreRoot)

    // 对象完整性
    const result = await scrub(restored)
    expect(result.corrupted).toHaveLength(0)
    expect(result.checked).toBeGreaterThan(0)

    // 提交链可访问
    const docId = docIdOf('论文.docx')
    const head = await readHead(restored, docId, 'main')
    expect(head).toMatch(/^[0-9a-f]{64}$/)
    const ctx = StorageContext.forRepo(restored)
    const commit = await readCommit(ctx, head!)
    expect(commit.message).toBe('v2')
    const tree = await readTree(ctx, commit.tree)
    expect(Object.keys(tree.entries)).toContain('')
  })

  it('备份包损坏时 importBackup 抛出错误', async () => {
    await fs.writeFile(path.join(repo.root, 'workspace', '论文.docx'), makeDocxBuf(['内容']))
    await commitDoc(repo, '论文.docx', { message: 'v1', author: 'test' })
    const backupPath = path.join(dir, 'backup.zip')
    await exportBackup(repo, backupPath)

    // 破坏 zip 内容（在文件末尾附近）
    const data = Buffer.from(await fs.readFile(backupPath))
    data[Math.floor(data.length / 2)] ^= 0xff
    await fs.writeFile(backupPath, data)

    await expect(importBackup(backupPath, path.join(dir, 'bad.wg'))).rejects.toThrow()
  })
})
