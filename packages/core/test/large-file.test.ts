import { it, expect } from 'vitest'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { createHash, randomBytes } from 'node:crypto'
import { Repo } from '../src/repo.js'
import { importDoc, checkoutDoc } from '../src/ops.js'
import { exportVersion } from '../src/library.js'
import { exportBackup, importBackup } from '../src/backup.js'
import { readFileBlocks } from '../src/fsutil.js'
import { tmpDir, cleanup } from './helpers.js'

it('preserves a 65 MiB nonrepeating file through import, checkout, export and streaming backup restore', async () => {
  const dir = await tmpDir(), source = path.join(dir, 'random.bin'), repo = await Repo.init(path.join(dir, 'large.wg'), 'large-file')
  const expected = createHash('sha256'), output = await fs.open(source, 'w'), chunks = new Set<string>()
  const started = Date.now(), before = process.memoryUsage().rss
  let peak = before
  const sample = setInterval(() => { peak = Math.max(peak, process.memoryUsage().rss) }, 10)
  const hashFile = async (file: string) => { const hash = createHash('sha256'); for await (const block of readFileBlocks(file)) hash.update(block); return hash.digest('hex') }
  const phase = (name: string) => console.info(JSON.stringify({ phase: name, elapsedMs: Date.now() - started }))
  try {
    try {
      for (let index = 0; index < 65; index++) { const bytes = randomBytes(1024 * 1024); expected.update(bytes); chunks.add(createHash('sha256').update(bytes).digest('hex')); await output.writeFile(bytes) }
    } finally { await output.close() }
    expect(chunks.size).toBe(65)
    phase('source ready'); const digest = expected.digest('hex'), first = await importDoc(repo, source); phase('imported')
    await fs.writeFile(path.join(repo.root, 'workspace', 'random.bin'), 'unrecorded working edit')
    await checkoutDoc(repo, 'random.bin', { commitId: first.commitId })
    expect(await hashFile(path.join(repo.root, 'workspace', 'random.bin'))).toBe(digest)
    phase('checkout verified'); const exported = path.join(dir, 'export.bin'); await exportVersion(repo, 'random.bin', first.commitId, exported)
    expect(await hashFile(exported)).toBe(digest)
    phase('export verified'); const backup = path.join(dir, 'large.wgbak'); await exportBackup(repo, backup); phase('backup written')
    const restored = await importBackup(backup, path.join(dir, 'restored.wg'))
    phase('backup restored'); expect(await hashFile(path.join(restored.root, 'workspace', 'random.bin'))).toBe(digest)
    expect(await hashFile(source)).toBe(digest)
    console.info(JSON.stringify({ largeFileMiB: 65, distinctMiBBlocks: chunks.size, elapsedMs: Date.now() - started, peakRssMiB: Math.round(peak / 1048576), rssGrowthMiB: Math.round((peak - before) / 1048576) }))
  } finally { clearInterval(sample); await cleanup(dir) }
}, 300000)
