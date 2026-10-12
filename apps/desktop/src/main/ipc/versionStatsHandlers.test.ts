import { describe,it,expect,vi,beforeEach,afterEach } from 'vitest'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Repo, importDoc, commitDoc, createBranch, documentDetail, saveWorkspace, editVersionRelations } from '@wordgit/core'
import { setRepo,clearRepo } from '../repoState.js'
vi.mock('electron',()=>({ipcMain:{handle:vi.fn()}}))
import { versionStatsHandler,exportStatistics } from './versionStatsHandlers.js'
let dir:string,repo:Repo
beforeEach(async()=>{dir=await fs.mkdtemp(path.join(os.tmpdir(),'gaomiao-stats-'));repo=await Repo.init(path.join(dir,'library'),'测试');setRepo(repo)})
afterEach(async()=>{clearRepo();await fs.rm(dir,{recursive:true,force:true})})
describe('branch statistics',()=>{
 it('includes disconnected versions by membership and leaves missing predecessor differences empty',async()=>{
  const source=path.join(dir,'自由稿.txt');await fs.writeFile(source,'甲乙');const first=(await importDoc(repo,source)).commitId
  await fs.writeFile(path.join(repo.root,'workspace','自由稿.txt'),'甲乙丙丁');const second=(await commitDoc(repo,'自由稿.txt',{message:'第二稿',author:'测试'})).commitId!
  await editVersionRelations(repo,'自由稿.txt',second,{action:'disconnectPrevious'})
  const stats=await versionStatsHandler({docName:'自由稿.txt',branch:'main'})
  expect(stats.versions.map(v=>v.id)).toEqual([first,second])
  expect(stats.versions[1].values.characters).toBe(4)
  expect(stats.versions[1].values.inserted).toBeUndefined()
 })
 it('compares a chosen baseline using exclusive branch ownership and exports only requested versions',async()=>{
  const source=path.join(dir,'draft.txt');await fs.writeFile(source,'甲乙');await importDoc(repo,source,'draft.txt')
  const first=(await documentDetail(repo,'draft.txt')).versions[0],main=(await documentDetail(repo,'draft.txt')).currentBranch
  await createBranch(repo,'draft.txt','旧稿',{branch:main})
  await fs.writeFile(path.join(repo.root,'workspace','draft.txt'),'甲乙丙丁');await commitDoc(repo,'draft.txt',{message:'=危险标题',author:'研究者'})
  const stats=await versionStatsHandler({docName:'draft.txt',branch:main,compareBranch:'旧稿',onlyExclusive:true,baselineId:first.id})
  expect(stats.versions).toHaveLength(2);expect(stats.versions[1].baselineValues?.inserted).toBe(2);expect(stats.summary).toMatchObject({commonVersions:0,exclusiveVersions:2});expect(stats.baseline?.values.characters).toBe(2)
  const destination=path.join(dir,'统计.csv');await exportStatistics({docName:'draft.txt',branch:main,destination,versionIds:[stats.versions[1].id],baselineId:first.id})
  const csv=await fs.readFile(destination,'utf8');expect(csv).toContain("'=危险标题");expect(csv).toContain('中英混合字数');expect(csv.split('\r\n')).toHaveLength(2)
  expect((await documentDetail(repo,'draft.txt')).currentBranch).toBe(main);expect(await fs.readFile(path.join(repo.root,'workspace','draft.txt'),'utf8')).toBe('甲乙丙丁')
  await expect(versionStatsHandler({docName:'draft.txt',branch:main,baselineId:'a'.repeat(64)})).rejects.toThrow('基准版本')
  await expect(exportStatistics({docName:'draft.txt',branch:main,destination:path.join(repo.root,'workspace','draft.csv'),versionIds:[]})).rejects.toThrow('文档库之外')
 })
 it('uses exclusive ownership, updates overwritten snapshots, and never switches the editing branch',async()=>{
  const source=path.join(dir,'draft.txt');await fs.writeFile(source,'甲乙');await importDoc(repo,source,'draft.txt')
  const initial=await documentDetail(repo,'draft.txt'),main=initial.currentBranch
  await createBranch(repo,'draft.txt','试验',{branch:main})
  await fs.writeFile(path.join(repo.root,'workspace','draft.txt'),'甲乙丙');await commitDoc(repo,'draft.txt',{message:'第二稿',author:'测试'})
  let stats=await versionStatsHandler({docName:'draft.txt',branch:main})
  expect(stats.versions).toHaveLength(2);expect(stats.versions[1].values.characters).toBe(3);expect(stats.versions[1].values.inserted).toBe(1)
  const other=await versionStatsHandler({docName:'draft.txt',branch:'试验'});expect(other.versions).toHaveLength(0)
  expect((await documentDetail(repo,'draft.txt')).currentBranch).toBe(main)
  await fs.writeFile(path.join(repo.root,'workspace','draft.txt'),'甲乙丙丁');await saveWorkspace(repo,'draft.txt','replace','小修改')
  stats=await versionStatsHandler({docName:'draft.txt',branch:main});expect(stats.versions).toHaveLength(2);expect(stats.versions[1].values.characters).toBe(4);expect(stats.versions[1].values.revisions).toBe(1)
 })
})
