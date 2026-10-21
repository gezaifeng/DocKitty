import { chromium } from '@playwright/test'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

// Record actual browser frames with its native encoder; no external codec dependency.
const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
  const encoder = await browser.newPage({ viewport: { width: 960, height: 600 } })
  await encoder.setContent('<canvas width="960" height="600"></canvas>')
  await encoder.evaluate(() => {
    const canvas = document.querySelector('canvas'), stream = canvas.captureStream(0)
    window.recordTrack = stream.getVideoTracks()[0]
    window.recordCanvas = canvas
    window.recordChunks = []
    window.recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8', videoBitsPerSecond: 1600000 })
    recorder.ondataavailable = event => { if (event.data.size) recordChunks.push(event.data) }
    recorder.start()
  })
  await page.bringToFront()
  await page.goto(pathToFileURL(path.resolve('docs/liquid-glass-lab/index.html')).href)
  const cdp = await page.context().newCDPSession(page)
  let frames = 0, paint = Promise.resolve()
  cdp.on('Page.screencastFrame', frame => {
    void cdp.send('Page.screencastFrameAck', { sessionId: frame.sessionId })
    paint = paint.then(() => encoder.evaluate(async data => {
      const img = new Image()
      img.src = 'data:image/jpeg;base64,' + data
      await img.decode()
      recordCanvas.getContext('2d').drawImage(img, 0, 0, 960, 600)
      recordTrack.requestFrame()
    }, frame.data)).then(() => { frames++ })
  })
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 85, maxWidth: 960, maxHeight: 600, everyNthFrame: 3 })
  const box = await page.locator('#main-content').boundingBox()
  await page.waitForTimeout(1500)
  for (let i = 0; i < 26; i++) {
    await page.mouse.move(box.x + 85 + i * 24, box.y + 160 + Math.sin(i / 5) * 95)
    await page.waitForTimeout(35)
  }
  await page.getByRole('heading', { name: '我的文档', exact: true }).hover()
  await page.waitForTimeout(6500)
  await cdp.send('Page.stopScreencast')
  await paint
  const base64 = await encoder.evaluate(() => new Promise(resolve => {
    recorder.onstop = () => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result.split(',')[1])
      reader.readAsDataURL(new Blob(recordChunks, { type: 'video/webm' }))
    }
    recorder.stop()
  }))
  if (frames < 30) throw new Error('Not enough rendered frames to demonstrate movement')
  const file = path.resolve('docs/liquid-glass-lab/audit/liquid-glass-motion.webm')
  const bytes = Buffer.from(base64, 'base64')
  await fs.writeFile(file, bytes)
  console.log(JSON.stringify({ file, frames, bytes: bytes.length, actualBrowserFrames: true }))
} finally { await browser.close() }
