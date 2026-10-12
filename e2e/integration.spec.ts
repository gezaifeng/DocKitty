import { test,expect,_electron as electron } from '@playwright/test'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { createRequire } from 'node:module'
const require=createRequire(path.resolve('apps/desktop/package.json'))
const ExcelJS=require('exceljs'),{zipSync}=require('fflate')

test('complete version, classification, structured metrics, baseline and export workflows',async()=>{
 test.setTimeout(180000)
 const temporary=await fs.mkdtemp(path.join(os.tmpdir(),'gaomiao-integration-')),env={...process.env,WORDGIT_LIBRARY_HOME:temporary}
 delete env.ELECTRON_RUN_AS_NODE
 const app=await electron.launch({executablePath:process.env.WORDGIT_ELECTRON??path.resolve('node_modules/.cache/electron-runtime/dist/electron.exe'),args:[process.env.WORDGIT_APP??path.resolve('apps/desktop'),'--user-data-dir='+path.join(temporary,'profile')],env})
 try{
  const page=await app.firstWindow(),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message))
  await page.emulateMedia({reducedMotion:'reduce'})
  await expect(page.locator('.wg-startup')).toHaveCount(0)
  await expect(page.getByRole('button',{name:'总览工作台',exact:true})).toBeVisible()
  await fs.mkdir('docs/integration-audit',{recursive:true})
  await fs.mkdir('docs/indicator-audit',{recursive:true})
  const indicatorReport:Array<{format:string,label:string,file:string}>=[]
  async function auditIndicators(format:string){
   const buttons=page.locator('.wg-stat-sidebar section button')
   for(let i=0;i<await buttons.count();i++){
    const button=buttons.nth(i),label=await button.locator('span').count()?await button.locator('span').innerText():await button.innerText()
    await button.click();await expect(button).toHaveAttribute('aria-pressed','true')
    await expect(page.locator('.wg-stat-heading h1')).toHaveText(label.trim())
    await expect(page.locator('.wg-stat-heading h1')).toBeInViewport()
    await expect(page.locator('.wg-stat-sidebar button.active')).toHaveCount(1)
    expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false)
    const file=`${format}-${i}.png`;await page.screenshot({path:'docs/indicator-audit/'+file,scale:'css'})
    indicatorReport.push({format,label:label.trim(),file})
   }
  }
  const enc=new TextEncoder(),p=(id:string,text:string,heading=false)=>'<w:p w14:paraId="'+id+'">'+(heading?'<w:pPr><w:pStyle w:val="Heading1"/></w:pPr>':'')+'<w:r><w:t>'+text+'</w:t></w:r></w:p>'
  const docx=(extra=false)=>zipSync({'word/document.xml':enc.encode('<w:document xmlns:w="urn:w" xmlns:w14="urn:w14"><w:body>'+p('a','研究背景',true)+p('b',extra?'甲乙丙丁 Hello world 12':'甲乙 Hello')+p('c','实验设计',true)+p('d',extra?'补充实验':'实验')+'</w:body></w:document>')})
  const name='论文验收.docx',source=path.join(temporary,name);await fs.writeFile(source,docx())
  await page.evaluate(async({source,name})=>window.wordgit.doc.import(source,name),{source,name})
  let detail=await page.evaluate(name=>window.wordgit.library.detail(name),name);const branch=detail.currentBranch,first=detail.versions[0].id
  await page.evaluate(({name,branch})=>window.wordgit.branch.create(name,'导师路线',{fromBranch:branch}),{name,branch})
  const workspace=path.join(temporary,'稿喵文档库.wg','workspace',name),expectedBytes=Buffer.from(docx(true));await fs.writeFile(workspace,expectedBytes)
  await page.evaluate(name=>window.wordgit.library.mutate({type:'save',docName:name,mode:'new',message:'补充实验'}),name)
  detail=await page.evaluate(name=>window.wordgit.library.detail(name),name);const latest=detail.versions.find(v=>v.id!==first)!.id
  const category=await page.evaluate(name=>window.wordgit.library.mutate({type:'category',docName:name,action:'create',name:'导师审阅'}),name)
  await page.evaluate(({name,latest,id})=>window.wordgit.library.mutate({type:'version',docName:name,versionId:latest,categoryId:id!,note:'本轮补充结果'}),{name,latest,id:category.categoryId})
  await expect(page.locator('.wg-document-card')).toHaveCount(1);await page.locator('.wg-document-card').click()
  await page.getByRole('button',{name:'分类看板',exact:true}).click();await expect(page.locator('.wg-column').filter({hasText:'导师审阅'}).locator('.wg-version-card')).toHaveCount(1)
  await page.locator('.wg-version-filters summary').click();await page.getByLabel('查找版本',{exact:true}).fill('补充实验');await expect(page.locator('.wg-version-card')).toHaveCount(1)
  await page.getByRole('button',{name:'清除筛选',exact:true}).click();await page.locator('.wg-version-filters summary').click()
  await page.getByRole('button',{name:'版本关系图',exact:true}).click();await expect(page.locator('.wg-graph-node')).toHaveCount(2)
  await page.getByRole('button',{name:'版本统计',exact:true}).click();await expect(page.locator('.wg-stat-cards')).toBeVisible()
  await page.getByRole('button',{name:'中英混合字数',exact:false}).click();await expect(page.locator('.wg-stat-heading h1')).toHaveText('中英混合字数')
  const stats=await page.evaluate(({name,branch})=>window.wordgit.stats.versions(name,branch),{name,branch})
  await expect(page.locator('.wg-stat-cards section').nth(1).locator('strong')).toHaveText(String(stats.versions.at(-1)!.values.wordCount))
  await page.locator('.wg-stat-filters summary').click();await page.getByLabel('基准版本',{exact:true}).selectOption(first);await page.getByLabel('对照分支',{exact:true}).selectOption('导师路线')
  await expect(page.locator('.wg-stat-filters')).toContainText('共同版本 1');await page.getByLabel('仅分叉后版本').check();await expect(page.locator('.wg-stat-cards section').first().locator('strong')).toHaveText('1')
  await page.getByLabel('仅分叉后版本').uncheck();await page.getByLabel('起始版本',{exact:true}).selectOption(latest);await expect(page.locator('.wg-stat-cards section').first().locator('strong')).toHaveText('1');await page.getByRole('button',{name:'清除范围',exact:true}).click()
  await page.getByLabel('统计起始日期').fill('2099-01-01');await expect(page.locator('.wg-stat-cards section').first().locator('strong')).toHaveText('0');await page.getByRole('button',{name:'清除范围',exact:true}).click()
  await page.getByLabel('趋势横轴').selectOption('time');await page.locator('.wg-stat-filters summary').click()
  const csv=path.join(temporary,'统计.csv');await app.evaluate(({dialog},filePath)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath})},csv)
  await page.getByRole('button',{name:'导出表格 CSV'}).click();await expect.poll(async()=>{try{return (await fs.readFile(csv,'utf8')).includes('中英混合字数')}catch{return false}}).toBeTruthy()
  const png=path.join(temporary,'趋势.png');await app.evaluate(({dialog},filePath)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath})},png)
  await page.getByRole('button',{name:'导出趋势 PNG'}).click();await expect.poll(async()=>{try{return (await fs.readFile(png)).subarray(0,8).toString('hex')}catch{return ''}}).toBe('89504e470d0a1a0a')
  await fs.copyFile(png,'docs/integration-audit/exported-trend.png')
  for(const metric of ['分类与作者','章节变化','结构变化明细','大改版本排行','保存活动','字数目标']){
   await page.getByRole('button',{name:metric,exact:true}).click();await expect(page.locator('.wg-stat-heading h1')).toHaveText(metric)
   if(metric==='分类与作者')await expect(page.locator('.wg-stat-chart-panel')).toContainText('导师审阅')
   if(metric==='章节变化')await expect(page.locator('.wg-stat-chart-panel')).toContainText('研究背景')
   if(metric==='结构变化明细')await expect(page.locator('.wg-stat-chart-panel')).toContainText('修改段落')
   if(metric==='保存活动')await page.getByLabel('活动统计周期').selectOption('week')
   if(metric==='字数目标')await page.getByLabel('目标字数').fill('10000')
   await page.waitForTimeout(350);await page.screenshot({path:'docs/integration-audit/word-'+metric+'.png',scale:'css'})
   await page.locator('.wg-stat-chart-panel').screenshot({path:'docs/integration-audit/word-'+metric+'-detail.png'})
  }
  await auditIndicators('word')
  await page.getByRole('button',{name:'与基准比较内容',exact:true}).click();await expect(page.getByRole('dialog')).toContainText('两份版本');await page.getByRole('button',{name:'关闭',exact:true}).click()
  await page.getByRole('button',{name:'查看这份版本',exact:true}).click();await expect(page.locator('.wg-selected-version h3')).toHaveText('补充实验')
  expect((await page.evaluate(name=>window.wordgit.library.detail(name),name)).currentBranch).toBe(branch);expect((await fs.readFile(workspace)).equals(expectedBytes)).toBeTruthy()
  // New sheet, formula rewrite, numeric aggregation and sparse multi-sheet preview.
  const book=new ExcelJS.Workbook(),sheet=book.addWorksheet('数据');sheet.getCell('C5').value=10;sheet.getCell('C7').value=20;sheet.getCell('D7').value={formula:'C5+C7',result:30}
  const xname='表格验收.xlsx',xsource=path.join(temporary,xname);await fs.writeFile(xsource,Buffer.from(await book.xlsx.writeBuffer()))
  await page.evaluate(({source,name})=>window.wordgit.doc.import(source,name),{source:xsource,name:xname})
  sheet.getCell('D7').value={formula:'C5*2+C7',result:40};book.addWorksheet('汇总').getCell('B9').value=40
  await fs.writeFile(path.join(temporary,'稿喵文档库.wg','workspace',xname),Buffer.from(await book.xlsx.writeBuffer()));await page.evaluate(name=>window.wordgit.library.mutate({type:'save',docName:name,mode:'new',message:'增加汇总'}),xname)
  await expect(page.locator('.wg-document-card')).toHaveCount(2);await page.locator('.wg-document-card').filter({hasText:xname}).click()
  await expect(page.getByRole('tab',{name:'汇总',exact:true})).toBeVisible();await page.getByRole('tab',{name:'汇总',exact:true}).click();await expect(page.locator('.wg-xlsx-grid')).toContainText('9');await expect(page.locator('.wg-xlsx-grid')).toContainText('40')
  await page.getByRole('button',{name:'版本统计',exact:true}).click();await page.getByRole('button',{name:'改写公式',exact:false}).click();await expect(page.locator('.wg-stat-cards section').nth(1).locator('strong')).toHaveText('1')
  await page.getByRole('button',{name:'数值列统计',exact:true}).click();await page.getByLabel('数值列').selectOption('数据!C');await expect(page.locator('.wg-stat-chart-panel')).toContainText('30');await page.screenshot({path:'docs/integration-audit/excel-columns.png',scale:'css'});await page.locator('.wg-stat-chart-panel').screenshot({path:'docs/integration-audit/excel-columns-detail.png'})
  await auditIndicators('excel')
  // Rename-conflict recovery restores the old reference without replacing the new one.
  await page.evaluate(name=>window.wordgit.branch.delete(name,'导师路线'),name)
  await page.evaluate(({name,latest})=>window.wordgit.branch.create(name,'导师路线',{fromCommitId:latest}),{name,latest})
  await page.getByLabel('保存与备份设置').click();await page.getByLabel('恢复分支名称 导师路线').fill('导师路线-旧稿');await page.getByRole('button',{name:'还原',exact:true}).click()
  await expect.poll(async()=>Object.keys((await page.evaluate(name=>window.wordgit.library.detail(name),name)).branchHeads).includes('导师路线-旧稿')).toBeTruthy()
  const restored=await page.evaluate(name=>window.wordgit.library.detail(name),name);expect(restored.branchHeads['导师路线-旧稿']).toBe(first);expect(restored.branchHeads['导师路线']).toBe(latest)
  await page.getByRole('button',{name:'返回工作台',exact:true}).click();await page.getByRole('button',{name:'总览工作台',exact:true}).click()
  const slide=(text:string)=>enc.encode('<p:sld xmlns:p="urn:p" xmlns:a="urn:a"><a:p><a:t>'+text+'</a:t></a:p></p:sld>'),pname='演示验收.pptx',psource=path.join(temporary,pname)
  await fs.writeFile(psource,zipSync({'ppt/slides/slide1.xml':slide('研究背景'),'ppt/slides/slide2.xml':slide('实验设计')}))
  await page.evaluate(({source,name})=>window.wordgit.doc.import(source,name),{source:psource,name:pname})
  await fs.writeFile(path.join(temporary,'稿喵文档库.wg','workspace',pname),zipSync({'ppt/slides/slide1.xml':slide('研究背景'),'ppt/slides/slide2.xml':slide('实验设计与结果')}))
  await page.evaluate(name=>window.wordgit.library.mutate({type:'save',docName:name,mode:'new',message:'演示补充结果'}),pname)
  await expect(page.locator('.wg-document-card')).toHaveCount(3);await page.locator('.wg-document-card').filter({hasText:pname}).click();await page.getByRole('button',{name:'版本统计',exact:true}).click()
  await page.getByRole('button',{name:'幻灯片文本修改',exact:false}).click();await expect(page.locator('.wg-stat-cards section').nth(1).locator('strong')).toHaveText('1')
  await page.screenshot({path:'docs/integration-audit/ppt-changes.png',scale:'css'})
  await auditIndicators('ppt')
  await fs.writeFile('docs/indicator-audit/report.json',JSON.stringify(indicatorReport,null,2))
  expect(errors).toEqual([])
 }finally{await app.close();if(path.dirname(temporary)===os.tmpdir()&&path.basename(temporary).startsWith('gaomiao-integration-'))await fs.rm(temporary,{recursive:true,force:true})}
})
