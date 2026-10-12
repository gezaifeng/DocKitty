import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import os from 'node:os'
import path from 'node:path'
import { promises as fs } from 'node:fs'
import { Repo } from '@wordgit/core'
import { setRepo, clearRepo } from '../repoState.js'

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
}))

import { createBranchHandler, switchBranchHandler, deleteBranchHandler } from './branchHandlers.js'
import { createCommitHandler } from './commitHandlers.js'

let tmpDir: string
let repo: Repo

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wg-branch-test-'))
  repo = await Repo.init(path.join(tmpDir, 'r.wg'), 'test')
  setRepo(repo)
  await fs.writeFile(path.join(repo.root, 'workspace', 'doc.docx'), Buffer.from('hello'))
  await createCommitHandler({ docName: 'doc.docx', message: '初始版本', author: 'tester' })
})
afterEach(async () => {
  clearRepo()
  await fs.rm(tmpDir, { recursive: true, force: true })
})

describe('createBranchHandler', () => {
  it('creates a new branch from current HEAD', async () => {
    await expect(createBranchHandler({
      docName: 'doc.docx',
      branch: 'feature-v2',
    })).resolves.toBeUndefined()
  })

  it('throws on duplicate branch name', async () => {
    await createBranchHandler({ docName: 'doc.docx', branch: 'dup' })
    await expect(createBranchHandler({ docName: 'doc.docx', branch: 'dup' })).rejects.toThrow()
  })
})

describe('switchBranchHandler', () => {
  it('switches current branch', async () => {
    await createBranchHandler({ docName: 'doc.docx', branch: 'alt' })
    await expect(switchBranchHandler({ docName: 'doc.docx', branch: 'alt' })).resolves.toBeUndefined()
  })
})

describe('deleteBranchHandler', () => {
  it('moves branch to quarantine and returns entry', async () => {
    await createBranchHandler({ docName: 'doc.docx', branch: 'to-delete' })
    const entry = await deleteBranchHandler({ docName: 'doc.docx', branch: 'to-delete' })
    expect(entry.branch).toBe('to-delete')
    expect(entry.id).toBeTruthy()
  })
})
