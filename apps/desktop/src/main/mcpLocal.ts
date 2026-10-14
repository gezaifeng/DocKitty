import { app } from 'electron'
import { spawn, type ChildProcess } from 'node:child_process'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { writeFileAtomic } from '@wordgit/core'

type Settings = { enabled: boolean; port: number; token: string }
export type LocalMcpStatus = { running: boolean; url?: string; token?: string; error?: string }
let child: ChildProcess | undefined, currentRoot: string | undefined, status: LocalMcpStatus = { running: false }
let queue = Promise.resolve()
const settingsPath = () => path.join(app.getPath('userData'), 'dockitty-local-mcp.json')
const serverPath = () => path.join(app.getAppPath(), 'out', 'mcp', 'server.cjs')

async function settings(): Promise<Settings> {
  try {
    const value = JSON.parse(await fs.readFile(settingsPath(), 'utf8')) as Settings
    if (typeof value.enabled !== 'boolean' || !Number.isInteger(value.port) || value.port < 0 || value.port > 65535 || !/^[a-f0-9]{64}$/.test(value.token)) throw new Error('本机 MCP 设置无效')
    return value
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    return { enabled: false, port: 0, token: randomBytes(32).toString('hex') }
  }
}
export async function stopLocalMcp() {
  const previous = child; child = undefined; currentRoot = undefined; status = { running: false }
  if (!previous || previous.exitCode !== null) return
  await new Promise<void>(resolve => {
    const timer = setTimeout(() => { previous.kill(); resolve() }, 2000)
    previous.once('exit', () => { clearTimeout(timer); resolve() }); previous.stdin?.end()
  })
}
async function start(root: string, config: Settings) {
  if (child && currentRoot === root && status.running) return
  await stopLocalMcp(); await fs.access(serverPath())
  const process = spawn(globalThis.process.execPath, [serverPath(), '--repo', root, '--http', '--port', String(config.port)], { env: { ...globalThis.process.env, ELECTRON_RUN_AS_NODE: '1', DOCKITTY_HTTP_TOKEN: config.token }, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true })
  child = process; currentRoot = root
  try {
    const endpoint = await new Promise<{ url: string; token: string }>((resolve, reject) => {
      let output = '', error = ''
      const timer = setTimeout(() => reject(new Error('本机 MCP 服务启动超时')), 10000)
      const fail = (reason: Error) => { clearTimeout(timer); reject(reason) }
      process.stdout!.on('data', bytes => { output += String(bytes); if (output.includes('\n')) { try { const value = JSON.parse(output.split('\n')[0]); clearTimeout(timer); resolve(value) } catch { fail(new Error('本机 MCP 启动响应无效')) } } })
      process.stderr!.on('data', bytes => { error = (error + String(bytes)).slice(-2000) })
      process.once('error', fail); process.once('exit', code => { fail(new Error(error || `本机 MCP 服务退出：${code}`)); if (child === process) { child = undefined; status = { running: false, error: error || '本机 MCP 已停止' } } })
    })
    config.port = Number(new URL(endpoint.url).port)
    await writeFileAtomic(settingsPath(), Buffer.from(JSON.stringify(config)))
    status = { running: true, ...endpoint }
  } catch (error) { await stopLocalMcp(); throw error }
}
export async function localMcpStatus(): Promise<LocalMcpStatus> { await queue; return status }
export function syncLocalMcp(root: string | null) {
  queue = queue.then(async () => {
    const config = await settings()
    if (root && config.enabled) await start(root, config); else await stopLocalMcp()
  }).catch(error => { status = { running: false, error: (error as Error).message } })
}
export async function setLocalMcpEnabled(root: string, enabled: boolean): Promise<LocalMcpStatus> {
  const operation = queue.then(async () => {
    const config = await settings(); config.enabled = enabled
    if (enabled) await start(root, config)
    else { await stopLocalMcp(); await writeFileAtomic(settingsPath(), Buffer.from(JSON.stringify(config))) }
  })
  queue = operation.catch(error => { status = { running: false, error: (error as Error).message } })
  await operation; return status
}
