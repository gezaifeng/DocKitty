import { promises as fs } from 'node:fs'
import { createRequire } from 'node:module'
const require = createRequire(new URL('../apps/desktop/package.json', import.meta.url))
const ts = require('typescript')
const source = await fs.readFile(new URL('../apps/desktop/src/renderer/src/brand/catScene.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText
export const { renderCat } = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'))
