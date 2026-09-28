import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import os from 'node:os'
import path from 'node:path'
import { promises as fs } from 'node:fs'
import { Repo } from '@wordgit/core'
import { setRepo, clearRepo } from '../repoState.js'

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
}))

import {
  createCommitHandler, listCommitsHandler, checkoutCommitHandler,
} from './commitHandlers.js'

let tmpDir: string
let repo: Repo

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wg-commit-test-'))
  repo = await Repo.init(path.join(tmpDir, 'r.wg'), 'test')
  setRepo(repo)
  // create a workspace file so commitDoc works
  const wsDir = path.join(repo.root, 'workspace')
  await fs.writeFile(path.join(wsDir, 'doc.docx'), Buffer.from('hello'))
})
afterEach(async () => {
  clearRepo()
  await fs.rm(tmpDir, { recursive: true, force: true })
})

describe('createCommitHandler', () => {
  it('commits a new version', async () => {
    const r = await createCommitHandler({
      docName: 'doc.docx',
      message: '初始版本',
      author: 'tester',
    })
    expect(r.commitId).not.toBeNull()
    expect(r.branch).toBe('main')
  })
})

describe('listCommitsHandler', () => {
  it('returns empty for unknown doc', async () => {
    const list = await listCommitsHandler({ docName: 'nonexistent.docx' })
    expect(list).toEqual([])
  })

  it('returns commits after committing', async () => {
    await createCommitHandler({ docName: 'doc.docx', message: 'v1', author: 'tester' })
    const list = await listCommitsHandler({ docName: 'doc.docx' })
    expect(list).toHaveLength(1)
    expect(list[0].message).toBe('v1')
  })
})

describe('checkoutCommitHandler', () => {
  it('checks out to workspace', async () => {
    await createCommitHandler({ docName: 'doc.docx', message: 'v1', author: 'tester' })
    const commits = await listCommitsHandler({ docName: 'doc.docx' })
    const result = await checkoutCommitHandler({ docName: 'doc.docx', commitId: commits[0].id })
    expect(result.docId).toBeTruthy()
    expect(result.commitId).toBe(commits[0].id)
  })
})
