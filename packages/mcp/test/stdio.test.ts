import { it, expect } from 'vitest'
import { Client } from '@modelcontextprotocol/client'
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { Repo, getProject, documentDetail } from '@wordgit/core'

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


it('real stdio version management shares desktop rules for drafts, branches, notes, edges, recycle and statistics', async () => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'dockitty-mcp-versions-')), root = path.join(temporary, 'library.wg')
  const repo = await Repo.init(root, '版本 MCP 验收'), source = path.join(temporary, '论文.txt'), original = '甲乙\n研究初稿'
  await fs.writeFile(source, original)
  const client = new Client({ name: 'dockitty-version-acceptance', version: '1.0.0' })
  const transport = new StdioClientTransport({ command: process.execPath, args: [path.resolve('dist/server.cjs'), '--repo', root], stderr: 'pipe' })
  const call = async <T,>(name: string, args: Record<string, unknown> = {}): Promise<T> => {
    const response = await client.callTool({ name, arguments: args })
    if (response.isError) throw new Error(JSON.stringify(response.content))
    return (response.structuredContent as { result: T }).result
  }
  try {
    await client.connect(transport)
    expect(await call('dockitty_get_capabilities')).toMatchObject({ version: '0.5.13', modes: ['version-management', 'project-management'] })
    const names = (await client.listTools()).tools.map(t => t.name)
    expect(names).toContain('dockitty_version_statistics'); expect(names).toContain('dockitty_version_relation')
    const { commitId: first } = await call<{ commitId: string }>('dockitty_import_document', { sourcePath: source })
    const docName = '论文.txt'
    await call('dockitty_update_document', { docName, title: '论文 · 送审' })
    const { categoryId } = await call<{ categoryId: string }>('dockitty_version_category', { docName, action: 'create', name: '初稿' })
    await call('dockitty_update_version', { docName, versionId: first, note: '第一次记录', categoryId, position: { x: 80, y: 100 } })
    const draft = await call<{ workspacePath: string }>('dockitty_prepare_draft', { docName, versionId: first, branch: 'main', title: '第二稿' })
    expect(draft.workspacePath).not.toBe(source)
    await fs.writeFile(draft.workspacePath, original + '增加实验')
    const second = await call<{ versionId: string }>('dockitty_sync_draft', draft)
    expect(second.versionId).not.toBe(first)
    expect(await call('dockitty_sync_draft', draft)).toEqual({ changed: false })
    await fs.writeFile(draft.workspacePath, original + '增加实验与讨论')
    expect((await call<{ versionId: string }>('dockitty_sync_draft', draft)).versionId).toBe(second.versionId)
    let detail = await documentDetail(repo, docName)
    expect(detail.versions).toHaveLength(2); expect(detail.versions.find(v => v.id === first)?.note).toBe('第一次记录')
    await call('dockitty_manage_branch', { docName, action: 'create', branch: 'TIP', fromVersionId: first })
    await call('dockitty_version_relation', { docName, versionId: second.versionId, action: 'moveBranch', branch: 'TIP' })
    detail = await documentDetail(repo, docName)
    expect(detail.versions.find(v => v.id === second.versionId)).toMatchObject({ parents: [], branches: ['TIP'] })
    await call('dockitty_version_relation', { docName, versionId: first, action: 'connectNext', targetVersionId: second.versionId })
    await call('dockitty_version_relation', { docName, versionId: first, action: 'renameConnection', targetVersionId: second.versionId, label: '补充实验', note: '送审准备', style: { line: 'dashed', arrowSize: 16 } })
    const cyclic = await client.callTool({ name: 'dockitty_version_relation', arguments: { docName, versionId: second.versionId, action: 'connectNext', targetVersionId: first } })
    expect(cyclic.isError).toBe(true)
    await call('dockitty_version_relation', { docName, versionId: first, action: 'reverseConnection', targetVersionId: second.versionId })
    detail = await documentDetail(repo, docName)
    expect(detail.versions.find(v => v.id === first)).toMatchObject({ parents: [second.versionId], parentLabels: { [second.versionId]: '补充实验' } })
    expect(detail.versions.find(v => v.id === second.versionId)?.branches).toEqual(['TIP'])
    expect(await call('dockitty_compare_versions', { docName, commitIdA: first, commitIdB: second.versionId })).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'insert' })]))
    const stats = await call<{ versions: { id: string; values: { characters: number } }[] }>('dockitty_version_statistics', { docName, branch: 'TIP' })
    expect(stats.versions.map(v => v.id)).toEqual([second.versionId]); expect(stats.versions[0].values.characters).toBeGreaterThan(5)
    const csv = path.join(temporary, '统计.csv')
    await call('dockitty_export_version_statistics', { docName, branch: 'TIP', versionIds: [second.versionId], destination: csv })
    expect(await fs.readFile(csv, 'utf8')).toContain('第二稿')
    await call('dockitty_update_version', { docName, versionId: second.versionId, deleted: true })
    expect((await documentDetail(repo, docName)).versions.find(v => v.id === second.versionId)?.deletedAt).toBeTruthy()
    await call('dockitty_edit_history', { action: 'undo' })
    expect((await documentDetail(repo, docName)).versions.find(v => v.id === second.versionId)?.deletedAt).toBeNull()
    await call('dockitty_edit_history', { action: 'redo' })
    await call('dockitty_update_version', { docName, versionId: second.versionId, deleted: false })
    const currentDelete = await client.callTool({ name: 'dockitty_manage_branch', arguments: { docName, action: 'recycle', branch: 'TIP' } })
    expect(currentDelete.isError).toBe(true)
    await call('dockitty_manage_branch', { docName, action: 'switch', branch: 'main' })
    await call('dockitty_manage_branch', { docName, action: 'recycle', branch: 'TIP' })
    const recycled = await call<{ id: string; branch: string }[]>('dockitty_list_recycled_branches')
    await call('dockitty_manage_branch', { docName, action: 'restore', branch: 'TIP', entryId: recycled.find(v => v.branch === 'TIP')!.id })
    const output = path.join(temporary, '导出.txt')
    await call('dockitty_export_version', { docName, versionId: second.versionId, destination: output })
    expect(await fs.readFile(output, 'utf8')).toBe(original + '增加实验与讨论')
    expect(await call('dockitty_read_version', { docName, versionId: first })).toMatchObject({ encoding: 'utf8', content: original })
    const blocked = await client.callTool({ name: 'dockitty_purge_version', arguments: { docName, versionId: first, deleteSource: true, confirmation: 'PERMANENTLY DELETE', confirmedSourcePath: 'wrong' } })
    expect(blocked.isError).toBe(true)
    expect(await call('dockitty_edit_history', { action: 'status' })).toMatchObject({ canUndo: true })
    expect(await fs.readFile(source, 'utf8')).toBe(original)
    await call('dockitty_create_document', { name: '空白表格', format: 'xlsx' })
    expect(await call('dockitty_list_documents')).toEqual(expect.arrayContaining([expect.objectContaining({ docName: '空白表格.xlsx' })]))
  } finally {
    await client.close()
    if (path.dirname(temporary) === os.tmpdir() && path.basename(temporary).startsWith('dockitty-mcp-versions-')) await fs.rm(temporary, { recursive: true, force: true })
  }
}, 45000)
