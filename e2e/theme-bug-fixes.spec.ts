import { auditPath } from './auditPath'
import { test, expect, _electron as electron, type Page } from '@playwright/test'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import type { ProjectLibrary } from '../packages/shared/src/projects.js'
import { captureGraph, editWire } from './graphHelpers.js'

const output = auditPath('ak-ui-integration-audit')
const themes = [['arknights','方舟'],['redline','赤幕'],['liquid','琉璃'],['liquid-dark','夜璃'],['blockframe','积木'],['raw','粉绿'],['retro','视窗'],['capsule','胶囊'],['light','素白'],['paper','暖纸'],['dark','石墨'],['system','系统']]
async function choose(page: Page,label: string) { await page.getByLabel('主题风格').click(); await page.getByRole('option').filter({has:page.getByText(label,{exact:true})}).click() }
async function launch(temporary: string) {
  const env={...process.env,WORDGIT_LIBRARY_HOME:path.join(temporary,'library')};delete env.ELECTRON_RUN_AS_NODE
  const app=await electron.launch({executablePath:process.env.WORDGIT_ELECTRON??path.resolve('node_modules/.cache/electron-runtime/dist/electron.exe'),args:[process.env.WORDGIT_APP??path.resolve('apps/desktop'),'--user-data-dir='+path.join(temporary,'profile')],env})
  const page=await app.firstWindow();page.setDefaultTimeout(10000);await page.emulateMedia({reducedMotion:'reduce'})
  await app.evaluate(({BrowserWindow})=>{BrowserWindow.getAllWindows()[0].setContentSize(1600,1000);BrowserWindow.getAllWindows()[0].webContents.setBackgroundThrottling(false)})
  await expect(page.getByLabel('主题风格')).toBeVisible();await fs.mkdir(output,{recursive:true})
  return {app,page}
}
test('redline preview stays self-contained in every theme',async()=>{
  const temporary=await fs.mkdtemp(path.join(os.tmpdir(),'dockitty-theme-swatch-')),{app,page}=await launch(temporary),results=[]
  try{
    let expected=''
    for(const [id,label] of themes){
      await choose(page,label);await page.getByLabel('主题风格').click();const swatch=page.locator('.wg-theme-swatch.redline')
      await swatch.scrollIntoViewIfNeeded();await expect(swatch).toBeInViewport();const background=await swatch.evaluate(n=>getComputedStyle(n).backgroundImage)
      expect(background).toContain('linear-gradient');expect(background).toContain('229, 27, 50');if(expected)expect(background).toBe(expected);expected=background
      await captureGraph(app,path.join(output,`swatch-from-${id}.png`));results.push({theme:id,background});await page.keyboard.press('Escape')
    }
    await fs.writeFile(path.join(output,'swatches.json'),JSON.stringify({passed:true,results},null,2))
  }finally{await app.close();if(path.dirname(temporary)===os.tmpdir()&&path.basename(temporary).startsWith('dockitty-theme-swatch-'))await fs.rm(temporary,{recursive:true,force:true})}
})

test('glass graph masks covered segments, retains visible lines and moves masks with cards',async()=>{
  test.setTimeout(150000)
  const temporary=await fs.mkdtemp(path.join(os.tmpdir(),'dockitty-card-occlusion-')),{app,page}=await launch(temporary),results=[],errors:string[]=[]
  page.on('pageerror',e=>errors.push(e.message))
  try{
    await page.evaluate(()=>{const p=JSON.parse(localStorage.getItem('word-git-ui-v1')??'{"version":2,"state":{"theme":"blockframe"}}');Object.assign(p.state,{glassBackgroundMotion:false,glassPointerLight:false,reduceMotion:true});localStorage.setItem('word-git-ui-v1',JSON.stringify(p))});await page.reload();await expect(page.getByLabel('主题风格')).toBeVisible()
    const source=path.join(temporary,'来源文件');await fs.mkdir(source);for(const file of ['A.md','B.md','C.md'])await fs.writeFile(path.join(source,file),'# '+file+'\n此文件只用于隔离验收，不修改真实论文。')
    const projectId=await page.evaluate(async source=>{const p=await window.wordgit.projects!.request({action:'create',name:'连线遮挡验收'}) as ProjectLibrary;await window.wordgit.projects!.request({action:'import',projectId:p.id,paths:[source],unpackFolder:true});return p.id},source)
    const project=await page.evaluate(id=>window.wordgit.projects!.request({action:'get',projectId:id}) as Promise<ProjectLibrary>,projectId)
    const a=project.nodes.find(n=>n.name==='A.md')!,b=project.nodes.find(n=>n.name==='B.md')!,c=project.nodes.find(n=>n.name==='C.md')!
    await page.evaluate(async({projectId,ids})=>{for(const [i,id]of ids.entries())await window.wordgit.projects!.request({action:'updateNode',projectId,nodeId:id,position:{x:[60,800,430][i],y:140}});await window.wordgit.projects!.request({action:'setRelation',projectId,relation:{from:ids[0],to:ids[1],kind:'custom',label:'',style:{line:'double',width:6,arrow:'diamond',arrowSize:24}}})},{projectId,ids:[a.id,b.id,c.id]})
    await page.getByLabel('管理模式').click();await page.getByRole('option',{name:/项目管理/}).click();await page.getByRole('listitem',{name:'文档库 连线遮挡验收',exact:true}).click();await page.getByRole('button',{name:'文件关系图',exact:true}).click()
    await expect(page.locator('.wg-edge-card-mask')).toHaveCount(3);const blocker=page.getByRole('button',{name:'项目节点 C.md',exact:true}),group=page.locator('[data-project-occlusion]')
    const sample=async()=>{
      const box=(await blocker.boundingBox())!,rect={x:Math.round(box.x+150),y:Math.round(box.y+54),width:24,height:4}
      return Buffer.from(await app.evaluate(async({BrowserWindow},rect)=>(await BrowserWindow.getAllWindows()[0].webContents.capturePage(rect)).toBitmap().toString('base64'),rect),'base64')
    }
    const difference=(a:Buffer,b:Buffer)=>{expect(a.length).toBe(b.length);return a.reduce((sum,v,i)=>sum+Math.abs(v-b[i]),0)/a.length}
    for(const label of ['琉璃','夜璃']){
      await choose(page,label);await page.waitForTimeout(500);const originalMask=(await group.getAttribute('mask'))!
      const covered=await sample();await group.evaluate(n=>n.setAttribute('visibility','hidden'));await page.waitForTimeout(80);const baseline=await sample();await group.evaluate(n=>n.removeAttribute('visibility'))
      await group.evaluate(n=>n.removeAttribute('mask'));await page.waitForTimeout(80);const unmasked=await sample();await group.evaluate((n,mask)=>n.setAttribute('mask',mask),originalMask)
      const hiddenDelta=difference(covered,baseline),regressionDelta=difference(unmasked,baseline)
      expect(hiddenDelta).toBeLessThan(1);expect(regressionDelta).toBeGreaterThan(2)
      const hit=await blocker.evaluate(n=>{const r=n.getBoundingClientRect();return document.elementFromPoint(r.x+150,r.y+56)?.closest('[data-graph-node]')?.getAttribute('data-graph-node')});expect(hit).toBe(c.id)
      await captureGraph(app,path.join(output,label==='琉璃'?'glass-covered-line-light.png':'glass-covered-line-dark.png'));results.push({theme:label,hiddenDelta,regressionDelta})
    }
    const before=(await blocker.boundingBox())!;await page.mouse.move(before.x+30,before.y+20);await page.mouse.down();await page.mouse.move(before.x+90,before.y+85,{steps:10});await page.mouse.up()
    const mask=page.locator(`[data-occlusion-node="${c.id}"]`);await expect(mask).toHaveAttribute('x','490');await expect(mask).toHaveAttribute('y','205')
    await page.mouse.move(300,500);await page.mouse.wheel(0,-250);await expect(mask).toHaveAttribute('x','490')
    await editWire(page,page.locator('.wg-project-edges .wg-edge-line').first(),'right');const editor=page.getByRole('dialog',{name:'编辑连线',exact:true});await editor.getByLabel('线条格式').selectOption('dashed');await editor.getByLabel('箭头大小').fill('18');await editor.getByRole('button',{name:'反转箭头',exact:true}).click();await editor.getByRole('button',{name:'保存',exact:true}).click()
    await expect(page.locator('.wg-project-edges .wg-edge-line')).toHaveAttribute('data-from',b.id);await expect(page.locator('.wg-project-edges .wg-edge-line')).toHaveAttribute('data-line','dashed');await expect(page.locator('.wg-edge-card-mask')).toHaveCount(3)
    for(const [id,label]of themes){await choose(page,label);await expect(group).toHaveAttribute('mask',/^url\(#project-mask-/);await expect(page.locator('.wg-edge-card-shield')).toHaveCount(3);results.push({theme:id,maskAndShields:true})}
    for(const file of ['A.md','B.md','C.md'])expect(await fs.readFile(path.join(source,file),'utf8')).toBe('# '+file+'\n此文件只用于隔离验收，不修改真实论文。')
    expect(errors).toEqual([]);await fs.writeFile(path.join(output,'occlusion.json'),JSON.stringify({passed:true,results,dragZoomReverseAndStyle:true,sourcesUnchanged:true,errors},null,2))
  }finally{await app.close();if(path.dirname(temporary)===os.tmpdir()&&path.basename(temporary).startsWith('dockitty-card-occlusion-'))await fs.rm(temporary,{recursive:true,force:true})}
})
