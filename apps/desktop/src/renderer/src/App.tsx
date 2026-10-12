import { useCallback, useEffect, useRef, useState } from 'react'
import { MotionConfig } from 'framer-motion'
import { useQueryClient } from '@tanstack/react-query'
import { useRepoStore } from '@renderer/store/repoStore'
import { useUiStore } from '@renderer/store/uiStore'
import { api } from '@renderer/lib/ipc'
import { MainLayout } from '@renderer/layouts/MainLayout'
import { StartupScreen } from './components/StartupScreen'
import { mascotImages } from './brand/mascot'

export function App() {
  const { repoRoot, setRepo } = useRepoStore()
  const theme = useUiStore(s => s.theme)
  const [checking, setChecking] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [entered, setEntered] = useState(false)
  const revealRef = useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()
  const finishEntrance = useCallback(() => setEntered(true), [])

  useEffect(() => {
    const root = document.documentElement
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => { const resolved = theme === 'system' ? (media.matches ? 'dark' : 'light') : theme; root.setAttribute('data-theme', resolved);root.setAttribute('data-theme-preference',theme);root.style.colorScheme=resolved === 'dark'?'dark':'light' }
    apply();media.addEventListener('change',apply)
    void api.appearance?.setTheme(theme === 'dark'?'dark':theme === 'system'?'system':'light')
    return()=>media.removeEventListener('change',apply)
  }, [theme])

  async function start() {
    setChecking(true); setError('')
    try {
      const result = await api.repo.bootstrap(repoRoot ?? undefined)
      setRepo(result.repoRoot, result.repoName)
      setNotice(result.notice ?? '')
      await queryClient.fetchQuery({ queryKey: ['library', result.repoRoot], queryFn: () => api.library.list(), retry: false })
    } catch (e) { setError((e as Error).message) }
    finally { setChecking(false) }
  }
  useEffect(() => { void start() }, [])

  async function reconnect() {
    try {
      const root = await api.dialog.pickFolder('选择原文档库文件夹（含 repo.yaml）')
      if (!root) return
      setChecking(true)
      const result = await api.repo.open(root)
      setRepo(result.repoRoot, '我的文档')
      await queryClient.fetchQuery({ queryKey: ['library', result.repoRoot], queryFn: () => api.library.list(), retry: false })
      setError('')
    } catch (e) { setError((e as Error).message) }
    finally { setChecking(false) }
  }

  return <MotionConfig reducedMotion="user">
    {error ? <div className="flex h-screen flex-col items-center justify-center gap-4 bg-background p-8"><h1 className="text-xl font-semibold">稿喵暂时无法打开文档库</h1><p role="alert" className="max-w-xl break-words text-sm text-destructive">{error}</p><p className="text-sm text-muted-foreground">原有文档不会被删除。请检查保存位置、磁盘或访问权限。</p><div className="flex gap-4"><button className="wg-button" onClick={() => void start()}>重试</button><button className="wg-button" onClick={() => void reconnect()}>选择原文档库位置</button></div></div> : <>
      {!checking && <div ref={revealRef} className="wg-app-reveal" inert={!entered} aria-hidden={!entered} data-entered={entered}><div className="wg-page-content"><MainLayout /></div><img className="wg-page-origin" src={mascotImages.paper} alt="" aria-hidden="true" /></div>}
      {!entered && <StartupScreen ready={!checking} revealRef={revealRef} onFinish={finishEntrance} />}
      {entered && notice && <div role="status" className="wg-startup-notice"><span>{notice}</span><button onClick={() => setNotice('')}>知道了</button></div>}
    </>}
  </MotionConfig>
}
