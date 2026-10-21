# 版本归档与回退

归档日期：2026-10-21。保留 30 个版本、55 份本地程序构建的应用代码；同版本的不同构建分别留档。归档日期不是这些旧构建的发布日期。

## 源码与构建代码

- `v0.5.13`：当前完整开发源码、测试与构建脚本。
- `v0.4.0`、`v0.5.7`：保留仓库已有的原始源码标签及发布历史。
- `archive-build/v版本号`：从原程序目录逐字节保存的编译后应用代码，包含资源、MCP 和随附说明。**这些标签不是找回的逐版本 TypeScript 源码。**
- `archive-build-variant/v版本号/原目录名`：保存同一版本的各个构建差异，未验证构建仍保留其原目录中的 unverified 标识。
- `archive/build-history-20261021`：串联全部构建快照的独立分支。快照提交产生于本次归档，未伪造原开发时间。

现有早期开发提交与 GitHub 历史均保留。未提交的设计草稿、完整测试证据及本机资料另存本机 Git 快照，不发布论文库、用户文档或账户配置。

## 版本索引

以下迭代说明来自已有项目记录；没有可靠记录的版本不补写功能或测试结论。

| 版本 | 迭代记录 | 构建代码 |
| --- | --- | --- |
| 0.1.0 | 首个可用程序；保留当时的构建代码 | [查看快照](https://github.com/gezaifeng/DocKitty/tree/archive-build/v0.1.0) |
| 0.2.0 | 保留实际构建，未补写缺失功能日志 | [查看快照](https://github.com/gezaifeng/DocKitty/tree/archive-build/v0.2.0) |
| 0.2.1 | 保留实际构建，未补写缺失功能日志 | [查看快照](https://github.com/gezaifeng/DocKitty/tree/archive-build/v0.2.1) |
| 0.2.2 | 保留实际构建，未补写缺失功能日志 | [查看快照](https://github.com/gezaifeng/DocKitty/tree/archive-build/v0.2.2) |
| 0.2.3 | 保留实际构建，未补写缺失功能日志 | [查看快照](https://github.com/gezaifeng/DocKitty/tree/archive-build/v0.2.3) |
| 0.2.4 | 保留实际构建，未补写缺失功能日志 | [查看快照](https://github.com/gezaifeng/DocKitty/tree/archive-build/v0.2.4) |
| 0.2.5 | 保留实际构建，未补写缺失功能日志 | [查看快照](https://github.com/gezaifeng/DocKitty/tree/archive-build/v0.2.5) |
| 0.2.6 | 保留实际构建，未补写缺失功能日志 | [查看快照](https://github.com/gezaifeng/DocKitty/tree/archive-build/v0.2.6) |
| 0.3.0 | 保留实际构建，未补写缺失功能日志 | [查看快照](https://github.com/gezaifeng/DocKitty/tree/archive-build/v0.3.0) |
| 0.3.1 | 保留实际构建，未补写缺失功能日志 | [查看快照](https://github.com/gezaifeng/DocKitty/tree/archive-build/v0.3.1) |
| 0.3.2 | 版本关系、分类和量化统计入口 | [查看快照](https://github.com/gezaifeng/DocKitty/tree/archive-build/v0.3.2) |
| 0.3.3 | 界面切换、筛选与选中状态修复 | [查看快照](https://github.com/gezaifeng/DocKitty/tree/archive-build/v0.3.3) |
| 0.3.4 | 编辑副本与源文件隔离 | [查看快照](https://github.com/gezaifeng/DocKitty/tree/archive-build/v0.3.4) |
| 0.3.5 | 猫咪互动与拖动体验 | [查看快照](https://github.com/gezaifeng/DocKitty/tree/archive-build/v0.3.5) |
| 0.3.6 | 版本关系规则与测试数据隔离 | [查看快照](https://github.com/gezaifeng/DocKitty/tree/archive-build/v0.3.6) |
| 0.4.0 | 既有公开版本，原始源码标签保留 | [查看快照](https://github.com/gezaifeng/DocKitty/tree/archive-build/v0.4.0) |
| 0.5.0 | 保留实际构建，未补写缺失功能日志 | [查看快照](https://github.com/gezaifeng/DocKitty/tree/archive-build/v0.5.0) |
| 0.5.1 | 保留实际构建，未补写缺失功能日志 | [查看快照](https://github.com/gezaifeng/DocKitty/tree/archive-build/v0.5.1) |
| 0.5.2 | 保留实际构建，未补写缺失功能日志 | [查看快照](https://github.com/gezaifeng/DocKitty/tree/archive-build/v0.5.2) |
| 0.5.3 | 保留实际构建，未补写缺失功能日志 | [查看快照](https://github.com/gezaifeng/DocKitty/tree/archive-build/v0.5.3) |
| 0.5.4 | 保留实际构建，未补写缺失功能日志 | [查看快照](https://github.com/gezaifeng/DocKitty/tree/archive-build/v0.5.4) |
| 0.5.5 | 液态玻璃主题与全局视觉开关 | [查看快照](https://github.com/gezaifeng/DocKitty/tree/archive-build/v0.5.5) |
| 0.5.6 | 保留实际构建，未补写缺失功能日志 | [查看快照](https://github.com/gezaifeng/DocKitty/tree/archive-build/v0.5.6) |
| 0.5.7 | 玻璃缩放、背景配色与项目管理 | [查看快照](https://github.com/gezaifeng/DocKitty/tree/archive-build/v0.5.7) |
| 0.5.8 | 拖放导入、复制或移动与文件撤回 | [查看快照](https://github.com/gezaifeng/DocKitty/tree/archive-build/v0.5.8) |
| 0.5.9 | 赤幕主题及组件适配 | [查看快照](https://github.com/gezaifeng/DocKitty/tree/archive-build/v0.5.9) |
| 0.5.10 | 斜面横扫、画布右键菜单与菜单动效 | [查看快照](https://github.com/gezaifeng/DocKitty/tree/archive-build/v0.5.10) |
| 0.5.11 | 方舟主题、赤幕预览和连线遮挡修复 | [查看快照](https://github.com/gezaifeng/DocKitty/tree/archive-build/v0.5.11) |
| 0.5.12 | 主题双字命名与功能一致性审查 | [查看快照](https://github.com/gezaifeng/DocKitty/tree/archive-build/v0.5.12) |
| 0.5.13 | 详情栏重整、文稿保护、完整版本 MCP、备份及大文件修复 | [查看快照](https://github.com/gezaifeng/DocKitty/tree/archive-build/v0.5.13) |

全部构建与提交编号见 [build-archive-index.json](build-archive-index.json)。每份构建的 `BUILD-MANIFEST.json` 记录文件 SHA-256、版本、原目录名及 Electron 运行时版本。文件已在本机 Git 中逐一读取并与归档来源比对。

## 回退开发源码

在仓库目录执行；独立工作目录保留当前未提交改动：

```powershell
git fetch origin --tags
git worktree add --detach ..\DocKitty-source-0.5.13 v0.5.13
```

0.4.0 或 0.5.7 可替换最后的标签。进入新目录，按其 README 安装依赖和构建。

## 取回其他旧版的应用代码

```powershell
git fetch origin --tags
git worktree add --detach ..\DocKitty-build-0.5.10 archive-build/v0.5.10
```

构建快照需要 Electron 32.3.3 的 Windows x64 运行环境；可使用本机保留的最新免安装程序目录的独立副本，将快照中的 `resources/app`、`MCP` 与随附说明覆盖到该副本。源码标签用于开发，构建标签用于取回当时运行代码；两者不可混用。旧版本回退请使用独立数据副本，保留当前文档库。

## 验证范围

本次归档验证文件清单、Git 对象字节和远程引用，不把归档通过视为旧版全部功能重新通过测试。0.5.13 的历史验收及其边界见 [修复清单](修复清单-0.5.13.md)。WPS 与干净 Windows 的安装卸载仍不在已验证范围内。
