import { it, expect } from 'vitest'
import { Client } from '@modelcontextprotocol/client'
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { Repo, getProject } from '@wordgit/core'

it('real stdio client imports agent iterations, records relationships, refreshes, and protects source files', async () => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'dockitty-mcp-')), root = path.join(temporary, 'library.wg')
  const repo = await Repo.init(root, 'MCP 验收'), folder = path.join(temporary, '项目')
  await fs.mkdir(path.join(folder, 'iteration-01'), { recursive: true }); await fs.mkdir(path.join(folder, '资料'), { recursive: true })
  await fs.writeFile(path.join(folder, 'iteration-01', 'main.py'), 'print("一轮")')
  await fs.writeFile(path.join(folder, '资料', '说明.md'), '# 算法说明')
  const transport = new StdioClientTransport({ command: process.execPath, args: [path.resolve('dist/server.cjs'), '--repo', root], stderr: 'pipe' })
  const client = new Client({ name: 'dockitty-acceptance-client', version: '1.0.0' })
  try {
    await client.connect(transport)
    const names = (await client.listTools()).tools.map(t => t.name)
    expect(names).toContain('dockitty_import_items'); expect(names).toContain('dockitty_record_iteration')
    expect(names).toEqual(expect.arrayContaining(['dockitty_list_categories', 'dockitty_set_category', 'dockitty_remove_category']))
    const call = async <T,>(name: string, args: Record<string, unknown>): Promise<T> => {
      const result = await client.callTool({ name, arguments: args })
      if (result.isError) throw new Error(JSON.stringify(result.content))
      return (result.structuredContent as { result: T }).result
    }
    const library = await call<{ id: string }>('dockitty_create_library', { name: 'Agent 研究项目' }), projectId = library.id
    const imported = await call<{ nodeIds: string[] }>('dockitty_import_items', { projectId, paths: [folder], unpackFolder: true, requestId: 'initial-import' })
    expect(await call('dockitty_import_items', { projectId, paths: [folder], unpackFolder: true, requestId: 'initial-import' })).toEqual(imported)
    let p = await getProject(repo, projectId), script = p.nodes.find(n => n.name === 'main.py')!, reference = p.nodes.find(n => n.name === '说明.md')!
    const category = await call<{ id: string }>('dockitty_set_category', { projectId, category: { name: '投稿资料' } })
    await call('dockitty_update_item', { projectId, nodeId: script.id, categoryId: category.id })
    await call('dockitty_set_category', { projectId, category: { id: category.id, name: '送审资料' } })
    expect(await call('dockitty_list_categories', { projectId })).toEqual([{ id: category.id, name: '送审资料' }])
    expect((await call<{ nodes: { id: string; categoryId: string }[] }>('dockitty_list_items', { projectId, parentId: script.parentId })).nodes.find(n => n.id === script.id)?.categoryId).toBe(category.id)
    await call('dockitty_set_relation', { projectId, relation: { from: script.id, to: reference.id, label: '参考文档' } })
    expect((await getProject(repo, projectId)).relations[0].kind).toBe('custom')
    const originalEdge = (await getProject(repo, projectId)).relations[0], style = { arrow: 'chevron', arrowSize: 18, line: 'double', width: 3 }
    await call('dockitty_set_relation', { projectId, relation: { ...originalEdge, style } })
    await call('dockitty_set_relation', { projectId, relation: { ...originalEdge, label: '带样式的参考关系' } })
    expect((await getProject(repo, projectId)).relations[0].style).toEqual(style)
    const invalidStyle = await client.callTool({ name: 'dockitty_set_relation', arguments: { projectId, relation: { ...originalEdge, style: { width: -1 } } } })
    expect(invalidStyle.isError).toBe(true)
    await call('dockitty_remove_category', { projectId, categoryId: category.id })
    expect((await getProject(repo, projectId)).nodes.find(n => n.id === script.id)?.categoryId).toBe('')
    expect(await call<{ encoding: string; content: string }>('dockitty_read_file', { projectId, nodeId: script.id })).toMatchObject({ encoding: 'utf8', content: 'print("一轮")' })
    await fs.writeFile(path.join(folder, 'iteration-01', 'main.py'), 'print("二轮")')
    const next = await call<{ nodeIds: string[] }>('dockitty_record_iteration', { projectId, nodeId: script.id, title: '第二轮脚本', requestId: 'second-round' })
    expect(await call('dockitty_record_iteration', { projectId, nodeId: script.id, title: '第二轮脚本', requestId: 'second-round' })).toEqual(next)
    expect(await call('dockitty_read_file', { projectId, nodeId: script.id })).toMatchObject({ content: 'print("一轮")' })
    expect(await call('dockitty_read_file', { projectId, nodeId: next.nodeIds[0] })).toMatchObject({ content: 'print("二轮")' })
    p = await getProject(repo, projectId); expect(p.relations).toHaveLength(2)
    const bad = await client.callTool({ name: 'dockitty_set_relation', arguments: { projectId, relation: { from: script.id, to: script.id, kind: 'reference', label: '错误' } } })
    expect(bad.isError).toBe(true)
    const output = path.join(temporary, '导出.py'); await call('dockitty_export_item', { projectId, nodeId: next.nodeIds[0], destination: output })
    expect(await fs.readFile(output, 'utf8')).toBe('print("二轮")')
    await call('dockitty_remove_item', { projectId, nodeId: reference.id })
    expect(await fs.readFile(path.join(folder, '资料', '说明.md'), 'utf8')).toBe('# 算法说明')
    await call('dockitty_refresh_library', { projectId })
    expect((await getProject(repo, projectId)).nodes.some(n => n.id === reference.id)).toBe(false)
  } finally {
    await client.close()
    if (path.dirname(temporary) === os.tmpdir() && path.basename(temporary).startsWith('dockitty-mcp-')) await fs.rm(temporary, { recursive: true, force: true })
  }
}, 30000)
