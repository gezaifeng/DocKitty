import { promises as fs } from 'node:fs'
import { chromium } from '@playwright/test'
const asset='apps/desktop/src/renderer/src/assets/mascot-tail-fixed/'
const uri='data:image/png;base64,'+(await fs.readFile(asset+'cat.png')).toString('base64')
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true})
try {
 const page=await browser.newPage()
 const result=await page.evaluate(async uri=>{
  const img=new Image();img.src=uri;await img.decode()
  const sizes=[16,24,32,48,64,128,256],images=[]
  for(const size of sizes){
   const canvas=document.createElement('canvas');canvas.width=canvas.height=size;const ctx=canvas.getContext('2d');ctx.imageSmoothingQuality='high'
   ctx.fillStyle='#000';ctx.fillRect(size*.03,size*.03,size*.94,size*.94);ctx.fillStyle='#F7CB46';ctx.fillRect(size*.065,size*.065,size*.835,size*.835)
   ctx.drawImage(img,size*.06,size*.025,size*.88,size*.94)
   images.push(canvas.toDataURL('image/png').split(',')[1])
  }
  const canvas=document.createElement('canvas');canvas.width=99;canvas.height=123
  canvas.getContext('2d').drawImage(img,519,747,99,123,0,0,99,123)
  return {images,paper:canvas.toDataURL('image/png').split(',')[1]}
 },uri)
 await fs.writeFile(asset+'paper.png',Buffer.from(result.paper,'base64'))
 const sizes=[16,24,32,48,64,128,256],images=result.images.map(p=>Buffer.from(p,'base64')),png=images.at(-1)
 await fs.writeFile('apps/desktop/resources/icon.png',png)
 await fs.writeFile('apps/desktop/src/renderer/src/assets/gaomiao.png',png)
 const header=Buffer.alloc(6+16*sizes.length);header.writeUInt16LE(1,2);header.writeUInt16LE(sizes.length,4);let offset=header.length
 sizes.forEach((size,i)=>{const p=6+i*16;header[p]=size===256?0:size;header[p+1]=header[p];header.writeUInt16LE(1,p+4);header.writeUInt16LE(32,p+6);header.writeUInt32LE(images[i].length,p+8);header.writeUInt32LE(offset,p+12);offset+=images[i].length})
 await fs.writeFile('apps/desktop/resources/icon.ico',Buffer.concat([header,...images]))
 console.log('Exported complete generated cat PNG/ICO and matching badge crop; no character geometry drawn')
} finally {await browser.close()}
