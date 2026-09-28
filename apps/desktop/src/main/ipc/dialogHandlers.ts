import { ipcMain, dialog } from 'electron'
import { CH, DialogPickFolderReq, DialogPickFileReq, DialogSavePathReq } from '@wordgit/shared'

export async function pickFolder(args: unknown): Promise<{ path: string | null }> {
  const { title } = DialogPickFolderReq.parse(args)
  const result = await dialog.showOpenDialog({
    title: title ?? '选择文件夹',
    properties: ['openDirectory', 'createDirectory'],
  })
  return { path: result.canceled ? null : (result.filePaths[0] ?? null) }
}

export async function pickFile(args: unknown): Promise<{ path: string | null }> {
  const { title, filters } = DialogPickFileReq.parse(args)
  const result = await dialog.showOpenDialog({
    title: title ?? '选择文件',
    properties: ['openFile'],
    filters: filters ?? [{ name: '文档', extensions: ['docx', 'xlsx', 'pptx', '*'] }],
  })
  return { path: result.canceled ? null : (result.filePaths[0] ?? null) }
}

export async function savePath(args: unknown): Promise<{ path: string | null }> {
  const { title, defaultName } = DialogSavePathReq.parse(args)
  const result = await dialog.showSaveDialog({
    title: title ?? '保存文件',
    defaultPath: defaultName,
  })
  return { path: result.canceled ? null : (result.filePath ?? null) }
}

export function registerDialogHandlers(): void {
  ipcMain.handle(CH.DIALOG_PICK_FOLDER, (_e, arg: unknown) => pickFolder(arg))
  ipcMain.handle(CH.DIALOG_PICK_FILE, (_e, arg: unknown) => pickFile(arg))
  ipcMain.handle(CH.DIALOG_SAVE_PATH, (_e, arg: unknown) => savePath(arg))
}
