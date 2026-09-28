import { watch, type FSWatcher } from 'chokidar'
import type { BrowserWindow } from 'electron'
import { CH } from '@wordgit/shared'
import type { WatcherChangeEvent } from '@wordgit/shared'

let _watcher: FSWatcher | null = null
let _mainWindow: BrowserWindow | null = null

export function setMainWindow(win: BrowserWindow): void {
  _mainWindow = win
}

export function watchDoc(docName: string, workspacePath: string): void {
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

export function stopWatcher(): void {
  _watcher?.close()
  _watcher = null
}
