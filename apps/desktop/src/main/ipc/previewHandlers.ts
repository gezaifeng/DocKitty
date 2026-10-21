import path from 'node:path'
import { promises as fs } from 'node:fs'
import { ipcMain } from 'electron'
import {
  validateDocName,
} from '@wordgit/core'
import { CH, PreviewGetBytesReq } from '@wordgit/shared'
import { readVersionWithin } from '../versionFile.js'
import { getRepo } from '../repoState.js'

export async function getPreviewBytes(
  args: unknown,
): Promise<{ data: ArrayBuffer; ext: string }> {
  const { docName, commitId } = PreviewGetBytesReq.parse(args)
  const repo = getRepo()
  const ext = path.extname(docName).toLowerCase().replace('.', '')

  let raw: Uint8Array
  if (commitId) {
    raw = await readVersionWithin(repo, docName, commitId)
  } else {
    const wsPath = path.join(repo.root, 'workspace', validateDocName(docName))
    if ((await fs.stat(wsPath)).size > 20 * 1024 * 1024) throw new Error('文件超过内置预览大小（20 MiB），请导出后使用关联程序查看')
    raw = new Uint8Array(await fs.readFile(wsPath))
  }

  // Transfer as ArrayBuffer
  const data = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer
  return { data, ext }
}

export function registerPreviewHandlers(): void {
  ipcMain.handle(CH.PREVIEW_GET_BYTES, (_e, arg: unknown) => getPreviewBytes(arg))
}
