import {chromium} from '@playwright/test';
import {promises as fs} from 'node:fs';
const expected=((await fs.readFile('README.md','utf8')).match(/!\[[^\]]*\]\([^)]+\)/g)||[]).length;
const b=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
try{
 const p=await b.newPage({viewport:{width:1400,height:1000}});await p.goto('https://github.com/gezaifeng/DocKitty',{waitUntil:'domcontentloaded'});
 const a=p.locator('article.markdown-body').first();await a.waitFor();await a.locator('details').evaluateAll(es=>es.forEach(e=>e.open=true));await a.locator('img').last().scrollIntoViewIfNeeded();
 await p.waitForFunction(expected=>{const images=[...document.querySelectorAll('article.markdown-body img')];return images.length===expected&&images.every(i=>i.complete&&i.naturalWidth>0)},expected,{timeout:30000});
 const result=await a.evaluate(el=>[...el.querySelectorAll('img')].map(i=>({alt:i.alt,loaded:i.complete&&i.naturalWidth>0})));
 await fs.mkdir('docs/release-0.5.7-audit',{recursive:true});await fs.writeFile('docs/release-0.5.7-audit/readme-github.json',JSON.stringify({passed:true,expected,images:result},null,2));
 await a.screenshot({path:'docs/release-0.5.7-audit/readme-github.png'});console.log(`PASS: all ${expected} README screenshots and diagrams loaded on GitHub`);
}finally{await b.close();}
