import { sha256 } from './hashes.js'
import type { StorageContext } from './storageContext.js'

export interface Commit {
  parents: string[]
  tree: string
  message: string
  author: string
  createdAt: string
}

export interface Tree {
  /** 键：文档内相对路径；值：FileManifest 的 blob id */
  entries: Record<string, string>
}

export function canonicalize(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v)
  if (Array.isArray(v)) return `[${v.map(canonicalize).join(',')}]`
  const o = v as Record<string, unknown>
  const keys = Object.keys(o).sort()
  return `{${keys.map(k => `${JSON.stringify(k)}:${canonicalize(o[k])}`).join(',')}}`
}

export async function commitId(c: Commit): Promise<string> {
  return sha256(new TextEncoder().encode(canonicalize(c)))
}

export async function treeId(t: Tree): Promise<string> {
  return sha256(new TextEncoder().encode(canonicalize(t)))
}

export async function writeCommit(ctx: StorageContext, c: Commit): Promise<string> {
  return ctx.blobs.put(new TextEncoder().encode(canonicalize(c)))
}

export async function readCommit(ctx: StorageContext, id: string): Promise<Commit> {
  return JSON.parse(new TextDecoder().decode(await ctx.blobs.get(id))) as Commit
}

export async function writeTree(ctx: StorageContext, t: Tree): Promise<string> {
  return ctx.blobs.put(new TextEncoder().encode(canonicalize(t)))
}

export async function readTree(ctx: StorageContext, id: string): Promise<Tree> {
  return JSON.parse(new TextDecoder().decode(await ctx.blobs.get(id))) as Tree
}
