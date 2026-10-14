import { app, BrowserWindow, Menu, nativeTheme, ipcMain } from 'electron'
import path from 'node:path'
import { registerAllHandlers } from './ipc/registerAll.js'
import { setMainWindow, watchWorkspace, stopWatcher } from './watcher.js'
import { setRepoListener } from './repoState.js'
import { syncLocalMcp, stopLocalMcp } from './mcpLocal.js'

let win: BrowserWindow | null = null

function createWindow(): void {
  Menu.setApplicationMenu(null)
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: '稿喵',
    icon: path.join(app.getAppPath(), 'resources/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      sandbox: true,
    },
  })

  registerAllHandlers()
  setMainWindow(win)
  setRepoListener(repo => { repo ? watchWorkspace(repo.root) : stopWatcher(); syncLocalMcp(repo?.root ?? null) })

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  win.once('ready-to-show', () => win?.show())
  win.webContents.on('render-process-gone', (_e, details) => {
    console.error('[wordgit] render-process-gone:', details.reason, 'exitCode=', details.exitCode)
  })
  win.webContents.on('did-fail-load', (_e, code, desc, url) => {
    console.error('[wordgit] did-fail-load:', code, desc, url)
  })
  win.on('closed', () => { win = null })
}

app.whenReady().then(() => {
 app.setAppUserModelId('com.wordgit.app')
 ipcMain.handle('appearance.theme', (_event, args: unknown) => {
  const theme = (args as { theme?: unknown })?.theme
  if (theme !== 'light' && theme !== 'dark' && theme !== 'system') throw new Error('无效主题')
  nativeTheme.themeSource = theme
 })
 createWindow()
})
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
app.on('will-quit', () => { void stopLocalMcp() })
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
