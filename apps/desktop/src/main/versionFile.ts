import { documentDetail, StorageContext, readCommit, readTree, getManifest, versionBytes, type Repo } from '@wordgit/core'

export async function versionFileSize(repo: Repo, docName: string, versionId: string): Promise<number | null> {
  const version = (await documentDetail(repo, docName)).versions.find(version => version.id === versionId)
  if (!version) throw new Error('该版本不存在')
  const context = StorageContext.forRepo(repo), tree = await readTree(context, (await readCommit(context, version.contentId)).tree)
  return tree.entries[''] ? (await getManifest(context, tree.entries[''])).size : null
}
export async function readVersionWithin(repo: Repo, docName: string, versionId: string, limit = 20 * 1024 * 1024) {
  const size = await versionFileSize(repo, docName, versionId)
  if (size === null) throw new Error('目录型文档请导出后查看')
  if (size > limit) throw new Error(`文件超过内置读取大小（${limit / 1048576} MiB），请导出后使用关联程序查看`)
  return versionBytes(repo, docName, versionId)
}
