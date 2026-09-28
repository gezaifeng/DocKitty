# M4 文本差异、分支管理、存储统计 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现文本级差异对比（jsdiff Myers 算法，支持中文字符级对比）、分支管理 UI、存储统计 UI，使论文场景完整可用。

**Architecture:**
- `packages/core/src/diff.ts`：`diffText` 封装 jsdiff `diffChars`，`extractDocxText` 从 docx buffer 提取 word/document.xml 纯文本。
- IPC 层：`CH.COMMIT_DIFF_TEXT = 'commit:diffText'`，handler 取两个 commit 的 OOXML buffer、提取文本、对比差异。
- 渲染层：`BranchPanel`（分支创建/切换 UI）、`DiffView`（内联差异渲染）。

**Tech Stack:** jsdiff（新增）、fflate（已有）、React + tanstack-query（已有）

**Spec:** docs/superpowers/specs/2026-09-28-word-git-design.md M4 节

## Global Constraints

- pnpm workspaces monorepo；主要修改 packages/core、packages/shared、apps/desktop
- TypeScript 5 strict ESM，import 用 .js 扩展名
- Vitest 3，testTimeout: 30000
- jsdiff 需加入 packages/core/package.json dependencies 并安装
- DiffResult 必须从 packages/core/src/index.ts 导出
- IPC channel 名为 `'commit:diffText'`（对应 CH.COMMIT_DIFF_TEXT）
- 所有已有 124 个测试必须继续通过
- 开发分支：m4-diff（从 m3-gui 创建）

---

### Task 0: 创建 m4-diff 分支

**Files:**
- （仅 git 操作）

**Interfaces:**
- Consumes: M3 已在 m3-gui 分支完成，124 tests 全绿
- Produces: branch m4-diff，M3 代码为基础

- [ ] **Step 1: 创建分支**

```bash
git checkout m3-gui
git checkout -b m4-diff
```

- [ ] **Step 2: 验证起始状态**

```bash
pnpm test
```

Expected: 124 tests pass。

---

### Task 1: jsdiff 集成 — diff.ts

**Files:**
- Modify: `packages/core/package.json`（添加 jsdiff 依赖）
- Create: `packages/core/src/diff.ts`
- Modify: `packages/core/src/index.ts`（导出 DiffResult、diffText、extractDocxText）
- Create: `packages/core/test/diff.test.ts`

**Interfaces:**
- Consumes: `import { diffChars } from 'diff'`；`import { unzipSync } from 'fflate'`
- Produces:
  - `DiffResult: { type: 'equal'|'insert'|'delete', text: string }`
  - `diffText(textA: string, textB: string): DiffResult[]`
  - `extractDocxText(buf: Uint8Array): Promise<string>`

- [ ] **Step 1: 安装 jsdiff**

```bash
cd packages/core && pnpm add diff && pnpm add -D @types/diff
```

- [ ] **Step 2: 编写测试（TDD）**

创建 `packages/core/test/diff.test.ts`，覆盖：
  - `diffText` 对纯英文文本返回正确 equal/insert/delete 分段
  - `diffText` 对中文文本进行字符级对比
  - `extractDocxText` 从真实 docx buffer 提取包含文本的 XML

- [ ] **Step 3: 实现 diff.ts**

```typescript
import { diffChars } from 'diff'
import { unzipSync } from 'fflate'

export interface DiffResult {
  type: 'equal' | 'insert' | 'delete'
  text: string
}

export function diffText(textA: string, textB: string): DiffResult[] { ... }
export async function extractDocxText(buf: Uint8Array): Promise<string> { ... }
```

- [ ] **Step 4: 更新 index.ts 导出**

- [ ] **Step 5: tsc --noEmit + pnpm test**

---

### Task 2: IPC 扩展 — commit:diffText

**Files:**
- Modify: `packages/shared/src/channels.ts`（添加 COMMIT_DIFF_TEXT）
- Modify: `packages/shared/src/schemas.ts`（添加 CommitDiffTextReq、DiffResultSchema）
- Modify: `packages/shared/src/types.ts`（更新 IpcApi.commit.diffText）
- Modify: `apps/desktop/src/main/ipc/commitHandlers.ts`（添加 diffTextHandler）
- Modify: `apps/desktop/src/main/ipc/registerAll.ts`（无需修改，已在 registerCommitHandlers 内）
- Modify: `apps/desktop/src/preload/index.ts`（暴露 commit.diffText）
- Modify: `apps/desktop/src/renderer/src/test/setup.ts`（添加 mock）
- Test: `apps/desktop/src/main/ipc/commitHandlers.test.ts`（新增 diffText 测试）

**Interfaces:**
- Consumes: `extractDocxText`, `diffText` from `@wordgit/core`；`getManifest`, `decodeOoxml` from `@wordgit/core`
- Produces: `commit.diffText(docName, commitIdA, commitIdB): Promise<DiffResult[]>`

- [ ] **Step 1: 更新 channels.ts**

添加 `COMMIT_DIFF_TEXT: 'commit:diffText'`

- [ ] **Step 2: 更新 schemas.ts**

添加 `CommitDiffTextReq`、`DiffResultSchema`

- [ ] **Step 3: 更新 types.ts IpcApi**

在 `commit` 下添加 `diffText(docName, commitIdA, commitIdB): Promise<DiffResult[]>`

- [ ] **Step 4: 实现 diffTextHandler**

- [ ] **Step 5: 更新 preload.ts**

- [ ] **Step 6: 更新 setup.ts mock**

- [ ] **Step 7: 编写/扩展测试**

- [ ] **Step 8: tsc --noEmit + pnpm test**

---

### Task 3: BranchPanel UI

**Files:**
- Create: `apps/desktop/src/renderer/src/components/BranchPanel.tsx`
- Create: `apps/desktop/src/renderer/src/components/BranchPanel.test.tsx`
- Modify: `apps/desktop/src/renderer/src/layouts/MainLayout.tsx`（集成 BranchPanel）

**Interfaces:**
- Consumes: `api.branch.create`, `api.branch.switch`, `api.doc.list`（获取当前 branches）；`useUiStore`
- Produces: `BranchPanel` 组件——显示当前分支、创建分支表单、切换分支按钮

- [ ] **Step 1: 编写测试（TDD）**

- [ ] **Step 2: 实现 BranchPanel**

- [ ] **Step 3: 集成到 MainLayout（在 TimelinePanel 下方或作为侧边面板）**

- [ ] **Step 4: pnpm test**

---

### Task 4: DiffView UI

**Files:**
- Create: `apps/desktop/src/renderer/src/components/DiffView.tsx`
- Create: `apps/desktop/src/renderer/src/components/DiffView.test.tsx`

**Interfaces:**
- Consumes: `api.commit.diffText`；`DiffResult` type from `@wordgit/shared`（re-exported）
- Produces: `DiffView` 组件——接收 `docName`、`commitIdA`、`commitIdB`，显示内联差异（绿色=插入，红色=删除）

- [ ] **Step 1: 导出 DiffResult 类型从 @wordgit/shared**

- [ ] **Step 2: 编写测试（TDD）**

- [ ] **Step 3: 实现 DiffView**

- [ ] **Step 4: pnpm test**

---

### Task 5: M4 全量验证

- [ ] **Step 1: pnpm test（全部通过）**

预期：原有 124 个测试 + M4 新增测试全绿。

- [ ] **Step 2: tsc --noEmit（全部包）**

- [ ] **Step 3: git commit 各 task**
