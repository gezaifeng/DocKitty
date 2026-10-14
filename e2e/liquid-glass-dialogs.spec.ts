import { test, expect, _electron as electron } from '@playwright/test'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { captureGraph } from './graphHelpers.js'

test('glass dialog layers, file actions, settings and theme chooser', async () => {
  test.setTimeout(120000)
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'dockitty-glass-dialogs-')), output = path.resolve('docs/liquid-glass-integration-audit')
  const env = { ...process.env, WORDGIT_LIBRARY_HOME: temporary }; delete env.ELECTRON_RUN_AS_NODE
  const app = await electron.launch({ executablePath: process.env.WORDGIT_ELECTRON ?? path.resolve('node_modules/.cache/electron-runtime/dist/electron.exe'), args: [process.env.WORDGIT_APP ?? path.resolve('apps/desktop'), '--user-data-dir=' + path.join(temporary, 'profile')], env })
  try {
    const page = await app.firstWindow(), errors: string[] = [], captures: string[] = []; page.setDefaultTimeout(12000)
    page.on('pageerror', e => errors.push(e.message))
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1600, 1000))
    await expect(page.getByRole('button', { name: '总览工作台', exact: true })).toBeVisible()
    const source = path.join(temporary, '审阅记录.txt'); await fs.writeFile(source, '修改前的内容')
    await page.evaluate(source => window.wordgit.doc.import(source), source)
    const root = (await page.evaluate(() => window.wordgit.repo.bootstrap())).repoRoot
    await fs.writeFile(path.join(root, 'workspace/审阅记录.txt'), '第二稿的内容与说明')
    await page.evaluate(() => window.wordgit.commit.create('审阅记录.txt', '第二稿', '测试'))
    await page.locator('.wg-document-card').click()
    async function capture(key: string, dialog = true) {
      if (dialog) { await expect(page.getByRole('dialog')).toBeVisible(); await expect(page.getByRole('dialog')).toHaveCSS('opacity', '1') }
      if (key.endsWith('settings')) await expect(page.locator('.wg-settings .max-w-2xl>div').last()).toHaveCSS('opacity', '1')
      await page.waitForTimeout(150)
      await captureGraph(app, path.join(output, key + '.png')); captures.push(key)
      await page.keyboard.press('Escape')
    }
    for (const label of ['液态玻璃', '液态玻璃 · 深色']) {
      const prefix = label.includes('深色') ? 'dark-dialog-' : 'light-dialog-'
      await page.getByLabel('主题风格').click(); await page.getByRole('option').filter({ has: page.getByText(label, { exact: true }) }).click()
      await page.locator('.wg-menu:not(.wg-features-menu) summary').click(); await expect(page.getByRole('button', { name: '新建文档…', exact: true })).toBeVisible(); await expect(page.getByRole('button', { name: '更改保存位置…', exact: true })).toBeVisible(); await capture(prefix + 'file', false)
      await page.getByRole('button', { name: '新建文档', exact: true }).click(); await capture(prefix + 'new')
      await page.getByRole('button', { name: '导入文档 / 版本', exact: true }).click(); await capture(prefix + 'import')
      await page.getByRole('button', { name: '保存工作区', exact: true }).click(); await capture(prefix + 'save')
      await page.getByRole('button', { name: '改名称', exact: true }).click(); await capture(prefix + 'document')
      await page.getByRole('button', { name: '名称 / 说明 / 分类', exact: true }).click(); await capture(prefix + 'version')
      await page.getByRole('button', { name: '建分支', exact: true }).click(); await capture(prefix + 'branch')
      await page.getByRole('button', { name: '分类看板', exact: true }).click(); await page.getByRole('button', { name: '添加分类', exact: true }).click(); await capture(prefix + 'category')
      await page.getByRole('button', { name: '版本关系图', exact: true }).click(); await expect(page.locator('.wg-main-view')).toHaveCSS('opacity', '1')
      const version = page.getByRole('button', { name: '版本节点 第二稿', exact: true })
      await version.click({ button: 'right' }); await page.getByRole('menuitem', { name: '编辑备注', exact: true }).click(); await capture(prefix + 'note')
      await version.click({ button: 'right' }); await page.getByRole('menuitem', { name: '沿现有分支创建下一稿', exact: true }).click(); await capture(prefix + 'edit')
      await version.click({ button: 'right' }); await page.getByRole('menuitem', { name: '删除版本…', exact: true }).click(); await capture(prefix + 'delete')
      await page.getByRole('button', { name: '使用帮助', exact: true }).click(); await capture(prefix + 'help')
      await page.getByRole('button', { name: '保存与备份设置', exact: true }).click(); await expect(page.getByRole('button', { name: '返回工作台' })).toBeVisible(); await capture(prefix + 'settings', false); await page.getByRole('button', { name: '返回工作台' }).click()
      await page.getByLabel('主题风格').click(); await expect(page.getByRole('listbox', { name: '选择主题' })).toBeVisible(); await capture(prefix + 'themes', false)
      await page.getByRole('button', { name: '总览工作台', exact: true }).click()
    }
    expect(errors).toEqual([]); expect(await fs.readFile(source, 'utf8')).toBe('修改前的内容')
    await fs.writeFile(path.join(output, 'dialogs.json'), JSON.stringify({ passed: true, errors, sourceUnchanged: true, screenshots: captures }, null, 2))
  } finally { await app.close(); if (path.dirname(temporary) === os.tmpdir() && path.basename(temporary).startsWith('dockitty-glass-dialogs-')) await fs.rm(temporary, { recursive: true, force: true }) }
})
