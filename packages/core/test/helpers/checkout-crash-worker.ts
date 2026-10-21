import { promises as fs } from 'node:fs'
import path from 'node:path'
import { Repo, checkoutDoc } from '../../src/index.js'

const [, , root, versionId, phase] = process.argv
const repo = await Repo.open(root), rename = fs.rename.bind(fs)
fs.rename = async (from, to) => {
  await rename(from, to)
  if ((phase === 'old-moved' && String(to).endsWith(path.sep + 'previous')) || (phase === 'new-published' && String(from).endsWith(path.sep + 'next'))) {
    process.stdout.write('CHECKOUT_CRASH_POINT\n')
    setInterval(() => {}, 1000)
    await new Promise<void>(() => {})
  }
}
await checkoutDoc(repo, 'folder', { commitId: versionId })
