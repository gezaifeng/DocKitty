// apps/desktop/src/renderer/src/lib/ipc.ts
import type { IpcApi } from '@wordgit/shared'

export const api = (window as Window & typeof globalThis & { wordgit: IpcApi }).wordgit
