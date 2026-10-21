import { promises as fs, constants } from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import type { DroppedFile, ProjectDropPlan, ProjectDropRequest } from '../../shared/src/fileDrop.js'
import type { Repo } from './repo.js'
import { createProject, getProject, importProjectItems, refreshProject, setProjectWorkingFolder } from './projects.js'
import { withUndoableAction, type ExternalHistory } from './editHistory.js'
import { validateDocName } from './names.js'
import { writeFileAtomic, readFileBlocks } from './fsutil.js'

const key = (file: string) => process.platform === 'win32' ? path.resolve(file).toLowerCase() : path.resolve(file)
const inside = (folder: string, file: string) => { const relative = path.relative(folder, file); return relative === '' || !path.isAbsolute(relative) && relative !== '..' && !relative.startsWith('..' + path.sep) }
async function exists(file: string) { return fs.lstat(file).then(() => true, error => { if (error.code !== 'ENOENT') throw error; return false }) }
export async function inspectDroppedFiles(paths: string[]): Promise<DroppedFile[]> {
  if (!Array.isArray(paths) || !paths.length || paths.some(p => typeof p !== 'string' || !path.isAbsolute(p))) throw new Error('请从文件资源管理器拖入文件或文件夹')
  const files: DroppedFile[] = []
  for (const input of paths) {
    const file = path.resolve(input)
    if (files.some(p => key(p.path) === key(file))) continue
    const stat = await fs.lstat(file).catch(() => { throw new Error('拖入来源无法访问：' + file) })
    if (!stat.isSymbolicLink() && !stat.isDirectory() && !stat.isFile()) throw new Error('不支持特殊设备文件')
    files.push({ path: file, name: path.basename(file), kind: stat.isSymbolicLink() ? 'link' : stat.isDirectory() ? 'folder' : 'file' })
  }
  return files.filter(file => !files.some(parent => parent !== file && parent.kind === 'folder' && inside(parent.path, file.path)))
}
async function safeFolder(repo: Repo, folder: string) {
  if (!path.isAbsolute(folder)) throw new Error('工作文件夹必须是绝对路径')
  const stat = await fs.lstat(folder)
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('请选择普通工作文件夹，链接入口不可作为复制或剪切目标')
  const resolved = await fs.realpath(folder), root = await fs.realpath(repo.root)
  if (inside(root, resolved) || inside(resolved, root)) throw new Error('工作文件夹不能是稿喵文档库或包含文档库的目录')
  return resolved
}
export async function resolveProjectWorkingFolder(repo: Repo, projectId?: string, parentId?: string | null, folder?: string): Promise<string | null> {
  let workingFolder = folder ?? null
  if (projectId) {
    const project = await getProject(repo, projectId), parent = parentId ? project.nodes.find(n => n.id === parentId) : null
    if (parentId && (!parent || parent.kind !== 'folder' || parent.snapshot || parent.linkTarget)) throw new Error('请选择当前普通文件夹；历史快照和链接不接受拖入')
    if (parent?.sourcePath) workingFolder = parent.sourcePath
    else if (!workingFolder) {
      workingFolder = project.workingFolder ?? null
      if (!workingFolder) {
        const roots: string[] = []
        for (const source of project.sources ?? []) if (!source.parentId) {
          const stat = await fs.lstat(source.path).catch(() => null)
          if (stat && !stat.isSymbolicLink()) roots.push(stat.isDirectory() ? source.path : path.dirname(source.path))
        }
        const unique = [...new Set(roots.map(key))]
        if (unique.length === 1) workingFolder = roots[0]
      }
    }
  }
  return workingFolder ? safeFolder(repo, workingFolder) : null
}
export async function prepareProjectDrop(repo: Repo, paths: string[], projectId?: string, parentId?: string | null, folder?: string): Promise<ProjectDropPlan> {
  const files = await inspectDroppedFiles(paths), workingFolder = await resolveProjectWorkingFolder(repo, projectId, parentId, folder)
  const names = new Set<string>(), planned: ProjectDropPlan['files'] = []
  for (const file of files) {
    const sourcePath = file.kind === 'link' ? file.path : await fs.realpath(file.path)
    const contained = !!workingFolder && inside(workingFolder, sourcePath)
    const conflict = !contained && !!workingFolder && (await exists(path.join(workingFolder, file.name)) || names.has(file.name.toLowerCase()))
    let name = file.name, number = 2
    const ext = file.kind === 'folder' ? '' : path.extname(name), stem = name.slice(0, name.length - ext.length)
    if (workingFolder && !contained) while (await exists(path.join(workingFolder, name)) || names.has(name.toLowerCase())) name = `${stem} (${number++})${ext}`
    names.add(name.toLowerCase()); planned.push({ ...file, inside: contained, suggestedName: name, conflict })
  }
  return { files: planned, workingFolder }
}
async function fingerprint(file: string): Promise<string> {
  const hash = createHash('sha256')
  async function visit(current: string, relative: string) {
    const stat = await fs.lstat(current)
    if (stat.isSymbolicLink()) throw new Error('含链接的资料只支持保留原位置导入，不复制或剪切目标内容')
    hash.update(relative + '\0')
    if (stat.isDirectory()) { hash.update('folder\0'); for (const name of (await fs.readdir(current)).sort()) await visit(path.join(current, name), path.join(relative, name)) }
    else if (stat.isFile()) { hash.update('file\0' + stat.size + '\0'); for await (const block of readFileBlocks(current)) hash.update(block) }
    else throw new Error('不支持特殊设备文件')
  }
  await visit(file, ''); return hash.digest('hex')
}
async function copyExclusive(source: string, target: string) {
  let created = false
  try {
    if ((await fs.lstat(source)).isDirectory()) {
      await fs.mkdir(target); created = true
      for (const name of await fs.readdir(source)) await copyExclusive(path.join(source, name), path.join(target, name))
    } else { await fs.copyFile(source, target, constants.COPYFILE_EXCL); created = true }
  } catch (error) { if (created) await fs.rm(target, { recursive: true, force: true }); throw error }
}
interface Transfer { source: string; target: string; hash: string; move: boolean }
async function checkLocation(file: string) {
  if (key(await fs.realpath(path.dirname(file))) !== key(path.dirname(file))) throw new Error('文件所在目录已被替换为链接，已停止操作：' + file)
}
async function removeUnchanged(file: string, hash: string) {
  await checkLocation(file)
  if (!path.isAbsolute(file) || await fingerprint(file) !== hash) throw new Error('文件已被修改，未删除：' + file)
  await fs.rm(file, { recursive: true })
}
async function transfer(source: string, target: string, hash: string, move: boolean) {
  await checkLocation(source); await checkLocation(target)
  if (await fingerprint(source) !== hash) throw new Error('来源已发生变化，请重新确认：' + source)
  await copyExclusive(source, target)
  try {
    if (await fingerprint(target) !== hash || await fingerprint(source) !== hash) throw new Error('复制期间来源发生变化，已停止操作')
    if (move) await removeUnchanged(source, hash)
  } catch (error) { await removeUnchanged(target, hash); throw error }
}
function transferHistory(changes: Transfer[]): ExternalHistory {
  async function applyOne(change: Transfer, direction: 'undo' | 'redo') {
    if (direction === 'redo') await transfer(change.source, change.target, change.hash, change.move)
    else if (change.move) await transfer(change.target, change.source, change.hash, true)
    else await removeUnchanged(change.target, change.hash)
  }
  return {
    async validate(direction) {
      for (const change of changes) {
        const present = direction === 'undo' ? change.target : change.source
        await checkLocation(present)
        if (!await exists(present) || await fingerprint(present) !== change.hash) throw new Error('文件已被外部修改或移除，不能撤回／重做：' + present)
        if ((direction === 'undo' && change.move || direction === 'redo') && await exists(direction === 'undo' ? change.source : change.target)) throw new Error('目标位置已被占用，不能撤回／重做：' + (direction === 'undo' ? change.source : change.target))
      }
    },
    async apply(direction) {
      const applied: Transfer[] = [], ordered = direction === 'undo' ? [...changes].reverse() : changes
      try { for (const change of ordered) { await applyOne(change, direction); applied.push(change) } }
      catch (error) { for (const change of applied.reverse()) await applyOne(change, direction === 'undo' ? 'redo' : 'undo'); throw error }
    },
  }
}
async function restoreCatalog(repo: Repo, bytes?: Buffer) {
  const file = path.join(repo.root, 'projects', 'catalog.json')
  if (bytes) await writeFileAtomic(file, bytes); else await fs.rm(file, { force: true })
}
export async function importDroppedProject(repo: Repo, request: ProjectDropRequest): Promise<{ projectId: string; nodeIds: string[] }> {
  const changes: Transfer[] = [], external = transferHistory(changes)
  return withUndoableAction(repo, '拖入项目资料（含文件复制／剪切）', async () => {
    const selected = request.items.filter(i => i.action !== 'skip')
    if (!selected.length) throw new Error('请选择至少一项需要导入的资料')
    const plan = await prepareProjectDrop(repo, selected.map(i => i.path), request.projectId, request.parentId, request.workingFolder)
    const before = await fs.readFile(path.join(repo.root, 'projects', 'catalog.json')).catch(error => { if (error.code !== 'ENOENT') throw error; return undefined })
    const root = await fs.realpath(repo.root), reserved = new Set<string>()
    try {
      const projectId = request.projectId ?? (await createProject(repo, request.newProjectName?.trim() || '新文档库')).id
      const paths: string[] = []
      for (const file of plan.files) {
        const item = selected.find(i => key(i.path) === key(file.path))!
        if (file.kind !== 'link') { const real = await fs.realpath(file.path); if (inside(root, real) || inside(real, root)) throw new Error('不能导入稿喵文档库或包含它的目录') }
        if (item.action === 'reference' || file.inside) { paths.push(file.path); continue }
        if (!plan.workingFolder) throw new Error('请先选择工作文件夹')
        if (file.kind === 'link') throw new Error('链接入口只能保留原位置导入')
        const name = item.name ?? file.name; validateDocName(name)
        const destination = path.join(plan.workingFolder, name), source = await fs.realpath(file.path)
        if (inside(source, destination) || inside(destination, source)) throw new Error('不能复制或剪切文件夹到自身或父目录')
        if (reserved.has(key(destination)) || await exists(destination)) throw new Error('目标已存在，请改名或跳过：' + destination)
        reserved.add(key(destination))
        const change = { source, target: destination, hash: await fingerprint(source), move: item.action === 'move' }
        await transfer(change.source, change.target, change.hash, change.move); changes.push(change); paths.push(destination)
      }
      await refreshProject(repo, projectId)
      const project = await getProject(repo, projectId), parentId = request.parentId ?? null
      const nodeIds = project.nodes.filter(n => !n.snapshot && n.parentId === parentId && n.sourcePath && paths.some(p => key(p) === key(n.sourcePath!))).map(n => n.id)
      const missing = paths.filter(p => !project.nodes.some(n => !n.snapshot && n.parentId === parentId && n.sourcePath && key(n.sourcePath) === key(p)))
      if (missing.length) nodeIds.push(...(await importProjectItems(repo, { projectId, parentId, paths: missing })).nodeIds)
      if (request.workingFolder && !request.parentId) await setProjectWorkingFolder(repo, projectId, plan.workingFolder!)
      return { projectId, nodeIds }
    } catch (error) {
      await external.validate('undo'); await external.apply('undo'); await restoreCatalog(repo, before); throw error
    }
  }, undefined, external)
}
export async function createDroppedProjects(repo: Repo, paths: string[]): Promise<{ projectIds: string[] }> {
  return withUndoableAction(repo, '拖入文件夹创建项目', async () => {
    const files = await inspectDroppedFiles(paths)
    if (files.some(f => f.kind !== 'folder')) throw new Error('请拖入普通文件夹；散文件可在导入窗口选择项目')
    const before = await fs.readFile(path.join(repo.root, 'projects', 'catalog.json')).catch(error => { if (error.code !== 'ENOENT') throw error; return undefined })
    try {
      const projectIds: string[] = []
      for (const file of files) {
        const project = await createProject(repo, file.name)
        await importProjectItems(repo, { projectId: project.id, paths: [file.path], unpackFolder: true })
        await setProjectWorkingFolder(repo, project.id, file.path); projectIds.push(project.id)
      }
      return { projectIds }
    } catch (error) { await restoreCatalog(repo, before); throw error }
  })
}
