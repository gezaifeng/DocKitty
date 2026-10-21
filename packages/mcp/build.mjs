import { build } from 'esbuild'
import { readFile, writeFile } from 'node:fs/promises'
const version = JSON.parse(await readFile(new URL('./package.json', import.meta.url), 'utf8')).version
const desktopVersion = JSON.parse(await readFile(new URL('../../apps/desktop/package.json', import.meta.url), 'utf8')).version
const result = await build({ define: { DOCKITTY_VERSION: JSON.stringify(version), DOCKITTY_DESKTOP_VERSION: JSON.stringify(desktopVersion) }, entryPoints: ['src/server.ts'], outfile: 'dist/server.cjs', bundle: true, platform: 'node', target: 'node20', format: 'cjs', sourcemap: true, metafile: true })
await writeFile('dist/metafile.json', JSON.stringify(result.metafile))
