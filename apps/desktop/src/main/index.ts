import { app, BrowserWindow } from 'electron'
import path from 'node:path'
import { registerAllHandlers } from './ipc/registerAll.js'
import { setMainWindow } from './watcher.js'

let win: BrowserWindow | null = null

function createWindow(): void {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: 'word_git',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      sandbox: true,
    },
  })

  registerAllHandlers()
  setMainWindow(win)

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

app.whenReady().then(createWindow)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
