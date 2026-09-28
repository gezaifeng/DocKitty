import { promises as fs } from 'node:fs'
import path from 'node:path'
import { Repo, commitDoc } from '../../src/index.js'

const [, , repoDir] = process.argv
if (!repoDir) { process.stderr.write('repoDir required\n'); process.exit(1) }

const repo = await Repo.open(repoDir)
const docPath = path.join(repoDir, 'workspace', 'bigdoc.txt')
// 1MB of repeated data → ~250 CDC chunks → many fsync calls → slow commit (~2s)
await fs.writeFile(docPath, Buffer.alloc(1024 * 1024, 0xab))
await commitDoc(repo, 'bigdoc.txt', { message: 'crash-test', author: 'crash' })
process.exit(0)
