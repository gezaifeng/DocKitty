import { ipcMain } from 'electron'
import { editHistoryStatus, undoEdit, redoEdit } from '@wordgit/core'
import { getRepo } from '../repoState.js'

export function registerEditHistoryHandlers() {
  ipcMain.handle('history.status', () => editHistoryStatus(getRepo()))
  ipcMain.handle('history.undo', () => undoEdit(getRepo()))
  ipcMain.handle('history.redo', () => redoEdit(getRepo()))
}
