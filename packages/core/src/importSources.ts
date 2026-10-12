import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { Repo } from './repo.js'
import { StorageContext } from './storageContext.js'
import { readCommit, readTree } from './model.js'
import { getManifest, materializeFile } from './ingest/index.js'
import { containedPath, validateDocName } from './names.js'
import { writeFileAtomic } from './fsutil.js'

export async function registerImportSource(repo: Repo, docName: string, id: string, source: string): Promise<string | undefined> {
  const config = JSON.parse(await fs.readFile(path.join(repo.root, 'repo.yaml'), 'utf8'))
  if (!config.isolatedSources) return path.resolve(source)
  const ctx = StorageContext.forRepo(repo), tree = await readTree(ctx, (await readCommit(ctx, id)).tree)
  if (!tree.entries['']) return undefined
  const file = containedPath(repo.root, `imports/${id}/${validateDocName(docName)}`)
  await writeFileAtomic(file, await materializeFile(ctx, await getManifest(ctx, tree.entries[''])))
  return path.relative(repo.root, file).split(path.sep).join('/')
}
