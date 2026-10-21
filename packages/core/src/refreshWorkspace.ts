import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { Repo } from './repo.js'
import { docIds } from './refs.js'
import { commitDoc } from './ops.js'
import { activeDraftFiles, recordDraftSave } from './drafts.js'
import { withUndoableAction } from './editHistory.js'

export async function refreshWorkspaceDocuments(repo: Repo) {
  return withUndoableAction(repo, '刷新工作目录文档', async () => {
    for (const draft of await activeDraftFiles(repo)) await recordDraftSave(repo, draft.path)
    const known = new Set((await docIds(repo)).map(name => process.platform === 'win32' ? name.toLowerCase() : name))
    let added = 0
    for (const entry of await fs.readdir(path.join(repo.root, 'workspace'), { withFileTypes: true })) {
      if (!entry.isFile() || entry.name.startsWith('~$') || entry.name.includes('.tmp-') || known.has(process.platform === 'win32' ? entry.name.toLowerCase() : entry.name)) continue
      await commitDoc(repo, entry.name, { message: '从工作目录加入', author: 'user' }); added++
    }
    return { added }
  })
}
