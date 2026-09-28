import { z } from 'zod'

export const RepoCreateReq = z.object({ root: z.string().min(1), name: z.string().min(1) })
export const RepoCreateRes = z.object({ repoRoot: z.string() })

export const RepoOpenReq = z.object({ root: z.string().min(1) })
export const RepoOpenRes = z.object({ repoRoot: z.string(), repoName: z.string() })

export const DocImportReq = z.object({ sourcePath: z.string().min(1), name: z.string().optional() })
export const DocImportRes = z.object({ docId: z.string(), commitId: z.string() })

export const DocInfoSchema = z.object({
  docId: z.string(),
  docName: z.string(),
  currentBranch: z.string(),
  branches: z.array(z.string()),
  commitCount: z.number().int().nonnegative(),
  lastCommitAt: z.string().nullable(),
})

export const DocEditReq = z.object({ docName: z.string().min(1) })
export const DocEditRes = z.object({ workspacePath: z.string() })

export const CommitCreateReq = z.object({
  docName: z.string().min(1),
  message: z.string().min(1),
  author: z.string().default('user'),
  branch: z.string().optional(),
})

export const CommitResultSchema = z.object({
  docId: z.string(),
  branch: z.string(),
  commitId: z.string().nullable(),
  changed: z.array(z.string()),
})

export const CommitNodeSchema = z.object({
  id: z.string(),
  parents: z.array(z.string()),
  message: z.string(),
  author: z.string(),
  createdAt: z.string(),
})

export const CommitListReq = z.object({ docName: z.string().min(1), branch: z.string().optional() })
export const CommitCheckoutReq = z.object({
  docName: z.string().min(1),
  commitId: z.string().optional(),
  branch: z.string().optional(),
})
export const CommitCheckoutRes = z.object({ docId: z.string(), commitId: z.string() })

export const BranchCreateReq = z.object({
  docName: z.string().min(1),
  branch: z.string().min(1),
  fromBranch: z.string().optional(),
  fromCommitId: z.string().optional(),
})
export const BranchSwitchReq = z.object({ docName: z.string().min(1), branch: z.string().min(1) })
export const BranchDeleteReq = z.object({ docName: z.string().min(1), branch: z.string().min(1) })

export const QuarantineEntrySchema = z.object({
  id: z.string(),
  docId: z.string(),
  docName: z.string(),
  branch: z.string(),
  commitId: z.string(),
  deletedAt: z.string(),
})

export const StatsStorageRes = z.object({
  totalBytes: z.number().nonnegative(),
  objectCount: z.number().int().nonnegative(),
  docCount: z.number().int().nonnegative(),
  versionCount: z.number().int().nonnegative(),
})

export const BackupExportReq = z.object({ destPath: z.string().min(1) })
export const BackupExportRes = z.object({ fileCount: z.number().int() })
export const BackupImportReq = z.object({ srcPath: z.string().min(1), destRoot: z.string().min(1) })

export const ScrubCorruptionSchema = z.object({
  objectPath: z.string(),
  expected: z.string(),
  actual: z.string(),
})
export const ScrubResultSchema = z.object({
  checked: z.number().int().nonnegative(),
  corrupted: z.array(ScrubCorruptionSchema),
})

export const QuarantineRestoreReq = z.object({ entryId: z.string().min(1) })
export const QuarantinePurgeReq = z.object({ beforeMs: z.number().optional() })
export const QuarantinePurgeRes = z.object({ count: z.number().int().nonnegative() })

export const PreviewGetBytesReq = z.object({
  docName: z.string().min(1),
  commitId: z.string().optional(),
})

export const DialogPickFolderReq = z.object({ title: z.string().optional() })
export const DialogPickFolderRes = z.object({ path: z.string().nullable() })
export const DialogPickFileReq = z.object({
  title: z.string().optional(),
  filters: z.array(z.object({ name: z.string(), extensions: z.array(z.string()) })).optional(),
})
export const DialogPickFileRes = z.object({ path: z.string().nullable() })
export const DialogSavePathReq = z.object({ title: z.string().optional(), defaultName: z.string().optional() })
export const DialogSavePathRes = z.object({ path: z.string().nullable() })

export const WatcherChangeEvent = z.object({
  docName: z.string(),
  workspacePath: z.string(),
})

export const CommitDiffTextReq = z.object({
  docName: z.string().min(1),
  commitIdA: z.string().min(1),
  commitIdB: z.string().min(1),
})

export const DiffResultSchema = z.object({
  type: z.enum(['equal', 'insert', 'delete']),
  text: z.string(),
})
