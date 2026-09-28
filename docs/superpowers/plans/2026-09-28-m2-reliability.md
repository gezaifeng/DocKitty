# M2 可靠性层 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 packages/core 增加 journal WAL 崩溃恢复、quarantine 安全删除、scrub 完整性校验、backup 备份导出/导入，以及崩溃注入测试。

**Architecture:** 全部在 packages/core 内实现，无新 package。Journal 在每次 commitDoc 前写入 pending 条目，成功后删除；Repo.open() 调用 recoverJournal() 清理崩溃残留。Quarantine 将"已删分支"的引用元数据存入 quarantine/ 目录（30 天可还原）。Scrub 遍历 objects/ 验证 sha256。Backup 使用 fflate zipSync 生成含校验清单的归档包。

**Tech Stack:** fflate（已有）、node:fs/promises、node:crypto——不引入新依赖。

**Spec:** docs/superpowers/specs/2026-09-28-word-git-design.md §5.5

## Global Constraints

- pnpm workspaces monorepo；仅修改 packages/core（packages/cli 和 apps/desktop 不变）
- TypeScript 5 strict ESM，import 用 .js 扩展名，NodeNext 模块解析
- Vitest 3，testTimeout: 30000（packages/core/vitest.config.ts 已配置）
- 不引入新 npm 依赖——仅 fflate 和 node: 内置模块
- 所有磁盘写入沿用 tmp+rename 原子模式（fsutil.ts 的 writeFileAtomic）
- M2 无构建步骤：tsx 直接运行 .ts；每个 task 完成后 tsc --noEmit 必须通过
- 开发分支：m2-reliability（从 m1-core-engine 创建）

---

### Task 0: 创建 m2-reliability 分支

**Files:**
- （仅 git 操作）

**Interfaces:**
- Consumes: M1 已在 m1-core-engine 分支完成，43 tests + 1 CLI test 全绿
- Produces: branch m2-reliability，M1 代码为基础

- [ ] **Step 1: 创建分支**

```bash
git checkout m1-core-engine
git checkout -b m2-reliability
```

Expected: `Switched to a new branch 'm2-reliability'`

- [ ] **Step 2: 验证起始状态**

```bash
cd packages/core && npx tsc --noEmit && echo "TYPECHECK OK"
```

然后在仓库根目录：

```bash
pnpm test
```

Expected: core 43 tests pass，cli 1 test pass。

- [ ] **Step 3: 提交空标记**

```bash
git commit --allow-empty -m "chore: start M2 reliability layer"
```

---

### Task 1: Journal WAL（预写日志）

**Files:**
- Create: `packages/core/src/journal.ts`
- Modify: `packages/core/src/repo.ts`（在 open() 里调用 recoverJournal）
- Modify: `packages/core/src/ops.ts`（用 journal 包装 commitDoc）
- Test: `packages/core/test/journal.test.ts`

**Interfaces:**
- Consumes: `import type { Repo } from './repo.js'`；`writeFileAtomic` from `./fsutil.js`
- Produces:
  - `openJournal(repo: Repo, op: 'commit' | 'import', docName: string, branch: string): Promise<string>` — 返回条目 id
  - `closeJournal(repo: Repo, id: string): Promise<void>` — 删除条目
  - `recoverJournal(repo: Repo): Promise<number>` — 清理 .tmp 文件和 pending 条目；返回已恢复条目数
  - `JournalEntry` interface

- [ ] **Step 1: 写失败测试**

新建 `packages/core/test/journal.test.ts`：

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { Repo } from '../src/repo.js'
import { openJournal, closeJournal, recoverJournal } from '../src/journal.js'
import { commitDoc } from '../src/ops.js'
import { tmpDir, cleanup, makeDocxBuf } from './helpers.js'

let dir: string, repo: Repo
beforeEach(async () => {
  dir = await tmpDir()
  repo = await Repo.init(path.join(dir, '库.wg'), 't')
})
afterEach(async () => { await cleanup(dir) })

describe('journal', () => {
  it('openJournal 创建条目；closeJournal 删除它', async () => {
    const id = await openJournal(repo, 'commit', '论文.docx', 'main')
    const jDir = path.join(repo.root, 'journal')
    expect((await fs.readdir(jDir)).filter(n => n.endsWith('.json'))).toHaveLength(1)
    await closeJournal(repo, id)
    expect((await fs.readdir(jDir)).filter(n => n.endsWith('.json'))).toHaveLength(0)
  })

  it('recoverJournal 清理 pending 条目和 .tmp 文件', async () => {
    await openJournal(repo, 'commit', '论文.docx', 'main')
    // 模拟崩溃时遗留的 .tmp 文件
    const tmpFile = path.join(repo.root, 'objects', 'blobs', 'aa', 'bb', 'orphan.tmp-9999-abc')
    await fs.mkdir(path.dirname(tmpFile), { recursive: true })
    await fs.writeFile(tmpFile, 'orphan')

    const count = await recoverJournal(repo)
    expect(count).toBe(1)

    expect((await fs.readdir(path.join(repo.root, 'journal'))).filter(n => n.endsWith('.json'))).toHaveLength(0)
    await expect(fs.access(tmpFile)).rejects.toThrow()
  })

  it('Repo.open() 自动触发 recoverJournal', async () => {
    const repoRoot = repo.root
    await openJournal(repo, 'commit', '论文.docx', 'main')
    const tmpFile = path.join(repoRoot, 'objects', 'chunks', 'cc', 'dd', 'x.tmp-1-z')
    await fs.mkdir(path.dirname(tmpFile), { recursive: true })
    await fs.writeFile(tmpFile, 'orphan2')

    await Repo.open(repoRoot)  // triggers recoverJournal

    expect((await fs.readdir(path.join(repoRoot, 'journal'))).filter(n => n.endsWith('.json'))).toHaveLength(0)
    await expect(fs.access(tmpFile)).rejects.toThrow()
  })

  it('commitDoc 成功后 journal 为空', async () => {
    await fs.writeFile(path.join(repo.root, 'workspace', '论文.docx'), makeDocxBuf(['第一章']))
    await commitDoc(repo, '论文.docx', { message: 'v1', author: 'test' })
    expect((await fs.readdir(path.join(repo.root, 'journal'))).filter(n => n.endsWith('.json'))).toHaveLength(0)
  })
})
```

- [ ] **Step 2: 运行确认失败**

```bash
cd packages/core && npx vitest run test/journal.test.ts
```

Expected: FAIL — `Cannot find module '../src/journal.js'`

- [ ] **Step 3: 新建 `packages/core/src/journal.ts`**

```typescript
import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { Repo } from './repo.js'
import { writeFileAtomic } from './fsutil.js'

export interface JournalEntry {
  id: string
  op: 'commit' | 'import'
  docName: string
  branch: string
  startedAt: string
}

export async function openJournal(
  repo: Repo,
  op: JournalEntry['op'],
  docName: string,
  branch: string,
): Promise<string> {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const entry: JournalEntry = { id, op, docName, branch, startedAt: new Date().toISOString() }
  await writeFileAtomic(
    path.join(repo.root, 'journal', `${id}.json`),
    new TextEncoder().encode(JSON.stringify(entry)),
  )
  return id
}

export async function closeJournal(repo: Repo, id: string): Promise<void> {
  await fs.rm(path.join(repo.root, 'journal', `${id}.json`), { force: true })
}

export async function recoverJournal(repo: Repo): Promise<number> {
  await cleanTmpFiles(repo)
  const jDir = path.join(repo.root, 'journal')
  let names: string[]
  try {
    names = await fs.readdir(jDir)
  } catch {
    return 0
  }
  let count = 0
  for (const name of names) {
    if (!name.endsWith('.json')) continue
    await fs.rm(path.join(jDir, name), { force: true })
    count++
  }
  return count
}

async function cleanTmpFiles(repo: Repo): Promise<void> {
  for (const sub of ['objects/blobs', 'objects/chunks', 'objects/ooxml', 'refs/heads']) {
    await cleanDir(path.join(repo.root, sub))
  }
}

async function cleanDir(dir: string): Promise<void> {
  let entries: import('node:fs').Dirent[]
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const e of entries) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) await cleanDir(p)
    else if (e.isFile() && e.name.includes('.tmp-')) await fs.rm(p, { force: true })
  }
}
```

- [ ] **Step 4: 修改 `packages/core/src/repo.ts`——在 open() 里调用 recoverJournal**

在 repo.ts 顶部现有 import 之后添加：

```typescript
import { recoverJournal } from './journal.js'
```

将 `Repo.open()` 末尾的 `return new Repo(root)` 替换为：

```typescript
  const repo = new Repo(root)
  await recoverJournal(repo)
  return repo
```

完整 `Repo.open()` 函数如下（整体替换现有实现）：

```typescript
static async open(root: string): Promise<Repo> {
  let raw: string
  try {
    raw = await fs.readFile(path.join(root, 'repo.yaml'), 'utf8')
  } catch {
    throw new Error(`不是 word_git 仓库：${root}（缺少 repo.yaml）`)
  }
  const config = JSON.parse(raw) as RepoConfig
  if (config.formatVersion > FORMAT_VERSION) {
    throw new Error(`仓库格式版本 ${config.formatVersion} 高于本软件支持的 ${FORMAT_VERSION}，请升级 word_git`)
  }
  if (config.formatVersion < FORMAT_VERSION) {
    throw new Error(`仓库格式版本过旧（${config.formatVersion}），需要迁移工具（M2 提供）`)
  }
  const repo = new Repo(root)
  await recoverJournal(repo)
  return repo
}
```

- [ ] **Step 5: 修改 `packages/core/src/ops.ts`——用 journal 包装 commitDoc**

在 ops.ts 顶部 import 块末尾添加：

```typescript
import { openJournal, closeJournal } from './journal.js'
```

用下面的完整实现替换现有 `commitDoc` 函数（将 `branch` 计算提前到 `openJournal` 之前，其余逻辑不变）：

```typescript
export async function commitDoc(repo: Repo, docName: string, opts: { message: string; author: string; branch?: string }): Promise<CommitResult> {
  const docId = docIdOf(docName)
  const branch = opts.branch ?? await readCurrentBranch(repo, docId)
  const journalId = await openJournal(repo, 'commit', docName, branch)
  try {
    const ctx = StorageContext.forRepo(repo)
    const docAbs = path.join(repo.root, 'workspace', docName)
    try {
      await fs.stat(docAbs)
    } catch {
      throw new Error(`workspace 中不存在文档：${docName}`)
    }

    const headId = await readHead(repo, docId, branch)
    let prevTree: Tree = { entries: {} }
    if (headId) {
      prevTree = await readTree(ctx, (await readCommit(ctx, headId)).tree)
    }

    const paths: string[] = []
    await collectDocPaths(docAbs, '', paths)
    if (paths.length === 0) throw new Error(`workspace 中文档为空：${docName}`)

    const entries: Tree['entries'] = {}
    const changed: string[] = []
    for (const rel of paths.sort()) {
      const abs = path.join(docAbs, rel)
      const fileSha = await sha256File(abs)
      const prevManifestId = prevTree.entries[rel]
      let manifestId = prevManifestId ?? null

      if (manifestId) {
        const prevManifest = await getManifest(ctx, manifestId)
        if (prevManifest.sha256 !== fileSha) {
          manifestId = await putManifest(ctx, await encodeFile(ctx, abs, prevManifest))
          changed.push(rel ? docName + '/' + rel : docName)
        }
      } else {
        const existing = await getManifestByContent(ctx, fileSha)
        manifestId = existing ? await putManifest(ctx, existing) : await putManifest(ctx, await encodeFile(ctx, abs))
        changed.push(rel ? docName + '/' + rel : docName)
      }
      entries[rel] = manifestId!
    }

    if (changed.length === 0) {
      await closeJournal(repo, journalId)
      return { docId, branch, commitId: null, changed }
    }

    const treeId = await writeTree(ctx, { entries })
    const commit: Commit = {
      parents: headId ? [headId] : [],
      tree: treeId,
      message: opts.message,
      author: opts.author,
      createdAt: new Date().toISOString(),
    }
    const cid = await writeCommit(ctx, commit)
    await writeHead(repo, docId, branch, cid)
    await closeJournal(repo, journalId)
    return { docId, branch, commitId: cid, changed }
  } catch (e) {
    // journal 条目故意留下：下次 Repo.open() 触发 recoverJournal 清理
    throw e
  }
}
```

- [ ] **Step 6: 运行 journal 测试**

```bash
cd packages/core && npx vitest run test/journal.test.ts
```

Expected: 4 tests PASS。

- [ ] **Step 7: 运行全量核心测试（回归检查）**

```bash
npx vitest run
```

Expected: 47 tests pass（43 原有 + 4 新增）。

- [ ] **Step 8: 类型检查**

```bash
npx tsc --noEmit && echo "OK"
```

Expected: OK，0 errors。

- [ ] **Step 9: 提交**

```bash
git add packages/core/src/journal.ts packages/core/src/repo.ts packages/core/src/ops.ts packages/core/test/journal.test.ts
git commit -m "feat(core): journal WAL + crash recovery on Repo.open()"
```

---

### Task 2: Quarantine（安全删除分支，30 天可还原）

**Files:**
- Create: `packages/core/src/quarantine.ts`
- Test: `packages/core/test/quarantine.test.ts`

**Interfaces:**
- Consumes: `import type { Repo } from './repo.js'`；`writeFileAtomic` from `./fsutil.js`；`docIdOf, readHead, writeHead, deleteBranch` from `./refs.js`
- Produces:
  - `QuarantineEntry: { id: string; docId: string; docName: string; branch: string; commitId: string; deletedAt: string }`
  - `deleteBranchSafe(repo: Repo, docName: string, branch: string): Promise<QuarantineEntry>`
  - `listQuarantine(repo: Repo): Promise<QuarantineEntry[]>` — 按 deletedAt 倒序
  - `restoreFromQuarantine(repo: Repo, entryId: string): Promise<void>`
  - `purgeQuarantine(repo: Repo, beforeMs?: number): Promise<number>` — 默认 30 天前；返回已清除数量

- [ ] **Step 1: 写失败测试**

新建 `packages/core/test/quarantine.test.ts`：

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { Repo } from '../src/repo.js'
import { commitDoc, createBranch } from '../src/ops.js'
import { readHead, docIdOf } from '../src/refs.js'
import { deleteBranchSafe, listQuarantine, restoreFromQuarantine, purgeQuarantine } from '../src/quarantine.js'
import { tmpDir, cleanup, makeDocxBuf } from './helpers.js'

let dir: string, repo: Repo
beforeEach(async () => {
  dir = await tmpDir()
  repo = await Repo.init(path.join(dir, '库.wg'), 't')
  await fs.writeFile(path.join(repo.root, 'workspace', '论文.docx'), makeDocxBuf(['第一章']))
  await commitDoc(repo, '论文.docx', { message: 'v1', author: 'test' })
  await createBranch(repo, '论文.docx', 'feature')
})
afterEach(async () => { await cleanup(dir) })

describe('quarantine', () => {
  it('deleteBranchSafe 创建回收条目并删除分支引用', async () => {
    const entry = await deleteBranchSafe(repo, '论文.docx', 'feature')
    expect(entry.branch).toBe('feature')
    expect(entry.commitId).toMatch(/^[0-9a-f]{64}$/)
    expect(entry.docName).toBe('论文.docx')
    expect(await readHead(repo, docIdOf('论文.docx'), 'feature')).toBeNull()
    await expect(fs.access(path.join(repo.root, 'quarantine', `${entry.id}.json`))).resolves.toBeUndefined()
  })

  it('listQuarantine 返回全部回收条目，按 deletedAt 倒序', async () => {
    await deleteBranchSafe(repo, '论文.docx', 'feature')
    const list = await listQuarantine(repo)
    expect(list).toHaveLength(1)
    expect(list[0].branch).toBe('feature')
  })

  it('restoreFromQuarantine 恢复分支引用并删除回收条目', async () => {
    const entry = await deleteBranchSafe(repo, '论文.docx', 'feature')
    await restoreFromQuarantine(repo, entry.id)
    expect(await readHead(repo, docIdOf('论文.docx'), 'feature')).toBe(entry.commitId)
    expect(await listQuarantine(repo)).toHaveLength(0)
  })

  it('purgeQuarantine 删除超过时限的条目', async () => {
    await deleteBranchSafe(repo, '论文.docx', 'feature')
    const count = await purgeQuarantine(repo, Date.now() + 1)
    expect(count).toBe(1)
    expect(await listQuarantine(repo)).toHaveLength(0)
  })

  it('purgeQuarantine 保留未到期条目（默认 30 天）', async () => {
    await deleteBranchSafe(repo, '论文.docx', 'feature')
    const count = await purgeQuarantine(repo)
    expect(count).toBe(0)
    expect(await listQuarantine(repo)).toHaveLength(1)
  })
})
```

- [ ] **Step 2: 运行确认失败**

```bash
npx vitest run test/quarantine.test.ts
```

Expected: FAIL — `Cannot find module '../src/quarantine.js'`

- [ ] **Step 3: 新建 `packages/core/src/quarantine.ts`**

```typescript
import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { Repo } from './repo.js'
import { writeFileAtomic } from './fsutil.js'
import { docIdOf, readHead, writeHead, deleteBranch } from './refs.js'

export interface QuarantineEntry {
  id: string
  docId: string
  docName: string
  branch: string
  commitId: string
  deletedAt: string
}

export async function deleteBranchSafe(repo: Repo, docName: string, branch: string): Promise<QuarantineEntry> {
  const docId = docIdOf(docName)
  const commitId = await readHead(repo, docId, branch)
  if (!commitId) throw new Error(`分支不存在：${branch}`)
  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const entry: QuarantineEntry = { id, docId, docName, branch, commitId, deletedAt: new Date().toISOString() }
  const qDir = path.join(repo.root, 'quarantine')
  await fs.mkdir(qDir, { recursive: true })
  await writeFileAtomic(path.join(qDir, `${id}.json`), new TextEncoder().encode(JSON.stringify(entry)))
  await deleteBranch(repo, docId, branch)
  return entry
}

export async function listQuarantine(repo: Repo): Promise<QuarantineEntry[]> {
  const qDir = path.join(repo.root, 'quarantine')
  let names: string[]
  try { names = await fs.readdir(qDir) } catch { return [] }
  const entries: QuarantineEntry[] = []
  for (const name of names) {
    if (!name.endsWith('.json')) continue
    entries.push(JSON.parse(await fs.readFile(path.join(qDir, name), 'utf8')) as QuarantineEntry)
  }
  return entries.sort((a, b) => b.deletedAt.localeCompare(a.deletedAt))
}

export async function restoreFromQuarantine(repo: Repo, entryId: string): Promise<void> {
  const qDir = path.join(repo.root, 'quarantine')
  const p = path.join(qDir, `${entryId}.json`)
  const entry = JSON.parse(await fs.readFile(p, 'utf8')) as QuarantineEntry
  await writeHead(repo, entry.docId, entry.branch, entry.commitId)
  await fs.rm(p)
}

export async function purgeQuarantine(repo: Repo, beforeMs?: number): Promise<number> {
  const cutoff = beforeMs ?? (Date.now() - 30 * 24 * 60 * 60 * 1000)
  const entries = await listQuarantine(repo)
  const qDir = path.join(repo.root, 'quarantine')
  let count = 0
  for (const entry of entries) {
    if (new Date(entry.deletedAt).getTime() < cutoff) {
      await fs.rm(path.join(qDir, `${entry.id}.json`), { force: true })
      count++
    }
  }
  return count
}
```

- [ ] **Step 4: 运行 quarantine 测试**

```bash
npx vitest run test/quarantine.test.ts
```

Expected: 5 tests PASS。

- [ ] **Step 5: 运行全量测试 + 类型检查**

```bash
npx vitest run && npx tsc --noEmit && echo "OK"
```

Expected: 52 tests pass，OK。

- [ ] **Step 6: 提交**

```bash
git add packages/core/src/quarantine.ts packages/core/test/quarantine.test.ts
git commit -m "feat(core): quarantine — 安全删除分支（30天可还原）"
```

---

### Task 3: Scrub（对象完整性校验）

**Files:**
- Create: `packages/core/src/scrub.ts`
- Test: `packages/core/test/scrub.test.ts`

**Interfaces:**
- Consumes: `import type { Repo } from './repo.js'`；`sha256` from `./hashes.js`；`inflateSync` from `fflate`
- Produces:
  - `ScrubCorruption: { objectPath: string; expected: string; actual: string }`
  - `ScrubResult: { checked: number; corrupted: ScrubCorruption[] }`
  - `scrub(repo: Repo): Promise<ScrubResult>`

ObjectStore 路径结构：`<dir>/<first2>/<next2>/<rest>`，三段拼起来即完整 64 位 sha256。

- [ ] **Step 1: 写失败测试**

新建 `packages/core/test/scrub.test.ts`：

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { deflateSync } from 'fflate'
import { Repo } from '../src/repo.js'
import { commitDoc } from '../src/ops.js'
import { scrub } from '../src/scrub.js'
import { tmpDir, cleanup, makeDocxBuf } from './helpers.js'

let dir: string, repo: Repo
beforeEach(async () => {
  dir = await tmpDir()
  repo = await Repo.init(path.join(dir, '库.wg'), 't')
})
afterEach(async () => { await cleanup(dir) })

describe('scrub', () => {
  it('干净仓库校验：0 个损坏对象', async () => {
    await fs.writeFile(path.join(repo.root, 'workspace', '论文.docx'), makeDocxBuf(['第一章']))
    await commitDoc(repo, '论文.docx', { message: 'v1', author: 'test' })
    const result = await scrub(repo)
    expect(result.corrupted).toHaveLength(0)
    expect(result.checked).toBeGreaterThan(0)
  })

  it('发现被篡改的对象', async () => {
    await fs.writeFile(path.join(repo.root, 'workspace', '论文.docx'), makeDocxBuf(['第一章']))
    await commitDoc(repo, '论文.docx', { message: 'v1', author: 'test' })

    // 找到第一个 blob 文件并覆盖其内容（有效 deflate，但内容不同）
    const blobsDir = repo.objectsDir('blobs')
    let corruptedPath: string | null = null
    outer: for (const l1 of await fs.readdir(blobsDir, { withFileTypes: true })) {
      if (!l1.isDirectory()) continue
      for (const l2 of await fs.readdir(path.join(blobsDir, l1.name), { withFileTypes: true })) {
        if (!l2.isDirectory()) continue
        for (const l3 of await fs.readdir(path.join(blobsDir, l1.name, l2.name), { withFileTypes: true })) {
          if (!l3.isFile()) continue
          corruptedPath = path.join(blobsDir, l1.name, l2.name, l3.name)
          break outer
        }
      }
    }
    expect(corruptedPath).not.toBeNull()
    await fs.writeFile(corruptedPath!, deflateSync(new TextEncoder().encode('corrupted!')))

    const result = await scrub(repo)
    expect(result.corrupted).toHaveLength(1)
    expect(result.corrupted[0].objectPath).toBe(corruptedPath)
  })
})
```

- [ ] **Step 2: 运行确认失败**

```bash
npx vitest run test/scrub.test.ts
```

Expected: FAIL — `Cannot find module '../src/scrub.js'`

- [ ] **Step 3: 新建 `packages/core/src/scrub.ts`**

```typescript
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
```

- [ ] **Step 4: 运行 scrub 测试**

```bash
npx vitest run test/scrub.test.ts
```

Expected: 2 tests PASS。

- [ ] **Step 5: 运行全量测试 + 类型检查**

```bash
npx vitest run && npx tsc --noEmit && echo "OK"
```

Expected: 54 tests pass，OK。

- [ ] **Step 6: 提交**

```bash
git add packages/core/src/scrub.ts packages/core/test/scrub.test.ts
git commit -m "feat(core): scrub — 全量 sha256 对象完整性校验"
```

---

### Task 4: Backup（导出/导入备份包）

**Files:**
- Create: `packages/core/src/backup.ts`
- Test: `packages/core/test/backup.test.ts`

**Interfaces:**
- Consumes: `import { Repo } from './repo.js'`；`fflate.zipSync`；`fflate.unzipSync`；`sha256` from `./hashes.js`
- Produces:
  - `BackupManifest: { version: 1; createdAt: string; repoName: string; files: Array<{ path: string; sha256: string }> }`
  - `exportBackup(repo: Repo, destPath: string): Promise<{ fileCount: number }>` — 写 zip 文件，返回包含的文件数
  - `importBackup(srcPath: string, destRoot: string): Promise<Repo>` — 解压并校验，返回可用的 Repo 实例

排除出备份：`journal/`（临时）、`*.tmp-*`、`index/`（派生缓存）。
包含：`objects/`、`refs/`、`quarantine/`、`workspace/`、`repo.yaml`。

- [ ] **Step 1: 写失败测试**

新建 `packages/core/test/backup.test.ts`：

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { Repo } from '../src/repo.js'
import { commitDoc } from '../src/ops.js'
import { readHead, docIdOf } from '../src/refs.js'
import { exportBackup, importBackup } from '../src/backup.js'
import { StorageContext } from '../src/storageContext.js'
import { readCommit, readTree } from '../src/model.js'
import { scrub } from '../src/scrub.js'
import { tmpDir, cleanup, makeDocxBuf, editDocxAddParagraph } from './helpers.js'

let dir: string, repo: Repo
beforeEach(async () => {
  dir = await tmpDir()
  repo = await Repo.init(path.join(dir, '库.wg'), 't')
})
afterEach(async () => { await cleanup(dir) })

describe('backup', () => {
  it('exportBackup 写出 zip；importBackup 还原后仓库对象完整、提交可访问', async () => {
    const buf1 = makeDocxBuf(['第一章'])
    const buf2 = editDocxAddParagraph(buf1, '新增段落，保证产生新对象')
    await fs.writeFile(path.join(repo.root, 'workspace', '论文.docx'), buf1)
    await commitDoc(repo, '论文.docx', { message: 'v1', author: 'test' })
    await fs.writeFile(path.join(repo.root, 'workspace', '论文.docx'), buf2)
    await commitDoc(repo, '论文.docx', { message: 'v2', author: 'test' })

    const backupPath = path.join(dir, 'backup.zip')
    const { fileCount } = await exportBackup(repo, backupPath)
    expect(fileCount).toBeGreaterThan(3)

    const restoreRoot = path.join(dir, 'restored.wg')
    const restored = await importBackup(backupPath, restoreRoot)

    // 对象完整性
    const result = await scrub(restored)
    expect(result.corrupted).toHaveLength(0)
    expect(result.checked).toBeGreaterThan(0)

    // 提交链可访问
    const docId = docIdOf('论文.docx')
    const head = await readHead(restored, docId, 'main')
    expect(head).toMatch(/^[0-9a-f]{64}$/)
    const ctx = StorageContext.forRepo(restored)
    const commit = await readCommit(ctx, head!)
    expect(commit.message).toBe('v2')
    const tree = await readTree(ctx, commit.tree)
    expect(Object.keys(tree.entries)).toContain('')
  })

  it('备份包损坏时 importBackup 抛出错误', async () => {
    await fs.writeFile(path.join(repo.root, 'workspace', '论文.docx'), makeDocxBuf(['内容']))
    await commitDoc(repo, '论文.docx', { message: 'v1', author: 'test' })
    const backupPath = path.join(dir, 'backup.zip')
    await exportBackup(repo, backupPath)

    // 破坏 zip 内容
    const data = Buffer.from(await fs.readFile(backupPath))
    data[data.length - 50] ^= 0xff
    await fs.writeFile(backupPath, data)

    await expect(importBackup(backupPath, path.join(dir, 'bad.wg'))).rejects.toThrow()
  })
})
```

- [ ] **Step 2: 运行确认失败**

```bash
npx vitest run test/backup.test.ts
```

Expected: FAIL — `Cannot find module '../src/backup.js'`

- [ ] **Step 3: 新建 `packages/core/src/backup.ts`**

```typescript
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { zipSync, unzipSync } from 'fflate'
import { Repo } from './repo.js'
import { sha256 } from './hashes.js'

export interface BackupManifest {
  version: 1
  createdAt: string
  repoName: string
  files: Array<{ path: string; sha256: string }>
}

const EXCLUDE_DIRS = new Set(['journal', 'index'])

export async function exportBackup(repo: Repo, destPath: string): Promise<{ fileCount: number }> {
  const manifest: BackupManifest = {
    version: 1,
    createdAt: new Date().toISOString(),
    repoName: path.basename(repo.root),
    files: [],
  }
  const fileMap: Record<string, Uint8Array> = {}
  await collectFiles(repo.root, repo.root, fileMap, manifest)
  fileMap['_manifest.json'] = new TextEncoder().encode(JSON.stringify(manifest, null, 2))
  await fs.writeFile(destPath, zipSync(fileMap))
  return { fileCount: manifest.files.length }
}

async function collectFiles(
  root: string,
  dir: string,
  out: Record<string, Uint8Array>,
  manifest: BackupManifest,
): Promise<void> {
  let entries: import('node:fs').Dirent[]
  try { entries = await fs.readdir(dir, { withFileTypes: true }) } catch { return }
  for (const e of entries) {
    const abs = path.join(dir, e.name)
    // use forward slashes for zip paths (cross-platform)
    const rel = path.relative(root, abs).split(path.sep).join('/')
    if (e.isDirectory()) {
      if (EXCLUDE_DIRS.has(e.name)) continue
      await collectFiles(root, abs, out, manifest)
    } else if (e.isFile() && !e.name.includes('.tmp-')) {
      const data = new Uint8Array(await fs.readFile(abs))
      const hash = await sha256(data)
      out[rel] = data
      manifest.files.push({ path: rel, sha256: hash })
    }
  }
}

export async function importBackup(srcPath: string, destRoot: string): Promise<Repo> {
  const raw = new Uint8Array(await fs.readFile(srcPath))
  let all: Record<string, Uint8Array>
  try {
    all = unzipSync(raw)
  } catch (e) {
    throw new Error(`备份包解压失败：${(e as Error).message}`)
  }
  const manifestBytes = all['_manifest.json']
  if (!manifestBytes) throw new Error('备份包缺少 _manifest.json')
  const manifest = JSON.parse(new TextDecoder().decode(manifestBytes)) as BackupManifest
  for (const entry of manifest.files) {
    const data = all[entry.path]
    if (!data) throw new Error(`备份包缺少文件：${entry.path}`)
    const actual = await sha256(data)
    if (actual !== entry.sha256) {
      throw new Error(`备份包文件校验失败：${entry.path}（期望 ${entry.sha256}，实际 ${actual}）`)
    }
  }
  await fs.mkdir(destRoot, { recursive: true })
  for (const [relPath, data] of Object.entries(all)) {
    if (relPath === '_manifest.json') continue
    const target = path.join(destRoot, ...relPath.split('/'))
    await fs.mkdir(path.dirname(target), { recursive: true })
    await fs.writeFile(target, data)
  }
  // journal/ not in backup — create it so repo is valid
  await fs.mkdir(path.join(destRoot, 'journal'), { recursive: true })
  return Repo.open(destRoot)
}
```

- [ ] **Step 4: 运行 backup 测试**

```bash
npx vitest run test/backup.test.ts
```

Expected: 2 tests PASS。

- [ ] **Step 5: 运行全量测试 + 类型检查**

```bash
npx vitest run && npx tsc --noEmit && echo "OK"
```

Expected: 56 tests pass，OK。

- [ ] **Step 6: 提交**

```bash
git add packages/core/src/backup.ts packages/core/test/backup.test.ts
git commit -m "feat(core): backup export/import（含校验清单）"
```

---

### Task 5: 崩溃注入验收测试

**Files:**
- Create: `packages/core/test/helpers/crash-worker.ts`（子进程，执行耗时 commit）
- Create: `packages/core/test/crash.test.ts`

**Interfaces:**
- Consumes: `Repo`, `commitDoc` from `../../src/index.js`（crash-worker 用）；所有 M2 source（crash test 用）
- Produces: 2 个测试：①模拟崩溃（filesystem 注入）；②真实子进程 kill（3 次迭代）

- [ ] **Step 1: 新建 `packages/core/test/helpers/crash-worker.ts`**

```typescript
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { Repo, commitDoc } from '../../src/index.js'

const [, , repoDir] = process.argv
if (!repoDir) { process.stderr.write('repoDir required\n'); process.exit(1) }

const repo = await Repo.open(repoDir)
const docPath = path.join(repoDir, 'workspace', 'bigdoc.txt')
// 1MB 的数据 → 约 250 个 CDC chunk → 每次 fsync 约 2s，足够被 kill 打断
await fs.writeFile(docPath, Buffer.alloc(1024 * 1024, 0xab))
await commitDoc(repo, 'bigdoc.txt', { message: 'crash-test', author: 'crash' })
process.exit(0)
```

- [ ] **Step 2: 写 crash 测试**

新建 `packages/core/test/crash.test.ts`：

```typescript
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
// tsx binary at monorepo root node_modules/.bin/
const WORKSPACE_ROOT = fileURLToPath(new URL('../../../..', import.meta.url))
const TSX_BIN = path.join(
  WORKSPACE_ROOT, 'node_modules', '.bin',
  process.platform === 'win32' ? 'tsx.cmd' : 'tsx',
)

let dir: string, repo: Repo
beforeEach(async () => {
  dir = await tmpDir()
  repo = await Repo.init(path.join(dir, '库.wg'), 't')
})
afterEach(async () => { await cleanup(dir) })

/** Repo.open() triggers recoverJournal; then verify clean state. */
async function assertConsistent(repoRoot: string): Promise<void> {
  // Step 1: trigger recovery
  const repo2 = await Repo.open(repoRoot)

  // Step 2: no .tmp files remain
  for (const sub of ['objects/blobs', 'objects/chunks', 'objects/ooxml']) {
    await assertNoTmpFiles(path.join(repoRoot, sub))
  }

  // Step 3: no pending journal entries
  const jEntries = (await fs.readdir(path.join(repoRoot, 'journal')).catch(() => [])).filter(
    (n: string) => n.endsWith('.json'),
  )
  expect(jEntries).toHaveLength(0)

  // Step 4: all refs point to readable commits with readable trees
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

    // 模拟崩溃残留
    const jEntry = path.join(repo.root, 'journal', '99999-abc.json')
    await fs.writeFile(jEntry, JSON.stringify({
      id: '99999-abc', op: 'commit', docName: '论文.docx', branch: 'main',
      startedAt: new Date().toISOString(),
    }))
    const tmpObj = path.join(repo.root, 'objects', 'blobs', 'aa', 'bb', 'orphan.tmp-1-x')
    await fs.mkdir(path.dirname(tmpObj), { recursive: true })
    await fs.writeFile(tmpObj, 'orphan bytes')

    // Recovery + consistency check (Repo.open内部触发 recoverJournal)
    await assertConsistent(repo.root)

    // 原始提交依然可访问
    expect(await readHead(repo, docIdOf('论文.docx'), 'main')).toMatch(/^[0-9a-f]{64}$/)
  })

  it('真实子进程崩溃：随机 kill，仓库保持一致（3 次迭代）', async () => {
    // 初始提交（用于建立基线）
    await fs.writeFile(path.join(repo.root, 'workspace', 'bigdoc.txt'), makeDocxBuf(['init']))
    await commitDoc(repo, 'bigdoc.txt', { message: 'v0', author: 'test' })
    const repoRoot = repo.root

    for (let i = 0; i < 3; i++) {
      const child = spawn(TSX_BIN, [WORKER, repoRoot], { stdio: 'pipe', shell: false })

      // 等待 50-200ms 后 kill（覆盖"commit 进行中"的各个阶段）
      const delay = 50 + Math.floor(Math.random() * 150)
      await new Promise<void>(r => setTimeout(r, delay))
      killTree(child)
      await new Promise<void>(r => child.on('close', r))

      await assertConsistent(repoRoot)
    }
  }, 60_000)
})
```

- [ ] **Step 3: 运行确认失败**

```bash
npx vitest run test/crash.test.ts
```

Expected: FAIL — first test fails (journal/quarantine imports missing or TSX_BIN not found).

- [ ] **Step 4: 验证 tsx binary 路径**

```bash
ls "D:/Users/Desktop/test/word_git/node_modules/.bin/tsx"*
```

如果 Windows 上 tsx.cmd 存在则路径正确。如果不存在，检查：

```bash
ls "D:/Users/Desktop/test/word_git/node_modules/.bin/" | grep tsx
```

根据输出调整 crash.test.ts 中 TSX_BIN 的文件名（tsx 或 tsx.cmd）。

- [ ] **Step 5: 运行 crash 测试**

```bash
npx vitest run test/crash.test.ts
```

Expected: 2 tests PASS（subprocess test 全部 3 次迭代均通过）。

如果子进程测试在某些迭代中失败，检查：
- 如果失败是 `ENOENT`（tsx 找不到）：修正 TSX_BIN 路径
- 如果失败是 "journal not empty"：确认 Repo.open() 调用了 recoverJournal()（Task 1 Step 4）

- [ ] **Step 6: 运行全量测试 + 类型检查**

```bash
npx vitest run && npx tsc --noEmit && echo "OK"
```

Expected: 58 tests pass，OK。

- [ ] **Step 7: 提交**

```bash
git add packages/core/test/helpers/crash-worker.ts packages/core/test/crash.test.ts
git commit -m "test(core): 崩溃注入验收（模拟 + 真实 kill，3 次迭代）"
```

---

### Task 6: M2 全量验证（导出新 API + 测试）

**Files:**
- Modify: `packages/core/src/index.ts`（追加 M2 exports）

**Interfaces:**
- Consumes: journal.ts、quarantine.ts、scrub.ts、backup.ts 的全部公共 API
- Produces: packages/core 公共 API 包含所有 M2 功能；全量测试通过；两包 tsc 0 错误

- [ ] **Step 1: 更新 `packages/core/src/index.ts`**

在现有 `export` 末尾追加：

```typescript
export { openJournal, closeJournal, recoverJournal } from './journal.js'
export type { JournalEntry } from './journal.js'
export { deleteBranchSafe, listQuarantine, restoreFromQuarantine, purgeQuarantine } from './quarantine.js'
export type { QuarantineEntry } from './quarantine.js'
export { scrub } from './scrub.js'
export type { ScrubResult, ScrubCorruption } from './scrub.js'
export { exportBackup, importBackup } from './backup.js'
export type { BackupManifest } from './backup.js'
```

- [ ] **Step 2: 两包类型检查**

```bash
cd packages/core && npx tsc --noEmit && echo "core OK"
cd ../cli && npx tsc --noEmit && echo "cli OK"
```

Expected: 两个 OK，0 errors。

- [ ] **Step 3: 全量测试**

在仓库根目录：

```bash
pnpm test
```

Expected：core 58 tests pass（43 M1 + 4 journal + 5 quarantine + 2 scrub + 2 backup + 2 crash），cli 1 test pass。记录实际数量。

- [ ] **Step 4: 提交**

```bash
git add packages/core/src/index.ts
git commit -m "chore: M2 收尾（导出 journal/quarantine/scrub/backup）"
```

---

## 自查（Self-Review）

**Spec 覆盖检查（§5.5 可靠性机制）：**

| 规格要求 | 对应 Task |
|---|---|
| 断电/崩溃 mid-commit → journal + 原子重命名 → 重启回滚 | Task 1 |
| 误删版本/分支 → 只删引用；实体进 quarantine 保留 30 天 | Task 2 |
| 磁盘静默损坏 → 手动/定期 scrub：全盘校验 sha256 | Task 3 |
| 灾难恢复 → 一键导出完整备份包（含校验清单） | Task 4 |
| 崩溃注入：各阶段 kill，重启后仓库必须一致 | Task 5 |

**Placeholder 扫描：** 无 TBD/TODO/占位符；每步均有完整代码。

**类型一致性：**
- `openJournal` → `Promise<string>`（id）→ 传入 `closeJournal(repo, id)` ✓
- `QuarantineEntry.id` → 传入 `restoreFromQuarantine(repo, entryId)` ✓
- `ScrubResult.corrupted: ScrubCorruption[]` ✓
- `BackupManifest.files: Array<{path,sha256}>` ✓
- `importBackup` 返回 `Promise<Repo>`，可直接传入 `scrub(restored)` ✓
