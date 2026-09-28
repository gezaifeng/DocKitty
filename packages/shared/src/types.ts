import type { z } from 'zod'
import type {
  DocInfoSchema, CommitNodeSchema, CommitResultSchema,
  QuarantineEntrySchema, StatsStorageRes, ScrubResultSchema,
  WatcherChangeEvent,
} from './schemas.js'

export type DocInfo = z.infer<typeof DocInfoSchema>
export type CommitNode = z.infer<typeof CommitNodeSchema>
export type CommitResult = z.infer<typeof CommitResultSchema>
export type QuarantineEntry = z.infer<typeof QuarantineEntrySchema>
export type StorageStats = z.infer<typeof StatsStorageRes>
export type ScrubResult = z.infer<typeof ScrubResultSchema>
export type WatcherChangeEvent = z.infer<typeof WatcherChangeEvent>

export interface IpcApi {
  repo: {
    create(root: string, name: string): Promise<{ repoRoot: string }>
    open(root: string): Promise<{ repoRoot: string; repoName: string }>
  }
  doc: {
    import(sourcePath: string, name?: string): Promise<{ docId: string; commitId: string }>
    list(): Promise<DocInfo[]>
    edit(docName: string): Promise<{ workspacePath: string }>
  }
  commit: {
    create(docName: string, message: string, author: string, branch?: string): Promise<CommitResult>
    list(docName: string, branch?: string): Promise<CommitNode[]>
    checkout(docName: string, opts: { commitId?: string; branch?: string }): Promise<{ docId: string; commitId: string }>
  }
  branch: {
    create(docName: string, branch: string, from?: { fromBranch?: string; fromCommitId?: string }): Promise<void>
    switch(docName: string, branch: string): Promise<void>
    delete(docName: string, branch: string): Promise<QuarantineEntry>
  }
  stats: {
    storage(): Promise<StorageStats>
  }
  backup: {
    export(destPath: string): Promise<{ fileCount: number }>
    import(srcPath: string, destRoot: string): Promise<void>
  }
  maintenance: {
    scrub(): Promise<ScrubResult>
    quarantine: {
      list(): Promise<QuarantineEntry[]>
      restore(entryId: string): Promise<void>
      purge(beforeMs?: number): Promise<{ count: number }>
    }
  }
  preview: {
    getBytes(docName: string, commitId?: string): Promise<{ data: ArrayBuffer; ext: string }>
  }
  dialog: {
    pickFolder(title?: string): Promise<string | null>
    pickFile(title?: string, filters?: { name: string; extensions: string[] }[]): Promise<string | null>
    savePath(title?: string, defaultName?: string): Promise<string | null>
  }
  onWatcherChange(callback: (event: WatcherChangeEvent) => void): () => void
}
