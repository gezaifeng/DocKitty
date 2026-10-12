import { z } from 'zod'

const docName = z.string().min(1)
const versionId = z.string().regex(/^[a-f0-9]{64}$/)
const position = z.object({ x: z.number().finite(), y: z.number().finite() })

export const LibraryDetailReq = z.object({ docName })
export const LibraryMutationSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('document'), docName, title: z.string().min(1).optional(), deleted: z.boolean().optional() }),
  z.object({ type: z.literal('version'), docName, versionId, title: z.string().min(1).optional(), note: z.string().optional(), categoryId: z.string().optional(), order: z.number().finite().optional(), position: position.optional(), deleted: z.boolean().optional() }),
  z.object({ type: z.literal('layout'), docName }),
  z.object({ type: z.literal('relations'), docName, versionId, action: z.enum(['disconnectPrevious', 'disconnectNext', 'connectPrevious', 'connectNext', 'moveBranch']), targetVersionId: versionId.optional(), branch: z.string().optional() }),
  z.object({ type: z.literal('purgeVersion'), docName, versionId, deleteSource: z.boolean(), confirmedSourcePath: z.string().optional() }),
  z.object({ type: z.literal('category'), docName, action: z.enum(['create', 'rename', 'delete']), name: z.string().optional(), categoryId: z.string().optional() }),
  z.object({ type: z.literal('arrange'), docName, categoryId: z.string(), versionIds: z.array(versionId) }),
  z.object({ type: z.literal('importVersion'), docName, sourcePath: z.string().min(1), message: z.string().min(1), branch: z.string().optional(), replaceVersionId: versionId.optional() }),
  z.object({ type: z.literal('save'), docName, mode: z.enum(['new', 'replace']), message: z.string().min(1) }),
  z.object({ type: z.literal('undoReplacement'), docName, versionId }),
  z.object({ type: z.literal('export'), docName, versionId, destination: z.string().min(1) }),
  z.object({ type: z.literal('edit'), docName, versionId: versionId.optional(), branch: z.string().optional(), mode: z.enum(['new', 'replace']).optional(), title: z.string().optional() }),
  z.object({ type: z.literal('openCopy'), docName, versionId }),
  z.object({ type: z.literal('moveBranch'), docName, versionId, branch: z.string().min(1) }),
  z.object({ type: z.literal('createDocument'), name: z.string().min(1), format: z.enum(['docx', 'xlsx', 'txt']) }),
])

export type LibraryMutation = z.infer<typeof LibraryMutationSchema>

export interface LibraryDocument {
  docName: string
  title: string
  deletedAt: string | null
  currentBranch: string
  versionCount: number
  lastModified: string | null
  dirty: boolean
}

export interface LibraryVersion {
  id: string
  contentId: string
  parents: string[]
  title: string
  note: string
  author: string
  createdAt: string
  branches: string[]
  categoryId: string
  order: number
  position?: { x: number; y: number }
  deletedAt: string | null
  revisionCount: number
  sourcePath?: string
}

export interface DocumentDetail {
  docName: string
  title: string
  deletedAt: string | null
  currentBranch: string
  branchHeads: Record<string, string>
  categories: Array<{ id: string; name: string }>
  versions: LibraryVersion[]
  workspace: { dirty: boolean; versionId: string | null; exists: boolean }
  draft?: { path: string; branch: string; baseVersionId: string; versionId?: string; title: string }
}

export interface LibraryMutationResult {
  versionId?: string
  changed?: boolean
  categoryId?: string | null
  protectedBranch?: string | null
  docName?: string
  workspacePath?: string
}
