import { it, expect, vi, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { EventEmitter } from 'node:events'
const calls = vi.hoisted(() => ({ spawn: vi.fn(), openPath: vi.fn() }))
vi.mock('electron', () => ({ app: { getPath: () => '', getAppPath: () => '' }, ipcMain: { handle: vi.fn() }, shell: { openPath: calls.openPath } }))
vi.mock('node:child_process', () => ({ spawn: calls.spawn }))
import { Repo, createProject, importProjectItems } from '@wordgit/core'
import { projectRequest } from './projectHandlers.js'
import { setRepo, clearRepo } from '../repoState.js'
import { mcpConfiguration } from '../mcpConfig.js'
let temporary: string, projectId: string
beforeEach(async () => {
  temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'dockitty-project-handler-'))
  const repo = await Repo.init(path.join(temporary, 'lib.wg'), 'test'); setRepo(repo); projectId = (await createProject(repo, 'test')).id
  calls.spawn.mockImplementation(() => { const child = Object.assign(new EventEmitter(), { unref: vi.fn() }); queueMicrotask(() => child.emit('spawn')); return child })
  calls.openPath.mockResolvedValue('')
})
afterEach(async () => { clearRepo(); vi.clearAllMocks(); if (path.dirname(temporary) === os.tmpdir() && path.basename(temporary).startsWith('dockitty-project-handler-')) await fs.rm(temporary, { recursive: true, force: true }) })
it('opens original script paths only as text and refuses executing arbitrary program formats', async () => {
  const source = path.join(temporary, '代码.py'), executable = path.join(temporary, 'program.exe')
  await fs.writeFile(source, 'print(1)'); await fs.writeFile(executable, 'not executed')
  const repo = await Repo.open(path.join(temporary, 'lib.wg')), result = await importProjectItems(repo, { projectId, paths: [source, executable] })
  await projectRequest({ action: 'editFile', projectId, nodeId: result.nodeIds[0] })
  expect(calls.spawn.mock.calls[0][0]).toMatch(/notepad.exe$/i); expect(calls.spawn.mock.calls[0][1]).toEqual([source])
  await expect(projectRequest({ action: 'editFile', projectId, nodeId: result.nodeIds[1] })).rejects.toThrow('不会执行')
  expect(calls.spawn).toHaveBeenCalledTimes(1); expect(calls.openPath).not.toHaveBeenCalled()
  expect(await fs.readFile(source, 'utf8')).toBe('print(1)')
})
it('does not open historical sources or link targets for editing', async () => {
  const source = path.join(temporary, '正文.md'); await fs.writeFile(source, '# original')
  const link = path.join(temporary, 'link'); await fs.symlink(path.join(temporary, 'target'), link, process.platform === 'win32' ? 'junction' : 'dir')
  const repo = await Repo.open(path.join(temporary, 'lib.wg'))
  const old = await importProjectItems(repo, { projectId, paths: [source], snapshot: true }), shortcut = await importProjectItems(repo, { projectId, paths: [link] })
  for (const nodeId of [old.nodeIds[0], shortcut.nodeIds[0]]) await expect(projectRequest({ action: 'editFile', projectId, nodeId })).rejects.toThrow('普通资料')
  expect(calls.spawn).not.toHaveBeenCalled(); expect(calls.openPath).not.toHaveBeenCalled()
})
it('generates matching stdio configurations using the bundled runtime', () => {
  const result = mcpConfiguration('C:\\Apps\\稿喵.exe', 'C:\\Apps\\out\\mcp\\server.cjs', 'D:\\论文\\lib.wg')
  expect(JSON.parse(result.claude).mcpServers.dockitty).toEqual(result.server)
  expect(JSON.parse(result.cursor).mcpServers.dockitty).toEqual(result.server)
  expect(result.codex).toContain('[mcp_servers.dockitty.env]'); expect(result.server.env.ELECTRON_RUN_AS_NODE).toBe('1')
})
