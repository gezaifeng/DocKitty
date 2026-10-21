import {chromium} from '@playwright/test'
import {pathToFileURL} from 'node:url'
import path from 'node:path'
import {promises as fs} from 'node:fs'
const dir=path.resolve('docs/brand-lab/runtime');await fs.mkdir(dir,{recursive:true})
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true})
try {
 const page=await browser.newPage({viewport:{width:1280,height:800}}),cdp=await page.context().newCDPSession(page),frames=[]
 cdp.on('Page.screencastFrame',event=>{frames.push({data:event.data,time:event.metadata.timestamp});void cdp.send('Page.screencastFrameAck',{sessionId:event.sessionId})})
 await cdp.send('Page.startScreencast',{format:'jpeg',quality:90,maxWidth:1280,maxHeight:800,everyNthFrame:1})
 await page.goto(pathToFileURL(path.resolve('docs/brand-lab/startup-preview.html')).href+'?load=slow')
 await page.waitForFunction(()=>document.querySelector('.wg-brand')&&!document.querySelector('.wg-startup'))
 await page.waitForTimeout(500);await cdp.send('Page.stopScreencast')
 if(frames.length<10)throw new Error('Insufficient captured motion frames')
 const encoder=await browser.newPage()
 const video=await encoder.evaluate(async frames=>{
  const canvas=document.createElement('canvas');canvas.width=1280;canvas.height=800;const ctx=canvas.getContext('2d');
  const decoded=await Promise.all(frames.map(async frame=>{const img=new Image();img.src='data:image/jpeg;base64,'+frame.data;await img.decode();return img}));
  const chunks=[],recorder=new MediaRecorder(canvas.captureStream(60),{mimeType:'video/webm;codecs=vp9',videoBitsPerSecond:4000000});
  recorder.ondataavailable=e=>chunks.push(e.data);const stopped=new Promise(r=>recorder.onstop=r);recorder.start();
  const start=performance.now(),first=frames[0].time;
  for(let i=0;i<frames.length;i++){const delay=(frames[i].time-first)*1000-(performance.now()-start);if(delay>0)await new Promise(r=>setTimeout(r,delay));ctx.drawImage(decoded[i],0,0,1280,800)}
  await new Promise(r=>setTimeout(r,350));recorder.stop();await stopped;
  const bytes=new Uint8Array(await new Blob(chunks,{type:'video/webm'}).arrayBuffer());let data='';for(let i=0;i<bytes.length;i+=8192)data+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(data)
 },frames)
 await fs.writeFile(path.join(dir,'startup-demo.webm'),Buffer.from(video,'base64'));await fs.writeFile(path.join(dir,'recording.json'),JSON.stringify({frames:frames.length,durationMs:(frames.at(-1).time-frames[0].time)*1000,source:'Chromium compositor screencast, native MediaRecorder encoding'},null,2));console.log('Recorded '+frames.length+' actual compositor frames')
}finally{await browser.close()}
