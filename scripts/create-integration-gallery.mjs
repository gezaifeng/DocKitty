import { promises as fs } from 'node:fs'
import path from 'node:path'

const dir = path.resolve('docs/integration-audit')
const views = [
  ['word-保存活动', '保存活动', '按日、周、月查看版本记录活动。'],
  ['word-分类与作者', '分类与作者', '查看版本分类、作者及重复内容分布。'],
  ['word-章节变化', '章节变化', '章节占比、基准差异与逐版变化热区。'],
  ['word-结构变化明细', '结构变化', '定位上一稿与当前稿的段落修改。'],
  ['word-大改版本排行', '大改版本排行', '找出修改量较大的历史版本。'],
  ['word-字数目标', '字数目标', '设置目标，查看当前进度。'],
  ['excel-columns', 'Excel 数值列', '明确选择工作表及数值列，查看合计、均值与极值。'],
  ['ppt-changes', 'PPT 文本变化', '逐版查看幻灯片文本改写数量。'],
  ['exported-trend', '导出的趋势图', '直接从软件导出的 PNG 图片。'],
]
const cards = []
for (const [file, title, note] of views) {
  const detail = await fs.access(path.join(dir, `${file}-detail.png`)).then(() => true, () => false)
  cards.push(`<article><h2>${title}</h2><p>${note}</p><a href="${file}.png" target="_blank"><img loading="lazy" src="${file}.png" alt="${title}实际软件截图"></a>${detail ? `<a class="detail" href="${file}-detail.png" target="_blank">查看明细原图 ↗</a>` : ''}</article>`)
}
await fs.writeFile(path.join(dir, 'index.html'), `<!doctype html>
<html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>稿喵 0.3.2 · 功能验收</title>
<style>*{box-sizing:border-box}body{margin:0;padding:32px;background:#fffdf5;color:#171717;font:15px/1.8 'Microsoft YaHei',sans-serif}main{max-width:1440px;margin:auto}header{border:3px solid;background:#f8d44b;padding:24px;box-shadow:6px 6px 0}h1{margin:0;font-size:32px}header p{max-width:1000px}nav{display:flex;flex-wrap:wrap;gap:12px}a{color:inherit}nav a,.detail{display:inline-block;padding:8px 14px;border:2px solid;background:white;text-decoration:none}section{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,480px),1fr));gap:28px;margin-top:32px}article{border:2px solid;background:white;box-shadow:5px 5px 0;padding:20px}h2{margin:0;font-size:22px}article p{color:#555}img{display:block;width:100%;border:1px solid #171717}.detail{margin-top:16px}a:hover{background:#f8d44b}a:focus-visible{outline:3px solid #171717;outline-offset:4px}@media(max-width:600px){body{padding:16px}header{padding:18px}h1{font-size:26px}}</style>
<main><header><h1>稿喵 0.3.2 · 功能验收</h1><p>以下截图来自正式软件包的实际操作；使用隔离文档库和合成 Word、Excel、PPT 文件。点击图片查看完整尺寸，明细图片展示页面下方的统计内容。完整流程 8 项通过，主题矩阵另有 102 张截图。</p><nav><a href="../visual-audit/index.html">全部主题与页面</a><a href="../功能接入-0.3.2.md">功能及指标清单</a><a href="../brand-lab/startup-refined-preview.html">开场动画预览</a></nav></header><section>${cards.join('')}</section></main></html>
`)
console.log(`Created integration gallery: ${views.length} views`)
