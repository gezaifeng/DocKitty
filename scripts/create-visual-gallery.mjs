import { promises as fs } from 'node:fs'
import path from 'node:path'
const dir=path.resolve('docs/visual-audit')
const labels={blockframe:'BlockFrame 黑框积木',light:'浅色办公',paper:'纸张书房',dark:'石墨暗色',system:'跟随系统',raw:'粉绿方块',retro:'经典视窗',capsule:'胶囊文具'}
const screens={empty:'空文档库',overview:'文档与版本',graph:'版本关系图',board:'分类看板',statistics:'版本统计',settings:'设置',help:'使用帮助','new-dialog':'新建文档','file-menu':'文件菜单','theme-menu':'主题菜单',compact:'小窗口'}
for (const [key,label] of Object.entries({all:'全部文档',docx:'文稿',xlsx:'表格与数据',pptx:'演示资料'})) screens['filter-'+key]='空库筛选 · '+label
for (const [key,label] of Object.entries({graph:'关系图',board:'分类看板',statistics:'量化统计'})) screens['empty-'+key]='空库 · '+label
for (const [key,label] of Object.entries({docx:'文稿',xlsx:'表格与数据',pptx:'演示资料'})) screens['populated-'+key]='有文档筛选 · '+label
screens['nav-hover']='导航悬停状态'
screens['nav-focus']='导航键盘焦点'
const sections=[]
for(const system of ['light','dark']){
 const report=JSON.parse(await fs.readFile(path.join(dir,system,'report.json'),'utf8'))
 sections.push(`<section><h2>系统${system==='light'?'浅色':'深色'}环境 · ${report.screens.length}张实际软件截图</h2>${Object.entries(labels).map(([id,label])=>`<h3>${label}</h3><div class="grid">${report.screens.filter(s=>s.theme===id).map(s=>`<a href="${system}/${id}-${s.screen}.png" target="_blank"><img loading="lazy" src="${system}/${id}-${s.screen}.png"><b>${screens[s.screen]}</b></a>`).join('')}</div>`).join('')}</section>`)
}
await fs.writeFile(path.join(dir,'index.html'),`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>稿喵 · 正式软件视觉验收</title><style>body{margin:0;background:#fffdf5;color:#171717;font:15px 'Microsoft YaHei',sans-serif;padding:40px;line-height:1.8}h1{font-size:32px}h2{margin-top:60px;border-bottom:3px solid;padding-bottom:15px}h3{margin-top:36px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(350px,1fr));gap:24px}a{border:2px solid #171717;box-shadow:4px 4px 0 #171717;background:white;color:inherit;text-decoration:none}img{display:block;width:100%;border-bottom:1px solid #171717}b{display:block;padding:10px}p{max-width:850px}</style><h1>稿喵 · 正式软件视觉验收</h1><p>以下为真实 Electron 软件截图，覆盖本轮粉绿方块、经典视窗、胶囊文具三种新增主题，两种系统配色环境及主要页面。点击图片查看原尺寸。主题变量、蓝色文字和窗口横向溢出同时经过自动检查。演示文档仅用于验收。</p><p><a href="../indicator-audit/index.html">查看 Word、Excel、PPT 逐指标切换截图</a> · <a href="../界面切换验收-0.3.3.md">查看本轮验收范围</a></p><p><a href="../brand-lab/startup-refined-preview.html">查看新版猫咪与完整开场</a></p>${sections.join('')}</html>`)
console.log('Created gallery of real application screenshots')
