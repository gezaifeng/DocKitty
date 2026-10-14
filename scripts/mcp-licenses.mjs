import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), directory = path.join(root, 'packages/mcp')
const meta = JSON.parse(await fs.readFile(path.join(directory, 'dist/metafile.json'), 'utf8')), packages = new Map()
for (const name of Object.keys(meta.inputs)) {
  let folder = path.dirname(path.resolve(directory, name))
  while (path.dirname(folder) !== folder) {
    try {
      const manifest = JSON.parse(await fs.readFile(path.join(folder, 'package.json'), 'utf8'))
      if (!manifest.name) { folder = path.dirname(folder); continue }
      if (!manifest.name.startsWith('@wordgit/')) packages.set(manifest.name + '@' + manifest.version, { folder, manifest })
      break
    } catch (error) { if (error.code !== 'ENOENT') throw error; folder = path.dirname(folder) }
  }
}
const notices = []
for (const [id, { folder, manifest }] of packages) {
  const destination = path.join(directory, 'licenses', id.replaceAll('/', '__').replace(/^@/, ''))
  await fs.mkdir(destination, { recursive: true })
  const files = (await fs.readdir(folder)).filter(n => /^(license|notice|third.party)/i.test(n))
  if (!files.length) throw new Error('Missing bundled dependency license: ' + id)
  for (const file of files) await fs.cp(path.join(folder, file), path.join(destination, file), { recursive: true })
  notices.push(`${id} — ${manifest.license} — ${manifest.repository?.url ?? manifest.homepage ?? ''}`)
}
await fs.writeFile(path.join(directory, 'licenses/README.md'), '# Bundled MCP dependencies\n\n' + notices.map(n => '- ' + n).join('\n') + '\n')
console.log(`Collected licenses for ${packages.size} bundled MCP packages.`)
