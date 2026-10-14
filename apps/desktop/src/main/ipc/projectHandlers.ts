import { ipcMain, shell, app } from 'electron'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { promises as fs } from 'node:fs'
import { createProject, listProjects, getProject, importProjectItems, refreshProject, recordProjectIteration, updateProjectNode, setProjectCategory, deleteProjectCategory, deleteProjectNode, setProjectRelation, deleteProjectRelation, readProjectFile, exportProjectNode, withUndoableAction } from '@wordgit/core'
import { ProjectRequest } from '@wordgit/shared'
import { getRepo } from '../repoState.js'
import { mcpConfiguration } from '../mcpConfig.js'
import { localMcpStatus, setLocalMcpEnabled } from '../mcpLocal.js'

export async function projectRequest(args: unknown) {
  const req = ProjectRequest.parse(args), repo = getRepo()
  switch (req.action) {
    case 'list': return listProjects(repo)
    case 'mcpConfig': {
      const serverPath = path.join(app.getAppPath(), 'out', 'mcp', 'server.cjs')
      await fs.access(serverPath).catch(() => { throw new Error('MCP 启动文件未准备好，请使用包含 MCP 的完整软件包') })
      return { ...mcpConfiguration(process.execPath, serverPath, repo.root), local: await localMcpStatus() }
    }
    case 'mcpLocal': return setLocalMcpEnabled(repo.root, req.enabled)
    case 'get': return getProject(repo, req.projectId)
    case 'create': return createProject(repo, req.name)
    case 'import': return importProjectItems(repo, req)
    case 'refresh': return refreshProject(repo, req.projectId)
    case 'recordIteration': return recordProjectIteration(repo, req.projectId, req.nodeId, req.title, req.requestId)
    case 'updateNode': return updateProjectNode(repo, req.projectId, req.nodeId, req)
    case 'setCategory': return setProjectCategory(repo, req.projectId, req.category)
    case 'deleteCategory': return deleteProjectCategory(repo, req.projectId, req.categoryId)
    case 'deleteNode': return deleteProjectNode(repo, req.projectId, req.nodeId)
    case 'setRelation': return setProjectRelation(repo, req.projectId, req.relation)
    case 'deleteRelation': return deleteProjectRelation(repo, req.projectId, req.relationId)
    case 'editFile': {
      const node = (await getProject(repo, req.projectId)).nodes.find(n => n.id === req.nodeId)
      if (!node?.sourcePath || node.snapshot || node.linkTarget) throw new Error('当前普通资料才可打开来源编辑；历史快照请先导出，链接入口仅记录路径')
      await fs.access(node.sourcePath)
      const ext = path.extname(node.name).toLowerCase()
      if (node.kind === 'file' && ['.md', '.markdown', '.txt', '.html', '.htm', '.py', '.cpp', '.c', '.h', '.hpp', '.js', '.ts', '.tsx', '.jsx', '.json', '.yaml', '.yml', '.toml', '.xml', '.css', '.csv', '.sh', '.ps1', '.bat', '.r', '.rs', '.go', '.java', '.sql'].includes(ext)) {
        await new Promise<void>((resolve, reject) => {
          const child = spawn(path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'notepad.exe'), [node.sourcePath!], { windowsHide: false, detached: true, stdio: 'ignore' })
          child.once('error', reject); child.once('spawn', () => { child.unref(); resolve() })
        })
      } else if (node.kind === 'folder' || ['.docx', '.doc', '.xlsx', '.xls', '.pptx', '.ppt', '.pdf', '.png', '.jpg', '.jpeg', '.webp'].includes(ext)) {
        const error = await shell.openPath(node.sourcePath); if (error) throw new Error(error)
      } else throw new Error('此格式请从项目文件夹中使用合适的编辑器打开；软件不会执行程序文件')
      return { sourcePath: node.sourcePath }
    }
    case 'readFile': {
      const project = await getProject(repo, req.projectId), node = project.nodes.find(n => n.id === req.nodeId)
      if (!node) throw new Error('文件不存在')
      if (node.size > 20 * 1024 * 1024) throw new Error('文件超过内置预览大小，请导出后用关联程序查看')
      const bytes = await readProjectFile(repo, req.projectId, req.nodeId)
      return { data: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), ext: node.name.split('.').pop()?.toLowerCase() ?? '' }
    }
    case 'export': return exportProjectNode(repo, req.projectId, req.nodeId, req.destination)
  }
}
export function registerProjectHandlers() {
  const labels: Record<string, string> = { create: '新建项目', import: '导入项目资料', refresh: '刷新项目资料', recordIteration: '记录迭代', updateNode: '编辑资料信息或位置', setCategory: '编辑项目分类', deleteCategory: '删除项目分类', deleteNode: '移除资料', setRelation: '编辑资料连线', deleteRelation: '删除资料连线' }
  ipcMain.handle('projects.request', (_e, args: unknown) => {
    const req = ProjectRequest.parse(args), label = labels[req.action]
    return label ? withUndoableAction(getRepo(), label, () => projectRequest(req)) : projectRequest(req)
  })
}
