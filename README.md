# DocKitty 🐈 · 稿喵

A little home for every draft. 本地办公文档版本管理工具。

## 安装使用

前往 [Releases](https://github.com/gezaifeng/DocKitty/releases/latest)，下载 **DocKitty-Setup-0.4.0-x64.exe**，双击安装后从桌面或开始菜单打开“稿喵”。支持 Windows 10/11 x64，不需要 Node.js、pnpm、Python 或 Git；安装和基本管理可离线使用。

使用 Word、WPS、Excel 等已安装的关联程序编辑文稿。软件负责保存与管理各稿，支持独立编辑副本、分支、分类和历史比较。

## 功能

- 文档卡片总览、版本关系图、分类看板与可量化统计。
- 每稿单一分支归属，独立节点、手动连接、备注与可恢复删除。
- 首次保存形成下一稿，后续保存更新同稿，覆盖记录可撤销。
- 统计分支与基准选择、字数/结构/表格/幻灯片指标、CSV 与 PNG 导出。
- 七种固定主题：黑框积木、浅色办公、纸张书房、石墨暗色、粉绿方块、经典视窗、胶囊文具；另支持跟随系统。
- 完整二维猫咪、入场过渡、五种原版 Hairline 鼠标互动视效。
- 本地文档库、保存位置自定义、完整备份与恢复；卸载不会主动删除用户数据目录。

[使用教程](docs/使用教程.md)。旧式 DOC/XLS 等可保存版本，内容解析有格式限制；复杂排版请用办公软件查看。当前为首次公开测试版本。

## 开发

仅开发和自行构建需要 Node.js 22+、pnpm 9.15.0。普通用户只需安装包。

```powershell
pnpm install --frozen-lockfile
pnpm -r run typecheck
pnpm -r run test
pnpm --filter @wordgit/desktop build
pnpm e2e
pnpm package:installer
```

安装包输出到 dist/releases，内部已包含 Electron 和打包后的依赖。测试使用临时文档库；WORDGIT_ELECTRON 可指定运行环境。

## 公开发布内容

本仓库为当前软件源代码的初始公开快照。安装包从干净构建生成，不包含作者论文、测试文档、导入历史、个人文档库或账户凭据。

## 第三方

Hairline 0.5.0 (Lucas Marques, MIT) 用于 Riffle、Drawer、Terminal、Cabinet、Turntable；原版许可保留于源码和安装目录。其他依赖见各包清单。参见 [第三方说明](THIRD_PARTY_NOTICES.md)。
