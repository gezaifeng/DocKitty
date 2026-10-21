# 稿喵 MCP 接入指南

适用稿喵 0.5.13，普通用户无需额外安装 Node.js。先打开稿喵，在版本管理或项目管理顶栏点击“接入 Agent”。弹窗生成当前软件路径与文档库路径的完整配置。

## Codex、Claude Code 与 Cursor

选择对应标签并复制配置，合并到已有配置，保留其他服务与设置。不要将三种格式互相混用。

| 客户端 | 配置位置 | 格式 |
| --- | --- | --- |
| Codex | 用户目录 .codex/config.toml | TOML 的 mcp_servers.dockitty 与环境变量段 |
| Claude Code | 所选项目根目录 .mcp.json | JSON 的 mcpServers.dockitty |
| Cursor | 项目 .cursor/mcp.json 或用户目录 .cursor/mcp.json | JSON 的 mcpServers.dockitty |

配置 command 为安装后的稿喵.exe，args 指向软件自带 server.cjs 与 --repo 文档库位置；ELECTRON_RUN_AS_NODE=1 使用内置运行环境启动服务。软件内生成的配置可直接复制。更换安装路径或移动文档库之后请更新配置。首次启用请遵循客户端自己的工具批准流程。

这些 stdio 配置可以在稿喵桌面窗口关闭后使用；每个客户端启动自己的服务，通过同一文档库锁协调写入。不要直接双击 server.cjs。

## DSH

1. 在稿喵“接入 Agent → DSH”点击“开启本机连接”。
2. 在 DSH 的 MCP 面板添加服务，传输选择 **Streamable HTTP**。
3. 填写稿喵显示的服务地址及 **Bearer Token**，保存并连接。
4. 出现 dockitty_ 开头的工具即完成协议接入。

连接期间保持稿喵打开。服务只接受本机带密钥的请求，地址和密钥会在重启后沿用；关闭本机连接或退出稿喵后停止。密钥不要提交到 GitHub。DSH 的 stdio 沙箱限制了项目外文件访问，本版本采用本机 HTTP，不需要移动已有资料。

## 先查询能力

连接后先调用 `dockitty_get_capabilities`。返回当前服务版本、桌面版本、文档库位置、两种管理模式和关键操作规则。0.5.13 与桌面共用文稿修改、分支、连线、预览限额、比较和统计服务，校验与界面相同。

## 版本管理流程

1. `dockitty_list_documents` 列出文稿；`dockitty_get_document` 读取版本编号、唯一分支归属、分类、备注、连线与编辑副本。
2. `dockitty_import_document` 导入一份新文稿；`dockitty_import_version` 将另一份文件加入现有文稿；`dockitty_create_document` 创建 Word、Excel、TXT 或 Markdown。
3. 基于某版修改：调用 `dockitty_prepare_draft`，明确 `docName / versionId / branch / mode`。工具返回库内独立文件 `workspacePath`，不自动启动编辑器。Agent 用自己的编辑工具修改该文件，再调用 `dockitty_sync_draft`。首次有改动新增一稿，后续保存更新同一稿；相同内容重复同步不新增节点。源文件不回写。
4. 所选版本必须是指定分支末端；从历史稿发展时填写新分支名称。`dockitty_manage_branch` 支持 create、switch、recycle、restore、moveTip；删除当前编辑分支被拒绝。移动指针与修改版本归属是两个不同操作。
5. `dockitty_update_version` 修改标题、备注、分类、位置和回收状态；`dockitty_version_relation` 的 moveBranch 修改唯一归属并断开旧连线，可指定目标分支前版本，也可保持独立。
6. `dockitty_version_relation` 支持前后连接、断开、反转、标签、关系备注和样式。反转交换实际前后关系，不改正文、归属和位置；自连接、循环被拒绝。断开后的稿件保留原分支标签。
7. `dockitty_version_statistics` 返回桌面同一份量化结果及缺失原因；`dockitty_compare_versions` 按 A → B 比较正文；CSV 用 `dockitty_export_version_statistics`。统计查看不切换编辑分支。

### 版本工具表

| 工具 | 用途 |
| --- | --- |
| dockitty_list_documents / dockitty_get_document | 文稿列表、全部版本与回收状态 |
| dockitty_import_document / dockitty_create_document | 导入或新建文稿 |
| dockitty_import_version | 加入现有文稿，或明确替换一稿 |
| dockitty_update_document / dockitty_update_version | 显示名称、版本备注、分类、位置与回收 / 还原 |
| dockitty_prepare_draft / dockitty_sync_draft | 独立编辑副本及保存同步 |
| dockitty_save_workspace / dockitty_undo_replacement | 兼容工作区保存、撤销覆盖 |
| dockitty_manage_branch / dockitty_list_recycled_branches | 建立、切换、回收、恢复和移动分支指针 |
| dockitty_version_category / dockitty_arrange_versions | 分类与看板排序 |
| dockitty_version_relation / dockitty_tidy_versions | 前后连线、备注、格式、归属与整理卡片布局 |
| dockitty_refresh_workspace | 扫描受管工作目录，不扫描原始论文目录 |
| dockitty_read_version / dockitty_export_version | 读取不超过 1 MiB 的快照，或完整无覆盖导出 |
| dockitty_compare_versions | 与桌面相同的方向性正文差异 |
| dockitty_version_statistics / dockitty_export_version_statistics | 桌面量化与 CSV 导出 |
| dockitty_purge_version | 明确确认后的永久删除 |
| dockitty_edit_history | 当前 MCP 进程的可恢复操作撤回 / 重做 |

永久删除需先取得用户明确授权，并传 `confirmation: "PERMANENTLY DELETE"`。同时删除来源文件还需 `deleteSource: true` 及与详情一致的完整 `confirmedSourcePath`。普通回收使用 `deleted: true`，不会删除来源。永久删除清空该进程撤回记录；校验拒绝的操作不会清空。

MCP 与桌面各自保存当前启动的撤回栈，不跨进程共享。外部管理数据更新会使过期记录失效，避免覆盖新整理结果；Agent 或 Word 对文件正文的修改不由撤回回退。

## 项目管理的使用流程

先列出/创建项目文档库，再导入当前资料。当 agent 在来源文件中修改内容后：

- **只同步当前内容**：调用 dockitty_refresh_library，不增加历史。
- **明确保留一轮**：修改完成后，在再次刷新或其他写入前调用 dockitty_record_iteration；保存上次受管内容，再读取来源最新内容。
- **每轮单独一个目录**：调用 dockitty_import_items 导入新目录，unpackFolder=false，previousNodeId 指向上一轮文件夹。旧目录快照保留，并自动创建迭代关系。
- **连接资料**：dockitty_set_relation 指定 from、to、label、note；箭头从 from 指向 to，标签自由填写，无需选择关系类型。文件、文件夹可两两连接，跨文件夹端点允许属于同一文档库，桌面详情可跳转。编辑时传入已有 relation.id，可改标签或端点。
- **分类资料**：dockitty_set_category 创建或改名，dockitty_update_item 的 categoryId 分配分类；传 null 或空字符串回到未分类。分类名称全项目共用，桌面看板只展示当前层，关系图标签同步更新。

导入/记录传入固定 requestId，失败重试沿用它，同参数不会重复创建节点。不同迭代使用不同标识。所有节点编号来自工具返回值，不要用文件名代替编号。

## 工具表

| 工具 | 用途 |
| --- | --- |
| dockitty_list_libraries / dockitty_create_library | 列出、创建项目文档库 |
| dockitty_list_items | 读取当前层节点、项目共用分类及涉及的关系 |
| dockitty_import_items | 批量导入文件/文件夹，选择父层或上一轮 |
| dockitty_refresh_library | 同步来源变化，更新当前卡片 |
| dockitty_record_iteration | 明确保留一轮文件或完整文件夹快照 |
| dockitty_update_item | 修改显示名称、备注、分类归属与位置 |
| dockitty_list_categories | 列出本项目的共用分类 |
| dockitty_set_category | 创建分类，或带 category.id 重命名 |
| dockitty_remove_category | 删除分类，资料回到未分类，保留文件与连线 |
| dockitty_set_relation / dockitty_remove_relation | 创建、编辑、删除带标签关系 |
| dockitty_remove_item | 移除受管节点及子项，不删来源 |
| dockitty_read_file | 读取文本或二进制 base64，最多 1 MiB |
| dockitty_export_item | 将文件或完整文件夹导出到新的绝对路径 |

MCP 修改完成后会同步来源，桌面会显示相同资料。刷新本身不保存历史。来源真实删除会移除当前与历史卡片；需要永久留存的内容请提前导出。链接入口只返回目标路径，代码只作为文本读取，不运行。

旧客户端传入的 kind 参数仍兼容；新建手工关系可以省略。自动记录的迭代关系保持原有循环检查，手工关系允许两个方向和循环。自连接与跨项目连接仍不允许。

## 验证范围与参考

已用真实标准客户端验证 stdio、带密钥 HTTP、工具发现/调用和桌面联动，并用本机 DSH registry 验证连接。配置依据各客户端官方规范；这不代表调用了付费模型。Cursor 未在本机安装时不声称通过 Cursor 窗口验收。

官方配置说明：[Codex MCP](https://learn.chatgpt.com/docs/extend/mcp?surface=cli)、[Claude Code MCP](https://code.claude.com/docs/en/mcp)、[Cursor MCP](https://prod.cursor.com/docs/mcp)。协议实现使用[官方 TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)。

## 连线格式（0.5.3）

`dockitty_set_relation` 的 `relation.style` 可选字段：`arrow` 为 `triangle` / `chevron` / `diamond` / `none`，`arrowSize` 为 6–24 px，`line` 为 `solid` / `dashed` / `double`，`width` 为 1–6 px。编辑时传已有 `relation.id`；省略格式或格式中的某一字段会保留原值。默认实心三角、8 px、实线、1.5 px。

```json
{"projectId":"<文档库编号>","relation":{"id":"<关系编号>","from":"<起点编号>","to":"<目标编号>","label":"演示材料","style":{"arrow":"chevron","arrowSize":16,"line":"double","width":2}}}
```

MCP 更新管理数据后，桌面此前的撤回记录可能过期；软件会清除这些记录，以免撤回覆盖 Agent 的新整理结果。撤回不会回退 Agent 在外部文件中的正文修改。
