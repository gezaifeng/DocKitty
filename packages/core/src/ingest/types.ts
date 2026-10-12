export type StoredRef = { chunks: string[] } | { blob: string }

export interface GenericManifest {
  encoding: 'generic'
  size: number
  sha256: string
  ref: { chunks: string[] }
}

export interface OoxmlEntry {
  name: string
  sha256: string
  size: number
  ref: StoredRef
}

export interface OoxmlManifest {
  encoding: 'ooxml'
  size: number
  sha256: string
  order: string[]
  entries: Record<string, OoxmlEntry>
  original?: GenericManifest
}

export type FileManifest = GenericManifest | OoxmlManifest
