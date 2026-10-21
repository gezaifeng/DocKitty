import { _electron as electron } from '@playwright/test'
import { promises as fs } from 'node:fs'
import path from 'node:path'
const folder = await fs.mkdtemp(path.resolve('dist/system-editor-check-'))
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
const app = await electron.launch({ executablePath: path.resolve('node_modules/.cache/electron-runtime/dist/electron.exe'), args: [path.resolve('apps/desktop'), '--user-data-dir=' + path.join(folder, 'profile')], env })
try {
  const page = await app.firstWindow()
  await page.waitForFunction(() => !!window.wordgit)
  const result = await page.evaluate(async root => {
    await window.wordgit.repo.create(root, '系统编辑器验证')
    const document = await window.wordgit.library.mutate({ type: 'createDocument', name: '系统编辑器验证', format: 'docx' })
    try {
      const opened = await window.wordgit.library.mutate({ type: 'edit', docName: document.docName })
      return { opened: true, workspacePath: opened.workspacePath }
    } catch (error) { return { opened: false, error: error.message } }
  }, path.join(folder, '验证.wg'))
  await fs.writeFile(path.join(folder, 'result.json'), JSON.stringify(result, null, 2))
  console.log(JSON.stringify({ folder, ...result }))
} finally { await app.close() }
