import { it, expect, vi } from 'vitest'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Repo, importDoc } from '@wordgit/core'
import { setRepo, clearRepo } from '../repoState.js'
import { versionStatistics } from '../versionStatistics.js'
vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() } }))
import { getPreviewBytes } from './previewHandlers.js'

it('rejects oversized historical/workspace previews before loading bytes and exposes only available statistics', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'dockitty-preview-limit-'))
  try {
    const repo = await Repo.init(path.join(directory, 'library'), 'limits'); setRepo(repo)
    const source = path.join(directory, 'large.txt'); const file = await fs.open(source, 'w'); await file.truncate(21 * 1024 * 1024); await file.close()
    const { commitId } = await importDoc(repo, source)
    await expect(getPreviewBytes({ docName: 'large.txt', commitId })).rejects.toThrow('20 MiB')
    await expect(getPreviewBytes({ docName: 'large.txt' })).rejects.toThrow('20 MiB')
    const stats = await versionStatistics(repo, { docName: 'large.txt', branch: 'main' })
    expect(stats.versions[0].values).toEqual({ size: 21 * 1024 * 1024, revisions: 0 })
    expect(stats.versions[0].unavailable).toContain('正文指标未计算')
    expect(stats.versions[0].values.characters).toBeUndefined()
  } finally {
    clearRepo()
    if (path.dirname(directory) === os.tmpdir() && path.basename(directory).startsWith('dockitty-preview-limit-')) await fs.rm(directory, { recursive: true, force: true })
  }
}, 30000)
