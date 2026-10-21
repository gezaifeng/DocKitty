import { promises as fs } from 'node:fs'
import path from 'node:path'

const root=process.cwd(),target=path.resolve('D:/Desktop/DocKitty-publish')
if(await fs.access(target).then(()=>true,()=>false))throw new Error('Public staging directory already exists')
await fs.mkdir(target,{recursive:true})
const omit=new Set(['node_modules','out','dist','.git','test-results','playwright-report'])
for(const folder of ['apps','packages','e2e'])await fs.cp(path.join(root,folder),path.join(target,folder),{recursive:true,filter:file=>!file.split(path.sep).some(segment=>omit.has(segment))})
for(const file of ['package.json','pnpm-lock.yaml','tsconfig.base.json','playwright.config.ts','.gitignore'])await fs.copyFile(path.join(root,file),path.join(target,file))
await fs.writeFile(path.join(target,'pnpm-workspace.yaml'),"packages:\n  - 'apps/*'\n  - 'packages/*'\n")
await fs.mkdir(path.join(target,'scripts'))
for(const file of ['package-desktop.mjs','package-installer.mjs'])await fs.copyFile(path.join(root,'scripts',file),path.join(target,'scripts',file))
await fs.mkdir(path.join(target,'docs'))
await fs.writeFile(path.join(target,'docs/使用教程.md'),`# 稿喵使用教程

1. 从 Releases 下载 Windows x64 安装包，完成安装后打开“稿喵”。无需安装 Node.js、pnpm 或 Git。
2. 点击“导入文档 / 版本”。首次导入选择新文档，后续旧稿或新稿选择已有文档的版本。
3. 右键版本选择继续编辑或新建分支，通过系统关联的 Word / WPS / Excel 修改独立副本。首次保存修改形成下一稿，之后保存更新同一稿。
4. 分支表示独立编辑用途；每稿只属于一条分支。分类用于整理初稿、审阅稿和定稿，与分支独立。
5. 关系图支持滚轮缩放、拖动平移、拖动版本卡。右键可编辑备注、分类、归属、连接或删除。手动连接时依次点选两个版本，“取消连接”或 Esc 退出。
6. 断开连接不会改变卡片位置和所属分支；右键“整理布局”恢复默认排列。左下角可右键选择五种鼠标互动视效。
7. 版本统计提供分支筛选、字数/结构/增删趋势和表格/幻灯片指标。统计只读，不同格式的可用指标不同；与 Word/WPS 字数口径可能不同。
8. 顶部主题菜单提供七种固定主题及跟随系统。
9. 安装版文档库存放于用户数据目录，卸载保留。通过文件菜单可自定义位置，设置页可导出备份。建议定期将备份存到另一块磁盘。
10. 仅从管理中删除可回收还原；永久删除不可还原。勾选“同时删除导入文件”时须核对完整路径并确认。

DOCX/XLSX/PPTX 提供可解析的内容预览与比较；复杂排版、旧式 DOC/XLS 等请使用办公软件查看。编辑依赖用户已有办公软件，管理和保存版本不要求安装 Git。
`)
await fs.writeFile(path.join(target,'README.md'),`# DocKitty 🐈 · 稿喵

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

\`\`\`powershell
pnpm install --frozen-lockfile
pnpm -r run typecheck
pnpm -r run test
pnpm --filter @wordgit/desktop build
pnpm e2e
pnpm package:installer
\`\`\`

安装包输出到 dist/releases，内部已包含 Electron 和打包后的依赖。测试使用临时文档库；WORDGIT_ELECTRON 可指定运行环境。

## 公开发布内容

本仓库为当前软件源代码的初始公开快照。安装包从干净构建生成，不包含作者论文、测试文档、导入历史、个人文档库或账户凭据。

## 第三方

Hairline 0.5.0 (Lucas Marques, MIT) 用于 Riffle、Drawer、Terminal、Cabinet、Turntable；原版许可保留于源码和安装目录。其他依赖见各包清单。参见 [第三方说明](THIRD_PARTY_NOTICES.md)。
`)
await fs.writeFile(path.join(target,'THIRD_PARTY_NOTICES.md'),'# Third-party notices\n\nHairline 0.5.0 — Copyright (c) 2026 Lucas Marques — MIT.\nhttps://github.com/lucasmarkes/hairline\n\nThe full license is included at apps/desktop/src/renderer/src/vendor/hairline/LICENSE and with the installer.\n\nElectron and the bundled runtime carry their licenses in the installation directory (LICENSE.electron.txt and LICENSES.chromium.html). Other npm dependencies are listed in package.json files and pnpm-lock.yaml.\n')
await fs.appendFile(path.join(target,'.gitignore'),'\n*.wg/\n*.wgbackup\ndocs/*-audit/\n*.tgz\n.env*\n')
const files=[]
async function scan(folder){for(const entry of await fs.readdir(folder,{withFileTypes:true})){const file=path.join(folder,entry.name);if(entry.isDirectory())await scan(file);else files.push(file)}}
await scan(target)
for(const file of files){if(/\.(docx?|xlsx?|pptx?|wgbackup|pem|key)$/i.test(file))throw new Error('Unexpected document/private key: '+file);if(/\.(ts|tsx|js|json|md|ya?ml|css|mjs)$/i.test(file)){const text=await fs.readFile(file,'utf8');if(/基于轻量残差卷积|2980765992|gh[pousr]_[A-Za-z0-9]{20,}|BEGIN (?:RSA |OPENSSH )?PRIVATE KEY/.test(text))throw new Error('Sensitive content found: '+file)}}
console.log(JSON.stringify({target,files:files.length,sensitiveDocumentScan:'passed'}))
