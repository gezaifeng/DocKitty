// apps/desktop/src/renderer/src/App.tsx
import { useEffect, useState } from 'react'
import { MotionConfig } from 'framer-motion'
import { useRepoStore } from '@renderer/store/repoStore'
import { useUiStore } from '@renderer/store/uiStore'
import { api } from '@renderer/lib/ipc'
import { MainLayout } from '@renderer/layouts/MainLayout'
import { FirstRunPage } from '@renderer/pages/FirstRunPage'

export function App() {
  const { repoRoot, setRepo, clearRepo } = useRepoStore()
  const theme = useUiStore((s) => s.theme)
  const [checking, setChecking] = useState(!!repoRoot)

  // Apply data-theme attribute to <html> element
  useEffect(() => {
    const root = document.documentElement
    if (theme === 'dark') {
      root.setAttribute('data-theme', 'dark')
    } else if (theme === 'light') {
      root.setAttribute('data-theme', 'light')
    } else {
      root.removeAttribute('data-theme')
    }
  }, [theme])

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

  return (
    <MotionConfig reducedMotion="user">
      {repoRoot ? <MainLayout /> : <FirstRunPage />}
    </MotionConfig>
  )
}
