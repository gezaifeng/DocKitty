import type { EdgeStyle } from './edgeStyle.js'
export type RelationKind = 'iteration' | 'reference' | 'example' | 'dependency' | 'custom'
export interface ProjectCategory { id: string; name: string }
export interface ProjectNode {
  id: string
  parentId: string | null
  name: string
  title: string
  kind: 'file' | 'folder'
  linkTarget?: string
  contentHash?: string
  size: number
  note: string
  categoryId?: string
  createdAt: string
  position: { x: number; y: number }
  sourceId?: string
  sourcePath?: string
  snapshot?: boolean
  snapshotRootId?: string
}
export interface ProjectSource {
  id: string
  path: string
  parentId: string | null
  unpackFolder: boolean
  excludedPaths: string[]
}
export interface ProjectRelation {
  id: string
  from: string
  to: string
  kind: RelationKind
  label: string
  note: string
  style?: EdgeStyle
}
export interface ProjectLibrary {
  id: string
  workingFolder?: string
  name: string
  createdAt: string
  nodes: ProjectNode[]
  relations: ProjectRelation[]
  categories?: ProjectCategory[]
  sources?: ProjectSource[]
  refreshedAt?: string
}
export interface ProjectImport {
  projectId: string
  paths: string[]
  parentId?: string | null
  unpackFolder?: boolean
  previousNodeId?: string
  requestId?: string
  snapshot?: boolean
  title?: string
}
export interface ProjectImportResult { nodeIds: string[]; relationIds: string[] }
export interface ProjectRefreshResult { added: number; updated: number; removed: number }
