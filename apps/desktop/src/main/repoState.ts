import type { Repo } from '@wordgit/core'

let _repo: Repo | null = null

export function getRepo(): Repo {
  if (!_repo) throw new Error('仓库未打开，请先创建或打开仓库')
  return _repo
}

export function setRepo(repo: Repo): void {
  _repo = repo
}

export function clearRepo(): void {
  _repo = null
}
