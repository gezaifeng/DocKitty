import { promises as fs } from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const desktop = path.join(root, 'apps/desktop')
let runtime = process.env.WORDGIT_ELECTRON_DIST
if (!runtime) {
  try { runtime = path.dirname(createRequire(path.join(desktop, 'package.json'))('electron')) }
  catch { runtime = path.join(root, 'node_modules/.cache/electron-runtime/dist') }
}
await fs.access(path.join(runtime, 'electron.exe'))
await fs.access(path.join(desktop, 'out/main/index.js'))
// Create a fresh package; never delete or overwrite a previous delivery.
await fs.mkdir(path.join(root, 'dist'), { recursive: true })
const delivery = await fs.mkdtemp(path.join(root, 'dist', 'gaomiao-windows-'))
await fs.cp(runtime, delivery, { recursive: true })
await fs.rename(path.join(delivery, 'electron.exe'), path.join(delivery, '稿喵.exe'))
const rcedit = path.join(root, 'node_modules/.cache/rcedit/rcedit-x64.exe')
const digest = '3e7801db1a5edbec91b49a24a094aad776cb4515488ea5a4ca2289c400eade2a'
try { await fs.access(rcedit) } catch {
  const response = await fetch('https://github.com/electron/rcedit/releases/download/v2.0.0/rcedit-x64.exe')
  if (!response.ok) throw new Error('Cannot download rcedit: ' + response.status)
  const bytes = Buffer.from(await response.arrayBuffer())
  if (createHash('sha256').update(bytes).digest('hex') !== digest) throw new Error('rcedit checksum mismatch')
  await fs.mkdir(path.dirname(rcedit), { recursive: true })
  await fs.writeFile(rcedit, bytes)
}
if (createHash('sha256').update(await fs.readFile(rcedit)).digest('hex') !== digest) throw new Error('rcedit checksum mismatch')
execFileSync(rcedit, [path.join(delivery, '稿喵.exe'), '--set-icon', path.join(desktop, 'resources/icon.ico'), '--set-version-string', 'ProductName', '稿喵', '--set-version-string', 'FileDescription', '稿喵', '--set-version-string', 'OriginalFilename', '稿喵.exe', '--set-file-version', '0.4.0', '--set-product-version', '0.4.0'], { windowsHide: true })
const app = path.join(delivery, 'resources/app')
await fs.mkdir(app, { recursive: true })
await fs.cp(path.join(desktop, 'out'), path.join(app, 'out'), { recursive: true })
await fs.mkdir(path.join(app, 'resources'), { recursive: true })
for (const name of ['icon.png', 'icon.ico']) await fs.copyFile(path.join(desktop, 'resources', name), path.join(app, 'resources', name))
await fs.writeFile(path.join(app, 'package.json'), JSON.stringify({ name: 'word_git', productName: '稿喵', version: '0.4.0', type: 'module', main: 'out/main/index.js' }, null, 2))
await fs.copyFile(path.join(root, 'docs/使用教程.md'), path.join(delivery, '使用教程.md'))
console.log(delivery)

