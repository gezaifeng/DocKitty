import path from 'node:path'
import { promises as fs } from 'node:fs'
import { ipcMain } from 'electron'
import {
  StorageContext, readCommit, readTree, getManifest, materializeFile,
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
    const ctx = StorageContext.forRepo(repo)
    const commit = await readCommit(ctx, commitId)
    const tree = await readTree(ctx, commit.tree)
    // single-file doc: entry key is '' (empty string)
    const manifestId = tree.entries[''] ?? Object.values(tree.entries)[0]
    if (!manifestId) throw new Error(`提交 ${commitId} 中没有可预览的文件`)
    const manifest = await getManifest(ctx, manifestId)
    raw = await materializeFile(ctx, manifest)
  } else {
    const wsPath = path.join(repo.root, 'workspace', docName)
    raw = new Uint8Array(await fs.readFile(wsPath))
  }

  // Transfer as ArrayBuffer
  const data = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer
  return { data, ext }
}

export function registerPreviewHandlers(): void {
  ipcMain.handle(CH.PREVIEW_GET_BYTES, (_e, arg: unknown) => getPreviewBytes(arg))
}
