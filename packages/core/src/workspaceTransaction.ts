import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { Repo } from './repo.js'
import { writeFileAtomic } from './fsutil.js'
import { containedPath, validateDocName, validateBranchName } from './names.js'
import { readLibraryMeta, writeLibraryMeta, workingVersion, type LibraryMeta } from './libraryMeta.js'
import { docIdOf, readCurrentBranch, writeCurrentBranch } from './refs.js'

export interface CheckoutJournal {
  op: 'checkout'
  docName: string
  stage: string
  hadPrevious: boolean
  beforeMeta: LibraryMeta
  beforeBranch: string
}

const exists = async (file: string) => fs.lstat(file).then(() => true, error => { if (error.code === 'ENOENT') return false; throw error })

function stagePath(repo: Repo, name: string) {
  if (!/^\.checkout-[a-zA-Z0-9-]+$/.test(name)) throw new Error('工作区事务暂存路径无效')
  return containedPath(path.join(repo.root, 'workspace'), name)
}

export async function discardCheckoutStage(repo: Repo, name: string) {
  await fs.rm(stagePath(repo, name), { recursive: true, force: true })
}

export async function recoverWorkspaceCheckout(repo: Repo, entry: CheckoutJournal) {
  validateDocName(entry.docName); validateBranchName(entry.beforeBranch)
  if (entry.beforeMeta?.format !== 1 || !entry.beforeMeta.versions || typeof entry.hadPrevious !== 'boolean') throw new Error('工作区事务恢复信息无效')
  const stage = stagePath(repo, entry.stage), current = containedPath(path.join(repo.root, 'workspace'), entry.docName)
  const previous = path.join(stage, 'previous'), next = path.join(stage, 'next')
  if (!await exists(stage)) throw new Error('工作区事务暂存内容缺失，请保留日志并从备份恢复')
  const hasPrevious = await exists(previous), hasCurrent = await exists(current)
  // Keep an interrupted published file in case an editor changed it before recovery.
  if (hasCurrent && (hasPrevious || !entry.hadPrevious && !await exists(next))) {
    const recovery = containedPath(repo.root, `recovery/${entry.stage}/${entry.docName}`)
    await fs.mkdir(path.dirname(recovery), { recursive: true })
    if (await exists(recovery)) throw new Error('工作区恢复副本已存在，请先保留该文件后重试')
    await fs.rename(current, recovery)
  }
  if (hasPrevious) await fs.rename(previous, current)
  else if (entry.hadPrevious && !hasCurrent) throw new Error('原工作区与恢复副本均缺失，请保留事务日志')
  await writeLibraryMeta(repo, entry.docName, entry.beforeMeta)
  await writeCurrentBranch(repo, docIdOf(entry.docName), entry.beforeBranch)
}

export async function publishWorkspaceCheckout(repo: Repo, docName: string, stageName: string, versionId: string, switchBranch?: string) {
  const stage = stagePath(repo, stageName), current = containedPath(path.join(repo.root, 'workspace'), docName)
  const journal = path.join(repo.root, 'journal', stageName + '.json')
  const entry: CheckoutJournal = { op: 'checkout', docName, stage: stageName, hadPrevious: await exists(current), beforeMeta: await readLibraryMeta(repo, docName), beforeBranch: await readCurrentBranch(repo, docIdOf(docName)) }
  await writeFileAtomic(journal, Buffer.from(JSON.stringify(entry)))
  try {
    if (entry.hadPrevious) await fs.rename(current, path.join(stage, 'previous'))
    await fs.rename(path.join(stage, 'next'), current)
    await workingVersion(repo, docName, versionId)
    if (switchBranch) await writeCurrentBranch(repo, docIdOf(docName), switchBranch)
    await fs.rm(journal)
  } catch (error) {
    try { await recoverWorkspaceCheckout(repo, entry); await fs.rm(journal) }
    catch (recoveryError) { throw new Error(`工作区切换未完成，恢复内容保留在 ${stage}；${(recoveryError as Error).message}`, { cause: error }) }
    throw error
  }
}
