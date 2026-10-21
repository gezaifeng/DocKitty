import { promises as fs } from 'node:fs'
import path from 'node:path'
const renderer=path.resolve('apps/desktop/out/renderer')
const assets=await fs.readdir(path.join(renderer,'assets'))
let js=await fs.readFile(path.join(renderer,'assets',assets.find(f=>f.endsWith('.js'))),'utf8')
for (const file of assets.filter(f=>/\.(png|svg)$/.test(f))) { const uri='data:image/'+(file.endsWith('.svg')?'svg+xml':'png')+';base64,'+(await fs.readFile(path.join(renderer,'assets',file))).toString('base64'); js=js.replaceAll('./assets/'+file,uri).replaceAll('/assets/'+file,uri).replaceAll(file,uri) }
const css=await fs.readFile(path.join(renderer,'assets',assets.find(f=>f.endsWith('.css'))),'utf8')
const html=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>稿喵 · 完整入场预览</title><style>${css}</style><style>.preview-tools{position:fixed;right:16px;bottom:34px;z-index:300;padding:12px 15px;border:1px solid #cad8c8;border-radius:12px;background:#fffdf6ed;box-shadow:0 8px 30px #25433012;color:#44624b;font:11px 'Microsoft YaHei',sans-serif;line-height:1.9}.preview-tools button,.preview-tools select{border:1px solid #cad8c8;border-radius:6px;background:#f3f6ed;padding:5px 9px;color:#44624b;font:inherit;cursor:pointer}.preview-tools small{display:block;color:#84917c;margin-bottom:6px}</style><div id="root"></div><aside class="preview-tools"><b>完整入场预览</b><small>使用软件实际界面与动画 · 演示数据不读写文件</small><select aria-label="模拟加载速度" id="load"><option value="fast">正常加载</option><option value="slow">慢加载：观察猫咪等待</option></select> <button id="replay">↻ 重播完整入场</button></aside><script>
const params=new URLSearchParams(location.search),delay=params.get('load')==='slow'?1800:100;document.querySelector('#load').value=delay===1800?'slow':'fast';document.querySelector('#replay').onclick=()=>{params.set('load',document.querySelector('#load').value);location.search=params.toString()};document.querySelector('#load').onchange=()=>document.querySelector('#replay').click();document.addEventListener('click',e=>{if(!e.target.closest('.preview-tools')){e.preventDefault();e.stopPropagation()}},true);
window.wordgit={repo:{bootstrap:async()=>{await new Promise(r=>setTimeout(r,delay));return {repoRoot:'演示文档库（不读写文件）',repoName:'我的文档'}}},library:{list:async()=>[{docName:'毕业论文.docx',title:'毕业论文',versionCount:12,currentBranch:'主稿',dirty:false,lastModified:'2026-10-10T09:00:00Z'},{docName:'研究数据.xlsx',title:'研究数据',versionCount:4,currentBranch:'主稿',dirty:false,lastModified:'2026-10-09T09:00:00Z'}],detail:async()=>null},onWatcherChange:()=>()=>{}};
</script><script type="module">${js.replaceAll('</script','<\\/script')}</script></html>`
await fs.writeFile('docs/brand-lab/startup-preview.html',html)
await fs.writeFile('docs/brand-lab/startup-blockframe-preview.html',html)
await fs.writeFile('docs/brand-lab/startup-refined-preview.html',html)
console.log('Created offline preview from actual production renderer and startup animation')


