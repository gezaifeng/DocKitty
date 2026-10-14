import { build } from 'esbuild'
import { writeFile } from 'node:fs/promises'
const result = await build({ entryPoints: ['src/server.ts'], outfile: 'dist/server.cjs', bundle: true, platform: 'node', target: 'node20', format: 'cjs', sourcemap: true, metafile: true })
await writeFile('dist/metafile.json', JSON.stringify(result.metafile))
