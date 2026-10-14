import { McpServer } from '@modelcontextprotocol/server'
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio'
import * as z from 'zod'
import path from 'node:path'
import { createServer } from 'node:http'
import { randomBytes } from 'node:crypto'
import { NodeStreamableHTTPServerTransport, localhostHostValidation, originValidation } from '@modelcontextprotocol/node'
import { Repo, listProjects, createProject, getProject, importProjectItems, refreshProject, recordProjectIteration, updateProjectNode, setProjectCategory, deleteProjectCategory, setProjectRelation, deleteProjectRelation, deleteProjectNode, readProjectFile, exportProjectNode } from '@wordgit/core'

const id = z.uuid(), project = { projectId: id }, item = { ...project, nodeId: id }
const edgeStyle = z.object({ arrow: z.enum(['triangle', 'chevron', 'diamond', 'none']).optional(), arrowSize: z.number().min(6).max(24).optional(), line: z.enum(['solid', 'dashed', 'double']).optional(), width: z.number().min(1).max(6).optional() })
const relation = z.object({ id: id.optional(), from: id, to: id, kind: z.enum(['iteration', 'reference', 'example', 'dependency', 'custom']).optional().describe('Legacy compatibility only. Omit for free-text relationships; edits preserve the stored kind.'), label: z.string().max(10000), note: z.string().max(10000).default(''), style: edgeStyle.optional() })
const importSchema = z.object({ ...project, paths: z.array(z.string().min(1)).min(1), parentId: id.nullable().optional(), unpackFolder: z.boolean().default(false), previousNodeId: id.optional(), requestId: z.string().min(1).max(10000).optional(), snapshot: z.boolean().default(false), title: z.string().min(1).max(10000).optional() })

export function createDocKittyServer(repo: Repo) {
  const server = new McpServer({ name: 'dockitty', version: '0.5.4' })
  function tool<S extends z.ZodObject>(name: string, description: string, inputSchema: S, action: (request: z.output<S>) => Promise<unknown>, readOnly = false, destructive = false) {
    server.registerTool(name, { description, inputSchema: inputSchema as z.ZodObject, annotations: { readOnlyHint: readOnly, destructiveHint: destructive, openWorldHint: false } }, async request => {
      try {
        const result = await action(inputSchema.parse(request) as z.output<S>)
        let refreshWarning: string | undefined
        if (!readOnly && typeof request.projectId === 'string') {
          try { await refreshProject(repo, request.projectId) }
          catch (error) { refreshWarning = `操作已完成，但来源刷新失败：${(error as Error).message}` }
        }
        return { content: [{ type: 'text' as const, text: JSON.stringify({ result: result ?? { ok: true }, refreshWarning }) }], structuredContent: { result: result ?? { ok: true }, ...(refreshWarning ? { refreshWarning } : {}) } }
      } catch (error) { return { isError: true, content: [{ type: 'text' as const, text: (error as Error).message }] } }
    })
  }
  tool('dockitty_list_libraries', 'List project document libraries. Use each returned id as projectId.', z.object({}), async () => (await listProjects(repo)).map(p => ({ id: p.id, name: p.name, itemCount: p.nodes.length, rootItemCount: p.nodes.filter(n => !n.parentId).length })), true)
  tool('dockitty_create_library', 'Create a project document library without modifying source files.', z.object({ name: z.string().min(1).max(10000) }), async req => createProject(repo, req.name))
  tool('dockitty_list_items', 'Browse one folder level, plus relationships involving these items. Omit parentId for the library root.', z.object({ ...project, parentId: id.nullable().optional() }), async req => {
    const p = await getProject(repo, req.projectId)
    if (req.parentId && !p.nodes.some(n => n.id === req.parentId && n.kind === 'folder')) throw new Error('目标文件夹不存在')
    const nodes = p.nodes.filter(n => n.parentId === (req.parentId ?? null)), ids = new Set(nodes.map(n => n.id))
    return { nodes, categories: p.categories ?? [], relations: p.relations.filter(r => ids.has(r.from) || ids.has(r.to)) }
  }, true)
  tool('dockitty_import_items', 'Import multiple files or folders into an existing library. unpackFolder imports one parent folder’s direct children. Only an explicit previousNodeId creates iteration links; refresh never creates iterations. requestId makes identical retries idempotent.', importSchema, async req => {
    return importProjectItems(repo, req)
  })
  tool('dockitty_refresh_library', 'Refresh current file/folder contents from their sources. Existing cards keep their ids, notes, layout and relations. Source deletions remove current cards and their edges; renamed paths become new cards. Does not create iteration history.', z.object(project), async req => refreshProject(repo, req.projectId))
  tool('dockitty_record_iteration', 'Explicitly preserve the current stored card as history, read latest source bytes into the next card, and connect them. Future refresh updates only the latest card. Source deletions remove both current and historical cards. requestId makes retries idempotent.', z.object({ ...item, title: z.string().min(1).max(10000), requestId: z.string().min(1).max(10000).optional() }), async req => {
    return recordProjectIteration(repo, req.projectId, req.nodeId, req.title, req.requestId)
  })
  tool('dockitty_update_item', 'Edit display title, note, categoryId or canvas position; never renames or edits the source file. Categories are project-wide. Use categoryId null or empty string to clear classification.', z.object({ ...item, title: z.string().min(1).max(10000).optional(), note: z.string().max(10000).optional(), categoryId: z.union([id, z.literal('')]).nullable().optional(), position: z.object({ x: z.number().finite(), y: z.number().finite() }).optional() }), async req => updateProjectNode(repo, req.projectId, req.nodeId, req))
  tool('dockitty_list_categories', 'List shared categories for this project. The desktop board displays only the currently opened folder level.', z.object(project), async req => (await getProject(repo, req.projectId)).categories ?? [], true)
  tool('dockitty_set_category', 'Create a project-wide category, or rename it by providing category.id. Existing card labels follow renames automatically. Does not move source files or change graph connections.', z.object({ ...project, category: z.object({ id: id.optional(), name: z.string().min(1).max(10000) }) }), async req => setProjectCategory(repo, req.projectId, req.category))
  tool('dockitty_remove_category', 'Remove a project category. Its items become unclassified; preserve all cards, file contents and relationships.', z.object({ ...project, categoryId: id }), async req => deleteProjectCategory(repo, req.projectId, req.categoryId), false, true)
  tool('dockitty_set_relation', 'Create or edit a directed relationship from relation.from to relation.to, between any files or folders in the same project. Use any free-text label; no preset kind is required. Supply relation.id to edit endpoints, label or style (arrow, arrowSize, line, width). Omitted style fields preserve existing formatting. Manual relationships can point both ways and form cycles. Existing explicit iteration edges retain their cycle checks.', z.object({ ...project, relation }), async req => setProjectRelation(repo, req.projectId, req.relation))
  tool('dockitty_remove_relation', 'Remove only the relationship; preserve both endpoint items.', z.object({ ...project, relationId: id }), async req => deleteProjectRelation(repo, req.projectId, req.relationId), false, true)
  tool('dockitty_remove_item', 'Remove a managed card and its descendants and relations, without deleting source files. Current cards removed manually stay excluded from subsequent refresh.', z.object(item), async req => deleteProjectNode(repo, req.projectId, req.nodeId), false, true)
  tool('dockitty_read_file', 'Read the managed contents of a file. Text source is returned as text, not executed. Office and binary files are base64 encoded. Maximum response payload is 1 MiB; export larger files instead.', z.object(item), async req => {
    const p = await getProject(repo, req.projectId), node = p.nodes.find(n => n.id === req.nodeId)
    if (!node || node.kind !== 'file') throw new Error('请选择文件')
    if (node.linkTarget) return { name: node.name, linkTarget: node.linkTarget, contentCopied: false }
    if (node.size > 1024 * 1024) throw new Error('文件超过 MCP 读取大小，请使用导出工具')
    const bytes = await readProjectFile(repo, req.projectId, req.nodeId)
    const ext = path.extname(node.name).slice(1).toLowerCase()
    const text = ['md', 'markdown', 'txt', 'html', 'htm', 'py', 'cpp', 'c', 'h', 'hpp', 'js', 'ts', 'tsx', 'jsx', 'json', 'yaml', 'yml', 'toml', 'xml', 'css', 'csv', 'sh', 'ps1', 'bat', 'r', 'rs', 'go', 'java', 'sql'].includes(ext)
    return { name: node.name, encoding: text ? 'utf8' : 'base64', content: bytes.toString(text ? 'utf8' : 'base64') }
  }, true)
  tool('dockitty_export_item', 'Export a file or complete folder snapshot to a new absolute path outside the managed library. Existing destinations are never overwritten.', z.object({ ...item, destination: z.string().min(1) }), async req => exportProjectNode(repo, req.projectId, req.nodeId, req.destination))
  return server
}
async function main() {
  const flag = process.argv.indexOf('--repo'), root = flag >= 0 ? process.argv[flag + 1] : process.env.DOCKITTY_REPO
  if (!root || !path.isAbsolute(root)) throw new Error('请用 --repo 或 DOCKITTY_REPO 指定稿喵文档库绝对路径')
  const repo = await Repo.open(root)
  if (process.argv.includes('--http')) {
    const portFlag = process.argv.indexOf('--port'), port = portFlag >= 0 ? Number(process.argv[portFlag + 1]) : 0
    if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('本机 MCP 端口无效')
    const token = process.env.DOCKITTY_HTTP_TOKEN ?? randomBytes(32).toString('hex'), validateHost = localhostHostValidation(), validateOrigin = originValidation([])
    if (!/^[a-f0-9]{64}$/.test(token)) throw new Error('本机 MCP 访问密钥无效')
    const http = createServer((req, res) => {
      if (!validateHost(req, res) || !validateOrigin(req, res)) return
      if (req.url !== '/mcp') { res.writeHead(404); res.end(); return }
      if (req.headers.authorization !== 'Bearer ' + token) { res.writeHead(401); res.end('Unauthorized'); return }
      const transport = new NodeStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true }), server = createDocKittyServer(repo)
      res.once('close', () => { void server.close().catch(() => {}) })
      void server.connect(transport).then(() => transport.handleRequest(req, res)).catch(error => {
        if (!res.headersSent) res.writeHead(500)
        if (!res.writableEnded) res.end((error as Error).message)
      })
    })
    await new Promise<void>((resolve, reject) => { http.once('error', reject); http.listen(port, '127.0.0.1', resolve) })
    const address = http.address()
    if (!address || typeof address === 'string') throw new Error('本机 MCP 端口不可用')
    process.stdout.write(JSON.stringify({ url: `http://127.0.0.1:${address.port}/mcp`, token }) + '\n')
    process.stdin.resume(); process.stdin.once('end', () => http.close())
  } else await createDocKittyServer(repo).connect(new StdioServerTransport())
}
if (!process.env.DOCKITTY_MCP_TEST_IMPORT) void main().catch(error => { process.stderr.write((error as Error).message + '\n'); process.exitCode = 1 })
