# M1：core 存储引擎 + CLI 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付 packages/core（纯 TypeScript 文档版本控制引擎：CDC 去重存储、OOXML 感知编码、文档级提交/分支/检出）和最小 CLI，全部测试通过。

**Architecture:** 单 pnpm monorepo；core 零 Electron 依赖（IO 走 Node fs），CDC 采用 buzhash 内容定义分块（不用链式 delta），OOXML 走"解包→逐部件 CDC→清单"编码，refs 原子更新。CLI 仅做参数解析后调用 core。

**Tech Stack:** Node ≥ 22、pnpm（corepack 启用）、TypeScript 5（strict、ESM、nodenext）、vitest 3、fast-check、fflate（zip）、commander（CLI）、tsx（CLI 测试运行器）。

**Spec:** `docs/superpowers/specs/2026-09-28-word-git-design.md`（§5.1–5.3、§9）

## Global Constraints

- Node `>=22`；包管理用 pnpm（仓库根 `packageManager: "pnpm@9.15.0"`，执行 `corepack enable` 后可用）。
- 全部 ESM：每个 package.json 设 `"type": "module"`；TS 相对导入必须带 `.js` 后缀（`module/moduleResolution: nodenext`）。
- `packages/core` **禁止** import `electron`、`node:sqlite`；只允许 Node 内置模块（`node:fs`、`node:crypto`、`node:path`、`node:stream` 等）与 `fflate`。
- 一切对仓库目录的写操作必须原子：临时文件 → fsync → rename；统一走 `writeFileAtomic` / `ObjectStore.put`，禁止裸 `fs.writeFile` 写仓库文件。
- 测试离线可跑；docx/xlsx fixture 用 fflate 程序化生成（见 Task 2 的 helpers），不向仓库提交二进制样例。
- 提交信息用 conventional 前缀（`feat:` / `test:` / `chore:` / `docs:`），中文描述。
- 与 spec 的三处实现决策（执行时如发现冲突以 spec 为准并回报）：
  1. `repo.yaml` 的内容是 JSON（JSON 为 YAML 子集），不引入 yaml 依赖。
  2. OOXML 重建统一用 fflate deflate 重打包（不保留原条目的压缩方式差异），以"部件字节一致、文档可打开"为验收，不追求 zip 字节级一致。
  3. M1 的 `index/` 目录仅占位（CLI 的 log 直接遍历提交图）；SQLite 索引随 M3 GUI 落地。超大 OOXML 文件 M1 允许整文件缓冲，流式硬化归 M2。

---

### Task 0: pnpm monorepo 脚手架

**Files:**
- Create: `package.json`（根）
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `packages/core/package.json`
- Create: `packages/core/tsconfig.json`
- Create: `packages/core/vitest.config.ts`
- Create: `packages/cli/package.json`
- Create: `packages/cli/tsconfig.json`

**Interfaces:**
- Produces: 可运行 `pnpm test`（暂无测试，vitest 应报 "No test files found" 或以空套件通过）与 `pnpm typecheck`。

- [ ] **Step 1: 安装 pnpm 并确认 Node 版本**

Run: `node -v && corepack enable && pnpm -v`
Expected: Node ≥ 22.x，pnpm 9.x。

- [ ] **Step 2: 写根文件**

`package.json`:

```json
{
  "name": "word-git",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@9.15.0",
  "engines": { "node": ">=22" },
  "scripts": {
    "test": "pnpm -r run test",
    "typecheck": "pnpm -r run typecheck"
  }
}
```

`pnpm-workspace.yaml`:

```yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

`tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "sourceMap": true,
    "outDir": "dist"
  }
}
```

- [ ] **Step 3: 写 packages/core 配置**

`packages/core/package.json`:

```json
{
  "name": "@wordgit/core",
  "version": "0.1.0",
  "type": "module",
  "main": "./src/index.ts",
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "fflate": "^0.8.2"
  },
  "devDependencies": {
    "@types/node": "^22.10.0",
    "fast-check": "^3.23.0",
    "typescript": "^5.7.0",
    "vitest": "^3.0.0"
  }
}
```

`packages/core/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "src", "outDir": "dist", "types": ["node"] },
  "include": ["src", "test"]
}
```

`packages/core/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'
export default defineConfig({ test: { include: ['test/**/*.test.ts'] } })
```

- [ ] **Step 4: 写 packages/cli 配置（本任务只建配置，代码 Task 13 写）**

`packages/cli/package.json`:

```json
{
  "name": "@wordgit/cli",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "start": "tsx src/index.ts"
  },
  "dependencies": {
    "@wordgit/core": "workspace:*",
    "commander": "^12.1.0"
  },
  "devDependencies": {
    "@types/node": "^22.10.0",
    "tsx": "^4.19.0",
    "typescript": "^5.7.0",
    "vitest": "^3.0.0"
  }
}
```

`packages/cli/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "src", "outDir": "dist", "types": ["node"] },
  "include": ["src", "test"]
}
```

- [ ] **Step 5: 安装依赖并验证**

Run: `pnpm install && pnpm typecheck`
Expected: 安装成功，typecheck 两个包均无错误（无源码可编译，应静默通过）。

- [ ] **Step 6: Commit**

```bash
git add pnpm-workspace.yaml package.json tsconfig.base.json packages
git commit -m "chore: pnpm monorepo 脚手架（core + cli）"
```

---

### Task 1: Repo 布局与 init/open

**Files:**
- Create: `packages/core/src/repo.ts`
- Create: `packages/core/src/index.ts`
- Test: `packages/core/test/repo.test.ts`

**Interfaces:**
- Produces:
  - `class Repo { readonly root: string; static init(root: string, name: string): Promise<Repo>; static open(root: string): Promise<Repo>; storage(): StorageContext }`
  - `FORMAT_VERSION: number`（=1）
  - `StorageContext { chunks: ObjectStore; blobs: ObjectStore }`（类型在 Task 2 实现，本任务先建 `StorageContext` 接口并返回以 `ObjectStore` 占位的实现——ObjectStore 在 Task 2 落地，本任务 repo.ts 中 `storage()` 暂不引用 ObjectStore，先返回 `{ chunks: null, blobs: null } as unknown as StorageContext` 会违反类型……因此本任务 storage() 直接 `throw new Error('Task 2 实现')`？**不允许占位**。改为：本任务不定义 storage()，Task 2 再加。`Repo` 先暴露 `objectsDir(sub: 'blobs'|'chunks'|'ooxml'): string`。）

修正后的 Produces:
  - `class Repo { readonly root: string; static init(root, name): Promise<Repo>; static open(root): Promise<Repo>; objectsDir(sub: 'blobs' | 'chunks' | 'ooxml'): string }`
  - `FORMAT_VERSION = 1`

- [ ] **Step 1: 写失败测试**

`packages/core/test/repo.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { Repo, FORMAT_VERSION } from '../src/repo.js'

let dir: string
beforeEach(async () => { dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wg-repo-')) })
afterEach(async () => { await fs.rm(dir, { recursive: true, force: true }) })

describe('Repo.init', () => {
  it('创建 spec §5.1 规定的目录布局与 repo.yaml', async () => {
    const repo = await Repo.init(path.join(dir, '库.wg'), '我的文档')
    for (const d of ['journal', 'objects/blobs', 'objects/chunks', 'objects/ooxml',
                     'refs/heads', 'quarantine', 'workspace', 'index']) {
      const st = await fs.stat(path.join(repo.root, d))
      expect(st.isDirectory()).toBe(true)
    }
    const yaml = JSON.parse(await fs.readFile(path.join(repo.root, 'repo.yaml'), 'utf8'))
    expect(yaml.formatVersion).toBe(FORMAT_VERSION)
    expect(yaml.name).toBe('我的文档')
    expect(typeof yaml.createdAt).toBe('string')
  })
})

describe('Repo.open', () => {
  it('打开合法仓库', async () => {
    await Repo.init(path.join(dir, '库.wg'), 'x')
    const repo = await Repo.open(path.join(dir, '库.wg'))
    expect(repo.root).toBe(path.join(dir, '库.wg'))
  })
  it('拒绝更高格式版本的仓库', async () => {
    const root = path.join(dir, '库.wg')
    await Repo.init(root, 'x')
    await fs.writeFile(path.join(root, 'repo.yaml'), JSON.stringify({ formatVersion: 999, name: 'x', createdAt: '' }))
    await expect(Repo.open(root)).rejects.toThrow(/格式版本/)
  })
  it('拒绝非仓库目录', async () => {
    await expect(Repo.open(dir)).rejects.toThrow(/不是 word_git 仓库/)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @wordgit/core test`
Expected: FAIL，`Repo is not defined` / 模块不存在。

- [ ] **Step 3: 实现 repo.ts**

`packages/core/src/repo.ts`:

```ts
import { promises as fs } from 'node:fs'
import path from 'node:path'

export const FORMAT_VERSION = 1

export interface RepoConfig { formatVersion: number; name: string; createdAt: string }

const LAYOUT_DIRS = ['journal', 'objects/blobs', 'objects/chunks', 'objects/ooxml',
  'refs/heads', 'quarantine', 'workspace', 'index']

export class Repo {
  private constructor(readonly root: string) {}

  static async init(root: string, name: string): Promise<Repo> {
    await fs.mkdir(root, { recursive: true })
    for (const d of LAYOUT_DIRS) await fs.mkdir(path.join(root, d), { recursive: true })
    const config: RepoConfig = { formatVersion: FORMAT_VERSION, name, createdAt: new Date().toISOString() }
    const tmp = path.join(root, '.repo.yaml.tmp')
    await fs.writeFile(tmp, JSON.stringify(config, null, 2), 'utf8')
    await fs.rename(tmp, path.join(root, 'repo.yaml'))
    return new Repo(root)
  }

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
    return new Repo(root)
  }

  objectsDir(sub: 'blobs' | 'chunks' | 'ooxml'): string {
    return path.join(this.root, 'objects', sub)
  }
}
```

`packages/core/src/index.ts`:

```ts
export { Repo, FORMAT_VERSION } from './repo.js'
export type { RepoConfig } from './repo.js'
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm --filter @wordgit/core test`
Expected: PASS（3 个用例）。

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/repo.ts packages/core/src/index.ts packages/core/test/repo.test.ts
git commit -m "feat(core): Repo 初始化/打开与目录布局"
```

---

### Task 2: 测试 fixture 助手 + ObjectStore（原子内容寻址存储）

**Files:**
- Create: `packages/core/test/helpers.ts`
- Create: `packages/core/src/hashes.ts`
- Create: `packages/core/src/objectStore.ts`
- Modify: `packages/core/src/index.ts`（导出 ObjectStore、sha256）
- Test: `packages/core/test/objectStore.test.ts`

**Interfaces:**
- Consumes: 无（只依赖 Node 内置模块与 fflate）。
- Produces:
  - `async function sha256(data: Uint8Array): Promise<string>`（hex）
  - `class ObjectStore { constructor(dir: string); put(buf: Uint8Array): Promise<string>; get(id: string): Promise<Uint8Array>; has(id: string): Promise<boolean> }` —— put 返回内容 sha256；两阶段写入（tmp+fsync+rename），并发重复 put 安全。
  - 测试助手：`makeDocxBuf(paragraphs: string[]): Uint8Array`、`editDocxAddParagraph(buf: Uint8Array, text: string): Uint8Array`、`tmpDir(): Promise<string>`、`cleanup(dir)` —— 后续所有任务的测试都用它们。

- [ ] **Step 1: 写 helpers.ts**

`packages/core/test/helpers.ts`:

```ts
import { promises as fs } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { zipSync, unzipSync } from 'fflate'

export async function tmpDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'wg-test-'))
}
export async function cleanup(dir: string): Promise<void> {
  await fs.rm(dir, { recursive: true, force: true })
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

export function makeDocxXml(paragraphs: string[]): string {
  const body = paragraphs.map(t => `<w:p><w:r><w:t>${escapeXml(t)}</w:t></w:r></w:p>`).join('')
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`
}

function docxParts(documentXml: string): Record<string, Uint8Array> {
  const enc = new TextEncoder()
  return {
    '[Content_Types].xml': enc.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`),
    '_rels/.rels': enc.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`),
    'word/document.xml': enc.encode(documentXml),
  }
}

export function makeDocxBuf(paragraphs: string[]): Uint8Array {
  return zipSync(docxParts(makeDocxXml(paragraphs)), { mtime: new Date(0) })
}

export function editDocxAddParagraph(buf: Uint8Array, text: string): Uint8Array {
  const parts = unzipSync(buf)
  const dec = new TextDecoder()
  const enc = new TextEncoder()
  const xml = dec.decode(parts['word/document.xml'])
  parts['word/document.xml'] = enc.encode(
    xml.replace('</w:body>', `<w:p><w:r><w:t>${escapeXml(text)}</w:t></w:r></w:p></w:body>`))
  return zipSync(parts, { mtime: new Date(0) })
}
```

- [ ] **Step 2: 写失败测试**

`packages/core/test/objectStore.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import path from 'node:path'
import { ObjectStore } from '../src/objectStore.js'
import { tmpDir, cleanup } from './helpers.js'

let dir: string
beforeEach(async () => { dir = await tmpDir() })
afterEach(async () => { await cleanup(dir) })

describe('ObjectStore', () => {
  it('put/get 往返，id 等于内容 sha256', async () => {
    const store = new ObjectStore(path.join(dir, 'chunks'))
    const data = new TextEncoder().encode('hello')
    const id = await store.put(data)
    expect(id).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824')
    expect([...await store.get(id)]).toEqual([...data])
  })

  it('相同内容重复 put 返回相同 id 且不报错', async () => {
    const store = new ObjectStore(path.join(dir, 'chunks'))
    const a = await store.put(new Uint8Array([1, 2, 3]))
    const b = await store.put(new Uint8Array([1, 2, 3]))
    expect(a).toBe(b)
    expect(await store.has(a)).toBe(true)
  })

  it('对象按 sha256 分桶存放（ab/cd/…）', async () => {
    const store = new ObjectStore(path.join(dir, 'chunks'))
    const id = await store.put(new TextEncoder().encode('hello'))
    const obj = await store.get(id)
    expect(obj).toBeDefined()
    // 分桶路径前两级为 id 前 4 个字符
    const fs = await import('node:fs/promises')
    const st = await fs.stat(path.join(dir, 'chunks', id.slice(0, 2), id.slice(2, 4), id.slice(4)))
    expect(st.isFile()).toBe(true)
  })
})
```

注意：本任务的实现采用**三级分桶**（`ab/cd/rest`），repo.test.ts 不校验分桶结构，无冲突。

- [ ] **Step 3: 运行测试确认失败**

Run: `pnpm --filter @wordgit/core test`
Expected: FAIL，模块不存在。

- [ ] **Step 4: 实现**

`packages/core/src/hashes.ts`:

```ts
import { createHash } from 'node:crypto'

export async function sha256(data: Uint8Array): Promise<string> {
  return createHash('sha256').update(data).digest('hex')
}
```

`packages/core/src/objectStore.ts`:

```ts
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { deflateSync, inflateSync } from 'fflate'
import { sha256 } from './hashes.js'

// 内容寻址 + deflate 压缩落盘（等价 git loose object）：
// id = 原始字节 sha256；磁盘存 deflateSync(原始字节)，get 时 inflateSync 还原。
// 文本 chunk/manifest/commit 压缩率 3-7×，已压缩的媒体字节膨胀 <0.5%，可忽略。
export class ObjectStore {
  constructor(readonly dir: string) {}

  private pathFor(id: string): string {
    return path.join(this.dir, id.slice(0, 2), id.slice(2, 4), id.slice(4))
  }

  async put(buf: Uint8Array): Promise<string> {
    const id = await sha256(buf)
    const target = this.pathFor(id)
    if (await this.has(id)) return id
    await fs.mkdir(path.dirname(target), { recursive: true })
    const tmp = `${target}.tmp-${process.pid}-${Math.random().toString(36).slice(2)}`
    const fh = await fs.open(tmp, 'w')
    try {
      await fh.write(deflateSync(buf))
      await fh.sync()
    } finally {
      await fh.close()
    }
    try {
      await fs.rename(tmp, target)
    } catch (e) {
      // 并发/重复写入：目标已存在则清理临时文件即可（内容寻址保证同 id 同内容）
      await fs.rm(tmp, { force: true })
      if (!(await this.has(id))) throw e
    }
    return id
  }

  async get(id: string): Promise<Uint8Array> {
    return inflateSync(await fs.readFile(this.pathFor(id)))
  }

  async has(id: string): Promise<boolean> {
    try {
      await fs.access(this.pathFor(id))
      return true
    } catch {
      return false
    }
  }
}
```

在 `packages/core/src/index.ts` 追加：

```ts
export { ObjectStore } from './objectStore.js'
export { sha256 } from './hashes.js'
```

- [ ] **Step 5: 运行测试确认通过**

Run: `pnpm --filter @wordgit/core test`
Expected: 全部 PASS。

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/hashes.ts packages/core/src/objectStore.ts packages/core/src/index.ts packages/core/test/helpers.ts packages/core/test/objectStore.test.ts
git commit -m "feat(core): 内容寻址对象存储（原子写入）与 docx 测试 fixture"
```

---

### Task 3: CDC 分块器（buzhash，内容定义边界）

**Files:**
- Create: `packages/core/src/chunker.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/chunker.test.ts`

**Interfaces:**
- Consumes: 无。
- Produces:
  - `interface Chunk { data: Uint8Array }`
  - `async function* chunkStream(stream: AsyncIterable<Uint8Array>, opts?: { min?: number; avg?: number; max?: number }): AsyncGenerator<Chunk>`
  - 默认值 `min=2048, avg=4096, max=16384`。边界判定：64 位 buzhash 的低 `log2(avg)` 位全 0；不足 min 不切、超过 max 强制切。哈希表由固定种子 PRNG（mulberry32(0x9e3779b9)）生成，保证跨进程/跨机器边界一致。默认值取 4KB 均值的原因：版本场景的典型编辑只新增/改动一句话，块越小单次编辑的边际存储成本越低（≈1-2KB 压缩后），与"改一句话 ≈ 几 KB"的设计目标一致；2MB 论文约 500 块，文件数量可接受。

- [ ] **Step 1: 写失败测试（含 fast-check 属性测试）**

`packages/core/test/chunker.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { chunkStream, type Chunk } from '../src/chunker.js'

async function collect(stream: AsyncIterable<Uint8Array>): Promise<Chunk[]> {
  const out: Chunk[] = []
  for await (const c of chunkStream(stream)) out.push(c)
  return out
}

async function* fromBuffer(buf: Uint8Array, block = 1024): AsyncGenerator<Uint8Array> {
  for (let i = 0; i < buf.length; i += block) yield buf.subarray(i, Math.min(i + block, buf.length))
}

describe('CDC 分块器', () => {
  it('重组后与原内容逐字节一致（属性测试，随机二进制）', async () => {
    await fc.assert(fc.asyncProperty(fc.uint8Array({ minLength: 1, maxLength: 500_000 }), async (buf) => {
      const chunks = await collect(fromBuffer(buf))
      const total = chunks.reduce((n, c) => n + c.data.length, 0)
      expect(total).toBe(buf.length)
      const merged = new Uint8Array(total)
      let off = 0
      for (const c of chunks) { merged.set(c.data, off); off += c.data.length }
      expect([...merged]).toEqual([...buf])
    }), { numRuns: 50 })
  })

  it('块大小落在 [min, max]', async () => {
    const buf = new Uint8Array(500_000)
    for (let i = 0; i < buf.length; i++) buf[i] = (i * 31 + 7) & 0xff
    const chunks = await collect(fromBuffer(buf))
    expect(chunks.length).toBeGreaterThan(3)
    for (const c of chunks) {
      expect(c.data.length).toBeGreaterThanOrEqual(2048)
      expect(c.data.length).toBeLessThanOrEqual(16384)
    }
  })

  it('内容确定性：同一内容块边界完全一致', async () => {
    const buf = new Uint8Array(200_000)
    for (let i = 0; i < buf.length; i++) buf[i] = (i * 13 + 5) & 0xff
    const a = (await collect(fromBuffer(buf))).map(c => c.data.length)
    const b = (await collect(fromBuffer(buf, 4096))).map(c => c.data.length)
    expect(a).toEqual(b)
  })

  it('中部插入只影响插入点附近的分块（前缀块大量复用）', async () => {
    const enc = new TextEncoder()
    const base = new Uint8Array(200_000)
    for (let i = 0; i < base.length; i++) base[i] = (i * 13 + 5) & 0xff
    const insertAt = 100_000
    const head = base.subarray(0, insertAt)
    const tail = base.subarray(insertAt)
    const ins = enc.encode('在论文第三章补充的整整一段新内容，包含足够长的文本以改变边界。'.repeat(20))
    const edited = new Uint8Array(head.length + ins.length + tail.length)
    edited.set(head, 0); edited.set(ins, head.length); edited.set(tail, head.length + ins.length)

    const baseChunks = await collect(fromBuffer(base))
    const editedChunks = await collect(fromBuffer(edited))
    const baseSet = new Map(baseChunks.map(c => [Buffer.from(c.data).toString('hex'), true]))
    const reused = editedChunks.filter(c => baseSet.has(Buffer.from(c.data).toString('hex')))
    // 插入点之后的内容虽然整体后移，但内容定义的边界使绝大多数块仍可复用
    expect(reused.length).toBeGreaterThan(baseChunks.length * 0.8)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @wordgit/core test`
Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现 chunker.ts**

`packages/core/src/chunker.ts`:

```ts
export interface Chunk { data: Uint8Array }

export interface CdcOptions { min?: number; avg?: number; max?: number }

const WINDOW = 32

// 固定种子的确定性随机表：保证任何机器上同一内容产生同一分块边界
function mulberry32(seed: number): () => number {
  let a = seed | 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const TABLE = (() => {
  const rnd = mulberry32(0x9e3779b9)
  const t = new Uint32Array(256)
  for (let i = 0; i < 256; i++) t[i] = (rnd() * 0xffffffff) >>> 0
  return t
})()

function maskFor(avg: number): number {
  // 期望块长 ≈ 2^bits
  const bits = Math.max(8, Math.min(24, Math.round(Math.log2(avg))))
  return (1 << bits) - 1 // 注意：仅用于 bits<=24 的低位掩码；见下方 rotate 注释
}

function rotl(x: number, n: number): number {
  return ((x << n) | (x >>> (32 - n))) | 0
}

class Buzhash {
  private h = 0
  private window = new Uint8Array(WINDOW)
  private pos = 0
  private filled = false

  push(b: number): void {
    this.h = rotl(this.h, 1) ^ TABLE[b]
    const old = this.window[this.pos]
    this.window[this.pos] = b
    this.pos = (this.pos + 1) % WINDOW
    if (this.filled) this.h = this.h ^ rotl(TABLE[old], WINDOW)
    else if (this.pos === 0) this.filled = true
  }

  value(): number {
    // 64 位：高 32 位再混一次，降低低位偏差
    const hi = rotl(this.h, 17) ^ this.h
    return (this.h ^ (hi * 0x9e3779b9)) >>> 0
  }
}

export async function* chunkStream(stream: AsyncIterable<Uint8Array>, opts: CdcOptions = {}): AsyncGenerator<Chunk> {
  const min = opts.min ?? 2048
  const avg = opts.avg ?? 4096
  const max = opts.max ?? 16384
  const mask = maskFor(avg)

  let buf: number[] = []
  const hasher = new Buzhash()
  const flush = (): Chunk => {
    const data = new Uint8Array(buf)
    buf = []
    return { data }
  }

  for await (const block of stream) {
    for (const byte of block) {
      buf.push(byte)
      hasher.push(byte)
      const len = buf.length
      if ((len >= min && (hasher.value() & mask) === 0) || len >= max) {
        yield flush()
      }
    }
  }
  if (buf.length > 0) yield flush()
}
```

说明：`maskFor` 的 `(1 << bits) - 1` 在 bits ≤ 24 时安全；avg 默认 4096（bits=12）远在此范围内。若调整 avg 超过 2^24 需改用 `Math.pow` 实现，当前不需要（YAGNI）。

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm --filter @wordgit/core test`
Expected: 全部 PASS（含 fast-check 属性测试）。

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/chunker.ts packages/core/src/index.ts packages/core/test/chunker.test.ts
git commit -m "feat(core): buzhash 内容定义分块器（CDC）"
```

---

### Task 4: 通用文件编码（generic encoding）

**Files:**
- Create: `packages/core/src/fsutil.ts`
- Create: `packages/core/src/ingest/generic.ts`
- Create: `packages/core/src/ingest/types.ts`
- Create: `packages/core/src/storageContext.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/generic.test.ts`

**Interfaces:**
- Consumes: `ObjectStore`（Task 2）、`chunkStream`（Task 3）、`sha256`（Task 2）、`Repo.objectsDir`（Task 1）。
- Produces:
  - `interface StoredRef { chunks: string[] } | { blob: string }`（types.ts）
  - `interface GenericManifest { encoding: 'generic'; size: number; sha256: string; ref: { chunks: string[] } }`（types.ts）
  - `class StorageContext { chunks: ObjectStore; blobs: ObjectStore; static forRepo(repo: Repo): StorageContext }`（storageContext.ts）
  - `async function readFileBlocks(path: string, blockSize?: number): AsyncGenerator<Uint8Array>`、`async function writeFileAtomic(path: string, data: Uint8Array): Promise<void>`、`function teeHash(stream: AsyncIterable<Uint8Array>): { stream: AsyncIterable<Uint8Array>; digest: () => Promise<string> }`（fsutil.ts）
  - `async function encodeGeneric(ctx: StorageContext, stream: AsyncIterable<Uint8Array>): Promise<GenericManifest>`、`async function materializeGeneric(ctx: StorageContext, m: GenericManifest): Promise<Uint8Array>`（ingest/generic.ts）——`encodeGeneric` 吃字节流（单遍：tee 哈希 + CDC 切块同时完成）；调用方有文件路径时用 `readFileBlocks(path)` 包一层，已有缓冲时用一次性 yield 生成器

- [ ] **Step 1: 写失败测试**

`packages/core/test/generic.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { Repo } from '../src/repo.js'
import { StorageContext } from '../src/storageContext.js'
import { encodeGeneric, materializeGeneric } from '../src/ingest/generic.js'
import { readFileBlocks } from '../src/fsutil.js'
import { tmpDir, cleanup } from './helpers.js'

let dir: string, repo: Repo, ctx: StorageContext
beforeEach(async () => {
  dir = await tmpDir()
  repo = await Repo.init(path.join(dir, '库.wg'), 't')
  ctx = StorageContext.forRepo(repo)
})
afterEach(async () => { await cleanup(dir) })

describe('generic 编码', () => {
  it('编码→物化 往返逐字节一致（1MB 随机内容）', async () => {
    const buf = new Uint8Array(1_000_000)
    for (let i = 0; i < buf.length; i++) buf[i] = (i * 31 + 7) & 0xff
    const p = path.join(dir, 'f.bin')
    await fs.writeFile(p, buf)

    const m = await encodeGeneric(ctx, readFileBlocks(p))
    expect(m.encoding).toBe('generic')
    expect(m.size).toBe(buf.length)
    expect(m.ref.chunks.length).toBeGreaterThan(10)

    const back = await materializeGeneric(ctx, m)
    expect([...back]).toEqual([...buf])
  })

  it('相同文件二次编码复用已有块（无新增对象）', async () => {
    const p = path.join(dir, 'f.bin')
    await fs.writeFile(p, new Uint8Array(100_000).fill(1))
    const m1 = await encodeGeneric(ctx, readFileBlocks(p))
    const m2 = await encodeGeneric(ctx, readFileBlocks(p))
    expect(m2.ref.chunks).toEqual(m1.ref.chunks)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @wordgit/core test`
Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现**

`packages/core/src/fsutil.ts`:

```ts
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'

export async function* readFileBlocks(filePath: string, blockSize = 1024 * 1024): AsyncGenerator<Uint8Array> {
  const fh = await fs.open(filePath, 'r')
  try {
    const buf = Buffer.allocUnsafe(blockSize)
    for (;;) {
      const { bytesRead } = await fh.read(buf, 0, blockSize, null)
      if (bytesRead === 0) return
      yield new Uint8Array(buf.subarray(0, bytesRead))
    }
  } finally {
    await fh.close()
  }
}

export async function writeFileAtomic(target: string, data: Uint8Array): Promise<void> {
  await fs.mkdir(path.dirname(target), { recursive: true })
  const tmp = `${target}.tmp-${process.pid}-${Math.random().toString(36).slice(2)}`
  const fh = await fs.open(tmp, 'w')
  try {
    await fh.write(data)
    await fh.sync()
  } finally {
    await fh.close()
  }
  await fs.rename(tmp, target)
}

export function teeHash(stream: AsyncIterable<Uint8Array>): { stream: AsyncIterable<Uint8Array>; digest: () => Promise<string> } {
  const hash = createHash('sha256')
  const wrapped = (async function* () {
    for await (const b of stream) {
      hash.update(b)
      yield b
    }
  })()
  return {
    stream: wrapped,
    digest: async () => hash.digest('hex'),
  }
}
```

`packages/core/src/storageContext.ts`:

```ts
import { ObjectStore } from './objectStore.js'
import type { Repo } from './repo.js'

export class StorageContext {
  constructor(readonly chunks: ObjectStore, readonly blobs: ObjectStore) {}

  static forRepo(repo: Repo): StorageContext {
    return new StorageContext(new ObjectStore(repo.objectsDir('chunks')), new ObjectStore(repo.objectsDir('blobs')))
  }
}
```

`packages/core/src/ingest/types.ts`:

```ts
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
}

export type FileManifest = GenericManifest | OoxmlManifest
```

`packages/core/src/ingest/generic.ts`:

```ts
import { chunkStream } from '../chunker.js'
import { teeHash } from '../fsutil.js'
import type { StorageContext } from '../storageContext.js'
import type { GenericManifest } from './types.js'

export async function encodeGeneric(ctx: StorageContext, stream: AsyncIterable<Uint8Array>): Promise<GenericManifest> {
  const tee = teeHash(stream)
  const chunks: string[] = []
  let size = 0
  for await (const c of chunkStream(tee.stream)) {
    chunks.push(await ctx.chunks.put(c.data))
    size += c.data.length
  }
  return { encoding: 'generic', size, sha256: await tee.digest(), ref: { chunks } }
}

export async function materializeGeneric(ctx: StorageContext, m: GenericManifest): Promise<Uint8Array> {
  const out = new Uint8Array(m.size)
  let off = 0
  for (const id of m.ref.chunks) {
    const data = await ctx.chunks.get(id)
    out.set(data, off)
    off += data.length
  }
  return out
}
```

在 `packages/core/src/index.ts` 追加：

```ts
export { StorageContext } from './storageContext.js'
export { readFileBlocks, writeFileAtomic, teeHash } from './fsutil.js'
export type { StoredRef, GenericManifest, OoxmlEntry, OoxmlManifest, FileManifest } from './ingest/types.js'
export { encodeGeneric, materializeGeneric } from './ingest/generic.js'
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm --filter @wordgit/core test`
Expected: 全部 PASS。

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/fsutil.ts packages/core/src/storageContext.ts packages/core/src/ingest packages/core/src/index.ts packages/core/test/generic.test.ts
git commit -m "feat(core): 通用文件编码（流式 CDC + 单遍哈希）"
```

---

### Task 5: OOXML 识别、解包与重建

**Files:**
- Create: `packages/core/src/ingest/ooxml.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/ooxml.test.ts`

**Interfaces:**
- Consumes: `StorageContext`、`chunkStream`、`sha256`、`StoredRef/OoxmlManifest`（Task 4）。
- Produces:
  - `function isOoxml(buf: Uint8Array): boolean`（PK 头 + 含 `[Content_Types].xml`）
  - `async function encodeOoxml(ctx: StorageContext, buf: Uint8Array, prev?: OoxmlManifest): Promise<OoxmlManifest>`
  - `async function decodeOoxml(ctx: StorageContext, m: OoxmlManifest): Promise<Uint8Array>`（fflate 重打包，条目顺序 = `m.order`）
  - 规则：与 `prev` 同路径同 sha256 的条目整项复用 `prev` 的 `ref`；`.xml/.rels` 且 < 4096 字节 → 整体 blob，否则对该部件字节 CDC；其余（媒体等）→ 原始字节 CDC。

- [ ] **Step 1: 写失败测试**

`packages/core/test/ooxml.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { unzipSync } from 'fflate'
import path from 'node:path'
import { Repo } from '../src/repo.js'
import { StorageContext } from '../src/storageContext.js'
import { isOoxml, encodeOoxml, decodeOoxml } from '../src/ingest/ooxml.js'
import { tmpDir, cleanup, makeDocxBuf, editDocxAddParagraph } from './helpers.js'

let dir: string, repo: Repo, ctx: StorageContext
beforeEach(async () => {
  dir = await tmpDir()
  repo = await Repo.init(path.join(dir, '库.wg'), 't')
  ctx = StorageContext.forRepo(repo)
})
afterEach(async () => { await cleanup(dir) })

describe('OOXML 识别', () => {
  it('识别 fflate 生成的 docx，拒绝普通文件', () => {
    expect(isOoxml(makeDocxBuf(['标题']))).toBe(true)
    expect(isOoxml(new TextEncoder().encode('not a zip'))).toBe(false)
  })
})

describe('OOXML 编码/解码', () => {
  it('重建后所有部件与原部件逐字节一致', async () => {
    const original = makeDocxBuf(['第一章 绪论', '1.1 研究背景'])
    const m = await encodeOoxml(ctx, original)
    expect(m.encoding).toBe('ooxml')
    expect(m.order).toEqual(['[Content_Types].xml', '_rels/.rels', 'word/document.xml'])

    const rebuilt = await decodeOoxml(ctx, m)
    const a = unzipSync(original)
    const b = unzipSync(rebuilt)
    expect(Object.keys(b).sort()).toEqual(Object.keys(a).sort())
    for (const k of Object.keys(a)) {
      expect(new TextDecoder().decode(b[k])).toBe(new TextDecoder().decode(a[k]))
    }
  })

  it('编辑一个部件后重编码，未变部件复用 ref（零新增存储）', async () => {
    const v1 = makeDocxBuf(['第一章 绪论'])
    const m1 = await encodeOoxml(ctx, v1)
    const before = await countObjects(path.join(dir, '库.wg', 'objects'))

    const v2 = editDocxAddParagraph(v1, '新增的一段正文内容，足够长以越过 CDC 最小块大小。'.repeat(50))
    const m2 = await encodeOoxml(ctx, v2, m1)

    // [Content_Types].xml 与 _rels/.rels 未变 → ref 完全复用
    expect(m2.entries['[Content_Types].xml'].ref).toEqual(m1.entries['[Content_Types].xml'].ref)
    expect(m2.entries['_rels/.rels'].ref).toEqual(m1.entries['_rels/.rels'].ref)
    const after = await countObjects(path.join(dir, '库.wg', 'objects'))
    expect(after.chunks + after.blobs).toBeLessThan(before.chunks + before.blobs + 8)

    const rebuilt = await decodeOoxml(ctx, m2)
    const a = unzipSync(v2)
    const b = unzipSync(rebuilt)
    for (const k of Object.keys(a)) {
      expect(new TextDecoder().decode(b[k])).toBe(new TextDecoder().decode(a[k]))
    }
  })
})

async function countObjects(objectsDir: string) {
  const fs = await import('node:fs/promises')
  async function walk(d: string): Promise<number> {
    let n = 0
    for (const e of await fs.readdir(d, { withFileTypes: true })) {
      if (e.name.includes('.tmp')) continue
      n += e.isDirectory() ? await walk(path.join(d, e.name)) : 1
    }
    return n
  }
  return {
    chunks: await walk(path.join(objectsDir, 'chunks')),
    blobs: await walk(path.join(objectsDir, 'blobs')),
  }
}
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @wordgit/core test`
Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现 ooxml.ts**

`packages/core/src/ingest/ooxml.ts`:

```ts
import { unzipSync, zipSync, type Zippable } from 'fflate'
import { chunkStream } from '../chunker.js'
import { sha256 } from '../hashes.js'
import type { StorageContext } from '../storageContext.js'
import type { OoxmlEntry, OoxmlManifest, StoredRef } from './types.js'

const TEXT_PART_MAX = 4096
const TEXT_EXT = /\.(xml|rels)$/i

export function isOoxml(buf: Uint8Array): boolean {
  if (buf.length < 4 || buf[0] !== 0x50 || buf[1] !== 0x4b || buf[2] !== 3 || buf[3] !== 4) return false
  try {
    const parts = unzipSync(buf, { filter: (f) => f.name === '[Content_Types].xml' })
    return '[Content_Types].xml' in parts
  } catch {
    return false
  }
}

async function* single(buf: Uint8Array): AsyncGenerator<Uint8Array> {
  yield buf
}

async function storeRef(ctx: StorageContext, data: Uint8Array, asText: boolean): Promise<StoredRef> {
  if (asText && data.length < TEXT_PART_MAX) {
    return { blob: await ctx.blobs.put(data) }
  }
  const ids: string[] = []
  for await (const c of chunkStream(single(data))) ids.push(await ctx.chunks.put(c.data))
  return { chunks: ids }
}

async function loadRef(ctx: StorageContext, ref: StoredRef): Promise<Uint8Array> {
  if ('blob' in ref) return ctx.blobs.get(ref.blob)
  const sizes = await Promise.all(ref.chunks.map(async id => (await ctx.chunks.get(id)).length))
  const total = sizes.reduce((a, b) => a + b, 0)
  const out = new Uint8Array(total)
  let off = 0
  for (const id of ref.chunks) {
    const data = await ctx.chunks.get(id)
    out.set(data, off)
    off += data.length
  }
  return out
}

export async function encodeOoxml(ctx: StorageContext, buf: Uint8Array, prev?: OoxmlManifest): Promise<OoxmlManifest> {
  const parts = unzipSync(buf)
  const order = Object.keys(parts)
  const entries: Record<string, OoxmlEntry> = {}
  for (const name of order) {
    const data = parts[name]
    const hash = await sha256(data)
    const prevEntry = prev?.entries[name]
    if (prevEntry && prevEntry.sha256 === hash) {
      entries[name] = { name, sha256: hash, size: data.length, ref: prevEntry.ref }
      continue
    }
    entries[name] = { name, sha256: hash, size: data.length, ref: await storeRef(ctx, data, TEXT_EXT.test(name)) }
  }
  return { encoding: 'ooxml', size: buf.length, sha256: await sha256(buf), order, entries }
}

export async function decodeOoxml(ctx: StorageContext, m: OoxmlManifest): Promise<Uint8Array> {
  const zippable: Zippable = {}
  for (const name of m.order) {
    zippable[name] = await loadRef(ctx, m.entries[name].ref)
  }
  return zipSync(zippable, { mtime: new Date(0) })
}
```

在 `packages/core/src/index.ts` 追加：

```ts
export { isOoxml, encodeOoxml, decodeOoxml } from './ingest/ooxml.js'
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm --filter @wordgit/core test`
Expected: 全部 PASS。

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/ingest/ooxml.ts packages/core/src/index.ts packages/core/test/ooxml.test.ts
git commit -m "feat(core): OOXML 解包/部件级 CDC 编码/重打包重建"
```

---

### Task 6: 入库调度器 + 清单存储 + 全文件快速路径

**Files:**
- Create: `packages/core/src/ingest/index.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/ingest.test.ts`

**Interfaces:**
- Consumes: `isOoxml/encodeOoxml/decodeOoxml`（Task 5）、`encodeGeneric/materializeGeneric`（Task 4）、`teeHash/readFileBlocks`（Task 4）、`writeFileAtomic`（Task 4）、`StorageContext`。
- Produces:
  - `async function encodeFile(ctx: StorageContext, filePath: string, prev?: FileManifest): Promise<FileManifest>`——OOXML 整文件缓冲编码；其余走 generic；OOXML 解析失败自动回退 generic。
  - `async function materializeFile(ctx: StorageContext, m: FileManifest): Promise<Uint8Array>`
  - `async function putManifest(ctx: StorageContext, m: FileManifest): Promise<string>`——canonical JSON 存 blobs，并在 `blobs/index/<fileSha>` 写内容索引（值为 manifest blob id）。
  - `async function getManifest(ctx: StorageContext, blobId: string): Promise<FileManifest>`
  - `async function getManifestByContent(ctx: StorageContext, fileSha: string): Promise<FileManifest | null>`

- [ ] **Step 1: 写失败测试**

`packages/core/test/ingest.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { Repo } from '../src/repo.js'
import { StorageContext } from '../src/storageContext.js'
import { encodeFile, materializeFile, putManifest, getManifest, getManifestByContent } from '../src/ingest/index.js'
import { sha256 } from '../src/hashes.js'
import { tmpDir, cleanup, makeDocxBuf } from './helpers.js'

let dir: string, repo: Repo, ctx: StorageContext
beforeEach(async () => {
  dir = await tmpDir()
  repo = await Repo.init(path.join(dir, '库.wg'), 't')
  ctx = StorageContext.forRepo(repo)
})
afterEach(async () => { await cleanup(dir) })

describe('encodeFile 调度', () => {
  it('docx 走 ooxml 编码，txt 走 generic', async () => {
    const p1 = path.join(dir, 'a.docx')
    await fs.writeFile(p1, makeDocxBuf(['x']))
    const m1 = await encodeFile(ctx, p1)
    expect(m1.encoding).toBe('ooxml')

    const p2 = path.join(dir, 'b.txt')
    await fs.writeFile(p2, 'hello world')
    const m2 = await encodeFile(ctx, p2)
    expect(m2.encoding).toBe('generic')
  })

  it('伪 zip（PK 头但无 Content_Types）回退 generic', async () => {
    const p = path.join(dir, 'fake.docx')
    const bad = new Uint8Array([0x50, 0x4b, 3, 4, ...new TextEncoder().encode('junk')])
    await fs.writeFile(p, bad)
    const m = await encodeFile(ctx, p)
    expect(m.encoding).toBe('generic')
    expect([...await materializeFile(ctx, m)]).toEqual([...bad])
  })
})

describe('清单存储', () => {
  it('put/get/byContent 往返', async () => {
    const p = path.join(dir, 'a.docx')
    await fs.writeFile(p, makeDocxBuf(['内容']))
    const m = await encodeFile(ctx, p)
    const id = await putManifest(ctx, m)
    expect(await getManifest(ctx, id)).toEqual(m)
    expect(await getManifestByContent(ctx, m.sha256)).toEqual(m)
    expect(await getManifestByContent(ctx, '0'.repeat(64))).toBeNull()
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @wordgit/core test`
Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现**

`packages/core/src/ingest/index.ts`:

```ts
import { promises as fsp } from 'node:fs'
import path from 'node:path'
import { readFileBlocks, teeHash, writeFileAtomic } from '../fsutil.js'
import type { StorageContext } from '../storageContext.js'
import { encodeGeneric, materializeGeneric } from './generic.js'
import { decodeOoxml, encodeOoxml, isOoxml } from './ooxml.js'
import type { FileManifest } from './types.js'

export async function encodeFile(ctx: StorageContext, filePath: string, prev?: FileManifest): Promise<FileManifest> {
  // 单遍流式计算全文件 sha256
  const tee = teeHash(readFileBlocks(filePath))
  let buf: Uint8Array | null = null
  for await (const block of tee.stream) {
    if (buf === null) {
      buf = block.slice()
    } else {
      const merged = new Uint8Array(buf.length + block.length)
      merged.set(buf, 0)
      merged.set(block, buf.length)
      buf = merged
    }
    if (buf.length > 64 * 1024 * 1024) {
      // 超大文件：放弃 OOXML 路径，走流式 generic（防内存爆炸）
      const rest: Uint8Array[] = [buf]
      for await (const b of tee.stream) rest.push(b)
      const total = rest.reduce((n, b) => n + b.length, 0)
      const merged = new Uint8Array(total)
      let off = 0
      for (const b of rest) { merged.set(b, off); off += b.length }
      return encodeGeneric(ctx, streamOnce(merged))
    }
  }
  if (buf === null) buf = new Uint8Array(0)
  const fileSha = await tee.digest()

  if (isOoxml(buf)) {
    try {
      const prevOoxml = prev?.encoding === 'ooxml' ? prev : undefined
      const m = await encodeOoxml(ctx, buf, prevOoxml)
      if (m.sha256 !== fileSha) throw new Error('sha256 不一致')
      return m
    } catch {
      // OOXML 解析失败 → 回退通用编码（spec §5.3 第 4 条）
    }
  }
  return encodeGeneric(ctx, streamOnce(buf))
}

async function* streamOnce(buf: Uint8Array): AsyncGenerator<Uint8Array> {
  yield buf
}

export async function materializeFile(ctx: StorageContext, m: FileManifest): Promise<Uint8Array> {
  return m.encoding === 'ooxml' ? decodeOoxml(ctx, m) : materializeGeneric(ctx, m)
}

function canonical(m: FileManifest): string {
  return JSON.stringify(m)
}

export async function putManifest(ctx: StorageContext, m: FileManifest): Promise<string> {
  const id = await ctx.blobs.put(new TextEncoder().encode(canonical(m)))
  // 内容索引：fileSha → manifest blob id（同内容文件跨版本/跨文档去重的关键，spec §5.4）
  await writeFileAtomic(path.join(ctx.blobs.dir, 'index', m.sha256), new TextEncoder().encode(id))
  return id
}

export async function getManifest(ctx: StorageContext, blobId: string): Promise<FileManifest> {
  const raw = await ctx.blobs.get(blobId)
  return JSON.parse(new TextDecoder().decode(raw)) as FileManifest
}

export async function getManifestByContent(ctx: StorageContext, fileSha: string): Promise<FileManifest | null> {
  try {
    const blobId = await fsp.readFile(path.join(ctx.blobs.dir, 'index', fileSha), 'utf8')
    return await getManifest(ctx, blobId.trim())
  } catch {
    return null
  }
}
```

`ObjectStore` 的构造参数属性 `readonly dir` 已是公开只读（Task 2），`ctx.blobs.dir` 直接可用。

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm --filter @wordgit/core test`
Expected: 全部 PASS。

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/ingest/index.ts packages/core/src/index.ts packages/core/test/ingest.test.ts
git commit -m "feat(core): 入库调度（OOXML 识别/回退）与清单内容索引"
```

---

### Task 7: Commit / Tree 对象模型（canonical JSON + sha256 id）

**Files:**
- Create: `packages/core/src/model.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/model.test.ts`

**Interfaces:**
- Consumes: `sha256`（Task 2）、`StorageContext`。
- Produces:
  - `interface Commit { parents: string[]; tree: string; message: string; author: string; createdAt: string }`
  - `interface Tree { entries: Record<string, string> }`（键 = 文档内相对路径，值 = manifest blob id）
  - `function canonicalize(v: unknown): string`（键排序、无空白）
  - `async function commitId(c: Commit): Promise<string>`、`async function treeId(t: Tree): Promise<string>`
  - `async function writeCommit(ctx, c): Promise<string>`、`async function readCommit(ctx, id): Promise<Commit>`、`async function writeTree(ctx, t): Promise<string>`、`async function readTree(ctx, id): Promise<Tree>`

- [ ] **Step 1: 写失败测试**

`packages/core/test/model.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import path from 'node:path'
import { Repo } from '../src/repo.js'
import { StorageContext } from '../src/storageContext.js'
import { canonicalize, commitId, writeCommit, readCommit, writeTree, readTree } from '../src/model.js'
import { tmpDir, cleanup } from './helpers.js'

let dir: string, repo: Repo, ctx: StorageContext
beforeEach(async () => {
  dir = await tmpDir()
  repo = await Repo.init(path.join(dir, '库.wg'), 't')
  ctx = StorageContext.forRepo(repo)
})
afterEach(async () => { await cleanup(dir) })

describe('canonicalize', () => {
  it('键排序后与键序无关', () => {
    expect(canonicalize({ b: 1, a: { d: 2, c: 3 } })).toBe(canonicalize({ a: { c: 3, d: 2 }, b: 1 }))
  })
})

describe('Commit/Tree', () => {
  it('id 由内容决定：相同内容相同 id，不同消息不同 id', async () => {
    const base = { parents: [], tree: 't', author: 'me', createdAt: '2026-09-28T00:00:00Z' }
    expect(await commitId({ ...base, message: 'a' })).toBe(await commitId({ ...base, message: 'a' }))
    expect(await commitId({ ...base, message: 'a' })).not.toBe(await commitId({ ...base, message: 'b' }))
  })

  it('write/read 往返', async () => {
    const tid = await writeTree(ctx, { entries: { '论文.docx': 'abc123' } })
    expect(await readTree(ctx, tid)).toEqual({ entries: { '论文.docx': 'abc123' } })
    const cid = await writeCommit(ctx, {
      parents: [], tree: tid, message: '首版本', author: 'me', createdAt: '2026-09-28T00:00:00Z',
    })
    expect(await readCommit(ctx, cid)).toEqual({
      parents: [], tree: tid, message: '首版本', author: 'me', createdAt: '2026-09-28T00:00:00Z',
    })
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @wordgit/core test`
Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现 model.ts**

`packages/core/src/model.ts`:

```ts
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
```

在 `packages/core/src/index.ts` 追加：

```ts
export { canonicalize, commitId, treeId, writeCommit, readCommit, writeTree, readTree } from './model.js'
export type { Commit, Tree } from './model.js'
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm --filter @wordgit/core test`
Expected: 全部 PASS。

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/model.ts packages/core/src/index.ts packages/core/test/model.test.ts
git commit -m "feat(core): Commit/Tree 对象模型（canonical JSON + 内容寻址）"
```

---

### Task 8: 文档级分支引用（原子读写）

**Files:**
- Create: `packages/core/src/refs.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/refs.test.ts`

**Interfaces:**
- Consumes: `Repo`、`writeFileAtomic`（Task 4）。
- Produces:
  - `function docIds(repo: Repo): Promise<string[]>`（`refs/heads/` 下目录名，URL 解码）
  - `function listBranches(repo: Repo, docId: string): Promise<string[]>`（不含 `HEAD` 文件）
  - `function readHead(repo: Repo, docId: string, branch: string): Promise<string | null>`
  - `function writeHead(repo: Repo, docId: string, branch: string, commitId: string): Promise<void>`（tmp+rename 原子替换）
  - `function readCurrentBranch(repo: Repo, docId: string): Promise<string>`（默认 `main`）
  - `function writeCurrentBranch(repo: Repo, docId: string, branch: string): Promise<void>`
  - `function deleteBranch(repo: Repo, docId: string, branch: string): Promise<void>`
  - docId 规范：`encodeURIComponent(文档显示名)`。

- [ ] **Step 1: 写失败测试**

`packages/core/test/refs.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import path from 'node:path'
import { Repo } from '../src/repo.js'
import { docIds, listBranches, readHead, writeHead, readCurrentBranch, writeCurrentBranch, deleteBranch } from '../src/refs.js'
import { tmpDir, cleanup } from './helpers.js'

let dir: string, repo: Repo
beforeEach(async () => {
  dir = await tmpDir()
  repo = await Repo.init(path.join(dir, '库.wg'), 't')
})
afterEach(async () => { await cleanup(dir) })

describe('分支引用', () => {
  it('write/read/原子替换 head', async () => {
    await writeHead(repo, '论文', 'main', 'c1')
    expect(await readHead(repo, '论文', 'main')).toBe('c1')
    await writeHead(repo, '论文', 'main', 'c2')
    expect(await readHead(repo, '论文', 'main')).toBe('c2')
  })

  it('listBranches 不含 HEAD；docIds 列出所有文档', async () => {
    await writeHead(repo, '论文', 'main', 'c1')
    await writeHead(repo, '论文', '实验分支', 'c2')
    await writeHead(repo, '报告', 'main', 'c3')
    expect(await listBranches(repo, '论文')).toEqual(['main', '实验分支'])
    expect((await docIds(repo)).sort()).toEqual(['报告', '论文'])
  })

  it('当前分支默认 main，可切换；不可删除当前分支', async () => {
    await writeHead(repo, '论文', 'main', 'c1')
    await writeHead(repo, '论文', 'b2', 'c2')
    expect(await readCurrentBranch(repo, '论文')).toBe('main')
    await writeCurrentBranch(repo, '论文', 'b2')
    expect(await readCurrentBranch(repo, '论文')).toBe('b2')
    await expect(deleteBranch(repo, '论文', 'b2')).rejects.toThrow(/当前分支/)
    await deleteBranch(repo, '论文', 'main')
    expect(await listBranches(repo, '论文')).toEqual(['b2'])
  })

  it('不存在的 head 返回 null', async () => {
    expect(await readHead(repo, '不存在', 'main')).toBeNull()
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @wordgit/core test`
Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现 refs.ts**

`packages/core/src/refs.ts`:

```ts
import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { Repo } from './repo.js'
import { writeFileAtomic } from './fsutil.js'

export function docIdOf(name: string): string {
  return encodeURIComponent(name)
}

export function docNameOf(docId: string): string {
  return decodeURIComponent(docId)
}

function headsDir(repo: Repo, docId: string): string {
  return path.join(repo.root, 'refs', 'heads', docId)
}

export async function docIds(repo: Repo): Promise<string[]> {
  const base = path.join(repo.root, 'refs', 'heads')
  try {
    const es = await fs.readdir(base, { withFileTypes: true })
    return es.filter(e => e.isDirectory()).map(e => docNameOf(e.name))
  } catch {
    return []
  }
}

export async function listBranches(repo: Repo, docId: string): Promise<string[]> {
  try {
    const es = await fs.readdir(headsDir(repo, docId), { withFileTypes: true })
    return es.filter(e => e.isFile() && e.name !== 'HEAD').map(e => e.name).sort()
  } catch {
    return []
  }
}

export async function readHead(repo: Repo, docId: string, branch: string): Promise<string | null> {
  try {
    return (await fs.readFile(path.join(headsDir(repo, docId), branch), 'utf8')).trim()
  } catch {
    return null
  }
}

export async function writeHead(repo: Repo, docId: string, branch: string, commitId: string): Promise<void> {
  await writeFileAtomic(path.join(headsDir(repo, docId), branch), new TextEncoder().encode(commitId))
}

export async function readCurrentBranch(repo: Repo, docId: string): Promise<string> {
  try {
    return (await fs.readFile(path.join(headsDir(repo, docId), 'HEAD'), 'utf8')).trim() || 'main'
  } catch {
    return 'main'
  }
}

export async function writeCurrentBranch(repo: Repo, docId: string, branch: string): Promise<void> {
  await writeFileAtomic(path.join(headsDir(repo, docId), 'HEAD'), new TextEncoder().encode(branch))
}

export async function deleteBranch(repo: Repo, docId: string, branch: string): Promise<void> {
  const current = await readCurrentBranch(repo, docId)
  if (branch === current) throw new Error(`不能删除当前分支：${branch}`)
  await fs.rm(path.join(headsDir(repo, docId), branch))
}
```

在 `packages/core/src/index.ts` 追加：

```ts
export { docIds, listBranches, readHead, writeHead, readCurrentBranch, writeCurrentBranch, deleteBranch, docIdOf, docNameOf } from './refs.js'
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm --filter @wordgit/core test`
Expected: 全部 PASS。

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/refs.ts packages/core/src/index.ts packages/core/test/refs.test.ts
git commit -m "feat(core): 文档级分支引用（原子 head 读写）"
```

---

### Task 9: commitDoc（变更检测 → 增量入库 → 提交）

**Files:**
- Create: `packages/core/src/ops.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/commit.test.ts`

**Interfaces:**
- Consumes: 全部前述接口。
- Produces:
  - `interface CommitResult { docId: string; branch: string; commitId: string | null; changed: string[] }`（commitId 为 null 表示无变更）
  - `async function commitDoc(repo: Repo, docName: string, opts: { message: string; author: string; branch?: string }): Promise<CommitResult>`
  - 语义：workspace 中文档对应路径（文件或目录）整体快照为新 tree；逐路径比对当前 head tree，未变路径复用旧 manifest id（零成本），已变/新增路径 `encodeFile(prevManifest)`；无路径变化返回 `{ commitId: null }`；有变更写 tree+commit 并原子更新 head。

- [ ] **Step 1: 写失败测试**

`packages/core/test/commit.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { Repo } from '../src/repo.js'
import { commitDoc } from '../src/ops.js'
import { docIdOf, readHead } from '../src/refs.js'
import { tmpDir, cleanup, makeDocxBuf, editDocxAddParagraph } from './helpers.js'

let dir: string, repo: Repo
beforeEach(async () => {
  dir = await tmpDir()
  repo = await Repo.init(path.join(dir, '库.wg'), 't')
})
afterEach(async () => { await cleanup(dir) })

async function importFile(name: string, buf: Uint8Array): Promise<void> {
  await fs.writeFile(path.join(repo.root, 'workspace', name), buf)
  await commitDoc(repo, name, { message: '导入', author: 'tester' })
}

describe('commitDoc', () => {
  it('首次提交创建 main 分支头', async () => {
    await importFile('论文.docx', makeDocxBuf(['第一章']))
    const head = await readHead(repo, docIdOf('论文.docx'), 'main')
    expect(head).toMatch(/^[0-9a-f]{64}$/)
  })

  it('修改后提交：head 前进、changed 列出变更路径', async () => {
    await importFile('论文.docx', makeDocxBuf(['第一章']))
    const v1 = await readHead(repo, docIdOf('论文.docx'), 'main')
    await fs.writeFile(path.join(repo.root, 'workspace', '论文.docx'),
      editDocxAddParagraph(makeDocxBuf(['第一章']), '新增内容，长度足够以越过 CDC 最小块。'.repeat(20)))
    const r = await commitDoc(repo, '论文.docx', { message: '补充正文', author: 'tester' })
    expect(r.commitId).toMatch(/^[0-9a-f]{64}$/)
    expect(r.changed).toEqual(['论文.docx'])
    expect(await readHead(repo, docIdOf('论文.docx'), 'main')).not.toBe(v1)
  })

  it('无变更时 commitId 为 null', async () => {
    await importFile('论文.docx', makeDocxBuf(['第一章']))
    const r = await commitDoc(repo, '论文.docx', { message: '再提交', author: 'tester' })
    expect(r.commitId).toBeNull()
    expect(r.changed).toEqual([])
  })

  it('workspace 中不存在该文档时报错', async () => {
    await expect(commitDoc(repo, 'ghost.docx', { message: 'x', author: 't' }))
      .rejects.toThrow(/workspace 中不存在/)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @wordgit/core test`
Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现 ops.ts（commitDoc 部分）**

`packages/core/src/ops.ts`:

```ts
import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { Repo } from './repo.js'
import { StorageContext } from './storageContext.js'
import { docIdOf, readCurrentBranch, readHead, writeHead } from './refs.js'
import { encodeFile, getManifest, getManifestByContent, putManifest } from './ingest/index.js'
import type { FileManifest } from './ingest/types.js'
import { readCommit, readTree, writeCommit, writeTree, type Commit, type Tree } from './model.js'
import { readFileBlocks, teeHash } from './fsutil.js'

export interface CommitResult {
  docId: string
  branch: string
  commitId: string | null
  changed: string[]
}

async function sha256File(p: string): Promise<string> {
  const tee = teeHash(readFileBlocks(p))
  for await (const _ of tee.stream) { /* 仅消费 */ }
  return tee.digest()
}

async function collectDocPaths(abs: string, rel: string, out: string[]): Promise<void> {
  const st = await fs.stat(abs)
  if (st.isDirectory()) {
    for (const e of await fs.readdir(abs)) {
      await collectDocPaths(path.join(abs, e), rel ? `${rel}/${e}` : e, out)
    }
  } else {
    out.push(rel)
  }
}

export async function commitDoc(repo: Repo, docName: string, opts: { message: string; author: string; branch?: string }): Promise<CommitResult> {
  const docId = docIdOf(docName)
  const branch = opts.branch ?? await readCurrentBranch(repo, docId)
  const ctx = StorageContext.forRepo(repo)
  const docAbs = path.join(repo.root, 'workspace', docName)
  try {
    await fs.stat(docAbs)
  } catch {
    throw new Error(`workspace 中不存在文档：${docName}`)
  }

  // 当前 head 的 tree（可能不存在 = 首次提交）
  const headId = await readHead(repo, docId, branch)
  let prevTree: Tree = { entries: {} }
  if (headId) {
    prevTree = await readTree(ctx, (await readCommit(ctx, headId)).tree)
  }

  // 收集 workspace 中该文档的所有路径
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
        changed.push(rel)
      }
    } else {
      // 新增路径：先查全文件快速路径（内容相同的全局去重）
      const existing = await getManifestByContent(ctx, fileSha)
      manifestId = existing ? await putManifest(ctx, existing) : await putManifest(ctx, await encodeFile(ctx, abs))
      changed.push(rel)
    }
    entries[rel] = manifestId!
  }

  if (changed.length === 0) {
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
  return { docId, branch, commitId: cid, changed }
}
```

说明：M1 删除整条文档（workspace 中整个删除）不支持差异删除（tree 只含现存路径；旧路径自然消失于新 tree，这是 git 语义正确行为）。首次提交时 HEAD 文件不存在，`readCurrentBranch` 返回默认 `main`；`switchBranch`（Task 11）之后，不带 `branch` 参数的提交自动进入当前分支。

在 `packages/core/src/index.ts` 追加：

```ts
export { commitDoc } from './ops.js'
export type { CommitResult } from './ops.js'
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm --filter @wordgit/core test`
Expected: 全部 PASS。

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/ops.ts packages/core/src/index.ts packages/core/test/commit.test.ts
git commit -m "feat(core): commitDoc 变更检测与增量入库提交"
```

---

### Task 10: checkout（物化任意提交到工作区）

**Files:**
- Modify: `packages/core/src/ops.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/checkout.test.ts`

**Interfaces:**
- Consumes: Task 2–9 全部。
- Produces:
  - `async function checkoutDoc(repo: Repo, docName: string, opts: { branch?: string; commitId?: string }): Promise<{ docId: string; commitId: string }>`——`commitId` 优先；否则取分支 head；把该提交 tree 物化到 workspace（多余文件删除、变更文件原子写）。

- [ ] **Step 1: 写失败测试**

`packages/core/test/checkout.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { Repo } from '../src/repo.js'
import { commitDoc, checkoutDoc } from '../src/ops.js'
import { docIdOf, readHead, writeHead } from '../src/refs.js'
import { tmpDir, cleanup, makeDocxBuf, editDocxAddParagraph } from './helpers.js'

let dir: string, repo: Repo
beforeEach(async () => {
  dir = await tmpDir()
  repo = await Repo.init(path.join(dir, '库.wg'), 't')
})
afterEach(async () => { await cleanup(dir) })

const docPath = () => path.join(repo.root, 'workspace', '论文.docx')

describe('checkoutDoc', () => {
  it('检出旧提交后工作区恢复为该版本字节', async () => {
    const v1 = makeDocxBuf(['第一章'])
    await fs.writeFile(docPath(), v1)
    await commitDoc(repo, '论文.docx', { message: 'v1', author: 't' })
    const c1 = await readHead(repo, docIdOf('论文.docx'), 'main')

    await fs.writeFile(docPath(), editDocxAddParagraph(v1, '后来的大量修改内容。'.repeat(100)))
    await commitDoc(repo, '论文.docx', { message: 'v2', author: 't' })

    await checkoutDoc(repo, '论文.docx', { commitId: c1! })
    expect([...(await fs.readFile(docPath()))]).toEqual([...v1])
  })

  it('检出其他分支 head', async () => {
    const v1 = makeDocxBuf(['主线内容'])
    await fs.writeFile(docPath(), v1)
    await commitDoc(repo, '论文.docx', { message: 'v1', author: 't' })
    const c1 = (await readHead(repo, docIdOf('论文.docx'), 'main'))!

    await writeHead(repo, docIdOf('论文.docx'), '实验', c1)
    const branched = editDocxAddParagraph(makeDocxBuf(['主线内容']), '实验分支独有的段落。'.repeat(50))
    await fs.writeFile(docPath(), branched)
    await commitDoc(repo, '论文.docx', { message: '实验改动', author: 't', branch: '实验' })

    await checkoutDoc(repo, '论文.docx', { branch: 'main' })
    expect([...(await fs.readFile(docPath()))]).toEqual([...v1])
  })

  it('检出时删除工作区中不属于该提交的多余文件', async () => {
    const docDir = path.join(repo.root, 'workspace', '资料')
    await fs.mkdir(docDir, { recursive: true })
    await fs.writeFile(path.join(docDir, 'a.txt'), 'A')
    await commitDoc(repo, '资料', { message: 'v1', author: 't' })

    // 工作区混入一个不属于任何提交的多余文件
    const stray = path.join(docDir, 'stray.txt')
    await fs.writeFile(stray, '多余')

    await checkoutDoc(repo, '资料', { branch: 'main' })
    await expect(fs.stat(stray)).rejects.toThrow()
    expect(await fs.readFile(path.join(docDir, 'a.txt'), 'utf8')).toBe('A')
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @wordgit/core test`
Expected: FAIL，`checkoutDoc is not defined`（或类似导出错误）。

- [ ] **Step 3: 实现**

在 `packages/core/src/ops.ts` 追加（`materializeFile` 合并进 Task 9 已有的 `./ingest/index.js` 导入行；`readCurrentBranch` 合并进 `./refs.js` 导入行）：

```ts
export async function checkoutDoc(repo: Repo, docName: string, opts: { branch?: string; commitId?: string }): Promise<{ docId: string; commitId: string }> {
  const docId = docIdOf(docName)
  const ctx = StorageContext.forRepo(repo)
  const branch = opts.branch ?? await readCurrentBranch(repo, docId)
  const commitId = opts.commitId ?? await readHead(repo, docId, branch)
  if (!commitId) throw new Error(`没有可检出的提交（branch=${branch}）`)

  const commit = await readCommit(ctx, commitId)
  const tree = await readTree(ctx, commit.tree)
  const docAbs = path.join(repo.root, 'workspace', docName)

  // 物化全部条目（原子写；writeFileAtomic 自建父目录）
  for (const [rel, manifestId] of Object.entries(tree.entries)) {
    const m = await getManifest(ctx, manifestId)
    const data = await materializeFile(ctx, m)
    await writeFileAtomic(path.join(docAbs, rel), data)
  }

  // 删除工作区中不属于该 tree 的多余文件（目录型文档）
  const keep = new Set(Object.keys(tree.entries))
  const present: string[] = []
  await collectDocPaths(docAbs, '', present)
  for (const rel of present) {
    if (!keep.has(rel)) await fs.rm(path.join(docAbs, rel))
  }
  return { docId, commitId }
}
```

（`getManifest` Task 9 已导入；单文件文档的 rel 为 `''`，`keep` 含 `''`，不会误删。文件/目录类型互换的边界情况 M1 不支持——同一文档名在 M1 生命周期内类型固定。）

在 `packages/core/src/index.ts` 追加：

```ts
export { checkoutDoc } from './ops.js'
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm --filter @wordgit/core test`
Expected: 全部 PASS。

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/ops.ts packages/core/src/index.ts packages/core/test/checkout.test.ts
git commit -m "feat(core): checkoutDoc 任意提交物化到工作区"
```

---

### Task 11: importDoc / listCommits / 分支操作

**Files:**
- Modify: `packages/core/src/ops.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/ops.test.ts`

**Interfaces:**
- Consumes: 前述全部。
- Produces:
  - `async function importDoc(repo: Repo, sourcePath: string, name?: string): Promise<{ docId: string; commitId: string }>`——把外部文件/目录复制进 workspace 并做首提交（默认分支 main）。
  - `interface CommitNode { id: string; parents: string[]; message: string; author: string; createdAt: string }`
  - `async function listCommits(repo: Repo, docName: string, branch?: string): Promise<CommitNode[]>`（从 head 沿 parents 回溯）
  - `async function createBranch(repo: Repo, docName: string, branch: string, from?: { branch?: string; commitId?: string }): Promise<void>`
  - `async function switchBranch(repo: Repo, docName: string, branch: string): Promise<void>`（写 HEAD + checkoutDoc）

- [ ] **Step 1: 写失败测试**

`packages/core/test/ops.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { Repo } from '../src/repo.js'
import { importDoc, commitDoc, listCommits, createBranch, switchBranch } from '../src/ops.js'
import { readHead, listBranches, readCurrentBranch } from '../src/refs.js'
import { StorageContext } from '../src/storageContext.js'
import { readCommit, readTree } from '../src/model.js'
import { tmpDir, cleanup, makeDocxBuf, editDocxAddParagraph } from './helpers.js'

let dir: string, repo: Repo
beforeEach(async () => {
  dir = await tmpDir()
  repo = await Repo.init(path.join(dir, '库.wg'), 't')
})
afterEach(async () => { await cleanup(dir) })

describe('importDoc', () => {
  it('导入外部文件为首版本并复制进 workspace', async () => {
    const src = path.join(dir, '外部.docx')
    await fs.writeFile(src, makeDocxBuf(['导入我']))
    const { docId, commitId } = await importDoc(repo, src)
    expect(docId).toBe(encodeURIComponent('外部.docx'))
    expect(commitId).toMatch(/^[0-9a-f]{64}$/)
    expect(await readHead(repo, docId, 'main')).toBe(commitId)
    const wsFile = path.join(repo.root, 'workspace', '外部.docx')
    expect([...(await fs.readFile(wsFile))]).toEqual([...(await fs.readFile(src))])
  })

  it('name 参数覆盖入库名', async () => {
    const src = path.join(dir, 'a.docx')
    await fs.writeFile(src, makeDocxBuf(['内容']))
    const { docId } = await importDoc(repo, src, '论文.docx')
    expect(docId).toBe(encodeURIComponent('论文.docx'))
    await fs.stat(path.join(repo.root, 'workspace', '论文.docx'))
  })

  it('导入目录作为一篇文档', async () => {
    const srcDir = path.join(dir, '资料')
    await fs.mkdir(srcDir)
    await fs.writeFile(path.join(srcDir, 'a.txt'), 'A')
    await fs.writeFile(path.join(srcDir, 'b.txt'), 'B')
    const { docId, commitId } = await importDoc(repo, srcDir)
    expect(docId).toBe(encodeURIComponent('资料'))
    expect(commitId).toMatch(/^[0-9a-f]{64}$/)
    const ctx = StorageContext.forRepo(repo)
    const tree = await readTree(ctx, (await readCommit(ctx, commitId)).tree)
    expect(Object.keys(tree.entries).sort()).toEqual(['a.txt', 'b.txt'])
  })

  it('workspace 中已存在同名文档时报错', async () => {
    const src = path.join(dir, 'a.docx')
    await fs.writeFile(src, makeDocxBuf(['x']))
    await importDoc(repo, src)
    await expect(importDoc(repo, src)).rejects.toThrow(/已存在/)
  })
})

describe('listCommits', () => {
  it('从 head 沿 parents 回溯，新→旧', async () => {
    const wsFile = path.join(repo.root, 'workspace', '论文.docx')
    const v1 = makeDocxBuf(['第一版'])
    await fs.writeFile(wsFile, v1)
    await commitDoc(repo, '论文.docx', { message: 'v1', author: 't' })
    await fs.writeFile(wsFile, editDocxAddParagraph(v1, '第二版新增。'.repeat(30)))
    await commitDoc(repo, '论文.docx', { message: 'v2', author: 't' })

    const commits = await listCommits(repo, '论文.docx')
    expect(commits.map(c => c.message)).toEqual(['v2', 'v1'])
    expect(commits[0].parents).toEqual([commits[1].id])
    expect(commits[1].parents).toEqual([])
    for (const c of commits) {
      expect(c.id).toMatch(/^[0-9a-f]{64}$/)
      expect(c.createdAt).toBeTruthy()
    }
  })

  it('无提交时返回空数组', async () => {
    expect(await listCommits(repo, '不存在的.docx')).toEqual([])
  })
})

describe('createBranch / switchBranch', () => {
  async function seedMain(): Promise<Uint8Array> {
    const wsFile = path.join(repo.root, 'workspace', '论文.docx')
    const v1 = makeDocxBuf(['主线内容'])
    await fs.writeFile(wsFile, v1)
    await commitDoc(repo, '论文.docx', { message: 'm1', author: 't' })
    return v1
  }

  it('createBranch 从当前 head 建分支；switchBranch 切换并物化工作区', async () => {
    const v1 = await seedMain()
    const docId = encodeURIComponent('论文.docx')

    await createBranch(repo, '论文.docx', 'experiment')
    expect(await listBranches(repo, docId)).toEqual(['experiment', 'main'])

    // 在 experiment 分支上提交
    const wsFile = path.join(repo.root, 'workspace', '论文.docx')
    await fs.writeFile(wsFile, editDocxAddParagraph(v1, '实验分支段落。'.repeat(40)))
    await commitDoc(repo, '论文.docx', { message: 'e1', author: 't', branch: 'experiment' })

    // 切回 main：工作区字节恢复为 v1
    await switchBranch(repo, '论文.docx', 'main')
    expect(await readCurrentBranch(repo, docId)).toBe('main')
    expect([...(await fs.readFile(wsFile))]).toEqual([...v1])

    // 切到 experiment：工作区为实验版本
    await switchBranch(repo, '论文.docx', 'experiment')
    expect(await readCurrentBranch(repo, docId)).toBe('experiment')
    expect([...(await fs.readFile(wsFile))]).not.toEqual([...v1])
  })

  it('createBranch 可用 from.commitId 指定历史起点', async () => {
    const wsFile = path.join(repo.root, 'workspace', '论文.docx')
    const v1 = makeDocxBuf(['v1'])
    await fs.writeFile(wsFile, v1)
    await commitDoc(repo, '论文.docx', { message: 'v1', author: 't' })
    const c1 = (await readHead(repo, encodeURIComponent('论文.docx'), 'main'))!
    await fs.writeFile(wsFile, editDocxAddParagraph(v1, 'v2 内容。'.repeat(30)))
    await commitDoc(repo, '论文.docx', { message: 'v2', author: 't' })

    await createBranch(repo, '论文.docx', 'old', { commitId: c1 })
    const commits = await listCommits(repo, '论文.docx', 'old')
    expect(commits.map(c => c.message)).toEqual(['v1'])
  })

  it('分支重名 / 无起点 / 切换到不存在分支均报错', async () => {
    await seedMain()
    await createBranch(repo, '论文.docx', 'experiment')
    await expect(createBranch(repo, '论文.docx', 'experiment')).rejects.toThrow(/已存在/)
    await expect(switchBranch(repo, '论文.docx', 'ghost')).rejects.toThrow(/不存在/)
    await expect(createBranch(repo, '不存在的.docx', 'b')).rejects.toThrow(/没有可指向的提交/)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @wordgit/core test`
Expected: FAIL，`importDoc is not defined`（或类似导出错误）。

- [ ] **Step 3: 实现**

在 `packages/core/src/ops.ts` 追加（`readCurrentBranch`、`writeCurrentBranch` 合并进 `./refs.js` 导入行；`readCommit` 已在 Task 9 导入）：

```ts
export async function importDoc(repo: Repo, sourcePath: string, name?: string): Promise<{ docId: string; commitId: string }> {
  const docName = name ?? path.basename(sourcePath)
  const dest = path.join(repo.root, 'workspace', docName)
  const exists = await fs.stat(dest).then(() => true, () => false)
  if (exists) throw new Error(`workspace 中已存在文档：${docName}`)
  await fs.mkdir(path.dirname(dest), { recursive: true })
  const st = await fs.stat(sourcePath)
  if (st.isDirectory()) {
    await fs.cp(sourcePath, dest, { recursive: true })
  } else {
    await fs.copyFile(sourcePath, dest)
  }
  const r = await commitDoc(repo, docName, { message: '导入', author: 'import' })
  if (!r.commitId) throw new Error(`导入未产生提交：${docName}`)
  return { docId: r.docId, commitId: r.commitId }
}

export interface CommitNode {
  id: string
  parents: string[]
  message: string
  author: string
  createdAt: string
}

export async function listCommits(repo: Repo, docName: string, branch?: string): Promise<CommitNode[]> {
  const docId = docIdOf(docName)
  const ctx = StorageContext.forRepo(repo)
  let id = await readHead(repo, docId, branch ?? await readCurrentBranch(repo, docId))
  const out: CommitNode[] = []
  while (id) {
    const c = await readCommit(ctx, id)
    out.push({ id, parents: c.parents, message: c.message, author: c.author, createdAt: c.createdAt })
    id = c.parents[0] ?? null
  }
  return out
}

export async function createBranch(repo: Repo, docName: string, branch: string, from?: { branch?: string; commitId?: string }): Promise<void> {
  const docId = docIdOf(docName)
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(branch)) throw new Error(`分支名不合法：${branch}`)
  if (await readHead(repo, docId, branch)) throw new Error(`分支已存在：${branch}`)
  const base = from?.commitId
    ?? await readHead(repo, docId, from?.branch ?? await readCurrentBranch(repo, docId))
  if (!base) throw new Error('没有可指向的提交（请先提交首版本）')
  await writeHead(repo, docId, branch, base)
}

export async function switchBranch(repo: Repo, docName: string, branch: string): Promise<void> {
  const docId = docIdOf(docName)
  if (!(await readHead(repo, docId, branch))) throw new Error(`分支不存在：${branch}`)
  await writeCurrentBranch(repo, docId, branch)
  await checkoutDoc(repo, docName, { branch })
}
```

说明：M1 提交链为单父链，`listCommits` 只沿 `parents[0]` 回溯（多父合并不在 M1 范围）。`importDoc` 用 `fs.cp`（Node ≥16.7）递归复制目录。

在 `packages/core/src/index.ts` 追加：

```ts
export { importDoc, listCommits, createBranch, switchBranch } from './ops.js'
export type { CommitNode } from './ops.js'
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm --filter @wordgit/core test`
Expected: 全部 PASS。

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/ops.ts packages/core/src/index.ts packages/core/test/ops.test.ts
git commit -m "feat(core): importDoc/listCommits/分支创建与切换"
```

---

### Task 12: 验收——50 版本相似 docx 的存储去重

**Files:**
- Test: `packages/core/test/acceptance.dedup.test.ts`

**Interfaces:**
- Consumes: 全部前述接口。前置条件已满足：helpers 与 `decodeOoxml` 的 `zipSync` 均固定 `mtime: new Date(0)`（Task 2/5），重建 zip 与原始 zip 字节一致；ObjectStore deflate 压缩（Task 2）；CDC 默认 2048/4096/16384（Task 3）。
- Produces: 无新接口。这是设计文档 §9 属性测试对应的验收测试：正确性（每版本字节可还原）+ 去重效果（对象总量远小于 50 份全量）。

- [ ] **Step 1: 写验收测试**

`packages/core/test/acceptance.dedup.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { Repo } from '../src/repo.js'
import { commitDoc, checkoutDoc, listCommits } from '../src/ops.js'
import { tmpDir, cleanup, makeDocxBuf, editDocxAddParagraph } from './helpers.js'

async function dirSize(p: string): Promise<number> {
  let n = 0
  for (const e of await fs.readdir(p, { withFileTypes: true })) {
    const full = path.join(p, e.name)
    n += e.isDirectory() ? await dirSize(full) : (await fs.stat(full)).size
  }
  return n
}

// 确定性伪随机句子（不用 Math.random，保证测试可复现）
const WORDS = '的 了 在 是 我 有 和 就 不 人 都 一 上 也 很 到 说 要 去 会 着 看 好 这 那 与 及 或 但 而 因为 所以'.split(' ')
function randomSentence(seed: number): string {
  let s = (seed * 2654435761) % 2147483647
  const out: string[] = []
  for (let i = 0; i < 14; i++) {
    s = (s * 48271) % 2147483647
    out.push(WORDS[s % WORDS.length])
  }
  return out.join('')
}

describe('验收：50 个相似版本的存储去重', () => {
  it('每个版本字节可还原，且对象总量 < 50 份全量的 10%', async () => {
    const dir = await tmpDir()
    try {
      const repo = await Repo.init(path.join(dir, '库.wg'), 't')
      const wsFile = path.join(repo.root, 'workspace', '论文.docx')
      const versions: Uint8Array[] = []

      // 约 4000 段不可高压缩的正文（≈130KB 文本），模拟真实论文第一章
      let buf = makeDocxBuf(Array.from({ length: 4000 }, (_, i) => `段落 ${i}：${randomSentence(i)}`))
      versions.push(buf)
      await fs.writeFile(wsFile, buf)
      await commitDoc(repo, '论文.docx', { message: 'v0', author: 't' })

      // 49 个版本：每次只在文末加一句话
      for (let v = 1; v < 50; v++) {
        buf = editDocxAddParagraph(buf, `版本 ${v} 只新增这一句话。`)
        versions.push(buf)
        await fs.writeFile(wsFile, buf)
        await commitDoc(repo, '论文.docx', { message: `v${v}`, author: 't' })
      }

      // 去重效果：objects/ 总量 < 50 × 最终版本大小的 10%（即至少 10× 节省）
      const finalSize = versions[49].length
      const stored = await dirSize(path.join(repo.root, 'objects'))
      expect(stored).toBeLessThan(finalSize * 50 * 0.1)

      // 正确性：50 个版本逐个字节还原
      const commits = await listCommits(repo, '论文.docx')
      expect(commits).toHaveLength(50)
      for (let i = 0; i < 50; i++) {
        await checkoutDoc(repo, '论文.docx', { commitId: commits[49 - i].id })
        expect([...(await fs.readFile(wsFile))]).toEqual([...versions[i]])
      }
    } finally {
      await cleanup(dir)
    }
  }, 120000)
})
```

- [ ] **Step 2: 运行测试确认通过**

Run: `pnpm --filter @wordgit/core test test/acceptance.dedup.test.ts`
Expected: PASS。若去重断言失败，用 `console.log(stored, finalSize)` 定位：期望 stored ≈ 基础块（压缩后 ≈文本量 1/3）+ 49 × 单块（压缩后 1-2KB）+ manifest（每版本 <2KB），应远在阈值内。

- [ ] **Step 3: Commit**

```bash
git add packages/core/test/acceptance.dedup.test.ts
git commit -m "test(core): 50 版本去重验收（字节还原 + 存储远小于全量副本）"
```

---

### Task 13: CLI（packages/cli，commander）

**Files:**
- Create: `packages/cli/src/index.ts`
- Test: `packages/cli/test/cli.test.ts`

**Interfaces:**
- Consumes: `@wordgit/core` 全部公开接口（`Repo`、`importDoc`、`commitDoc`、`listCommits`、`createBranch`、`switchBranch`、`checkoutDoc`、`listBranches`、`docIdOf`——Task 1/8/9/10/11 已导出）。
- Produces: 命令 `wordgit init|import|commit|log|checkout|branch`，均输出 JSON（log 默认人类可读、`--json` 输出 JSON），供 M3 GUI 之前的终端使用与集成测试驱动。

- [ ] **Step 1: 写失败测试**

`packages/cli/test/cli.test.ts`:

```ts
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
  }, 60000)
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @wordgit/cli test`
Expected: FAIL，`src/index.ts` 不存在（tsx 报错）。

- [ ] **Step 3: 实现 CLI**

`packages/cli/src/index.ts`:

```ts
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { Command } from 'commander'
import {
  Repo,
  importDoc, commitDoc, listCommits, createBranch, switchBranch, checkoutDoc,
  listBranches, docIdOf,
} from '@wordgit/core'

export function buildProgram(): Command {
  const program = new Command()
  program.name('wordgit').description('word_git 命令行（M1）')

  program.command('init')
    .argument('<库路径>', '仓库目录，如 论文库.wg')
    .action(async (p: string) => {
      const repo = await Repo.init(p, path.basename(p))
      console.log(JSON.stringify({ root: repo.root }))
    })

  program.command('import')
    .argument('<库路径>')
    .argument('<外部路径>', '要导入的文件或目录')
    .option('--name <文档名>', '入库名（默认取文件名）')
    .action(async (p: string, src: string, opts: { name?: string }) => {
      const repo = await Repo.open(p)
      console.log(JSON.stringify(await importDoc(repo, src, opts.name)))
    })

  program.command('commit')
    .argument('<库路径>')
    .argument('<文档名>')
    .requiredOption('-m, --message <信息>')
    .option('--author <作者>', 'unknown')
    .option('--branch <分支>')
    .action(async (p: string, doc: string, opts: { message: string; author: string; branch?: string }) => {
      const repo = await Repo.open(p)
      console.log(JSON.stringify(await commitDoc(repo, doc, {
        message: opts.message, author: opts.author, branch: opts.branch,
      })))
    })

  program.command('log')
    .argument('<库路径>')
    .argument('<文档名>')
    .option('--branch <分支>')
    .option('--json', '输出 JSON', false)
    .action(async (p: string, doc: string, opts: { branch?: string; json: boolean }) => {
      const repo = await Repo.open(p)
      const commits = await listCommits(repo, doc, opts.branch)
      if (opts.json) {
        console.log(JSON.stringify(commits))
      } else {
        for (const c of commits) console.log(`${c.id.slice(0, 8)}  ${c.createdAt}  ${c.message}`)
      }
    })

  program.command('checkout')
    .argument('<库路径>')
    .argument('<文档名>')
    .option('--branch <分支>')
    .option('--commit <提交ID>')
    .action(async (p: string, doc: string, opts: { branch?: string; commit?: string }) => {
      const repo = await Repo.open(p)
      console.log(JSON.stringify(await checkoutDoc(repo, doc, { branch: opts.branch, commitId: opts.commit })))
    })

  program.command('branch')
    .argument('<库路径>')
    .argument('<文档名>')
    .argument('[分支名]', '缺省则列出分支')
    .option('--from-commit <提交ID>', '指定起点提交')
    .option('--switch', '创建后切换过去', false)
    .action(async (p: string, doc: string, name: string | undefined, opts: { fromCommit?: string; switch: boolean }) => {
      const repo = await Repo.open(p)
      if (!name) {
        console.log(JSON.stringify(await listBranches(repo, docIdOf(doc))))
        return
      }
      await createBranch(repo, doc, name, opts.fromCommit ? { commitId: opts.fromCommit } : undefined)
      if (opts.switch) await switchBranch(repo, doc, name)
      console.log(JSON.stringify({ created: name, switched: opts.switch }))
    })

  return program
}

const isMain = process.argv[1] !== undefined
  && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) {
  buildProgram().parseAsync(process.argv).catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  })
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm --filter @wordgit/cli test`
Expected: PASS（首次 tsx 启动较慢，已给 60s 超时）。

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/index.ts packages/cli/test/cli.test.ts
git commit -m "feat(cli): init/import/commit/log/checkout/branch 命令"
```

---

### Task 14: M1 全量验证

**Files:**
- 无新增文件。

**Interfaces:**
- Consumes: 全部。

- [ ] **Step 1: 全新安装依赖**

Run: `pnpm install`
Expected: 成功，无 peer 警告。

- [ ] **Step 2: 类型检查**

Run: `pnpm typecheck`
Expected: 两个包均 0 错误。

- [ ] **Step 3: 全量测试**

Run: `pnpm test`
Expected: core 与 cli 全部 PASS（含 Task 12 验收测试）。

- [ ] **Step 4: 手动冒烟（真实 docx）**

准备一个真实 .docx（Word 创建的任意文档），执行（`<tmp>` 取临时目录，如 Unix `/tmp` 或 Windows `%TEMP%`）：

```bash
cd packages/cli
pnpm exec tsx src/index.ts init <tmp>/smoke.wg
pnpm exec tsx src/index.ts import <tmp>/smoke.wg <真实.docx>
pnpm exec tsx src/index.ts commit <tmp>/smoke.wg <真实.docx> -m "改一版" --author smoke
pnpm exec tsx src/index.ts log <tmp>/smoke.wg <真实.docx>
pnpm exec tsx src/index.ts checkout <tmp>/smoke.wg <真实.docx> --commit <首提交id>
```

Expected: 每步输出 JSON；checkout 后用 Word 打开工作区中的文档内容为首版本。（真实 docx 含 Word 特有部件，验证 OOXML 路径在生产数据上工作。）

- [ ] **Step 5: 收尾提交（如有零散改动）**

```bash
git status
git add -A
git commit -m "chore: M1 收尾"   # 仅在确有改动时执行
```
