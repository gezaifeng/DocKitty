import { watch, type FSWatcher } from 'chokidar'
import type { BrowserWindow } from 'electron'
import { CH } from '@wordgit/shared'
import type { WatcherChangeEvent } from '@wordgit/shared'
import path from 'node:path'
import { activeDraftFiles, recordDraftSave } from '@wordgit/core'
import { getRepo } from './repoState.js'

let _watcher: FSWatcher | null = null
let _mainWindow: BrowserWindow | null = null
let _workspaceRoot: string | null = null

export function setMainWindow(win: BrowserWindow): void {
  _mainWindow = win
}

export function watchDoc(docName: string, workspacePath: string): void {
  if (_workspaceRoot && workspacePath.startsWith(_workspaceRoot + path.sep)) return
  if (_watcher) {
    _watcher.close()
    _watcher = null
  }
  _watcher = watch(workspacePath, {
    ignoreInitial: true,
    depth: 0,
    awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 },
  })
  _watcher.on('change', () => {
    if (!_mainWindow) return
    const event: WatcherChangeEvent = { docName, workspacePath }
    _mainWindow.webContents.send(CH.WATCHER_CHANGE, event)
  })
}

export function watchWorkspace(repoRoot: string): void {
  stopWatcher()
  _workspaceRoot = path.join(repoRoot, 'workspace')
  const root = _workspaceRoot
  _watcher = watch([root, path.join(repoRoot, 'drafts')], { ignoreInitial: true, awaitWriteFinish: { stabilityThreshold: 700, pollInterval: 100 } })
  let pending = Promise.resolve()
  const record = (file: string) => {
    pending = pending.then(async () => {
      if (_workspaceRoot !== root) return
      const repo = getRepo()
      try {
        const event = await recordDraftSave(repo, file)
        if (event && _mainWindow && !_mainWindow.isDestroyed()) _mainWindow.webContents.send(CH.WATCHER_CHANGE, event)
      } catch (error) {
        if (_mainWindow && !_mainWindow.isDestroyed()) _mainWindow.webContents.send(CH.WATCHER_CHANGE, { docName: '', workspacePath: file, status: 'error', message: (error as Error).message })
      }
    }).catch(error => console.error('[稿喵自动记录]', error))
  }
  const changed = (file: string) => {
    if (path.basename(file).startsWith('~$') || file.includes('.tmp-')) return
    const inDrafts = path.relative(path.join(repoRoot, 'drafts'), file)
    if (inDrafts && !inDrafts.startsWith('..') && !path.isAbsolute(inDrafts)) { record(file); return }
    const relative = path.relative(root, file)
    const docName = relative.split(path.sep)[0]
    if (!docName || docName.startsWith('~$') || relative.includes('.tmp-')) return
    if (_mainWindow && !_mainWindow.isDestroyed()) {
      _mainWindow.webContents.send(CH.WATCHER_CHANGE, { docName, workspacePath: path.join(root, docName) })
    }
  }
  _watcher.on('add', changed).on('change', changed).on('unlink', changed)
  _watcher.on('ready', () => {
    void activeDraftFiles(getRepo()).then(files => { for (const file of files) record(file.path) }).catch(error => console.error('[稿喵恢复编辑副本]', error))
  })
}

export function stopWatcher(): void {
  _watcher?.close()
  _watcher = null
  _workspaceRoot = null
}
