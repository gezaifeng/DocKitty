import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import os from 'node:os'
import path from 'node:path'
import { promises as fs } from 'node:fs'
import { Repo } from '@wordgit/core'
import { setRepo, clearRepo } from '../repoState.js'

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  shell: { openPath: vi.fn().mockResolvedValue('') },
}))

// watcher mock
vi.mock('../watcher.js', () => ({
  watchDoc: vi.fn(),
  stopWatcher: vi.fn(),
}))

import { shell } from 'electron'
import { listDocs, importDocHandler, editDoc } from './docHandlers.js'

let tmpDir: string
let repo: Repo

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wg-doc-test-'))
  repo = await Repo.init(path.join(tmpDir, 'r.wg'), 'test')
  setRepo(repo)
  vi.clearAllMocks()
})
afterEach(async () => {
  clearRepo()
  await fs.rm(tmpDir, { recursive: true, force: true })
})

describe('listDocs', () => {
  it('returns empty array when no docs', async () => {
    const docs = await listDocs({})
    expect(docs).toEqual([])
  })

  it('lists imported docs with metadata', async () => {
    const src = path.join(tmpDir, 'report.docx')
    await fs.writeFile(src, Buffer.from('PK\x03\x04dummy'))
    await importDocHandler({ sourcePath: src })
    const docs = await listDocs({})
    expect(docs).toHaveLength(1)
    expect(docs[0].docName).toBe('report.docx')
    expect(docs[0].commitCount).toBe(1)
    expect(docs[0].currentBranch).toBe('main')
  })
})

describe('editDoc', () => {
  it('opens the current workspace without overwriting unsaved edits', async () => {
    const src = path.join(tmpDir, 'notes.docx')
    await fs.writeFile(src, Buffer.from('hello'))
    await importDocHandler({ sourcePath: src })
    const workspace = path.join(repo.root, 'workspace', 'notes.docx')
    await fs.writeFile(workspace, 'unsaved edits')
    const result = await editDoc({ docName: 'notes.docx' })
    expect(result.workspacePath).toContain('notes.docx')
    expect(shell.openPath).toHaveBeenCalledWith(result.workspacePath)
    expect(await fs.readFile(workspace, 'utf8')).toBe('unsaved edits')
  })
})
