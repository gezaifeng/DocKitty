import path from 'node:path'
import { promises as fs } from 'node:fs'
import { ipcMain } from 'electron'
import {
  scrub as coreScrub,
  listQuarantine,
  restoreFromQuarantine,
  purgeQuarantine,
  exportBackup,
  importBackup,
  docIds,
  documentDetail,
  withUndoableAction,
} from '@wordgit/core'
import {
  CH,
  QuarantineRestoreReq, QuarantinePurgeReq,
  BackupExportReq, BackupImportReq,
  StatsStorageRes,
} from '@wordgit/shared'
import type { StorageStats, ScrubResult, QuarantineEntry } from '@wordgit/shared'
import { getRepo, setRepo } from '../repoState.js'

async function sumDirBytes(dir: string): Promise<{ bytes: number; count: number }> {
  let bytes = 0
  let count = 0
  try {
    const entries = await fs.readdir(dir, { recursive: true, withFileTypes: true })
    for (const e of entries) {
      if (!e.isFile()) continue
      const parentPath = (e as { parentPath?: string; name: string }).parentPath ?? dir
      try {
        const st = await fs.stat(path.join(parentPath, e.name))
        bytes += st.size
        count++
      } catch { /* skip */ }
    }
  } catch { /* dir missing */ }
  return { bytes, count }
}

export async function getStorageStats(_args: unknown): Promise<StorageStats> {
  const repo = getRepo()
  const [blobs, chunks, ooxml] = await Promise.all([
    sumDirBytes(repo.objectsDir('blobs')),
    sumDirBytes(repo.objectsDir('chunks')),
    sumDirBytes(repo.objectsDir('ooxml')),
  ])
  const names = await docIds(repo)
  let versionCount = 0
  for (const name of names) {
    const detail = await documentDetail(repo, name)
    versionCount += detail.versions.filter(v => !v.deletedAt).length
  }
  return StatsStorageRes.parse({
    totalBytes: blobs.bytes + chunks.bytes + ooxml.bytes,
    objectCount: blobs.count + chunks.count + ooxml.count,
    docCount: names.length,
    versionCount,
  })
}

export async function runScrub(_args: unknown): Promise<ScrubResult> {
  return coreScrub(getRepo())
}

export async function quarantineList(_args: unknown): Promise<QuarantineEntry[]> {
  return listQuarantine(getRepo())
}

export async function quarantineRestore(args: unknown): Promise<void> {
  const { entryId, branch } = QuarantineRestoreReq.parse(args)
  await restoreFromQuarantine(getRepo(), entryId, branch)
}

export async function quarantinePurge(args: unknown): Promise<{ count: number }> {
  const { beforeMs } = QuarantinePurgeReq.parse(args)
  const count = await purgeQuarantine(getRepo(), beforeMs)
  return { count }
}

export async function backupExport(args: unknown): Promise<{ fileCount: number }> {
  const { destPath } = BackupExportReq.parse(args)
  return exportBackup(getRepo(), destPath)
}

export async function backupImport(args: unknown): Promise<void> {
  const { srcPath, destRoot } = BackupImportReq.parse(args)
  const repo = await importBackup(srcPath, destRoot)
  setRepo(repo)
}

export function registerMaintenanceHandlers(): void {
  ipcMain.handle(CH.STATS_STORAGE, (_e, arg: unknown) => getStorageStats(arg))
  ipcMain.handle(CH.MAINTENANCE_SCRUB, (_e, arg: unknown) => runScrub(arg))
  ipcMain.handle(CH.QUARANTINE_LIST, (_e, arg: unknown) => quarantineList(arg))
  ipcMain.handle(CH.QUARANTINE_RESTORE, (_e, arg: unknown) => withUndoableAction(getRepo(), '还原分支', () => quarantineRestore(arg)))
  ipcMain.handle(CH.QUARANTINE_PURGE, (_e, arg: unknown) => withUndoableAction(getRepo(), '清理分支回收记录', () => quarantinePurge(arg)))
  ipcMain.handle(CH.BACKUP_EXPORT, (_e, arg: unknown) => backupExport(arg))
  ipcMain.handle(CH.BACKUP_IMPORT, (_e, arg: unknown) => backupImport(arg))
}
