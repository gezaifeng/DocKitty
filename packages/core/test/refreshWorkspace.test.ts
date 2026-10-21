import { it, expect } from 'vitest'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { Repo, importDoc, documentDetail, docIds, refreshWorkspaceDocuments, undoEdit, redoEdit, startDraft } from '../src/index.js'

it('discovers only regular files in its own workspace, preserves history and sources, and supports undo/redo', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'dockitty-workspace-refresh-'))
  try {
    const repo = await Repo.init(path.join(temp, 'library.wg'), 'test'), source = path.join(temp, 'source.txt'), workspace = path.join(repo.root, 'workspace')
    await fs.writeFile(source, 'source'); await importDoc(repo, source)
    const original = await documentDetail(repo, 'source.txt')
    await fs.writeFile(path.join(workspace, 'source.txt'), 'working changes')
    await fs.writeFile(path.join(temp, 'outside.txt'), 'outside')
    await fs.writeFile(path.join(workspace, 'new.md'), '# new'); await fs.writeFile(path.join(workspace, '~$lock.docx'), 'lock')
    await fs.mkdir(path.join(workspace, 'folder')); await fs.writeFile(path.join(workspace, 'folder', 'inner.txt'), 'skip')
    await fs.symlink(path.join(workspace, 'folder'), path.join(workspace, 'linked'), process.platform === 'win32' ? 'junction' : 'dir')
    expect(await refreshWorkspaceDocuments(repo)).toEqual({ added: 1 })
    expect((await docIds(repo)).sort()).toEqual(['new.md', 'source.txt'])
    expect((await documentDetail(repo, 'source.txt')).versions).toEqual(original.versions)
    expect((await documentDetail(repo, 'source.txt')).workspace.dirty).toBe(true)
    expect(await fs.readFile(source, 'utf8')).toBe('source')
    await undoEdit(repo); expect(await docIds(repo)).toEqual(['source.txt'])
    expect(await fs.readFile(path.join(workspace, 'new.md'), 'utf8')).toBe('# new')
    await redoEdit(repo); expect((await docIds(repo)).sort()).toEqual(['new.md', 'source.txt'])
    expect(await refreshWorkspaceDocuments(repo)).toEqual({ added: 0 })
    await fs.writeFile(path.join(workspace, 'source.txt'), 'source')
    const draft = await startDraft(repo, 'source.txt', original.versions[0].id, 'main', 'new', '下一稿')
    await fs.writeFile(draft.workspacePath, 'draft edits'); await refreshWorkspaceDocuments(repo)
    expect((await documentDetail(repo, 'source.txt')).versions).toHaveLength(2)
    await refreshWorkspaceDocuments(repo); expect((await documentDetail(repo, 'source.txt')).versions).toHaveLength(2)
    expect(await fs.readFile(source, 'utf8')).toBe('source')
  } finally { if (path.dirname(temp) === os.tmpdir() && path.basename(temp).startsWith('dockitty-workspace-refresh-')) await fs.rm(temp, { recursive: true, force: true }) }
})
