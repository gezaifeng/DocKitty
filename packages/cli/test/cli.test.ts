import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { execSync } from 'node:child_process'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const cliDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function run(args: string): string {
  // execSync 在 Windows 走 cmd.exe、POSIX 走 /bin/sh，均可解析 pnpm
  return execSync(`pnpm exec tsx src/index.ts ${args}`, {
    cwd: cliDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
}

let dir: string
beforeEach(async () => { dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wordgit-cli-')) })
afterEach(async () => { await fs.rm(dir, { recursive: true, force: true }) })

describe('CLI 集成', () => {
  it('init → import → commit → log → checkout → branch 全链路', async () => {
    const repoPath = path.join(dir, '库.wg')
    run(`init "${repoPath}"`)
    expect(await fs.readFile(path.join(repoPath, 'repo.yaml'), 'utf8')).toContain('formatVersion')

    const src = path.join(dir, '笔记.txt')
    await fs.writeFile(src, '第一版内容')
    const imported = JSON.parse(run(`import "${repoPath}" "${src}"`).trim())
    expect(imported.docId).toBe(encodeURIComponent('笔记.txt'))

    const wsFile = path.join(repoPath, 'workspace', '笔记.txt')
    await fs.writeFile(wsFile, '第二版内容')
    const committed = JSON.parse(run(`commit "${repoPath}" "笔记.txt" -m "v2" --author tester`).trim())
    expect(committed.commitId).toMatch(/^[0-9a-f]{64}$/)

    const commits = JSON.parse(run(`log "${repoPath}" "笔记.txt" --json`).trim())
    expect(commits.map((c: { message: string }) => c.message)).toEqual(['v2', '导入'])

    run(`checkout "${repoPath}" "笔记.txt" --commit ${commits[1].id}`)
    expect(await fs.readFile(wsFile, 'utf8')).toBe('第一版内容')

    run(`branch "${repoPath}" "笔记.txt" experiment --switch`)
    const branches = JSON.parse(run(`branch "${repoPath}" "笔记.txt"`).trim())
    expect(branches).toEqual(['experiment', 'main'])
  }, 120_000)
})
