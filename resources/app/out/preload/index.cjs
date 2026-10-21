"use strict";
const electron = require("electron");
const api = {
  history: { status: () => electron.ipcRenderer.invoke("history.status"), undo: () => electron.ipcRenderer.invoke("history.undo"), redo: () => electron.ipcRenderer.invoke("history.redo") },
  projects: { request: (request) => electron.ipcRenderer.invoke("projects.request", request) },
  appearance: { setTheme: (theme) => electron.ipcRenderer.invoke("appearance.theme", { theme }) },
  library: {
    list: () => electron.ipcRenderer.invoke("library.list", {}),
    detail: (docName) => electron.ipcRenderer.invoke("library.detail", { docName }),
    mutate: (request) => electron.ipcRenderer.invoke("library.mutate", request)
  },
  repo: {
    bootstrap: (previousRoot) => electron.ipcRenderer.invoke("repo.bootstrap", { previousRoot }),
    relocate: (parent) => electron.ipcRenderer.invoke("repo.relocate", { parent }),
    close: () => electron.ipcRenderer.invoke("repo.close", {}),
    create: (root, name) => electron.ipcRenderer.invoke("repo.create", { root, name }),
    open: (root) => electron.ipcRenderer.invoke("repo.open", { root })
  },
  doc: {
    import: (sourcePath, name) => electron.ipcRenderer.invoke("doc.import", { sourcePath, name }),
    list: () => electron.ipcRenderer.invoke("doc.list", {}),
    edit: (docName) => electron.ipcRenderer.invoke("doc.edit", { docName })
  },
  commit: {
    create: (docName, message, author, branch) => electron.ipcRenderer.invoke("commit.create", { docName, message, author, branch }),
    list: (docName, branch) => electron.ipcRenderer.invoke("commit.list", { docName, branch }),
    checkout: (docName, opts) => electron.ipcRenderer.invoke("commit.checkout", { docName, ...opts }),
    diffText: (docName, commitIdA, commitIdB) => electron.ipcRenderer.invoke("commit:diffText", { docName, commitIdA, commitIdB })
  },
  branch: {
    create: (docName, branch, from) => electron.ipcRenderer.invoke("branch.create", { docName, branch, ...from }),
    switch: (docName, branch) => electron.ipcRenderer.invoke("branch.switch", { docName, branch }),
    delete: (docName, branch) => electron.ipcRenderer.invoke("branch.delete", { docName, branch })
  },
  stats: {
    storage: () => electron.ipcRenderer.invoke("stats.storage", {}),
    versions: (docName, branch, options) => electron.ipcRenderer.invoke("stats.versions", { docName, branch, ...options }),
    export: (docName, branch, options, destination, versionIds, png) => electron.ipcRenderer.invoke("stats.export", { docName, branch, ...options, destination, versionIds, png })
  },
  backup: {
    export: (destPath) => electron.ipcRenderer.invoke("backup.export", { destPath }),
    import: (srcPath, destRoot) => electron.ipcRenderer.invoke("backup.import", { srcPath, destRoot })
  },
  maintenance: {
    scrub: () => electron.ipcRenderer.invoke("maintenance.scrub", {}),
    quarantine: {
      list: () => electron.ipcRenderer.invoke("quarantine.list", {}),
      restore: (entryId, branch) => electron.ipcRenderer.invoke("quarantine.restore", { entryId, branch }),
      purge: (beforeMs) => electron.ipcRenderer.invoke("quarantine.purge", { beforeMs })
    }
  },
  preview: {
    getBytes: (docName, commitId) => electron.ipcRenderer.invoke("preview.getBytes", { docName, commitId })
  },
  dialog: {
    pickFiles: () => electron.ipcRenderer.invoke("dialog.pickFiles"),
    pickFolder: (title) => electron.ipcRenderer.invoke("dialog.pickFolder", { title }).then((r) => r.path),
    pickFile: (title, filters) => electron.ipcRenderer.invoke("dialog.pickFile", { title, filters }).then((r) => r.path),
    savePath: (title, defaultName) => electron.ipcRenderer.invoke("dialog.savePath", { title, defaultName }).then((r) => r.path)
  },
  onWatcherChange(callback) {
    const handler = (_, data) => callback(data);
    electron.ipcRenderer.on("watcher.change", handler);
    return () => {
      electron.ipcRenderer.removeListener("watcher.change", handler);
    };
  }
};
electron.contextBridge.exposeInMainWorld("wordgit", api);
