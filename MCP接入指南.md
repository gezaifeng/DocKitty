# 稿喵 MCP 接入指南

适用稿喵 0.5.2，普通用户无需额外安装 Node.js。先打开稿喵，左上角选择“项目管理”，再点击“接入 Agent”。弹窗生成当前软件路径与文档库路径的完整配置。

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

## Agent 的使用流程

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

## 连线格式（0.5.2）

`dockitty_set_relation` 的 `relation.style` 可选字段：`arrow` 为 `triangle` / `chevron` / `diamond` / `none`，`arrowSize` 为 6–24 px，`line` 为 `solid` / `dashed` / `double`，`width` 为 1–6 px。编辑时传已有 `relation.id`；省略格式或格式中的某一字段会保留原值。默认实心三角、8 px、实线、1.5 px。

```json
{"projectId":"<文档库编号>","relation":{"id":"<关系编号>","from":"<起点编号>","to":"<目标编号>","label":"演示材料","style":{"arrow":"chevron","arrowSize":16,"line":"double","width":2}}}
```

MCP 更新管理数据后，桌面此前的撤回记录可能过期；软件会清除这些记录，以免撤回覆盖 Agent 的新整理结果。撤回不会回退 Agent 在外部文件中的正文修改。
