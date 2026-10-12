import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { Repo } from '../src/repo.js'
import { commitDoc } from '../src/ops.js'
import { StorageContext } from '../src/storageContext.js'
import { readHead, docIdOf } from '../src/refs.js'
import { readCommit, readTree } from '../src/model.js'
import { tmpDir, cleanup, makeDocxBuf } from './helpers.js'

const WORKER = fileURLToPath(new URL('./helpers/crash-worker.ts', import.meta.url))
// Walk up 3 levels from packages/core/test/crash.test.ts → workspace root
const WORKSPACE_ROOT = fileURLToPath(new URL('../../..', import.meta.url))

/** Find tsx CLI .mjs in pnpm store — resolves dynamically to handle version changes. */
async function findTsxCli(): Promise<string | null> {
  const pnpmDir = path.join(WORKSPACE_ROOT, 'node_modules', '.pnpm')
  let entries: string[]
  try { entries = await fs.readdir(pnpmDir) } catch { return null }
  const tsxEntry = entries.find(e => e.startsWith('tsx@'))
  if (!tsxEntry) return null
  const cli = path.join(pnpmDir, tsxEntry, 'node_modules', 'tsx', 'dist', 'cli.mjs')
  try { await fs.access(cli); return cli } catch { return null }
}

let dir: string, repo: Repo
beforeEach(async () => {
  dir = await tmpDir()
  repo = await Repo.init(path.join(dir, '库.wg'), 't')
})
afterEach(async () => { await cleanup(dir) })

/** Open repo (triggers recoverJournal), then verify clean state. */
async function assertConsistent(repoRoot: string): Promise<void> {
  const repo2 = await Repo.open(repoRoot)

  for (const sub of ['objects/blobs', 'objects/chunks', 'objects/ooxml']) {
    await assertNoTmpFiles(path.join(repoRoot, sub))
  }

  const jEntries = (await fs.readdir(path.join(repoRoot, 'journal')).catch(() => [])).filter(
    (n: string) => n.endsWith('.json'),
  )
  expect(jEntries).toHaveLength(0)

  const ctx = StorageContext.forRepo(repo2)
  const refsBase = path.join(repoRoot, 'refs', 'heads')
  for (const docEntry of await fs.readdir(refsBase, { withFileTypes: true }).catch(() => [])) {
    if (!docEntry.isDirectory()) continue
    for (const br of await fs.readdir(path.join(refsBase, docEntry.name), { withFileTypes: true })) {
      if (!br.isFile() || br.name === 'HEAD') continue
      const commitId = (await fs.readFile(path.join(refsBase, docEntry.name, br.name), 'utf8')).trim()
      const commit = await readCommit(ctx, commitId)
      await readTree(ctx, commit.tree)
    }
  }
}

async function assertNoTmpFiles(dir: string): Promise<void> {
  let entries: import('node:fs').Dirent[]
  try { entries = await fs.readdir(dir, { withFileTypes: true }) } catch { return }
  for (const e of entries) {
    if (e.isDirectory()) await assertNoTmpFiles(path.join(dir, e.name))
    else expect(e.name, `unexpected .tmp file: ${e.name}`).not.toContain('.tmp-')
  }
}

function killTree(child: ChildProcess): void {
  if (process.platform === 'win32' && child.pid != null) {
    spawnSync('taskkill', ['/F', '/T', '/PID', String(child.pid)], { stdio: 'ignore' })
  } else {
    child.kill('SIGKILL')
  }
}

describe('崩溃注入', () => {
  it('模拟崩溃：注入 journal 条目 + .tmp 文件 → Repo.open() 自动清理', async () => {
    await fs.writeFile(path.join(repo.root, 'workspace', '论文.docx'), makeDocxBuf(['第一章']))
    await commitDoc(repo, '论文.docx', { message: 'v1', author: 'test' })

    const jEntry = path.join(repo.root, 'journal', '99999-abc.json')
    await fs.writeFile(jEntry, JSON.stringify({
      id: '99999-abc', op: 'commit', docName: '论文.docx', branch: 'main',
      startedAt: new Date().toISOString(),
    }))
    const tmpObj = path.join(repo.root, 'objects', 'blobs', 'aa', 'bb', 'orphan.tmp-1-x')
    await fs.mkdir(path.dirname(tmpObj), { recursive: true })
    await fs.writeFile(tmpObj, 'orphan bytes')

    await assertConsistent(repo.root)
    expect(await readHead(repo, docIdOf('论文.docx'), 'main')).toMatch(/^[0-9a-f]{64}$/)
  })

  it('真实子进程崩溃：随机 kill，仓库保持一致（3 次迭代）', async () => {
    const tsxCli = await findTsxCli()
    if (!tsxCli) {
      console.warn('Skipping subprocess crash test: tsx CLI not found in pnpm store')
      return
    }

    await fs.writeFile(path.join(repo.root, 'workspace', 'bigdoc.txt'), makeDocxBuf(['init']))
    await commitDoc(repo, 'bigdoc.txt', { message: 'v0', author: 'test' })
    const repoRoot = repo.root

    for (let i = 0; i < 3; i++) {
      // Spawn node directly with tsx CLI — no shell wrapper, so kill hits node.exe directly
      const child = spawn(
        process.execPath,
        [tsxCli, WORKER, repoRoot],
        { stdio: 'pipe', shell: false },
      )

      const delay = 50 + Math.floor(Math.random() * 150)
      await new Promise<void>(r => setTimeout(r, delay))
      killTree(child)
      await new Promise<void>(r => child.on('close', r))

      await assertConsistent(repoRoot)
    }
  }, 60_000)
})
