import { promises as fs } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
const userSettings = [path.join(os.homedir(), '.codex/config.toml'), path.join(os.homedir(), '.claude.json'), path.join(os.homedir(), '.claude/settings.json'), path.join(os.homedir(), '.cursor/mcp.json')]
const hashes = () => Promise.all(userSettings.map(file => fs.readFile(file).then(bytes => createHash('sha256').update(bytes).digest('hex'), error => { if (error.code === 'ENOENT') return null; throw error })))
const originalSettings = await hashes()
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'dockitty-agent-configs-'))
  const runtime = path.resolve('dist/install-smoke-0.5.0/稿喵.exe')
const run = (command, args, env) => new Promise((resolve, reject) => {
  const child = spawn(command, args, { env: { ...process.env, ...env }, cwd: temporary, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }); let output = ''
  const timer = setTimeout(() => { child.kill(); reject(new Error('Client configuration verification timed out')) }, 45000)
  child.stdout.on('data', bytes => { output += String(bytes) }); child.stderr.on('data', bytes => { output += String(bytes) })
  child.once('error', reject); child.once('exit', code => { clearTimeout(timer); code === 0 ? resolve(output) : reject(new Error(output)) })
})
try {
  await fs.mkdir(path.join(temporary, 'codex'))
  // Bootstrap an isolated repository through the bundled application, without touching the user's profile.
  const { _electron: electron } = await import('@playwright/test')
  const app = await electron.launch({ executablePath: runtime, args: ['--user-data-dir=' + path.join(temporary, 'app-profile')], env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined, WORDGIT_LIBRARY_HOME: undefined } })
  let config
  try {
    const page = await app.firstWindow(); await page.getByRole('button', { name: '总览工作台', exact: true }).waitFor()
    config = await page.evaluate(() => window.wordgit.projects.request({ action: 'mcpConfig' }))
  } finally { await app.close() }
  await fs.writeFile(path.join(temporary, 'codex/config.toml'), config.codex)
  const codex = await run(process.execPath, ['D:/codex/node_modules/@openai/codex/bin/codex.js', 'mcp', 'get', 'dockitty'], { CODEX_HOME: path.join(temporary, 'codex') })
  if (!codex.includes('ELECTRON_RUN_AS_NODE') || !codex.includes('stdio')) throw new Error('Codex configuration was not parsed')
  await fs.writeFile(path.join(temporary, '.mcp.json'), config.claude)
  await run('C:/Users/29807/.local/bin/claude.exe', ['mcp', 'add-json', '--scope', 'local', 'dockitty', JSON.stringify(JSON.parse(config.claude).mcpServers.dockitty)], { CLAUDE_CONFIG_DIR: path.join(temporary, 'claude') })
  const claude = await run('C:/Users/29807/.local/bin/claude.exe', ['mcp', 'list'], { CLAUDE_CONFIG_DIR: path.join(temporary, 'claude') })
  if (!/dockitty.*Connected/is.test(claude)) throw new Error('Claude Code MCP connection was not confirmed: ' + claude)
  const cursor = JSON.parse(config.cursor)
  if (JSON.stringify(cursor.mcpServers.dockitty) !== JSON.stringify(JSON.parse(config.claude).mcpServers.dockitty)) throw new Error('Cursor stdio configuration differs')
  if (JSON.stringify(await hashes()) !== JSON.stringify(originalSettings)) throw new Error('User agent configuration changed during isolated verification')
  const proof = { codexCliParsed: true, claudeCodeConnected: true, cursorConfigValidated: true, cursorGuiInstalled: false, usedBundledRuntime: true, userConfigurationsModified: false, paidModelCalls: 0 }
  await fs.writeFile('docs/project-audit/agent-client-verification.json', JSON.stringify(proof, null, 2)); console.log(JSON.stringify(proof))
} finally { if (path.dirname(temporary) === os.tmpdir() && path.basename(temporary).startsWith('dockitty-agent-configs-')) await fs.rm(temporary, { recursive: true, force: true }) }
