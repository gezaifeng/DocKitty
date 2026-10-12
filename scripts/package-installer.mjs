import { promises as fs } from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
const desktop=path.join(root,'apps/desktop')
const run=(command,args,cwd=root)=>new Promise((resolve,reject)=>{
 const child=spawn(command,args,{cwd,windowsHide:true,env:{...process.env,CSC_IDENTITY_AUTO_DISCOVERY:'false',ELECTRON_BUILDER_CACHE:path.join(root,'node_modules/.cache/electron-builder')}})
 let output='';child.stdout.on('data',bytes=>{const text=String(bytes);process.stdout.write(text);output+=text});child.stderr.on('data',bytes=>process.stderr.write(bytes))
 child.on('error',reject);child.on('exit',code=>code===0?resolve(output):reject(new Error('Packaging failed: '+code)))
})
// A fresh runtime is essential: never package the delivery used for manuscript testing.
const output=await run(process.execPath,[path.join(root,'scripts/package-desktop.mjs')])
const portable=String(output).trim().split(/\r?\n/).at(-1)
await fs.access(path.join(portable,'稿喵.exe'))
const manifestFile=path.join(portable,'resources/app/package.json'),manifest=JSON.parse(await fs.readFile(manifestFile,'utf8'))
manifest.name='dockitty';manifest.author='gezaifeng';manifest.description='Local document version manager'
await fs.writeFile(manifestFile,JSON.stringify(manifest,null,2))
await fs.copyFile(path.join(desktop,'src/renderer/src/vendor/hairline/LICENSE'),path.join(portable,'Hairline-LICENSE.txt'))
await fs.writeFile(path.join(portable,'resources/app/resources/installer-mode.json'),'{}')
const require=createRequire(path.join(desktop,'package.json'))
const cli=require.resolve('electron-builder/out/cli/cli.js')
await run(process.execPath,[cli,'--win','nsis','--x64','--prepackaged',portable,'--config','electron-builder.yml','--publish','never'],desktop)
console.log('Installer generated from clean application: '+portable)
