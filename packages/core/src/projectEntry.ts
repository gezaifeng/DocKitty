import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { Repo } from './repo.js'
import { resolveProjectWorkingFolder } from './fileDrop.js'
import { getProject, refreshProject, importProjectItems, setProjectWorkingFolder } from './projects.js'
import { withUndoableAction, type ExternalHistory } from './editHistory.js'
import { validateDocName } from './names.js'
import { writeFileAtomic } from './fsutil.js'

export async function createProjectEntry(repo: Repo, request: { projectId: string; parentId?: string | null; workingFolder?: string; name: string }, bytes?: Buffer) {
  const name = validateDocName(request.name.trim())
  const resolved = await resolveProjectWorkingFolder(repo, request.projectId, request.parentId, request.workingFolder)
  if (!resolved) throw new Error('请先选择项目工作文件夹')
  const folder: string = resolved
  const target = path.join(folder, name), directory = bytes === undefined
  const stat = () => fs.lstat(target).catch(error => { if (error.code !== 'ENOENT') throw error; return null })
  async function validate(direction: 'undo' | 'redo') {
    if (await fs.realpath(folder) !== folder || !(await fs.lstat(folder)).isDirectory()) throw new Error('工作文件夹已改变，请重新选择')
    const current = await stat()
    if (direction === 'redo') { if (current) throw new Error('目标名称已被占用，无法重做'); return }
    if (!current || current.isSymbolicLink() || (directory ? !current.isDirectory() || (await fs.readdir(target)).length > 0 : !current.isFile() || !(await fs.readFile(target)).equals(bytes!))) throw new Error('新建内容已被外部修改，无法撤回；请先保留你的修改')
  }
  async function create() { if (directory) await fs.mkdir(target); else await fs.writeFile(target, bytes!, { flag: 'wx' }) }
  const external: ExternalHistory = {
    validate,
    async apply(direction) { await validate(direction); if (direction === 'redo') await create(); else if (directory) await fs.rmdir(target); else await fs.unlink(target) },
  }
  return withUndoableAction(repo, directory ? '新建项目文件夹' : '新建项目文档', async () => {
    await validate('redo')
    const catalog = path.join(repo.root, 'projects/catalog.json'), before = await fs.readFile(catalog)
    await create()
    try {
      await refreshProject(repo, request.projectId)
      let project = await getProject(repo, request.projectId)
      let node = project.nodes.find(n => !n.snapshot && n.parentId === (request.parentId ?? null) && n.sourcePath === target)
      if (!node) {
        const added = await importProjectItems(repo, { projectId: request.projectId, parentId: request.parentId, paths: [target] })
        project = await getProject(repo, request.projectId); node = project.nodes.find(n => n.id === added.nodeIds[0])!
      }
      if (!request.parentId) await setProjectWorkingFolder(repo, request.projectId, folder)
      return { nodeId: node.id, sourcePath: target }
    } catch (error) {
      await writeFileAtomic(catalog, before); await external.apply('undo'); throw error
    }
  }, undefined, external)
}
