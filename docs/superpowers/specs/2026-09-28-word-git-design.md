# word_git 设计文档

- 日期：2026-09-28
- 状态：已与需求方逐节确认（第 1~3 节全部获批）
- 一句话定位：像 Git 管理代码一样管理可编辑文档（docx/xlsx/pptx 等）的版本与分支，本地优先的 PC 桌面应用。

## 1. 背景与目标

写论文多次修改、长期维护文档时，用户常为"删不删旧版本"发愁。word_git 让每一次修改都成为可回溯、可对比、可恢复的历史版本，并像 Git 一样支持分支并行演化（如"投稿前冲刺版"），同时通过内容级去重让存储多版本几乎不占额外空间。

**第一需求目标（用户明确定义）：在任何情况下保存的信息和文档都不丢失、不损坏。** 这里"安全性"指数据可靠性，不是对外部攻击的防护。

## 2. 需求决策记录（已与用户确认）

| 决策点 | 结论 |
|---|---|
| 工具形态 | PC 桌面 GUI 应用软件（手机端后续再考虑，架构上预留余地） |
| 版本捕获 | 工作区 + 引导式提交：App 内"编辑"→ 系统默认程序（Word/WPS）打开 → 保存后引导填写版本说明、选择分支、提交 |
| 格式范围 | Office 三件套（docx/xlsx/pptx）格式感知；任意其他文件类型通用存储兜底 |
| 版本对比 | 文本级对比（段落/单元格级差异高亮），不做 Word 修订级精确对比 |
| 存储引擎 | OOXML 感知 + 通用内容分块（CDC）回退；**不使用链式 delta** |
| 技术栈 | Electron（维持，不换 Tauri 2）+ React 19 + TypeScript |
| 安全含义 | 数据可靠性：原子写入、断电恢复、回收区、自检修复、备份导出 |

## 3. 竞品调研结论（2026-09）

- Git 本身：把 docx 当不透明二进制，diff 不可读、无格式感知去重。
- Simul（商业 SaaS）：仅 Word、闭源付费、不可自托管。
- Dropbox/SharePoint/OneDrive 版本历史：仅线性历史，无分支/commit/checkout 语义。
- DVC / git-annex：面向 AI 数据集/大文件指针，不做文档内容级增量。
- Tauri 2 已成熟（内存省约 58%、包体省约 96%），但切换到 Rust 核心工期约翻倍，与"core 纯 TS 复用到未来服务端"冲突，**维持 Electron**。

**差异化空白：本地优先 + git 式分支/commit/checkout 语义 + Office 格式感知的去重存储。**

## 4. 总体架构

```
┌──────────────────────────────────┐
│ 渲染进程：React SPA（Vite 7 构建）  │
├──────────────────────────────────┤
│ 主进程：IPC 路由（zod 校验）、chokidar │
│ 文件监听、shell.openPath 调起 Word/WPS │
├──────────────────────────────────┤
│ packages/core（纯 TypeScript，零        │
│ Electron 依赖，IO 接口注入，可单测）      │
│  ingest / ooxml / cdc / diff / repo /   │
│  gc / storage（journal 事务日志）       │
└──────────────────────────────────┘
```

- core 与 UI 完全解耦：将来可原样搬到服务端，支撑手机端（IPC 层替换为 HTTP 层，core 不动）。
- 安全默认：contextIsolation + sandbox + 最小化 contextBridge 白名单。

## 5. 存储引擎设计（核心）

### 5.1 仓库目录（单目录，可直接整目录备份/网盘同步）

```
<库名>.wg/
  repo.yaml            # 格式版本、创建时间、配置
  journal/             # 事务日志：写操作先记日志，完成后清理；断电恢复依据
  objects/
    blobs/             # 小型不可变对象：commit、tree、entry manifest（sha256 分桶 ab/cd/…）
    chunks/            # 通用 CDC 内容块（sha256 寻址）
    ooxml/             # OOXML 部件存储（清单指向 chunks/blobs）
  refs/heads/<docId>/<branch>   # 文档级分支头 → commit sha256（原子替换）
  quarantine/          # 回收区：GC 移入，默认保留 30 天，可一键还原
  workspace/           # 工作区（用户实际编辑的文件）
  index/               # node:sqlite 查询索引（纯派生数据，可随时重建）
```

### 5.2 对象模型（git 风格，全部不可变）

- **Commit**：`{ id, parents[], treeId, message, author, createdAt }`，id = canonical JSON 的 sha256。
- **Tree**：文档条目的目录快照（`entries: [{name, blobId}]`），支持单文件文档和"文档=文件夹"（论文 + 配图 + 参考文献）。
- **文档级提交链**：每个文档条目（doc）拥有独立分支命名空间 `refs/heads/<docId>/<branch>`，各文档演化互不干扰；切换文档 A 的分支只替换 workspace 中该文档对应的文件/目录。
- **文件版本（Blob）** 两种编码，按格式自动选择：
  - *通用编码*：整文件 CDC 分块清单。
  - *OOXML 编码*：见 5.3。

### 5.3 去重管线（ingest）

1. **快速路径**：整文件 sha256 已存在 → 直接复用，零成本。
2. **格式识别**：magic bytes（`PK\x03\x04` + `[Content_Types].xml`）判定 OOXML；否则走通用编码。
3. **OOXML 处理**（fflate 解包）：
   - 保留完整 entry 元数据（名称、顺序、压缩方式、时间戳、外部属性）→ 存 manifest。
   - 逐 entry 计算 sha256，与上一版本同路径 entry 对比，未变 → 复用引用（零成本）。
   - 文本类 entry（.xml/.rels）：小于 ~4KB 整体存 blob；否则对**文本做 CDC 分块**（关键设计：不用链式 delta——CDC 边界由内容决定，中间插入大段文字只影响插入点附近的块，其余块自动复用，去重效果接近差量但无链）。
   - 二进制 entry（媒体、嵌入对象）：原始字节 CDC。
   - 任何一步解析失败 → 整体回退通用编码，绝不阻塞入库。
4. **通用编码**：流式 CDC（滚动哈希，目标块 ~16KB，范围 8~64KB），chunk id = sha256。全程流式，内存恒定，支持超大文件。
5. **落盘**：所有对象先写 `*.tmp` + fsync，再 rename；写 journal；最后原子更新 refs 与索引。

**去重效果**：同一文档 50 个版本 ≈ 首版全量 + 若干 KB 级变化块；多张文档共用同一张图片只存一份；不同文档引用同一段模板文字也共享块。

### 5.4 diff 是视图，不是存储

存储层不存任何差量。版本对比界面需要差异高亮时，将两个版本的文本各自重建后**实时计算** Myers diff（中文按字符级对齐），增/删/改三色高亮。

### 5.5 可靠性机制（对应"任何情况下不丢失"）

| 场景 | 机制 |
|---|---|
| 断电/崩溃 mid-commit | journal + 临时文件原子重命名；重启回滚半成品对象，refs 永不指向半个提交 |
| 误删版本/分支 | 只删引用；实体进 quarantine 保留 30 天，可一键还原 |
| 磁盘静默损坏 | 手动/定期 scrub：全盘校验 sha256，告警并引导从备份/工作区修复 |
| 磁盘写满 | 写入前预检查空间，优雅失败且仓库一致 |
| Word/WPS 占用文件 | 检测 Office 锁文件，提示先关闭再提交，绝不强写 |
| 仓库被网盘同步 | 对象不可变 + 原子替换，天然同步友好；检出冲突副本时提示 |
| 索引损坏 | node:sqlite 为派生数据，启动校验失败自动从 objects 重建 |
| 软件升级 | repo.yaml 格式版本号；老版本自动迁移，迁移前自动备份，新版本拒绝打开不降级 |
| 灾难恢复 | 一键导出完整备份包（含校验清单）；仓库单目录可直接拷贝/网盘同步 |

## 6. 应用层设计

### 6.1 工程结构（pnpm monorepo）

```
word_git/
  apps/desktop/        Electron 壳（main + preload + renderer）
  packages/core/       纯 TS 引擎
  packages/shared/     IPC 契约：zod schema + TypeScript 类型（前后端共享）
```

### 6.2 IPC 契约（packages/shared，zod 校验）

`repo.create/open`、`doc.import/list`、`doc.edit`（调起系统编辑器）、`watcher.events`（保存变更推送）、`commit.create/list/checkout/diffText`、`branch.create/switch/delete`、`stats.storage`、`backup.export/import`、`maintenance.scrub`、`quarantine.list/restore/purge`。

### 6.3 交互流程（引导式，非程序员友好）

1. **首次启动**：引导创建仓库（选位置、起名）→ 可一键导入现有文档为首版本。
2. **文档列表**：卡片式，显示版本数、最后修改、当前分支。
3. **编辑闭环**：点"编辑"→ 检出到工作区 → 系统默认程序打开 → 监听保存 → 弹出"提交新版本"引导卡（自动变更摘要：字数/页数变化；版本说明输入 + 快捷标签如"导师反馈修改"；选择主线或新分支）→ 提交，时间线动画新增节点。
4. **时间线**：垂直时间线；任意版本在线预览（docx 高保真渲染 / xlsx 表格）；勾选两个版本 → 文本级差异对比。
5. **恢复**：任意版本"恢复到工作区"或"另存为副本"，永不覆盖未提交内容。
6. **分支**：默认主线；任意版本可"从此创建分支"；切换分支明确提示并确认工作区替换；删除分支两步确认，数据进回收区。
7. **设置**：存储统计亮点卡片（"共 X 个版本，实际占用 Y，相比全量节省 Z%"）、备份导出/导入、scrub 自检、回收区管理、仓库位置迁移。

### 6.4 界面设计原则

三栏布局（文档列表 | 时间线 | 预览/对比）；空状态均有插图与下一步引导；危险操作两步确认且一切删除可还原；深色/浅色双主题；UI 语言中文，代码与标识符英文。

## 7. 技术栈（2026-09 核查）

| 层 | 选型 | 备注 |
|---|---|---|
| 工程/包管理 | pnpm workspaces monorepo | apps/desktop + packages/core + packages/shared |
| 桌面运行时 | Electron 最新稳定版（内置 Node 22+，ESM 全支持） | 不换 Tauri 2（core 复用性优先） |
| 核心引擎 | 纯 TS ESM，零原生依赖 | `node:crypto` 做 SHA-256；fflate 处理 zip（替代 jszip）；CDC 自研；jsdiff 做文本 diff |
| 查询索引 | node:sqlite（Node 内置，免编译）；兜底 better-sqlite3 | 派生数据，可重建 |
| 文件监听 | chokidar v4 | |
| 构建 | Vite 7 + electron-vite | 秒级 HMR |
| UI | React 19 + TypeScript 5.x | |
| 组件 | shadcn/ui（Radix 无头）+ Tailwind CSS v4 | |
| 状态/数据 | Zustand + TanStack Query + TanStack Virtual | |
| 动效 | Framer Motion | |
| 文档预览 | docx：docx-preview；xlsx：ExcelJS 读数自渲染（SheetJS 已退出 npm，弃用） | 均支持中文 |
| 测试 | Vitest 3（单元/属性）+ Playwright（E2E）+ 自研崩溃注入 harness | |
| 打包 | electron-builder → Windows 安装包 | |

## 8. 错误处理矩阵

见 5.5（可靠性机制）与下述补充：损坏的 docx 自动回退通用编码；超大文件流式处理；网盘冲突检测提示。

## 9. 测试策略

- **单元测试**（Vitest）：CDC 分块在插入/删除/头部追加下的稳定性；OOXML 解包→重建往返一致；引用计数 GC 正确性；格式识别分支。
- **属性测试**：随机上千步编辑序列，断言任意历史版本重建后与原始文件逐字节一致。
- **崩溃注入**：提交流程各阶段随机强杀进程，重启后仓库必须一致（journal 有效性）。
- **集成测试**：真实 docx/xlsx 语料提交 100+ 版本，验证去重率、重建正确性、分支切换。
- **E2E**（Playwright）：建库→导入→编辑保存→提交→对比→恢复全流程。

## 10. 里程碑

| 里程碑 | 内容 | 验收标准 |
|---|---|---|
| M1 | core 引擎 + CLI：init/import/commit/checkout/branch、CDC、OOXML 管线 | 单元+属性测试全绿 |
| M2 | 可靠性层：journal 崩溃恢复、quarantine、scrub、备份导出/导入、崩溃注入 | 任意阶段 kill 不丢数据 |
| M3 | GUI 主体：仓库管理、引导式编辑闭环、时间线、预览 | 非程序员独立完成全流程 |
| M4 | 文本级对比、分支管理、存储统计 | 论文场景完整可用 |
| M5 | 打磨：双主题、动效、E2E、安装包发布 | 可交付使用 |

## 11. 明确不做（YAGNI）

- 多人协作、权限、自动合并（二进制文档合并不可行，冲突用分支+人工）。
- 手机端（core 纯 TS 已预留移植路径：IPC 换 HTTP）。
- 内容加密（需求为可靠性而非防攻击）。
- 自研文档编辑器（调起 Word/WPS）。
- 网络同步功能（仓库目录可直接放网盘/用户自行备份）。

## 12. 未来扩展路径

手机端：core 原样部署到服务端 + 移动端只做查看/预览/恢复（编辑在 Office/WPS 完成再上传）。存储格式与 IPC 契约设计已为此预留（契约即 API 边界）。
