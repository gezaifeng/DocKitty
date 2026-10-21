import { ipcMain, shell } from 'electron'
import { libraryDocuments, documentDetail } from '@wordgit/core'
import { CH, LibraryDetailReq } from '@wordgit/shared'
import { getRepo } from '../repoState.js'
import { mutateLibrary } from '../libraryService.js'

export async function libraryListHandler() { return libraryDocuments(getRepo()) }
export async function libraryDetailHandler(args: unknown) {
  return documentDetail(getRepo(), LibraryDetailReq.parse(args).docName)
}
export async function libraryMutationHandler(args: unknown) {
  return mutateLibrary(getRepo(), args, async file => {
    const error = await shell.openPath(file)
    if (error) throw new Error('无法打开系统编辑器：' + error)
  })
}
export function registerLibraryHandlers(): void {
  ipcMain.handle(CH.LIBRARY_LIST, () => libraryListHandler())
  ipcMain.handle(CH.LIBRARY_DETAIL, (_event, args: unknown) => libraryDetailHandler(args))
  ipcMain.handle(CH.LIBRARY_MUTATE, (_event, args: unknown) => libraryMutationHandler(args))
}
