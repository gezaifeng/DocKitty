import { test, expect, _electron as electron } from '@playwright/test'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createHash } from 'node:crypto'
import { auditPath } from './auditPath'

const run = promisify(execFile), hash = async (file: string) => createHash('sha256').update(await fs.readFile(file)).digest('hex')
const officeScript = path.resolve('scripts/verify-office-real.ps1')
const office = async (args: string[]) => run('pwsh.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', officeScript, ...args], { windowsHide: true, timeout: 90000 }).catch(error => { throw new Error(String(error) + '\n' + String(error.stdout) + '\n' + String(error.stderr)) })

test('real Microsoft Office files round-trip byte-for-byte and Word saved drafts update one managed version', async () => {
  test.setTimeout(240000)
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'dockitty-office-')), sources = path.join(temporary, 'source'), exported = path.join(temporary, 'export')
  await fs.mkdir(sources); await fs.mkdir(exported)
  await office(['-Mode', 'Create', '-Folder', sources])
  const env = { ...process.env, WORDGIT_LIBRARY_HOME: temporary }; delete env.ELECTRON_RUN_AS_NODE
  const app = await electron.launch({ executablePath: process.env.WORDGIT_ELECTRON ?? path.resolve('node_modules/.cache/electron-runtime/dist/electron.exe'), args: [process.env.WORDGIT_APP ?? path.resolve('apps/desktop'), '--user-data-dir=' + path.join(temporary, 'profile')], env })
  try {
    const page = await app.firstWindow(); await expect(page.getByLabel('主题风格')).toBeVisible(); await app.evaluate(({ shell }) => { shell.openPath = async () => '' })
    const groups = [['word', 'docx', 10], ['excel', 'xlsx', 3], ['powerpoint', 'pptx', 3], ['legacy', 'doc', 1], ['legacy', 'xls', 1], ['legacy', 'ppt', 1]] as const
    const hashes: Array<{ name: string; sha256: string; versionId: string }> = [], sourceHashes = new Map<string, string>()
    for (const [prefix, ext, count] of groups) {
      const docName = prefix + '.' + ext
      for (let index = 1; index <= count; index++) {
        const filename = prefix === 'legacy' ? docName : prefix + '-' + String(index).padStart(2, '0') + '.' + ext, source = path.join(sources, filename)
        const digest = await hash(source); sourceHashes.set(source, digest)
        const versionId = await page.evaluate(async ({ index, docName, source }) => index === 1 ? (await window.wordgit.doc.import(source, docName)).commitId : (await window.wordgit.library.mutate({ type: 'importVersion', docName, sourcePath: source, message: 'Office actual revision ' + index })).versionId!, { index, docName, source })
        const destination = path.join(exported, filename)
        await page.evaluate(({ docName, versionId, destination }) => window.wordgit.library.mutate({ type: 'export', docName, versionId, destination }), { docName, versionId, destination })
        expect(await hash(destination)).toBe(digest); hashes.push({ name: filename, sha256: digest, versionId })
      }
      expect((await page.evaluate(docName => window.wordgit.library.detail(docName), docName)).versions).toHaveLength(count)
    }
    const details = await page.evaluate(() => window.wordgit.library.detail('word.docx')), latest = details.branchHeads.main
    const draft = await page.evaluate(latest => window.wordgit.library.mutate({ type: 'edit', docName: 'word.docx', versionId: latest, branch: 'main', mode: 'new', title: 'Word 实际保存稿' }), latest)
    await office(['-Mode', 'EditWord', '-Folder', temporary, '-File', draft.workspacePath!, '-Text', ' First actual Word save.'])
    await expect.poll(async () => (await page.evaluate(() => window.wordgit.library.detail('word.docx'))).versions.length, { timeout: 15000 }).toBe(11)
    const next = (await page.evaluate(() => window.wordgit.library.detail('word.docx'))).branchHeads.main
    await office(['-Mode', 'EditWord', '-Folder', temporary, '-File', draft.workspacePath!, '-Text', ' Second actual Word save.'])
    await expect.poll(async () => (await page.evaluate(() => window.wordgit.library.detail('word.docx'))).versions.find(v => v.id === next)?.revisionCount, { timeout: 15000 }).toBeGreaterThan(0)
    expect((await page.evaluate(() => window.wordgit.library.detail('word.docx'))).versions).toHaveLength(11)
    const stats = await page.evaluate(() => window.wordgit.stats.versions('powerpoint.pptx', 'main'))
    expect(stats.versions.at(-1)?.values.slides).toBe(3)
    const wordStats = await page.evaluate(() => window.wordgit.stats.versions('word.docx', 'main'))
    expect(wordStats.versions.at(-1)?.values.tables).toBe(1); expect(wordStats.versions.at(-1)?.values.images).toBeGreaterThan(0)
    await office(['-Mode', 'Verify', '-Folder', exported])
    const opened = JSON.parse((await fs.readFile(path.join(exported, 'office-open-report.json'), 'utf8')).replace(/^\uFEFF/, ''))
    expect(opened).toHaveLength(19)
    for (const [source, digest] of sourceHashes) expect(await hash(source)).toBe(digest)
    const output = auditPath('office-real'); await fs.mkdir(output, { recursive: true })
    await fs.writeFile(path.join(output, 'result.json'), JSON.stringify({ passed: true, engines: ['Microsoft Word', 'Microsoft Excel', 'Microsoft PowerPoint'], wps: 'not installed; not verified', files: hashes, opened, wordDraft: { initial: 10, afterFirstSave: 11, afterSecondSave: 11 }, originalSourcesUnchanged: true, isolatedFixtures: true }, null, 2))
  } finally {
    await app.close()
    if (path.dirname(temporary) === os.tmpdir() && path.basename(temporary).startsWith('dockitty-office-')) await fs.rm(temporary, { recursive: true, force: true })
  }
})
