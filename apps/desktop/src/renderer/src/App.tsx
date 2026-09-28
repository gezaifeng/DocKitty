// apps/desktop/src/renderer/src/App.tsx
import { useEffect, useState } from 'react'
import { useRepoStore } from '@renderer/store/repoStore'
import { api } from '@renderer/lib/ipc'
import { MainLayout } from '@renderer/layouts/MainLayout'
import { FirstRunPage } from '@renderer/pages/FirstRunPage'

export function App() {
  const { repoRoot, setRepo, clearRepo } = useRepoStore()
  const [checking, setChecking] = useState(!!repoRoot)

  useEffect(() => {
    if (!repoRoot) {
      setChecking(false)
      return
    }
    api.repo
      .open(repoRoot)
      .then(({ repoRoot: r, repoName: n }) => {
        setRepo(r, n)
        setChecking(false)
      })
      .catch(() => {
        clearRepo()
        setChecking(false)
      })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (checking) {
    return (
      <div className="flex h-screen items-center justify-center text-muted-foreground">
        加载中…
      </div>
    )
  }

  return repoRoot ? <MainLayout /> : <FirstRunPage />
}
