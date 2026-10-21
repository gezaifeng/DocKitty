import { McpServer } from '@modelcontextprotocol/server'
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio'
import * as z from 'zod'
import path from 'node:path'
import { createServer } from 'node:http'
import { readVersionWithin } from '../../../apps/desktop/src/main/versionFile.js'
import { compareVersions } from '../../../apps/desktop/src/main/versionComparison.js'
import { mutateLibrary } from '../../../apps/desktop/src/main/libraryService.js'
import { versionStatistics, exportVersionStatistics } from '../../../apps/desktop/src/main/versionStatistics.js'
declare const DOCKITTY_VERSION: string
declare const DOCKITTY_DESKTOP_VERSION: string
import { randomBytes } from 'node:crypto'
import { NodeStreamableHTTPServerTransport, localhostHostValidation, originValidation } from '@modelcontextprotocol/node'
import { Repo, listProjects, createProject, getProject, importProjectItems, refreshProject, recordProjectIteration, updateProjectNode, setProjectCategory, deleteProjectCategory, setProjectRelation, deleteProjectRelation, deleteProjectNode, readProjectFile, exportProjectNode, libraryDocuments, documentDetail, importDoc, createBranch, switchBranch, deleteBranchSafe, listQuarantine, restoreFromQuarantine, recordDraftSave, withUndoableAction, editHistoryStatus, undoEdit, redoEdit } from '@wordgit/core'

const id = z.uuid(), project = { projectId: id }, item = { ...project, nodeId: id }
const edgeStyle = z.object({ arrow: z.enum(['triangle', 'chevron', 'diamond', 'none']).optional(), arrowSize: z.number().min(6).max(24).optional(), line: z.enum(['solid', 'dashed', 'double']).optional(), width: z.number().min(1).max(6).optional() })
const relation = z.object({ id: id.optional(), from: id, to: id, kind: z.enum(['iteration', 'reference', 'example', 'dependency', 'custom']).optional().describe('Legacy compatibility only. Omit for free-text relationships; edits preserve the stored kind.'), label: z.string().max(10000), note: z.string().max(10000).default(''), style: edgeStyle.optional() })
const importSchema = z.object({ ...project, paths: z.array(z.string().min(1)).min(1), parentId: id.nullable().optional(), unpackFolder: z.boolean().default(false), previousNodeId: id.optional(), requestId: z.string().min(1).max(10000).optional(), snapshot: z.boolean().default(false), title: z.string().min(1).max(10000).optional() })

export function createDocKittyServer(repo: Repo) {
  const server = new McpServer({ name: 'dockitty', version: DOCKITTY_VERSION })
  function tool<S extends z.ZodObject>(name: string, description: string, inputSchema: S, action: (request: z.output<S>) => Promise<unknown>, readOnly = false, destructive = false) {
    server.registerTool(name, { description, inputSchema: inputSchema as z.ZodObject, annotations: { readOnlyHint: readOnly, destructiveHint: destructive, openWorldHint: false } }, async request => {
      try {
        const perform = async () => {
          const result = await action(inputSchema.parse(request) as z.output<S>)
          let refreshWarning: string | undefined
          if (!readOnly && typeof request.projectId === 'string') {
            try { await refreshProject(repo, request.projectId) }
            catch (error) { refreshWarning = `操作已完成，但来源刷新失败：${(error as Error).message}` }
          }
          return { content: [{ type: 'text' as const, text: JSON.stringify({ result: result ?? { ok: true }, refreshWarning }) }], structuredContent: { result: result ?? { ok: true }, ...(refreshWarning ? { refreshWarning } : {}) } }
        }
        const projectLabels: Record<string, string> = { dockitty_create_library: '新建项目', dockitty_import_items: '导入项目资料', dockitty_refresh_library: '刷新项目资料', dockitty_record_iteration: '记录迭代', dockitty_update_item: '编辑资料信息或位置', dockitty_set_category: '编辑项目分类', dockitty_remove_category: '删除项目分类', dockitty_set_relation: '编辑资料连线', dockitty_remove_relation: '删除资料连线', dockitty_remove_item: '移除资料' }
        return projectLabels[name] ? await withUndoableAction(repo, projectLabels[name], perform) : await perform()
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

  const doc = { docName: z.string().min(1) }, versionId = z.string().regex(/^[a-f0-9]{64}$/), version = { ...doc, versionId }
  const statistics = { ...doc, branch: z.string().min(1), baselineId: versionId.optional(), compareBranch: z.string().min(1).optional() }
  tool('dockitty_get_capabilities', 'Read actual server version, scope and file safety rules before using this service.', z.object({}), async () => ({
    version: DOCKITTY_VERSION, desktopVersion: DOCKITTY_DESKTOP_VERSION, repoRoot: repo.root,
    modes: ['version-management', 'project-management'],
    versions: ['documents', 'independent-edit-drafts', 'branches', 'notes', 'categories', 'directed-connections', 'layout', 'statistics', 'recycle', 'export'],
    rules: { versionOwnership: 'Each version has one branch label; filters do not include other branches or switch the editing branch.',
      sourceFiles: 'Version editing uses independent managed drafts. Project editing uses original project files. Import, refresh and recycle do not delete sources.',
      refresh: 'Project refresh updates current cards without creating iterations; only record_iteration creates history. Version refresh scans the managed workspace, never the initial source directory.',
      saves: 'Preparing a draft creates a new file. First changed save forms one version; further saves update that version. Sync after agent file writes.',
      relations: 'Version edges are predecessor-to-successor and cannot form cycles. Disconnecting edges preserves ownership and positions.',
      undo: 'Undo history belongs to this MCP process and ends when it exits. Separate desktop and MCP processes do not share an undo stack. External file edits are not reverted.' }
  }), true)
  tool('dockitty_list_documents', 'List version-managed documents, including recycled status. These are separate from project libraries.', z.object({}), async () => libraryDocuments(repo), true)
  tool('dockitty_get_document', 'Read all versions, unique branch ownership, categories, positions, notes, edges, editing branch and active draft. Deleted versions remain marked for restoration.', z.object(doc), async req => documentDetail(repo, req.docName), true)
  tool('dockitty_import_document', 'Read a source file into a new version-managed document; never modify the source or overwrite an existing document name. Use import_version for another draft of an existing document.', z.object({ sourcePath: z.string().min(1), name: z.string().min(1).optional() }), async req => withUndoableAction(repo, '导入文档', () => importDoc(repo, req.sourcePath, req.name), req.name ?? path.basename(req.sourcePath)))
  tool('dockitty_create_document', 'Create a blank independent Word, Excel, TXT or Markdown document in the managed workspace. Does not create anything in the original source directory.', z.object({ name: z.string().min(1), format: z.enum(['docx', 'xlsx', 'txt', 'md']) }), async req => mutateLibrary(repo, { type: 'createDocument', ...req }))
  tool('dockitty_update_document', 'Change display title or recycle/restore the whole managed document. Does not rename or delete its source file.', z.object({ ...doc, title: z.string().min(1).optional(), deleted: z.boolean().optional() }), async req => mutateLibrary(repo, { type: 'document', ...req }))
  tool('dockitty_update_version', 'Edit version title, note, category, order or position; deleted true recycles it, false restores it. Preserve content and source files. Empty categoryId clears classification.', z.object({ ...version, title: z.string().min(1).optional(), note: z.string().optional(), categoryId: z.string().optional(), order: z.number().finite().optional(), position: z.object({ x: z.number().finite(), y: z.number().finite() }).optional(), deleted: z.boolean().optional() }), async req => mutateLibrary(repo, { type: 'version', ...req }))
  tool('dockitty_import_version', 'Add an existing file as another version of this document, on the requested or editing branch. message is its title. replaceVersionId explicitly updates an existing version instead, retaining replacement history. Never edits the input file.', z.object({ ...doc, sourcePath: z.string().min(1), message: z.string().min(1), branch: z.string().optional(), replaceVersionId: versionId.optional() }), async req => mutateLibrary(repo, { type: 'importVersion', ...req }))
  tool('dockitty_prepare_draft', 'Return an independent editable file path without launching an editor. Existing branch requires its tip; an older version needs a new branch name. mode new creates a version only after changed save; replace explicitly updates the chosen tip. Write to workspacePath using your editor, then sync_draft.', z.object({ ...version, branch: z.string().min(1), mode: z.enum(['new', 'replace']).default('new'), title: z.string().optional() }), async req => mutateLibrary(repo, { type: 'edit', ...req }))
  tool('dockitty_sync_draft', 'After agent writes to the active independent draft path returned by prepare_draft, sync it. Repeated calls with unchanged bytes are no-ops; later saves update the same version. Closed or mismatched drafts are not silently reopened.', z.object({ workspacePath: z.string().min(1) }), async req => withUndoableAction(repo, '同步编辑副本', async () => (await recordDraftSave(repo, req.workspacePath)) ?? { changed: false }))
  tool('dockitty_save_workspace', 'Explicitly record edits in the compatibility workspace. mode new appends a version; replace updates the current recorded version with replacement history. Active independent draft takes precedence when the workspace is clean.', z.object({ ...doc, mode: z.enum(['new', 'replace']), message: z.string().min(1) }), async req => mutateLibrary(repo, { type: 'save', ...req }))
  tool('dockitty_undo_replacement', 'Restore the previous recorded contents after replacing a version; preserve the version card identity.', z.object(version), async req => mutateLibrary(repo, { type: 'undoReplacement', ...req }))
  tool('dockitty_manage_branch', 'Create, switch, recycle, restore or move a branch tip using desktop rules. create accepts fromVersionId or fromBranch. switch protects dirty workspace. moveTip may preserve an old tip in a protection branch and does not change unique version ownership. restore requires entryId from list_recycled_branches.', z.object({ ...doc, action: z.enum(['create', 'switch', 'recycle', 'restore', 'moveTip']), branch: z.string().min(1), fromVersionId: versionId.optional(), fromBranch: z.string().optional(), entryId: z.string().optional() }), async req => {
    if (req.action === 'moveTip') { if (!req.fromVersionId) throw new Error('移动分支需要 fromVersionId'); return mutateLibrary(repo, { type: 'moveBranch', docName: req.docName, branch: req.branch, versionId: req.fromVersionId }) }
    return withUndoableAction(repo, '管理分支', async () => {
      if (req.action === 'create') { if (req.fromBranch && req.fromVersionId) throw new Error('请选择一个分支或版本作为起点'); return createBranch(repo, req.docName, req.branch, req.fromBranch || req.fromVersionId ? { branch: req.fromBranch, commitId: req.fromVersionId } : undefined) }
      if (req.action === 'switch') return switchBranch(repo, req.docName, req.branch)
      if (req.action === 'recycle') return deleteBranchSafe(repo, req.docName, req.branch)
      const entry = (await listQuarantine(repo)).find(e => e.id === req.entryId && e.docName === req.docName)
      if (!entry) throw new Error('请选择该文档的回收分支 entryId')
      return restoreFromQuarantine(repo, entry.id, req.branch)
    }, req.action === 'switch' ? req.docName : undefined)
  })
  tool('dockitty_list_recycled_branches', 'List restorable recycled branches. Document and version recycle flags are returned by list_documents/get_document.', z.object({}), async () => listQuarantine(repo), true)
  tool('dockitty_version_category', 'Create, rename or delete a document category. Read ids from get_document. Classification does not change branch ownership or edges.', z.object({ ...doc, action: z.enum(['create', 'rename', 'delete']), name: z.string().optional(), categoryId: z.string().optional() }), async req => mutateLibrary(repo, { type: 'category', ...req }))
  tool('dockitty_arrange_versions', 'Move and order version cards in a category, using the same board rules as the desktop. Does not edit content or connections.', z.object({ ...doc, categoryId: z.string(), versionIds: z.array(versionId) }), async req => mutateLibrary(repo, { type: 'arrange', ...req }))
  tool('dockitty_version_relation', 'Connect/disconnect predecessors or successors, move one version to a branch, edit edge label/note/style, or reverse an edge. For connection editing, versionId is the old/source endpoint and targetVersionId the new/target endpoint. reverseConnection swaps the actual predecessor relation. Cycles and self-links are rejected. moveBranch disconnects old edges and optionally connects to a version in the target branch; omit target to keep independent. Ownership and positions survive disconnects.', z.object({ ...version, action: z.enum(['disconnectPrevious', 'disconnectNext', 'connectPrevious', 'connectNext', 'moveBranch', 'renameConnection', 'reverseConnection', 'styleConnection']), targetVersionId: versionId.optional(), branch: z.string().optional(), label: z.string().max(10000).optional(), note: z.string().max(10000).optional(), style: edgeStyle.optional() }), async req => mutateLibrary(repo, { type: 'relations', ...req }))
  tool('dockitty_tidy_versions', 'Reset version card positions to the default layout, preserving content, branch ownership and edges. Undoable in this MCP process.', z.object(doc), async req => mutateLibrary(repo, { type: 'layout', ...req }))
  tool('dockitty_refresh_workspace', 'Scan the managed workspace for new documents and refresh known workspace state. Never scans or changes initial import source folders. Does not turn every save into a new version.', z.object({}), async () => mutateLibrary(repo, { type: 'refreshWorkspace' }))
  tool('dockitty_read_version', 'Read a version-managed file snapshot up to 1 MiB. Returns UTF-8 text for text formats and base64 otherwise. Export larger files or directory documents instead.', z.object(version), async req => {
    const bytes = Buffer.from(await readVersionWithin(repo, req.docName, req.versionId, 1024 * 1024)), text = /\.(txt|md|markdown|csv|json|xml|html?|css|[cm]?[jt]sx?|py|ya?ml|toml|r|sql)$/i.test(req.docName)
    return { name: req.docName, encoding: text ? 'utf8' : 'base64', content: bytes.toString(text ? 'utf8' : 'base64') }
  }, true)
  tool('dockitty_compare_versions', 'Compare visible body text of two versions using desktop rules and direction from A to B. Parsing errors, unsupported formats or excessive text/difference sizes return errors; they never masquerade as no differences.', z.object({ ...doc, commitIdA: versionId, commitIdB: versionId }), async req => compareVersions(repo, req), true)
  tool('dockitty_export_version', 'Export a file or complete folder version to a new absolute path outside the managed library. Never overwrite existing destinations or source files.', z.object({ ...version, destination: z.string().min(1) }), async req => mutateLibrary(repo, { type: 'export', ...req }))
  tool('dockitty_version_statistics', 'Read the same metrics, definitions, unavailable reasons, actual-predecessor differences and baseline values as desktop statistics. Only versions uniquely owned by the selected branch are counted; independent versions remain included. Never switches the editing branch.', z.object(statistics), async req => versionStatistics(repo, req), true)
  tool('dockitty_export_version_statistics', 'Export requested versions and all available metrics as CSV outside the managed library. Uses the desktop formulas and CSV injection escaping.', z.object({ ...statistics, destination: z.string().min(1), versionIds: z.array(versionId) }), async req => exportVersionStatistics(repo, req))
  tool('dockitty_purge_version', 'IRREVERSIBLE. Permanently remove a version and its stored content, clearing undo history. Only use after explicit user confirmation. deleteSource additionally deletes the exact imported source file and requires confirmedSourcePath matching get_document sourcePath. Recycle with update_version deleted:true instead when permanent deletion was not requested.', z.object({ ...version, confirmation: z.literal('PERMANENTLY DELETE'), deleteSource: z.boolean().default(false), confirmedSourcePath: z.string().optional() }), async req => mutateLibrary(repo, { type: 'purgeVersion', ...req }), false, true)
  tool('dockitty_edit_history', 'Read or undo/redo reversible actions in this MCP server process only. Desktop has a separate session history. External file changes and permanent deletion cannot be undone.', z.object({ action: z.enum(['status', 'undo', 'redo']) }), async req => req.action === 'status' ? editHistoryStatus(repo) : req.action === 'undo' ? undoEdit(repo) : redoEdit(repo))

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
