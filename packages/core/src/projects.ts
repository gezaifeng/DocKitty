import { EdgeStyleSchema } from '../../shared/src/edgeStyle.js'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import type { ProjectLibrary, ProjectNode, ProjectRelation, ProjectCategory, RelationKind, ProjectImport, ProjectImportResult, ProjectSource, ProjectRefreshResult } from '../../shared/src/projects.js'
import type { Repo } from './repo.js'
import { readFileBlocks, writeFileAtomic } from './fsutil.js'
import { withRepoWrite } from './writeLock.js'

interface ProjectIndex {
  format: 1
  projects: ProjectLibrary[]
  requests: Record<string, { signature: string; result: ProjectImportResult }>
}
const kinds: RelationKind[] = ['iteration', 'reference', 'example', 'dependency', 'custom']
const indexPath = (repo: Repo) => path.join(repo.root, 'projects', 'catalog.json')
const objectPath = (repo: Repo, hash: string) => {
  if (!/^[a-f0-9]{64}$/.test(hash)) throw new Error('无效文件快照标识')
  return path.join(repo.root, 'objects', 'project-files', hash)
}
function text(value: string, label: string, empty = false): string {
  if (typeof value !== 'string' || (!empty && !value.trim()) || value.length > 10000) throw new Error(`${label}无效`)
  return value.trim()
}
async function readIndex(repo: Repo): Promise<ProjectIndex> {
  try {
    const data = JSON.parse(await fs.readFile(indexPath(repo), 'utf8')) as ProjectIndex
    if (data.format !== 1 || !Array.isArray(data.projects) || !data.requests) throw new Error('项目索引格式不支持')
    return data
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return { format: 1, projects: [], requests: {} }
    throw e
  }
}
async function saveIndex(repo: Repo, data: ProjectIndex) {
  await writeFileAtomic(indexPath(repo), Buffer.from(JSON.stringify(data, null, 2)))
}
function findProject(data: ProjectIndex, id: string) {
  const project = data.projects.find(p => p.id === id)
  if (!project) throw new Error('文档库不存在')
  return project
}
function findNode(project: ProjectLibrary, id: string) {
  const node = project.nodes.find(n => n.id === id)
  if (!node) throw new Error('文件或文件夹不存在')
  return node
}
function updateFolderSizes(project: ProjectLibrary) {
  const children = new Map<string | null, ProjectNode[]>()
  for (const node of project.nodes) {
    const list = children.get(node.parentId)
    if (list) list.push(node); else children.set(node.parentId, [node])
  }
  const size = (node: ProjectNode): number => {
    if (node.kind === 'folder') node.size = (children.get(node.id) ?? []).reduce((sum, child) => sum + size(child), 0)
    return node.size
  }
  project.nodes.filter(n => !n.parentId).forEach(size)
}
export async function listProjects(repo: Repo): Promise<ProjectLibrary[]> { return (await readIndex(repo)).projects }
export async function getProject(repo: Repo, id: string): Promise<ProjectLibrary> { return findProject(await readIndex(repo), id) }
export async function setProjectWorkingFolder(repo: Repo, id: string, folder: string) {
  return withRepoWrite(repo, async () => {
    const resolved = await fs.realpath(folder)
    if (!(await fs.lstat(resolved)).isDirectory()) throw new Error('请选择普通工作文件夹')
    const data = await readIndex(repo)
    findProject(data, id).workingFolder = resolved
    await saveIndex(repo, data)
  })
}
export async function createProject(repo: Repo, name: string): Promise<ProjectLibrary> {
  name = text(name, '文档库名称')
  return withRepoWrite(repo, async () => {
    const data = await readIndex(repo)
    const project: ProjectLibrary = { id: randomUUID(), name, createdAt: new Date().toISOString(), nodes: [], relations: [], categories: [] }
    data.projects.push(project); await saveIndex(repo, data); return project
  })
}
async function digest(file: string) {
  const hash = createHash('sha256')
  for await (const chunk of readFileBlocks(file)) hash.update(chunk)
  return hash.digest('hex')
}
function inside(root: string, target: string) {
  const relative = path.relative(root, target)
  return relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith('..' + path.sep))
}
async function collectSource(repo: Repo, source: ProjectSource, stage: string, previous: ProjectNode[], start = 0): Promise<ProjectNode[]> {
  const nodes: ProjectNode[] = [], repoRoot = await fs.realpath(repo.root)
  const key = (file: string, kind: string) => (process.platform === 'win32' ? file.toLowerCase() : file) + ':' + kind
  const existingByPath = new Map(previous.filter(n => n.sourceId === source.id && n.sourcePath).map(n => [key(n.sourcePath!, n.kind), n]))
  async function copy(file: string, parentId: string | null, ordinal: number) {
    if (source.excludedPaths.some(excluded => inside(excluded, file))) return
    const stat = await fs.lstat(file)
    const link = stat.isSymbolicLink()
    if (!link && !stat.isFile() && !stat.isDirectory()) throw new Error('不支持特殊设备文件')
    if (!link) {
      const real = await fs.realpath(file)
      if (inside(repoRoot, real) || inside(real, repoRoot)) throw new Error('不能导入稿喵文档库或包含它的目录')
    }
    const kind = stat.isDirectory() ? 'folder' : 'file'
    const existing = existingByPath.get(key(file, kind))
    const node: ProjectNode = existing ? { ...existing, parentId } : { id: randomUUID(), parentId, name: path.basename(file), title: path.basename(file), kind, size: 0, note: '', createdAt: new Date().toISOString(), position: { x: 40 + ordinal % 3 * 290, y: 40 + Math.floor(ordinal / 3) * 190 } }
    node.sourceId = source.id; node.sourcePath = file; node.size = 0
    nodes.push(node)
    if (link) {
      node.linkTarget = path.resolve(path.dirname(file), await fs.readlink(file)); delete node.contentHash
    } else if (kind === 'file') {
      delete node.linkTarget
      const temp = path.join(stage, node.id)
      await fs.copyFile(file, temp)
      node.contentHash = await digest(temp); node.size = (await fs.stat(temp)).size
      const target = objectPath(repo, node.contentHash)
      await fs.mkdir(path.dirname(target), { recursive: true })
      if (await fs.access(target).then(() => true, error => { if (error.code !== 'ENOENT') throw error; return false })) {
        if (await digest(target) !== node.contentHash) throw new Error('已有文件快照损坏，请恢复备份后再导入')
      } else {
        const handle = await fs.open(temp, 'r+'); try { await handle.sync() } finally { await handle.close() }
        await fs.rename(temp, target)
      }
    } else {
      delete node.linkTarget
      delete node.contentHash
      const entries = (await fs.readdir(file)).sort()
      for (let i = 0; i < entries.length; i++) await copy(path.join(file, entries[i]), node.id, i)
    }
  }
  let stat
  try { stat = await fs.lstat(source.path) }
  catch (error) {
    if (['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? '')) return []
    throw error
  }
  if (source.unpackFolder) {
    if (stat.isSymbolicLink()) throw new Error('链接入口只保留卡片，不展开目标目录')
    if (!stat.isDirectory()) throw new Error('来源父文件夹已变成文件，请重新导入')
    const children = (await fs.readdir(source.path)).sort()
    for (let i = 0; i < children.length; i++) await copy(path.join(source.path, children[i]), source.parentId, start + i)
  } else await copy(source.path, source.parentId, start)
  return nodes
}
function subtree(project: ProjectLibrary, nodeId: string) {
  const ids = new Set([nodeId])
  for (let size = 0; size !== ids.size;) {
    size = ids.size
    project.nodes.filter(n => n.parentId && ids.has(n.parentId)).forEach(n => ids.add(n.id))
  }
  return ids
}
function freezeNode(project: ProjectLibrary, nodeId: string) {
  const root = findNode(project, nodeId), ids = subtree(project, nodeId)
  if (root.sourcePath && root.sourceId) project.sources?.find(s => s.id === root.sourceId)?.excludedPaths.push(root.sourcePath)
  for (const node of project.nodes) if (ids.has(node.id) && !node.snapshot) { delete node.sourceId; node.snapshot = true; node.snapshotRootId = nodeId }
}
function checkRelation(project: ProjectLibrary, relation: Omit<ProjectRelation, 'id'>, excludeId?: string) {
  findNode(project, relation.from); findNode(project, relation.to)
  if (relation.from === relation.to) throw new Error('不能连接到自身')
  if (!kinds.includes(relation.kind)) throw new Error('关系类型无效')
  text(relation.label, '关系标签', true); text(relation.note, '关系备注', true)
  if (relation.kind !== 'iteration') return
  const seen = new Set<string>(), visit = [relation.to]
  while (visit.length) {
    const id = visit.pop()!
    if (id === relation.from) throw new Error('迭代关系不能形成循环')
    if (seen.has(id)) continue
    seen.add(id)
    visit.push(...project.relations.filter(e => e.id !== excludeId && e.kind === 'iteration' && e.from === id).map(e => e.to))
  }
}
export async function importProjectItems(repo: Repo, request: ProjectImport): Promise<ProjectImportResult> {
  if (!Array.isArray(request.paths) || !request.paths.length || request.paths.some(p => typeof p !== 'string' || !path.isAbsolute(p))) throw new Error('请选择文件或文件夹的绝对路径')
  if (request.unpackFolder && request.paths.length !== 1) throw new Error('展开导入只支持一个父文件夹')
  if (request.title !== undefined) text(request.title, '迭代名称')
  const signature = createHash('sha256').update(JSON.stringify({ projectId: request.projectId, paths: request.paths.map(p => path.resolve(p)), parentId: request.parentId ?? null, unpackFolder: request.unpackFolder ?? false, previousNodeId: request.previousNodeId, snapshot: request.snapshot ?? false, title: request.title })).digest('hex')
  if (request.requestId !== undefined) text(request.requestId, '请求标识')
  return withRepoWrite(repo, async () => {
    const data = await readIndex(repo), project = findProject(data, request.projectId)
    const requestKey = request.requestId ? `${project.id}:${request.requestId}` : null
    if (requestKey && Object.hasOwn(data.requests, requestKey)) {
      const previous = data.requests[requestKey]
      if (previous.signature !== signature) throw new Error('请求标识已用于不同的导入参数')
      return previous.result
    }
    const parentId = request.parentId ?? null
    if (parentId && findNode(project, parentId).kind !== 'folder') throw new Error('导入目标必须是文件夹')
    if (parentId && findNode(project, parentId).snapshot) throw new Error('历史文件夹为快照，请返回当前文件夹或文档库根目录导入')
    if (request.previousNodeId) findNode(project, request.previousNodeId)
    const repoRoot = await fs.realpath(repo.root)
    const sources: string[] = []
    for (const input of request.paths) {
      if ((await fs.lstat(input)).isSymbolicLink()) { sources.push(path.resolve(input)); continue }
      const source = await fs.realpath(input)
      if (inside(repoRoot, source) || inside(source, repoRoot)) throw new Error('不能导入稿喵文档库或包含它的目录')
      sources.push(source)
    }
    if (request.unpackFolder && !(await fs.lstat(sources[0])).isDirectory()) throw new Error('展开导入需要普通文件夹；链接入口只保留卡片')
    const stage = await fs.mkdtemp(path.join(repo.root, '.project-import-'))
    const nodes: ProjectNode[] = [], nodeIds: string[] = []
    try {
      const existing = project.nodes.filter(n => n.parentId === parentId).length
      project.sources ??= []
      for (let i = 0; i < sources.length; i++) {
        const source: ProjectSource = { id: randomUUID(), path: sources[i], parentId, unpackFolder: request.unpackFolder ?? false, excludedPaths: [] }
        const copied = await collectSource(repo, source, stage, [], existing + i)
        nodeIds.push(...copied.filter(n => n.parentId === parentId).map(n => n.id))
        if (request.snapshot) {
          const groups = new Map<string, string>()
          for (const n of copied) {
            n.snapshotRootId = n.parentId === parentId ? n.id : groups.get(n.parentId!)
            groups.set(n.id, n.snapshotRootId ?? n.id); delete n.sourceId; n.snapshot = true
          }
        }
        else project.sources.push(source)
        nodes.push(...copied)
      }
      if (request.previousNodeId) {
        freezeNode(project, request.previousNodeId)
        for (const source of project.sources) {
          if (nodes.some(n => n.sourceId === source.id)) continue
          for (const imported of sources) if (inside(source.path, imported) && source.unpackFolder) source.excludedPaths.push(imported)
        }
      }
      project.nodes.push(...nodes)
      if (request.previousNodeId) {
        const previous = findNode(project, request.previousNodeId)
        for (const node of nodes.filter(n => nodeIds.includes(n.id))) {
          const position = { x: previous.position.x + 290, y: previous.position.y }
          while (project.nodes.some(n => n.id !== node.id && n.parentId === parentId && Math.abs(n.position.x - position.x) < 250 && Math.abs(n.position.y - position.y) < 150)) position.y += 190
          node.position = position
        }
      }
      if (request.title) project.nodes.filter(n => nodeIds.includes(n.id)).forEach(n => { n.title = request.title! })
      updateFolderSizes(project)
      const relationIds: string[] = []
      if (request.previousNodeId) for (const id of nodeIds) {
        const edge: ProjectRelation = { id: randomUUID(), from: request.previousNodeId, to: id, kind: 'iteration', label: '下一轮迭代', note: '' }
        checkRelation(project, edge); project.relations.push(edge); relationIds.push(edge.id)
      }
      const result = { nodeIds, relationIds }
      if (requestKey) data.requests[requestKey] = { signature, result }
      await saveIndex(repo, data); return result
    } finally {
      if (path.dirname(stage) !== repo.root || !path.basename(stage).startsWith('.project-import-')) throw new Error('导入暂存位置无效')
      await fs.rm(stage, { recursive: true, force: true })
    }
  })
}
export async function recordProjectIteration(repo: Repo, projectId: string, nodeId: string, title: string, requestId?: string): Promise<ProjectImportResult> {
  const project = await getProject(repo, projectId), node = findNode(project, nodeId)
  if (node.linkTarget) throw new Error('链接入口只记录目标路径，不记录目标内容迭代')
  if (!node.sourcePath) throw new Error('此节点没有来源路径，请导入新文件或文件夹创建下一轮')
  if (node.snapshot && (!requestId || !Object.hasOwn((await readIndex(repo)).requests, `${projectId}:${requestId}`))) throw new Error('历史快照不能同步原路径；请通过导入新文件或文件夹创建下一轮')
  return importProjectItems(repo, { projectId, paths: [node.sourcePath], parentId: node.parentId, previousNodeId: nodeId, requestId, title: text(title, '迭代名称') })
}
export async function updateProjectNode(repo: Repo, projectId: string, nodeId: string, patch: { title?: string; note?: string; categoryId?: string | null; position?: { x: number; y: number } }) {
  return withRepoWrite(repo, async () => {
    const data = await readIndex(repo), project = findProject(data, projectId), node = findNode(project, nodeId)
    if (patch.title !== undefined) node.title = text(patch.title, '名称')
    if (patch.note !== undefined) node.note = text(patch.note, '备注', true)
    if (patch.categoryId !== undefined) {
      if (patch.categoryId && !project.categories?.some(c => c.id === patch.categoryId)) throw new Error('分类不存在')
      node.categoryId = patch.categoryId ?? ''
    }
    if (patch.position !== undefined) {
      if (!Number.isFinite(patch.position.x) || !Number.isFinite(patch.position.y)) throw new Error('位置无效')
      node.position = patch.position
    }
    await saveIndex(repo, data); return node
  })
}
export async function setProjectCategory(repo: Repo, projectId: string, category: { id?: string; name: string }): Promise<ProjectCategory> {
  return withRepoWrite(repo, async () => {
    const data = await readIndex(repo), project = findProject(data, projectId), name = text(category.name, '分类名称')
    project.categories ??= []
    if (category.id && !project.categories.some(c => c.id === category.id)) throw new Error('分类不存在')
    if (project.categories.some(c => c.id !== category.id && c.name.toLowerCase() === name.toLowerCase())) throw new Error('分类名称已存在')
    const saved = { id: category.id ?? randomUUID(), name }
    if (category.id) project.categories = project.categories.map(c => c.id === category.id ? saved : c)
    else project.categories.push(saved)
    await saveIndex(repo, data); return saved
  })
}
export async function deleteProjectCategory(repo: Repo, projectId: string, categoryId: string) {
  return withRepoWrite(repo, async () => {
    const data = await readIndex(repo), project = findProject(data, projectId)
    if (!project.categories?.some(c => c.id === categoryId)) throw new Error('分类不存在')
    project.categories = project.categories.filter(c => c.id !== categoryId)
    for (const node of project.nodes) if (node.categoryId === categoryId) node.categoryId = ''
    await saveIndex(repo, data)
  })
}
export async function setProjectRelation(repo: Repo, projectId: string, input: Omit<ProjectRelation, 'id' | 'kind'> & { id?: string; kind?: RelationKind }): Promise<ProjectRelation> {
  return withRepoWrite(repo, async () => {
    const data = await readIndex(repo), project = findProject(data, projectId)
    const previous = project.relations.find(e => e.id === input.id)
    const relation = { ...input, kind: input.kind ?? previous?.kind ?? 'custom', style: input.style ? { ...previous?.style, ...EdgeStyleSchema.parse(input.style) } : previous?.style }
    if (relation.id && !project.relations.some(e => e.id === relation.id)) throw new Error('关系不存在')
    checkRelation(project, relation, relation.id)
    const edge = { ...relation, id: relation.id ?? randomUUID(), label: text(relation.label, '标签', true), note: text(relation.note, '备注', true) }
    project.relations = project.relations.filter(e => e.id !== edge.id); project.relations.push(edge)
    await saveIndex(repo, data); return edge
  })
}
export async function deleteProjectRelation(repo: Repo, projectId: string, relationId: string) {
  await withRepoWrite(repo, async () => {
    const data = await readIndex(repo), project = findProject(data, projectId)
    if (!project.relations.some(e => e.id === relationId)) throw new Error('关系不存在')
    project.relations = project.relations.filter(e => e.id !== relationId); await saveIndex(repo, data)
  })
}
export async function deleteProjectNode(repo: Repo, projectId: string, nodeId: string) {
  await withRepoWrite(repo, async () => {
    const data = await readIndex(repo), project = findProject(data, projectId); findNode(project, nodeId)
    const removed = subtree(project, nodeId), root = findNode(project, nodeId)
    if (root.sourceId && root.sourcePath) project.sources?.find(s => s.id === root.sourceId)?.excludedPaths.push(root.sourcePath)
    project.sources = project.sources?.filter(s => !s.parentId || !removed.has(s.parentId))
    project.nodes = project.nodes.filter(n => !removed.has(n.id))
    project.relations = project.relations.filter(e => !removed.has(e.from) && !removed.has(e.to))
    updateFolderSizes(project)
    await saveIndex(repo, data)
  })
}
export async function refreshProject(repo: Repo, projectId: string): Promise<ProjectRefreshResult> {
  return withRepoWrite(repo, async () => {
    const data = await readIndex(repo), project = findProject(data, projectId), previous = project.nodes
    const stage = await fs.mkdtemp(path.join(repo.root, '.project-import-'))
    try {
      const bindings = project.sources ?? [], current: ProjectNode[] = []
      for (const node of previous.filter(n => !n.sourceId)) {
        if (node.sourcePath) {
          try { await fs.lstat(node.sourcePath) }
          catch (error) { if (['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? '')) continue; throw error }
        }
        current.push({ ...node })
      }
      for (const source of bindings) {
        if (source.parentId && !previous.some(n => n.id === source.parentId)) continue
        const start = previous.filter(n => n.parentId === source.parentId).length
        current.push(...await collectSource(repo, source, stage, previous, start))
      }
      const ids = new Set(current.map(n => n.id))
      for (let count = -1; count !== ids.size;) {
        count = ids.size
        for (const n of current) if (n.parentId && !ids.has(n.parentId)) ids.delete(n.id)
      }
      project.nodes = current.filter(n => ids.has(n.id))
      project.sources = bindings.filter(s => !s.parentId || ids.has(s.parentId))
      project.relations = project.relations.filter(e => ids.has(e.from) && ids.has(e.to))
      updateFolderSizes(project); project.refreshedAt = new Date().toISOString()
      const old = new Map(previous.map(n => [n.id, n]))
      const result = {
        added: project.nodes.filter(n => !old.has(n.id)).length,
        updated: project.nodes.filter(n => { const p = old.get(n.id); return p && (p.contentHash !== n.contentHash || p.size !== n.size || p.linkTarget !== n.linkTarget) }).length,
        removed: previous.filter(n => !ids.has(n.id)).length,
      }
      await saveIndex(repo, data); return result
    } finally {
      if (path.dirname(stage) === repo.root && path.basename(stage).startsWith('.project-import-')) await fs.rm(stage, { recursive: true, force: true })
    }
  })
}
export async function readProjectFile(repo: Repo, projectId: string, nodeId: string): Promise<Buffer> {
  const node = findNode(await getProject(repo, projectId), nodeId)
  if (node.linkTarget) throw new Error('链接入口只记录目标路径，不复制目标内容')
  if (node.kind !== 'file' || !node.contentHash) throw new Error('请选择文件')
  const file = objectPath(repo, node.contentHash)
  if (await digest(file) !== node.contentHash) throw new Error('文件快照校验失败')
  return fs.readFile(file)
}
export async function exportProjectNode(repo: Repo, projectId: string, nodeId: string, destination: string): Promise<void> {
  const project = await getProject(repo, projectId), node = findNode(project, nodeId)
  if (!path.isAbsolute(destination)) throw new Error('导出需要绝对路径')
  const resolved = path.resolve(destination), ancestor = await fs.realpath(path.dirname(resolved))
  if (inside(await fs.realpath(repo.root), ancestor)) throw new Error('请导出到文档库之外')
  if (await fs.lstat(resolved).then(() => true, e => { if (e.code !== 'ENOENT') throw e; return false })) throw new Error('导出目标已存在，请使用新位置')
  const stage = await fs.mkdtemp(path.join(ancestor, '.稿喵导出-'))
  async function write(item: ProjectNode, target: string) {
    if (item.linkTarget) throw new Error('链接入口只记录目标路径，不能导出目标内容；请选择不包含链接的资料导出')
    if (item.kind === 'file') await fs.writeFile(target, await readProjectFile(repo, projectId, item.id), { flag: 'wx' })
    else {
      await fs.mkdir(target)
      const names = new Set<string>()
      for (const child of project.nodes.filter(n => n.parentId === item.id && (item.snapshot ? !n.snapshotRootId || n.snapshotRootId === item.snapshotRootId : !n.snapshot))) {
        if (child.name === '.' || child.name === '..' || path.basename(child.name) !== child.name || names.has(child.name.toLowerCase())) throw new Error('文件夹存在不安全或重复文件名，请整理后导出')
        names.add(child.name.toLowerCase()); await write(child, path.join(target, child.name))
      }
    }
  }
  try { const target = path.join(stage, 'item'); await write(node, target); await fs.rename(target, resolved) }
  finally { if (path.dirname(stage) === ancestor && path.basename(stage).startsWith('.稿喵导出-')) await fs.rm(stage, { recursive: true, force: true }) }
}
