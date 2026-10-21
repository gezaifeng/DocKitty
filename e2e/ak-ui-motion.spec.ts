import { auditPath } from './auditPath'
import { test, expect, _electron as electron } from '@playwright/test'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { captureGraph } from './graphHelpers.js'

test('AK-UI uses live card entrance, perspective hover and reduced-motion cancellation',async()=>{
  const temporary=await fs.mkdtemp(path.join(os.tmpdir(),'dockitty-ak-motion-')),env={...process.env,WORDGIT_LIBRARY_HOME:path.join(temporary,'library')};delete env.ELECTRON_RUN_AS_NODE
  const app=await electron.launch({executablePath:path.resolve('node_modules/.cache/electron-runtime/dist/electron.exe'),args:[path.resolve('apps/desktop'),'--user-data-dir='+path.join(temporary,'profile')],env})
  try{
    const page=await app.firstWindow();page.setDefaultTimeout(10000);await page.emulateMedia({reducedMotion:'reduce'});await app.evaluate(({BrowserWindow})=>{const win=BrowserWindow.getAllWindows()[0];win.setContentSize(1600,1000);win.webContents.setBackgroundThrottling(false)})
    await expect(page.getByLabel('主题风格')).toBeVisible();const source=path.join(temporary,'卡片动效.txt');await fs.writeFile(source,'文档内容与操作逻辑保持不变。');await page.evaluate(source=>window.wordgit.doc.import(source),source);await page.reload();await expect(page.locator('.wg-document-card')).toHaveCount(1)
    await page.emulateMedia({reducedMotion:'no-preference'});await page.getByLabel('主题风格').click();await page.getByRole('option',{name:/方舟/}).click()
    const card=page.locator('.wg-document-card'),read=()=>card.evaluate(n=>n.getAnimations().map(a=>({running:a.playState==='running',frames:a.effect?.getKeyframes(),duration:a.effect?.getTiming().duration})).filter(a=>a.frames?.some(f=>f.translate)))
    await expect.poll(async()=>(await read()).filter(a=>a.running).length).toBeGreaterThan(0)
    const animations=await read();expect(animations.some(a=>a.duration===420)).toBe(true);await expect(card.locator('.wg-ak-card-art')).toBeVisible()
    const output=auditPath('ak-ui-integration-audit');await fs.mkdir(output,{recursive:true});await captureGraph(app,path.join(output,'card-entrance-live.png'));await page.waitForTimeout(550)
    const rest=await card.evaluate(n=>getComputedStyle(n).transform);await card.hover();await page.waitForTimeout(450);const hover=await card.evaluate(n=>getComputedStyle(n).transform);expect(hover).not.toBe(rest);await captureGraph(app,path.join(output,'card-hover-plane.png'))
    await page.emulateMedia({reducedMotion:'reduce'});await page.waitForTimeout(80);expect(await card.evaluate(n=>getComputedStyle(n).transform)).toBe('none');expect((await read()).filter(a=>a.running)).toHaveLength(0)
    await page.emulateMedia({reducedMotion:'no-preference'});await page.locator('.wg-features-menu summary').click();await page.getByRole('menuitemcheckbox',{name:'减少动态效果',exact:true}).click();await page.keyboard.press('Escape');await expect(page.locator('html')).toHaveAttribute('data-reduced-motion','true');expect(await card.evaluate(n=>getComputedStyle(n).transform)).toBe('none')
    expect(await fs.readFile(source,'utf8')).toBe('文档内容与操作逻辑保持不变。');await fs.writeFile(path.join(output,'motion.json'),JSON.stringify({passed:true,animations,hoverChangesPlane:true,systemPreferenceCancels:true,applicationSettingCancels:true,sourceUnchanged:true},null,2))
  }finally{await app.close();if(path.dirname(temporary)===os.tmpdir()&&path.basename(temporary).startsWith('dockitty-ak-motion-'))await fs.rm(temporary,{recursive:true,force:true})}
})
