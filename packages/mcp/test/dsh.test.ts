import { it, expect } from 'vitest'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawn } from 'node:child_process'
import { Repo, getProject } from '@wordgit/core'
const dshRoot = process.env.DOCKITTY_DSH_ROOT

it.skipIf(!dshRoot)('DSH real MCP registry connects over local HTTP and calls DocKitty file-management tools', async () => {
  const root = path.resolve(dshRoot!), directory = await fs.mkdtemp(path.join(root, '.cache', 'tests', 'dockitty-mcp-'))
  const { Store } = await import(pathToFileURL(path.join(root, 'server/store.mjs')).href)
  const { McpRegistry } = await import(pathToFileURL(path.join(root, 'server/mcp.mjs')).href)
  const registry = new McpRegistry(new Store(directory), { nodePath: path.join(root, 'runtime/node.exe') })
  let child: ReturnType<typeof spawn> | undefined
  try {
    const libraryRoot = path.join(directory, '稿喵文档库.wg'), repo = await Repo.init(libraryRoot, 'DSH验收')
    await fs.mkdir(path.join(directory, '迭代'))
    const source = path.join(directory, '迭代', '结果.md'); await fs.writeFile(source, '# DSH 测试资料')
    child = spawn(process.execPath, [path.resolve('dist/server.cjs'), '--repo', libraryRoot, '--http'], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true })
    const endpoint = await new Promise<{ url: string; token: string }>((resolve, reject) => {
      let data = ''
      const timer = setTimeout(() => reject(new Error('本机 MCP 服务启动超时')), 10000)
      child!.stdout!.on('data', bytes => { data += String(bytes); if (data.includes('\n')) { clearTimeout(timer); resolve(JSON.parse(data.trim())) } })
      child!.once('error', error => { clearTimeout(timer); reject(error) })
      child!.once('exit', code => { clearTimeout(timer); if (!data) reject(new Error('MCP 服务退出：' + code)) })
    })
    expect((await fetch(endpoint.url, { method: 'POST' })).status).toBe(401)
    const item = registry.add({ name: '稿喵测试', transport: 'streamable-http', url: endpoint.url, bearerToken: endpoint.token })
    await registry.connect(item.id)
    const snapshot = registry.snapshot()
    expect(snapshot.definitions.length).toBeGreaterThanOrEqual(12)
    const invoke = async (suffix: string, args: Record<string, unknown>) => {
      const tool = snapshot.definitions.find((t: { function: { description: string } }) => t.function.description.includes('/ ' + suffix + ':'))
      expect(tool).toBeTruthy()
      const response = await snapshot.invoke(tool.function.name, args, new AbortController().signal)
      if (response.isError) throw new Error(JSON.stringify(response))
      return JSON.parse(response.content[0].text).result
    }
    const project = await invoke('dockitty_create_library', { name: 'DSH Agent 项目' })
    await invoke('dockitty_import_items', { projectId: project.id, paths: [source] })
    const node = (await getProject(repo, project.id)).nodes[0]
    expect(node.name).toBe('结果.md')
    const category = await invoke('dockitty_set_category', { projectId: project.id, category: { name: '项目结果' } })
    await invoke('dockitty_update_item', { projectId: project.id, nodeId: node.id, categoryId: category.id })
    expect(await invoke('dockitty_list_categories', { projectId: project.id })).toEqual([{ id: category.id, name: '项目结果' }])
    expect((await getProject(repo, project.id)).nodes[0].categoryId).toBe(category.id)
    expect(await fs.readFile(source, 'utf8')).toBe('# DSH 测试资料')
  } finally {
    await registry.close()
    if (child && child.exitCode === null) { child.stdin!.end(); await new Promise<void>(resolve => { child!.once('exit', () => resolve()); setTimeout(() => { child!.kill(); resolve() }, 3000) }) }
    if (path.dirname(directory) === path.join(root, '.cache', 'tests') && path.basename(directory).startsWith('dockitty-mcp-')) await fs.rm(directory, { recursive: true, force: true })
  }
}, 60000)
