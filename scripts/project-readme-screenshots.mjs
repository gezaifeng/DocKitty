import { _electron as electron, expect } from '@playwright/test'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'dockitty-readme-project-')), source = path.join(temporary, '星芽计划')
await fs.mkdir(path.join(source, '资料'), { recursive: true }); await fs.writeFile(path.join(source, '资料', '方法说明.md'), '# 颜色分析方法\n说明文档 · 虚构示例')
const env = { ...process.env, WORDGIT_LIBRARY_HOME: temporary }; delete env.ELECTRON_RUN_AS_NODE
const app = await electron.launch({ executablePath: process.env.WORDGIT_ELECTRON ?? path.resolve('node_modules/.cache/electron-runtime/dist/electron.exe'), args: [process.env.WORDGIT_APP ?? path.resolve('apps/desktop'), '--user-data-dir=' + path.join(temporary, 'profile')], env })
try {
  const page = await app.firstWindow(); await page.emulateMedia({ reducedMotion: 'reduce' }); await page.getByRole('button', { name: '总览工作台', exact: true }).waitFor(); await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1600, 1000))
  const project = await page.evaluate(() => window.wordgit.projects.request({ action: 'create', name: '星芽计划 · Agent 迭代资料' }))
  await page.evaluate(request => window.wordgit.projects.request(request), { action: 'import', projectId: project.id, paths: [source], unpackFolder: true })
  let previous, folderIds = []
  for (let i = 1; i <= 3; i++) {
    const folder = path.join(source, '迭代0' + i); await fs.mkdir(folder)
    await fs.writeFile(path.join(folder, '研究笔记.md'), `# 第 ${i} 轮\n\n任务：${['初步整理资料', '补充实验说明', '完成评审修订'][i - 1]}\n\n本资料为软件功能示例。`)
    await fs.writeFile(path.join(folder, '分析.py'), `# 第 ${i} 轮分析脚本示例\nprint("示例数据")`)
    await fs.writeFile(path.join(folder, '结果.html'), '<style>body{font:16px sans-serif;padding:24px;background:#fffaf0}h1{font-size:26px}article{padding:16px;border:2px solid #222}</style><h1>本轮修改结果</h1><article>保留完整资料 · 记录迭代关系</article>')
    const result = await page.evaluate(request => window.wordgit.projects.request(request), { action: 'import', projectId: project.id, paths: [folder], previousNodeId: previous, title: ['第一轮 · 初步方案', '第二轮 · 补充实验', '第三轮 · 评审修订'][i - 1] })
    previous = result.nodeIds[0]; folderIds.push(previous)
  }
  let detail = await page.evaluate(projectId => window.wordgit.projects.request({ action: 'get', projectId }), project.id)
  const reference = detail.nodes.find(n => n.name === '资料')
  for (const [id, x, y] of [[folderIds[0], 40, 40], [folderIds[1], 340, 40], [folderIds[2], 640, 40], [reference.id, 340, 260]]) await page.evaluate(request => window.wordgit.projects.request(request), { action: 'updateNode', projectId: project.id, nodeId: id, position: { x, y } })
  await page.evaluate(request => window.wordgit.projects.request(request), { action: 'updateNode', projectId: project.id, nodeId: folderIds[2], note: '按评审意见补充说明；正文、脚本和结果一起保留。' })
  await page.evaluate(request => window.wordgit.projects.request(request), { action: 'setRelation', projectId: project.id, relation: { from: folderIds[2], to: reference.id, kind: 'reference', label: '参考资料', note: '整理本轮材料时参考' } })
  const script = detail.nodes.find(n => n.name === '分析.py' && n.parentId === folderIds[2]), explanation = detail.nodes.find(n => n.name === '方法说明.md')
  await page.evaluate(request => window.wordgit.projects.request(request), { action: 'setRelation', projectId: project.id, relation: { from: script.id, to: explanation.id, kind: 'example', label: '方法的示例脚本', note: '跨文件夹关系在详情中跳转' } })
  const categories = []
  for (const name of ['方案起草', '实验补充', '评审材料', '参考资料']) categories.push(await page.evaluate(request => window.wordgit.projects.request(request), { action: 'setCategory', projectId: project.id, category: { name } }))
  for (const [nodeId, categoryId] of [[folderIds[0], categories[0].id], [folderIds[1], categories[1].id], [folderIds[2], categories[2].id], [reference.id, categories[3].id], [script.id, categories[2].id]]) await page.evaluate(request => window.wordgit.projects.request(request), { action: 'updateNode', projectId: project.id, nodeId, categoryId })
  await page.getByLabel('管理模式').click(); await page.getByRole('option', { name: /项目管理/ }).click(); await page.getByRole('listitem', { name: '文档库 星芽计划 · Agent 迭代资料', exact: true }).click()
  await page.getByRole('button', { name: '文件关系图', exact: true }).click(); await page.getByRole('button', { name: '项目节点 第三轮 · 评审修订', exact: true }).click(); await expect(page.locator('.wg-project-relation')).toHaveCount(2)
  await fs.mkdir('docs/images', { recursive: true })
  const shot = async name => { await page.waitForTimeout(450); await page.locator('.wg-projectbar small').evaluateAll(elements => elements.forEach(el => { el.textContent = '项目资料 · 虚构示例'; el.removeAttribute('title') })); await page.screenshot({ path: `docs/images/${name}.png`, animations: 'disabled', scale: 'css' }) }
  await shot('project-manager')
  await page.getByRole('button', { name: '分类看板', exact: true }).click(); await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1920, 1000)); await shot('project-board'); await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1600, 1000)); await page.getByRole('button', { name: '文件关系图', exact: true }).click()
  await page.getByRole('button', { name: '项目节点 第三轮 · 评审修订', exact: true }).dblclick(); await page.getByRole('button', { name: '文件浏览', exact: true }).click(); await page.getByRole('listitem', { name: '资料 分析.py', exact: true }).click(); await expect(page.locator('.wg-project-relation')).toContainText('方法说明.md'); await shot('project-folder')
  await page.locator('.wg-project-relation .wg-icon-button').click(); await shot('project-relation'); await page.getByRole('button', { name: '取消', exact: true }).click()
  await page.getByRole('button', { name: '展开预览', exact: true }).click(); await shot('project-preview'); await page.getByRole('button', { name: '关闭', exact: true }).click()
  await page.getByRole('button', { name: '返回上一级', exact: true }).click(); await page.getByRole('button', { name: '文件关系图', exact: true }).click()
  await page.getByLabel('主题风格').click(); await page.getByRole('option').filter({ has: page.getByText('液态玻璃', { exact: true }) }).click()
  await page.locator('.wg-features-menu summary').click()
  for (const [id, label] of [['jade','玉绿珍珠'],['blue-white','蓝白'],['pink-green','粉绿'],['yellow-black','黄黑'],['lavender','紫白'],['peach','橙米']]) {
    await page.getByRole('menuitemradio', { name: label, exact: true }).click(); await page.keyboard.press('Escape'); await shot('palette-' + id); await page.locator('.wg-features-menu summary').click()
  }
  await shot('palette-picker'); await page.keyboard.press('Escape')
  console.log('Created current desktop screenshots using fictional project materials.')
} finally { await app.close(); if (path.dirname(temporary) === os.tmpdir() && path.basename(temporary).startsWith('dockitty-readme-project-')) await fs.rm(temporary, { recursive: true, force: true }) }
