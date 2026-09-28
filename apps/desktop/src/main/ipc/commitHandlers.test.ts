import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import os from 'node:os'
import path from 'node:path'
import { promises as fs } from 'node:fs'
import { Repo } from '@wordgit/core'
import { zipSync } from 'fflate'
import { setRepo, clearRepo } from '../repoState.js'

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
}))

import {
  createCommitHandler, listCommitsHandler, checkoutCommitHandler, diffTextHandler,
} from './commitHandlers.js'

let tmpDir: string
let repo: Repo

function makeDocx(text: string): Buffer {
  const enc = new TextEncoder()
  const xml = `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`
  const buf = zipSync({
    '[Content_Types].xml': enc.encode('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>'),
    'word/document.xml': enc.encode(xml),
  })
  return Buffer.from(buf)
}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wg-commit-test-'))
  repo = await Repo.init(path.join(tmpDir, 'r.wg'), 'test')
  setRepo(repo)
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

describe('diffTextHandler', () => {
  it('returns DiffResult array for two commits with different content', async () => {
    const wsDir = path.join(repo.root, 'workspace')

    await fs.writeFile(path.join(wsDir, 'paper.docx'), makeDocx('第一版内容'))
    const r1 = await createCommitHandler({ docName: 'paper.docx', message: 'v1', author: 'tester' })
    expect(r1.commitId).not.toBeNull()
    const commitIdA = r1.commitId!

    await fs.writeFile(path.join(wsDir, 'paper.docx'), makeDocx('第二版内容'))
    const r2 = await createCommitHandler({ docName: 'paper.docx', message: 'v2', author: 'tester' })
    expect(r2.commitId).not.toBeNull()
    const commitIdB = r2.commitId!

    const diffs = await diffTextHandler({ docName: 'paper.docx', commitIdA, commitIdB })
    expect(Array.isArray(diffs)).toBe(true)
    expect(diffs.length).toBeGreaterThan(0)
    const types = diffs.map((d) => d.type)
    expect(types).toContain('delete')
    expect(types).toContain('insert')
  })

  it('returns only equal entries when both sides are the same commit', async () => {
    const wsDir = path.join(repo.root, 'workspace')
    await fs.writeFile(path.join(wsDir, 'paper.docx'), makeDocx('相同内容'))
    const r1 = await createCommitHandler({ docName: 'paper.docx', message: 'v1', author: 'tester' })
    expect(r1.commitId).not.toBeNull()
    const commitIdA = r1.commitId!

    // Compare same commit against itself — diff must be all-equal
    const diffs = await diffTextHandler({ docName: 'paper.docx', commitIdA, commitIdB: commitIdA })
    const nonEqual = diffs.filter((d) => d.type !== 'equal')
    expect(nonEqual).toHaveLength(0)
  })
})
