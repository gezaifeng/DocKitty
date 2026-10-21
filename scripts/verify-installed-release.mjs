import { _electron as electron, expect } from '@playwright/test'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { createHash } from 'node:crypto'

const installed=path.resolve('dist/install-smoke-0.4.0'),temporary=await fs.mkdtemp(path.join(os.tmpdir(),'dockitty-installed-'))
const profile=path.join(temporary,'profile'),env={...process.env,PATH:path.join(process.env.SystemRoot??'C:/Windows','System32')}
delete env.ELECTRON_RUN_AS_NODE;delete env.WORDGIT_LIBRARY_HOME;delete env.WORDGIT_APP;delete env.ELECTRON_RENDERER_URL
const app=await electron.launch({executablePath:path.join(installed,'稿喵.exe'),args:['--user-data-dir='+profile],env})
try{
 const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.emulateMedia({reducedMotion:'reduce'})
 await expect(page.getByRole('button',{name:'总览工作台',exact:true})).toBeVisible()
 await expect(page.locator('.wg-document-card')).toHaveCount(0)
 const bootstrap=await page.evaluate(()=>window.wordgit.repo.bootstrap())
 expect(path.resolve(bootstrap.repoRoot)).toBe(path.resolve(profile,'稿喵文档库.wg'))
 const source=path.join(temporary,'release-test.txt');await fs.writeFile(source,'Original manuscript')
 await page.evaluate(source=>window.wordgit.doc.import(source),source)
 await page.locator('.wg-document-card').click()
 await fs.writeFile(path.join(bootstrap.repoRoot,'workspace','release-test.txt'),'Revised manuscript')
 await page.evaluate(()=>window.wordgit.commit.create('release-test.txt','Revised','release test'))
 await expect(page.locator('.wg-document-card')).toHaveCount(1)
 await page.getByRole('button',{name:'版本关系图',exact:true}).click();await expect(page.locator('.wg-node-body')).toHaveCount(2)
 await page.getByLabel('主题风格').click();await expect(page.getByRole('listbox',{name:'选择主题'}).getByRole('option')).toHaveCount(8);await page.getByRole('option',{name:'胶囊文具'}).click()
 await page.locator('.wg-riffle-figure').click({button:'right'});await expect(page.getByRole('menuitemradio')).toHaveCount(5);await page.keyboard.press('Escape')
 await page.getByRole('button',{name:'版本统计',exact:true}).click();await expect(page.locator('.wg-stat-cards')).toBeVisible()
 await page.screenshot({path:'docs/visual-audit/installed-release.png'})
 await page.reload();await expect(page.getByLabel('主题风格')).toHaveAttribute('data-value','capsule')
 expect(await fs.readFile(source,'utf8')).toBe('Original manuscript')
 expect(errors).toEqual([])
 const digest=createHash('sha256').update(await fs.readFile('dist/releases/DocKitty-Setup-0.4.0-x64.exe')).digest('hex')
 const proof={passed:true,version:'0.4.0',installerSHA256:digest,installedApp:installed,initialDocumentCount:0,bundledRuntime:true,externalNodeRemovedFromPath:true,userDataOutsideInstall:true,importAndVersionSaved:true,themes:8,figures:5,rendererErrors:errors}
 await fs.writeFile('docs/visual-audit/release-install-verification.json',JSON.stringify(proof,null,2))
 console.log(JSON.stringify(proof,null,2))
}finally{await app.close();if(path.dirname(temporary)===os.tmpdir()&&path.basename(temporary).startsWith('dockitty-installed-'))await fs.rm(temporary,{recursive:true,force:true})}

