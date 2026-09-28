import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
}))

import os from 'node:os'
import path from 'node:path'
import { promises as fs } from 'node:fs'
import { createRepo, openRepo } from './repoHandlers.js'
import { clearRepo, getRepo } from '../repoState.js'

let tmpDir: string

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wg-repo-test-'))
  clearRepo()
})

afterEach(async () => {
  clearRepo()
  await fs.rm(tmpDir, { recursive: true, force: true })
})

describe('createRepo', () => {
  it('creates a repo and returns repoRoot', async () => {
    const repoPath = path.join(tmpDir, 'myrepo.wg')
    const result = await createRepo({ root: repoPath, name: 'myrepo' })
    expect(result.repoRoot).toBe(repoPath)
    // sets repo state
    expect(getRepo().root).toBe(repoPath)
  })

  it('throws ZodError on invalid args', async () => {
    await expect(createRepo({ root: '', name: 'x' })).rejects.toThrow()
  })
})

describe('openRepo', () => {
  it('opens an existing repo', async () => {
    const repoPath = path.join(tmpDir, 'myrepo.wg')
    await createRepo({ root: repoPath, name: 'myrepo' })
    clearRepo()
    const result = await openRepo({ root: repoPath })
    expect(result.repoRoot).toBe(repoPath)
    expect(result.repoName).toBe('myrepo.wg')
  })

  it('throws on non-existent path', async () => {
    await expect(openRepo({ root: path.join(tmpDir, 'nonexistent') })).rejects.toThrow()
  })
})
