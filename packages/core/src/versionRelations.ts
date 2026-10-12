import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { Repo } from './repo.js'
import { documentDetail } from './library.js'
import { readLibraryMeta, writeLibraryMeta } from './libraryMeta.js'
import { docIdOf, writeHead, writeCurrentBranch } from './refs.js'
import { validateBranchName, containedPath } from './names.js'
import { defaultVersionPositions } from './versionLayout.js'
import { withRepoWrite } from './writeLock.js'

type Action = 'disconnectPrevious' | 'disconnectNext' | 'connectPrevious' | 'connectNext' | 'moveBranch'

export async function editVersionRelations(repo: Repo, docName: string, id: string, request: { action: Action; targetVersionId?: string; branch?: string }) {
  return withRepoWrite(repo, async () => {
    const detail = await documentDetail(repo, docName), meta = await readLibraryMeta(repo, docName)
    const version = detail.versions.find(v => v.id === id && !v.deletedAt)
    if (!version || detail.deletedAt) throw new Error('请先还原要整理的版本和文档')
    const byId = new Map(detail.versions.map(v => [v.id, v]))
    const parents = new Map(detail.versions.map(v => [v.id, [...v.parents]]))
    const affected = new Set<string>()
    const replace = (versionId: string, previous: string[]) => { parents.set(versionId, previous); affected.add(versionId) }
    if (request.action === 'disconnectPrevious') replace(id, [])
    if (request.action === 'disconnectNext' || request.action === 'moveBranch') {
      for (const child of detail.versions) if (child.parents.includes(id)) replace(child.id, child.parents.filter(p => p !== id))
    }
    if (request.action === 'connectPrevious' || request.action === 'connectNext') {
      const target = byId.get(request.targetVersionId ?? '')
      if (!target || target.deletedAt) throw new Error('请选择同一文档中仍存在的版本')
      const child = request.action === 'connectPrevious' ? id : target.id
      const parent = request.action === 'connectPrevious' ? target.id : id
      replace(child, [...new Set([...(parents.get(child) ?? []), parent])])
    }
    if (request.action === 'moveBranch') {
      const branch = validateBranchName(request.branch ?? '')
      if (!(branch in detail.branchHeads)) throw new Error('目标分支不存在，请先建立分支')
      const target = request.targetVersionId ? byId.get(request.targetVersionId) : undefined
      if (request.targetVersionId && (!target || target.deletedAt || !target.branches.includes(branch))) throw new Error('连接起点必须属于目标分支')
      replace(id, target ? [target.id] : [])
    }
    const done = new Set<string>(), visiting = new Set<string>()
    const visit = (node: string) => {
      if (visiting.has(node)) throw new Error('不能连接到自己或形成循环；请先断开冲突的连接')
      if (done.has(node)) return
      visiting.add(node)
      for (const parent of parents.get(node) ?? []) visit(parent)
      visiting.delete(node); done.add(node)
    }
    for (const node of parents.keys()) visit(node)
    // Keep the complete pre-edit inventory, including ancestors no longer reachable from heads.
    for (const v of detail.versions) {
      const record = meta.versions[v.id] ??= {}
      record.branchMembership ??= v.branches
      record.position ??= v.position
    }
    // Explicit membership keeps disconnected versions in their original branch.
    for (const node of affected) {
      const v = meta.versions[node] ??= {}
      v.parents = parents.get(node)!
      v.branchMembership ??= byId.get(node)!.branches
    }
    if (request.action === 'moveBranch') {
      const branch = request.branch!
      meta.versions[id].branchMembership = [branch]
      for (const draft of meta.drafts ?? []) if ((draft.versionId ?? draft.baseVersionId) === id) draft.closed = true
      await writeLibraryMeta(repo, docName, meta)
      for (const [old, head] of Object.entries(detail.branchHeads)) {
        if (old === branch || head !== id) continue
        const fallback = detail.versions.find(v => v.id !== id && !v.deletedAt && v.branches.includes(old))
        if (fallback) await writeHead(repo, docIdOf(docName), old, fallback.id)
        else await fs.rm(containedPath(repo.root, `refs/heads/${docIdOf(docName)}/${old}`), { force: true })
      }
      if (!request.targetVersionId || detail.branchHeads[branch] === request.targetVersionId) await writeHead(repo, docIdOf(docName), branch, id)
      if (!detail.branchHeads[detail.currentBranch] || detail.branchHeads[detail.currentBranch] === id) await writeCurrentBranch(repo, docIdOf(docName), branch)
    } else await writeLibraryMeta(repo, docName, meta)
  })
}

export async function tidyVersionLayout(repo: Repo, docName: string) {
  return withRepoWrite(repo, async () => {
    const detail = await documentDetail(repo, docName), meta = await readLibraryMeta(repo, docName)
    const positions = defaultVersionPositions(detail.versions)
    for (const version of detail.versions) (meta.versions[version.id] ??= {}).position = positions.get(version.id)
    await writeLibraryMeta(repo, docName, meta)
  })
}
