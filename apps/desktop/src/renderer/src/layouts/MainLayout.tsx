// apps/desktop/src/renderer/src/layouts/MainLayout.tsx
import { useEffect } from 'react'
import { useUiStore } from '@renderer/store/uiStore'
import { DocListPanel } from '@renderer/components/DocListPanel'
import { TimelinePanel } from '@renderer/components/TimelinePanel'
import { PreviewPanel } from '@renderer/components/PreviewPanel'
import { SettingsPage } from '@renderer/components/SettingsPage'
import { BranchPanel } from '@renderer/components/BranchPanel'
import { EditLoopCard } from '@renderer/components/EditLoopCard'
import { useWatcherEvents } from '@renderer/hooks/useWatcherEvents'
import type { Theme } from '@renderer/store/uiStore'

const THEME_LABELS: Record<Theme, string> = {
  light: '☀️',
  dark: '🌙',
  system: '💻',
}

const THEME_CYCLE: Theme[] = ['system', 'light', 'dark']

export function MainLayout() {
  useWatcherEvents()
  const { rightPanel, pendingCommitDocName, theme, setTheme } = useUiStore()

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

  function cycleTheme() {
    const idx = THEME_CYCLE.indexOf(theme)
    setTheme(THEME_CYCLE[(idx + 1) % THEME_CYCLE.length])
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      {/* Left: Document list */}
      <div className="w-72 flex-shrink-0 border-r border-border flex flex-col">
        <DocListPanel />
      </div>

      {/* Center: Timeline */}
      <div className="w-80 flex-shrink-0 border-r border-border flex flex-col">
        <TimelinePanel />
      </div>

      {/* Center-right: Branch panel */}
      <div className="w-56 flex-shrink-0 border-r border-border flex flex-col">
        <BranchPanel />
      </div>

      {/* Right: Preview or Settings */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {rightPanel === 'settings' ? <SettingsPage /> : <PreviewPanel />}
      </div>

      {/* Theme toggle button */}
      <button
        aria-label={`切换主题 (当前: ${theme})`}
        title={`切换主题 (当前: ${theme})`}
        onClick={cycleTheme}
        className="fixed top-3 right-3 z-50 w-8 h-8 rounded-full border border-border bg-card text-foreground shadow-sm hover:bg-accent transition-colors text-sm flex items-center justify-center"
      >
        {THEME_LABELS[theme]}
      </button>

      {/* Floating commit guide card */}
      {pendingCommitDocName && <EditLoopCard />}
    </div>
  )
}
