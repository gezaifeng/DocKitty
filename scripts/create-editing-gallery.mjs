import { promises as fs } from 'node:fs'
import path from 'node:path'

const directory = path.resolve('docs/editing-audit')
const result = JSON.parse(await fs.readFile(path.join(directory, 'real-source-isolation.json'), 'utf8'))
const pictures = [
  ['独立新稿规则.png', '创建下一稿：独立文件与保存规则'],
  ['右键版本菜单.png', '右键版本菜单'],
  ['首次保存后的子版本.png', '首次保存形成子版本'],
  ['主稿与并列投稿分支.png', '主稿与投稿分支的真实父子关系'],
  ['文档主题边框与完整分割线.png', '文档行的黑框、投影与完整边线'],
  ['真实论文_侧栏加宽与原文缩放.png', '真实论文：侧栏加宽与纸张缩放'],
  ['真实论文_展开预览.png', '真实论文：展开预览首屏'],
  ['真实论文_正文布局.png', '真实论文：正文阅读布局'],
]
for (const [file] of pictures) await fs.access(path.join(directory, file))
await fs.writeFile(path.join(directory, 'index.html'), `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>稿喵0.3.4 · 编辑与隔离验收</title><style>body{margin:0;padding:36px;background:#fffdf5;color:#171717;font:15px/1.8 'Microsoft YaHei',sans-serif}main{max-width:1600px;margin:auto}h1{font-size:30px}.proof{padding:18px 22px;background:#cbedad;border:3px solid;box-shadow:5px 5px 0;margin:28px 0}a{color:inherit}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,550px),1fr));gap:26px}.card{display:block;border:3px solid;box-shadow:5px 5px 0;background:white;text-decoration:none}.card img{display:block;width:100%;border-bottom:2px solid}.card strong{display:block;padding:14px}p{max-width:950px}</style><main><h1>稿喵0.3.4 · 编辑与源文件隔离验收</h1><p>以下是正式交付包的实际截图。编辑流程使用隔离文档库，真实论文操作使用原文档库的临时复制品。</p><div class="proof">${result.sourceFilesVerified}个原始文件校验一致；首次保存新增一版，后续保存更新同一版；回收后旧编辑文件保存不会复活文档。<br><a href="real-source-isolation.json">查看原文件隔离结果</a> · <a href="result.json">查看独立新稿测试结果</a></div><p><a href="../编辑与源文件隔离-0.3.4.md">阅读操作说明与验证边界</a> · <a href="../visual-audit/index.html">查看全主题页面</a> · <a href="../indicator-audit/index.html">查看量化指标页面</a></p><div class="grid">${pictures.map(([file, title]) => `<a class="card" href="${file}" target="_blank"><img src="${file}" alt="${title}" loading="lazy"><strong>${title}</strong></a>`).join('')}</div></main></html>`)
console.log('Created editing and source-isolation screenshot gallery')
