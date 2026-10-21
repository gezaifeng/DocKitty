import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { IpcApi, WatcherChangeEvent } from '@wordgit/shared'

const api: IpcApi = {
  drop: {
    paths: files => [...new Set(files.map(file => webUtils.getPathForFile(file)).filter(Boolean))],
    inspect: paths => ipcRenderer.invoke('drop.inspect', paths),
    prepare: (paths, projectId, parentId, workingFolder) => ipcRenderer.invoke('drop.prepare', { paths, projectId, parentId, workingFolder }),
    importProject: request => ipcRenderer.invoke('drop.project', request),
    createProjects: paths => ipcRenderer.invoke('drop.projects', paths),
  },
  history: { status: () => ipcRenderer.invoke('history.status'), undo: () => ipcRenderer.invoke('history.undo'), redo: () => ipcRenderer.invoke('history.redo') },
  projects: { request: (request) => ipcRenderer.invoke('projects.request', request) },
  appearance: { setTheme: (theme) => ipcRenderer.invoke('appearance.theme', { theme }) },
  library: {
    list: () => ipcRenderer.invoke('library.list', {}),
    detail: (docName) => ipcRenderer.invoke('library.detail', { docName }),
    mutate: (request) => ipcRenderer.invoke('library.mutate', request),
  },
  repo: {
    bootstrap: (previousRoot) => ipcRenderer.invoke('repo.bootstrap', { previousRoot }),
    relocate: (parent) => ipcRenderer.invoke('repo.relocate', { parent }),
    close: () => ipcRenderer.invoke('repo.close', {}),
    create: (root, name) => ipcRenderer.invoke('repo.create', { root, name }),
    open: (root) => ipcRenderer.invoke('repo.open', { root }),
  },
  doc: {
    import: (sourcePath, name) => ipcRenderer.invoke('doc.import', { sourcePath, name }),
    list: () => ipcRenderer.invoke('doc.list', {}),
    edit: (docName) => ipcRenderer.invoke('doc.edit', { docName }),
  },
  commit: {
    create: (docName, message, author, branch) =>
      ipcRenderer.invoke('commit.create', { docName, message, author, branch }),
    list: (docName, branch) => ipcRenderer.invoke('commit.list', { docName, branch }),
    checkout: (docName, opts) =>
      ipcRenderer.invoke('commit.checkout', { docName, ...opts }),
    diffText: (docName, commitIdA, commitIdB) =>
      ipcRenderer.invoke('commit:diffText', { docName, commitIdA, commitIdB }),
  },
  branch: {
    create: (docName, branch, from) =>
      ipcRenderer.invoke('branch.create', { docName, branch, ...from }),
    switch: (docName, branch) => ipcRenderer.invoke('branch.switch', { docName, branch }),
    delete: (docName, branch) => ipcRenderer.invoke('branch.delete', { docName, branch }),
  },
  stats: {
    storage: () => ipcRenderer.invoke('stats.storage', {}),
    versions: (docName, branch, options) => ipcRenderer.invoke('stats.versions', { docName, branch, ...options }),
    export: (docName, branch, options, destination, versionIds, png) => ipcRenderer.invoke('stats.export', { docName, branch, ...options, destination, versionIds, png }),
  },
  backup: {
    export: (destPath) => ipcRenderer.invoke('backup.export', { destPath }),
    import: (srcPath, destRoot) => ipcRenderer.invoke('backup.import', { srcPath, destRoot }),
  },
  maintenance: {
    scrub: () => ipcRenderer.invoke('maintenance.scrub', {}),
    quarantine: {
      list: () => ipcRenderer.invoke('quarantine.list', {}),
      restore: (entryId, branch) => ipcRenderer.invoke('quarantine.restore', { entryId, branch }),
      purge: (beforeMs) => ipcRenderer.invoke('quarantine.purge', { beforeMs }),
    },
  },
  preview: {
    getBytes: (docName, commitId) =>
      ipcRenderer.invoke('preview.getBytes', { docName, commitId }),
  },
  dialog: {
    pickFiles: () => ipcRenderer.invoke('dialog.pickFiles'),
    pickFolder: (title) => ipcRenderer.invoke('dialog.pickFolder', { title }).then(r => (r as { path: string | null }).path),
    pickFile: (title, filters) =>
      ipcRenderer.invoke('dialog.pickFile', { title, filters }).then(r => (r as { path: string | null }).path),
    savePath: (title, defaultName) =>
      ipcRenderer.invoke('dialog.savePath', { title, defaultName }).then(r => (r as { path: string | null }).path),
  },
  onWatcherChange(callback) {
    const handler = (_: Electron.IpcRendererEvent, data: WatcherChangeEvent) => callback(data)
    ipcRenderer.on('watcher.change', handler)
    return () => { ipcRenderer.removeListener('watcher.change', handler) }
  },
}

contextBridge.exposeInMainWorld('wordgit', api)
