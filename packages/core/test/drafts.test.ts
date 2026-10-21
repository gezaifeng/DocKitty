import { beforeEach, afterEach, it, expect } from 'vitest'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { Repo, importDoc, startDraft, recordDraftSave, documentDetail, versionBytes, createBranch, updateDocument, updateVersion, exportBackup, importBackup, deleteBranchSafe } from '../src/index.js'
import { tmpDir, cleanup } from './helpers.js'

let root: string, repo: Repo, source: string, first: string
beforeEach(async () => { root = await tmpDir(); repo = await Repo.init(path.join(root, '库.wg'), '测试'); source = path.join(root, '真实源文件.txt'); await fs.writeFile(source, '不可覆盖的原始内容'); first = (await importDoc(repo, source, '论文.txt')).commitId })
afterEach(async () => cleanup(root))

it('首次修改形成一个子版本，多次保存更新同一节点，源文件与父快照不变', async () => {
 const draft = await startDraft(repo, '论文.txt', first, 'main')
 expect(draft.workspacePath).not.toBe(source)
 expect(draft.workspacePath).not.toBe(path.join(repo.root, 'workspace', '论文.txt'))
 expect(await recordDraftSave(repo, draft.workspacePath)).toBeUndefined()
 await fs.writeFile(draft.workspacePath, '第一次修改'); const saved = await recordDraftSave(repo, draft.workspacePath)
 expect(saved?.status).toBe('created');expect((await documentDetail(repo,'论文.txt')).versions).toHaveLength(2)
 expect((await documentDetail(repo,'论文.txt')).versions.find(v=>v.id===saved?.versionId)?.parents).toEqual([first])
 expect(await recordDraftSave(repo,draft.workspacePath)).toBeUndefined()
 await fs.writeFile(draft.workspacePath,'第二次修改');const updated=await recordDraftSave(repo,draft.workspacePath)
 expect(updated?.status).toBe('updated');expect(updated?.versionId).toBe(saved?.versionId)
 expect((await documentDetail(repo,'论文.txt')).versions).toHaveLength(2)
 expect(new TextDecoder().decode(await versionBytes(repo,'论文.txt',saved!.versionId))).toBe('第二次修改')
 expect(new TextDecoder().decode(await versionBytes(repo,'论文.txt',first))).toBe('不可覆盖的原始内容')
 expect(await fs.readFile(source,'utf8')).toBe('不可覆盖的原始内容')
})

it('Git末端规则：其他分支已发展时main仍可继续；main历史稿必须建新分支', async () => {
 const a=await startDraft(repo,'论文.txt',first,'杂志A');await fs.writeFile(a.workspacePath,'A投稿');const av=await recordDraftSave(repo,a.workspacePath)
 const main=await startDraft(repo,'论文.txt',first,'main');await fs.writeFile(main.workspacePath,'主稿继续');const mv=await recordDraftSave(repo,main.workspacePath)
 expect((await documentDetail(repo,'论文.txt')).branchHeads['杂志A']).toBe(av?.versionId)
 await expect(startDraft(repo,'论文.txt',first,'main')).rejects.toThrow('末端')
 const b=await startDraft(repo,'论文.txt',first,'杂志B');await fs.writeFile(b.workspacePath,'B投稿');const bv=await recordDraftSave(repo,b.workspacePath)
 const detail=await documentDetail(repo,'论文.txt')
 expect(detail.versions.find(v=>v.id===bv?.versionId)?.parents).toEqual([first]);expect(detail.branchHeads.main).toBe(mv?.versionId)
 await deleteBranchSafe(repo,'论文.txt','杂志A');expect((await documentDetail(repo,'论文.txt')).branchHeads.main).toBe(mv?.versionId)
 expect(new TextDecoder().decode(await versionBytes(repo,'论文.txt',first))).toBe('不可覆盖的原始内容')
})

it('会话可重启恢复；显式创建下一稿后旧副本不再更新历史', async () => {
 const draft=await startDraft(repo,'论文.txt',first,'main');await fs.writeFile(draft.workspacePath,'停机保存的修改')
 repo=await Repo.open(repo.root);const saved=await recordDraftSave(repo,draft.workspacePath)
 const next=await startDraft(repo,'论文.txt',saved!.versionId,'main');await fs.writeFile(draft.workspacePath,'旧窗口再次保存')
 expect(await recordDraftSave(repo,draft.workspacePath)).toBeUndefined()
 await fs.writeFile(next.workspacePath,'下一稿');await recordDraftSave(repo,next.workspacePath)
 expect((await documentDetail(repo,'论文.txt')).versions).toHaveLength(3)
 expect(new TextDecoder().decode(await versionBytes(repo,'论文.txt',saved!.versionId))).toBe('停机保存的修改')
})

it('回收版本或整篇文档后，Word旧窗口保存不复活记录，不影响源文件', async () => {
 const draft=await startDraft(repo,'论文.txt',first,'main');await updateVersion(repo,'论文.txt',first,{deleted:true})
 await fs.writeFile(draft.workspacePath,'回收后保存');expect(await recordDraftSave(repo,draft.workspacePath)).toBeUndefined()
 await updateVersion(repo,'论文.txt',first,{deleted:false});const next=await startDraft(repo,'论文.txt',first,'main')
 await updateDocument(repo,'论文.txt',{deleted:true});await fs.writeFile(next.workspacePath,'文档回收后保存')
 expect(await recordDraftSave(repo,next.workspacePath)).toBeUndefined();expect((await documentDetail(repo,'论文.txt')).versions).toHaveLength(1)
 expect(await fs.readFile(source,'utf8')).toBe('不可覆盖的原始内容')
})

it('显式覆盖使用独立副本，保留修订；备份还原仍包含编辑副本', async () => {
 const draft=await startDraft(repo,'论文.txt',first,'main','replace');await fs.writeFile(draft.workspacePath,'覆盖的小修改')
 const saved=await recordDraftSave(repo,draft.workspacePath);expect(saved?.versionId).toBe(first)
 expect((await documentDetail(repo,'论文.txt')).versions).toHaveLength(1)
 const backup=path.join(root,'备份.zip');await exportBackup(repo,backup);const restored=await importBackup(backup,path.join(root,'还原库'))
 expect(await fs.readFile(path.join(restored.root,(await documentDetail(restored,'论文.txt')).draft!.path),'utf8')).toBe('覆盖的小修改')
 expect(await fs.readFile(source,'utf8')).toBe('不可覆盖的原始内容')
})

it('未完成的首次保存可恢复分支指针且不重复建节点', async () => {
 const draft=await startDraft(repo,'论文.txt',first,'main');await fs.writeFile(draft.workspacePath,'下一稿')
 const saved=await recordDraftSave(repo,draft.workspacePath)
 const metadata=path.join(repo.root,'library',encodeURIComponent('论文.txt')+'.json')
 const meta=JSON.parse(await fs.readFile(metadata,'utf8'));meta.drafts[0].pendingHead=true;await fs.writeFile(metadata,JSON.stringify(meta))
 await fs.writeFile(path.join(repo.root,'refs','heads',encodeURIComponent('论文.txt'),'main'),first)
 await recordDraftSave(repo,draft.workspacePath)
 expect((await documentDetail(repo,'论文.txt')).branchHeads.main).toBe(saved?.versionId)
 expect((await documentDetail(repo,'论文.txt')).versions).toHaveLength(2)
})
