import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const locations = vi.hoisted(() => ({ userData: '', appPath: '', packaged: false }))
vi.mock('electron', () => ({
  app: { get isPackaged() { return locations.packaged }, getPath: () => locations.userData, getAppPath: () => locations.appPath },
  ipcMain: { handle: vi.fn() },
}))

import os from 'node:os'
import path from 'node:path'
import { promises as fs } from 'node:fs'
import { createRepo, openRepo, bootstrapRepo, relocateRepo } from './repoHandlers.js'
import { Repo } from '@wordgit/core'
import { clearRepo, getRepo } from '../repoState.js'

let tmpDir: string

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wg-repo-test-'))
  locations.userData = path.join(tmpDir, 'profile')
  locations.appPath = path.join(tmpDir, 'software')
  vi.stubEnv('WORDGIT_LIBRARY_HOME', locations.appPath)
  locations.packaged = false
  clearRepo()
})

afterEach(async () => {
  clearRepo()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  await fs.rm(tmpDir, { recursive: true, force: true })
})

describe('single default library', () => {
  it('starts directly and coalesces concurrent initialization', async () => {
    const [one, two] = await Promise.all([bootstrapRepo({}), bootstrapRepo({})])
    expect(one.repoRoot).toBe(path.join(locations.appPath, '稿喵文档库.wg'))
    expect(two).toEqual(one)
    clearRepo()
    expect((await bootstrapRepo({})).repoRoot).toBe(one.repoRoot)
  })
  it('keeps installer data outside the installation directory', async () => {
    vi.unstubAllEnvs(); locations.packaged = true
    await fs.mkdir(path.join(locations.appPath, 'resources'), { recursive: true })
    await fs.writeFile(path.join(locations.appPath, 'resources/installer-mode.json'), '{}')
    const result = await bootstrapRepo({})
    expect(result.repoRoot).toBe(path.join(locations.userData, '稿喵文档库.wg'))
    await expect(fs.access(path.join(locations.appPath, '稿喵文档库.wg'))).rejects.toThrow()
    locations.packaged = false
  })
  it('reuses the previous library without creating an empty default', async () => {
    const previousRoot = path.join(tmpDir, 'old.wg')
    await Repo.init(previousRoot, 'old')
    expect((await bootstrapRepo({ previousRoot })).repoRoot).toBe(previousRoot)
    expect((await bootstrapRepo({})).repoRoot).toBe(previousRoot)
    await expect(fs.stat(locations.appPath)).rejects.toMatchObject({ code: 'ENOENT' })
  })
  it('does not replace an inaccessible configured library', async () => {
    await fs.mkdir(locations.userData, { recursive: true })
    await fs.writeFile(path.join(locations.userData, 'library-settings.json'), JSON.stringify({ root: path.join(tmpDir, 'missing.wg') }))
    await expect(bootstrapRepo({})).rejects.toThrow()
    await expect(fs.stat(locations.appPath)).rejects.toMatchObject({ code: 'ENOENT' })
  })
  it('copies data, retains the original and remembers the new location', async () => {
    const initial = await bootstrapRepo({})
    await fs.writeFile(path.join(initial.repoRoot, 'workspace', '论文.txt'), '未记录的工作稿')
    const result = await relocateRepo({ parent: path.join(tmpDir, 'custom') })
    expect(await fs.readFile(path.join(result.repoRoot, 'workspace', '论文.txt'), 'utf8')).toBe('未记录的工作稿')
    expect(await fs.readFile(path.join(initial.repoRoot, 'workspace', '论文.txt'), 'utf8')).toBe('未记录的工作稿')
    expect(await fs.readFile(path.join(result.repoRoot, 'repo.yaml'), 'utf8')).toBe(await fs.readFile(path.join(initial.repoRoot, 'repo.yaml'), 'utf8'))
    await expect(fs.stat(path.join(result.repoRoot, '.write.lock'))).rejects.toMatchObject({ code: 'ENOENT' })
    clearRepo()
    expect((await bootstrapRepo({ previousRoot: initial.repoRoot })).repoRoot).toBe(result.repoRoot)
  })
  it('refuses occupied and nested destinations', async () => {
    const initial = await bootstrapRepo({})
    const parent = path.join(tmpDir, 'occupied')
    await fs.mkdir(path.join(parent, '稿喵文档库.wg'), { recursive: true })
    await expect(relocateRepo({ parent })).rejects.toThrow('已有文档库')
    await expect(relocateRepo({ parent: path.join(initial.repoRoot, 'nested') })).rejects.toThrow('内部')
    expect(getRepo().root).toBe(initial.repoRoot)
  })
  it('keeps the original active and cleans staging when copying fails', async () => {
    const initial = await bootstrapRepo({})
    vi.spyOn(fs, 'cp').mockRejectedValueOnce(new Error('磁盘已满'))
    const parent = path.join(tmpDir, 'failed')
    await expect(relocateRepo({ parent })).rejects.toThrow('磁盘已满')
    expect(getRepo().root).toBe(initial.repoRoot)
    expect(await fs.readdir(parent)).toEqual([])
    expect((await bootstrapRepo({})).repoRoot).toBe(initial.repoRoot)
  })
  it('explains fallback when the software directory is not writable', async () => {
    vi.spyOn(Repo, 'init').mockRejectedValueOnce(Object.assign(new Error('denied'), { code: 'EACCES' }))
    const result = await bootstrapRepo({})
    expect(result.repoRoot).toBe(path.join(locations.userData, '稿喵文档库.wg'))
    expect(result.notice).toContain('不可写')
  })
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
