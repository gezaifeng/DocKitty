import { promises as fs } from 'node:fs'
import path from 'node:path'
import { inflateSync } from 'fflate'
import type { Repo } from './repo.js'
import { sha256 } from './hashes.js'

export interface ScrubCorruption {
  objectPath: string
  expected: string
  actual: string
}

export interface ScrubResult {
  checked: number
  corrupted: ScrubCorruption[]
}

export async function scrub(repo: Repo): Promise<ScrubResult> {
  const dirs = [repo.objectsDir('blobs'), repo.objectsDir('chunks'), repo.objectsDir('ooxml')]
  let checked = 0
  const corrupted: ScrubCorruption[] = []
  for (const dir of dirs) {
    await walkObjects(dir, async (objectPath, expectedId) => {
      const compressed = await fs.readFile(objectPath)
      let raw: Uint8Array
      try {
        raw = inflateSync(new Uint8Array(compressed))
      } catch {
        corrupted.push({ objectPath, expected: expectedId, actual: '(inflate failed)' })
        checked++
        return
      }
      const actual = await sha256(raw)
      if (actual !== expectedId) corrupted.push({ objectPath, expected: expectedId, actual })
      checked++
    })
  }
  return { checked, corrupted }
}

async function walkObjects(dir: string, cb: (p: string, id: string) => Promise<void>): Promise<void> {
  let l1: import('node:fs').Dirent[]
  try { l1 = await fs.readdir(dir, { withFileTypes: true }) } catch { return }
  for (const e1 of l1.filter(e => e.isDirectory())) {
    const d1 = path.join(dir, e1.name)
    let l2: import('node:fs').Dirent[]
    try { l2 = await fs.readdir(d1, { withFileTypes: true }) } catch { continue }
    for (const e2 of l2.filter(e => e.isDirectory())) {
      const d2 = path.join(d1, e2.name)
      let l3: import('node:fs').Dirent[]
      try { l3 = await fs.readdir(d2, { withFileTypes: true }) } catch { continue }
      for (const e3 of l3.filter(e => e.isFile())) {
        await cb(path.join(d2, e3.name), e1.name + e2.name + e3.name)
      }
    }
  }
}
