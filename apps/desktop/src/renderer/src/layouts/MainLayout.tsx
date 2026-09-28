// apps/desktop/src/renderer/src/layouts/MainLayout.tsx
import { useUiStore } from '@renderer/store/uiStore'
import { DocListPanel } from '@renderer/components/DocListPanel'
import { TimelinePanel } from '@renderer/components/TimelinePanel'
import { PreviewPanel } from '@renderer/components/PreviewPanel'
import { SettingsPage } from '@renderer/components/SettingsPage'
import { EditLoopCard } from '@renderer/components/EditLoopCard'
import { useWatcherEvents } from '@renderer/hooks/useWatcherEvents'

export function MainLayout() {
  useWatcherEvents()
  const { rightPanel, pendingCommitDocName } = useUiStore()

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

      {/* Right: Preview or Settings */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {rightPanel === 'settings' ? <SettingsPage /> : <PreviewPanel />}
      </div>

      {/* Floating commit guide card */}
      {pendingCommitDocName && <EditLoopCard />}
    </div>
  )
}
