import { chromium } from '@playwright/test'
import { promises as fs } from 'node:fs'
const folder='apps/desktop/src/renderer/src/assets/mascot-2d'
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true})
try {
 const page=await browser.newPage()
 const data='data:image/png;base64,'+(await fs.readFile(folder+'/atlas.png')).toString('base64')
 const parts=await page.evaluate(async data=>{
  const img=new Image();img.src=data;await img.decode();const results=[]
  for(let i=0;i<6;i++){
   const w=img.width/3,h=img.height/2,c=document.createElement('canvas');c.width=Math.ceil(w);c.height=Math.ceil(h)
   const ctx=c.getContext('2d');ctx.drawImage(img,(i%3)*w,Math.floor(i/3)*h,w,h,0,0,c.width,c.height)
   const pixels=ctx.getImageData(0,0,c.width,c.height).data;let x0=c.width,y0=c.height,x1=0,y1=0
   for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++)if(pixels[(y*c.width+x)*4+3]>8){x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y)}
   x0=Math.max(0,x0-2);y0=Math.max(0,y0-2);x1=Math.min(c.width-1,x1+2);y1=Math.min(c.height-1,y1+2)
   const cut=document.createElement('canvas');cut.width=x1-x0+1;cut.height=y1-y0+1;cut.getContext('2d').drawImage(c,x0,y0,cut.width,cut.height,0,0,cut.width,cut.height)
   results.push(cut.toDataURL('image/png').split(',')[1])
  }return results
 },data)
 const names=['body','head','tail','left-paw','right-paw','paper']
 for(let i=0;i<names.length;i++)await fs.writeFile(folder+'/'+names[i]+'.png',Buffer.from(parts[i],'base64'))
 console.log('Extracted six generated 2D anime rig layers, preserving RGBA; no artwork redrawn')
}finally{await browser.close()}
