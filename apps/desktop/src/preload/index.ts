import { contextBridge } from 'electron'

contextBridge.exposeInMainWorld('wordgit', {})
