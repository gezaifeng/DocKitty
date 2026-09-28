import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { Command } from 'commander'
import {
  Repo,
  importDoc, commitDoc, listCommits, createBranch, switchBranch, checkoutDoc,
  listBranches, docIdOf,
} from '@wordgit/core'

export function buildProgram(): Command {
  const program = new Command()
  program.name('wordgit').description('word_git 命令行（M1）')

  program.command('init')
    .argument('<库路径>', '仓库目录，如 论文库.wg')
    .action(async (p: string) => {
      const repo = await Repo.init(p, path.basename(p))
      console.log(JSON.stringify({ root: repo.root }))
    })

  program.command('import')
    .argument('<库路径>')
    .argument('<外部路径>', '要导入的文件或目录')
    .option('--name <文档名>', '入库名（默认取文件名）')
    .action(async (p: string, src: string, opts: { name?: string }) => {
      const repo = await Repo.open(p)
      console.log(JSON.stringify(await importDoc(repo, src, opts.name)))
    })

  program.command('commit')
    .argument('<库路径>')
    .argument('<文档名>')
    .requiredOption('-m, --message <信息>')
    .option('--author <作者>', '作者名（默认 unknown）', 'unknown')
    .option('--branch <分支>')
    .action(async (p: string, doc: string, opts: { message: string; author: string; branch?: string }) => {
      const repo = await Repo.open(p)
      console.log(JSON.stringify(await commitDoc(repo, doc, {
        message: opts.message, author: opts.author, branch: opts.branch,
      })))
    })

  program.command('log')
    .argument('<库路径>')
    .argument('<文档名>')
    .option('--branch <分支>')
    .option('--json', '输出 JSON', false)
    .action(async (p: string, doc: string, opts: { branch?: string; json: boolean }) => {
      const repo = await Repo.open(p)
      const commits = await listCommits(repo, doc, opts.branch)
      if (opts.json) {
        console.log(JSON.stringify(commits))
      } else {
        for (const c of commits) console.log(`${c.id.slice(0, 8)}  ${c.createdAt}  ${c.message}`)
      }
    })

  program.command('checkout')
    .argument('<库路径>')
    .argument('<文档名>')
    .option('--branch <分支>')
    .option('--commit <提交ID>')
    .action(async (p: string, doc: string, opts: { branch?: string; commit?: string }) => {
      const repo = await Repo.open(p)
      console.log(JSON.stringify(await checkoutDoc(repo, doc, { branch: opts.branch, commitId: opts.commit })))
    })

  program.command('branch')
    .argument('<库路径>')
    .argument('<文档名>')
    .argument('[分支名]', '缺省则列出分支')
    .option('--from-commit <提交ID>', '指定起点提交')
    .option('--switch', '创建后切换过去', false)
    .action(async (p: string, doc: string, name: string | undefined, opts: { fromCommit?: string; switch: boolean }) => {
      const repo = await Repo.open(p)
      if (!name) {
        console.log(JSON.stringify(await listBranches(repo, docIdOf(doc))))
        return
      }
      await createBranch(repo, doc, name, opts.fromCommit ? { commitId: opts.fromCommit } : undefined)
      if (opts.switch) await switchBranch(repo, doc, name)
      console.log(JSON.stringify({ created: name, switched: opts.switch }))
    })

  return program
}

const isMain = process.argv[1] !== undefined
  && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) {
  buildProgram().parseAsync(process.argv).catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  })
}
