import { _electron as electron, expect } from '@playwright/test'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
const record=JSON.parse(await fs.readFile('docs/management-audit/reset-result.json','utf8'))
const temporary=await fs.mkdtemp(path.join(os.tmpdir(),'gaomiao-reset-view-'))
const profile=path.join(temporary,'profile');await fs.mkdir(profile)
await fs.writeFile(path.join(profile,'library-settings.json'),JSON.stringify({root:record.root}))
const delivery=path.resolve('dist/gaomiao-0.3.6-windows-x64'),env={...process.env};delete env.ELECTRON_RUN_AS_NODE
const app=await electron.launch({executablePath:path.join(delivery,'稿喵.exe'),args:[path.join(delivery,'resources/app'),'--user-data-dir='+profile],env})
try{
 const page=await app.firstWindow();await page.emulateMedia({reducedMotion:'reduce'})
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentSize(1600,1000))
 await expect(page.locator('.wg-document-card')).toHaveCount(3)
 await page.locator('.wg-document-card').filter({hasText:'完整历史.docx'}).click()
 const detail=await page.evaluate(()=>window.wordgit.library.detail('溶液光谱重建论文-完整历史.docx'))
 expect(detail.versions).toHaveLength(16);expect(detail.versions.every(v=>v.branches.length===1)).toBe(true)
 await page.getByRole('button',{name:'版本关系图',exact:true}).click();await page.getByLabel('查看分支').selectOption('TIP投稿')
 await expect(page.locator('.wg-node-body')).toHaveCount(1);await expect(page.locator('.wg-category-tag')).toHaveText('TIP 投稿稿')
 await expect(page.locator('.wg-main-view')).toHaveCSS('opacity','1')
 await page.screenshot({animations:'disabled',path:'docs/management-audit/reset-tip-only.png'})
 await page.getByRole('button',{name:'分类看板',exact:true}).click();await expect(page.locator('.wg-version-card')).toHaveCount(1)
 await expect(page.locator('.wg-main-view')).toHaveCSS('opacity','1')
 await page.screenshot({animations:'disabled',path:'docs/management-audit/reset-tip-board.png'})
 console.log('Restored real manuscript: 16 versions; TIP graph and board each show only its one owned version, with branch and category labels.')
}finally{await app.close();if(path.dirname(temporary)===os.tmpdir()&&path.basename(temporary).startsWith('gaomiao-reset-view-'))await fs.rm(temporary,{recursive:true,force:true})}
