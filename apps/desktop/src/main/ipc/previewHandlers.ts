import path from 'node:path'
import { promises as fs } from 'node:fs'
import { ipcMain } from 'electron'
import {
  versionBytes, validateDocName,
} from '@wordgit/core'
import { CH, PreviewGetBytesReq } from '@wordgit/shared'
import { getRepo } from '../repoState.js'

export async function getPreviewBytes(
  args: unknown,
): Promise<{ data: ArrayBuffer; ext: string }> {
  const { docName, commitId } = PreviewGetBytesReq.parse(args)
  const repo = getRepo()
  const ext = path.extname(docName).toLowerCase().replace('.', '')

  let raw: Uint8Array
  if (commitId) {
    raw = await versionBytes(repo, docName, commitId)
  } else {
    const wsPath = path.join(repo.root, 'workspace', validateDocName(docName))
    raw = new Uint8Array(await fs.readFile(wsPath))
  }

  // Transfer as ArrayBuffer
  const data = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer
  return { data, ext }
}

export function registerPreviewHandlers(): void {
  ipcMain.handle(CH.PREVIEW_GET_BYTES, (_e, arg: unknown) => getPreviewBytes(arg))
}
