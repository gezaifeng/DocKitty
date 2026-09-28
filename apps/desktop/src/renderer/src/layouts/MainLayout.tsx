// apps/desktop/src/renderer/src/layouts/MainLayout.tsx
import { useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useUiStore } from '@renderer/store/uiStore'
import { DocListPanel } from '@renderer/components/DocListPanel'
import { TimelinePanel } from '@renderer/components/TimelinePanel'
import { PreviewPanel } from '@renderer/components/PreviewPanel'
import { SettingsPage } from '@renderer/components/SettingsPage'
import { BranchPanel } from '@renderer/components/BranchPanel'
import { EditLoopCard } from '@renderer/components/EditLoopCard'
import { ThemeToggle } from '@renderer/components/ThemeToggle'
import { useWatcherEvents } from '@renderer/hooks/useWatcherEvents'

const rightPanelVariants = {
  initial: { opacity: 0, x: 16 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -16 },
}

const rightPanelTransition = { duration: 0.18, ease: 'easeOut' as const }

export function MainLayout() {
  useWatcherEvents()
  const rightPanel = useUiStore((s) => s.rightPanel)
  const pendingCommitDocName = useUiStore((s) => s.pendingCommitDocName)
  const containerRef = useRef<HTMLDivElement>(null)

  return (
    <div
      ref={containerRef}
      className="relative flex h-screen overflow-hidden bg-background text-foreground"
    >
      {/* Left: Document list */}
      <aside className="flex w-72 min-w-0 flex-shrink-0 flex-col border-r border-border">
        <DocListPanel />
      </aside>

      {/* Center: Timeline */}
      <aside className="flex w-80 min-w-0 flex-shrink-0 flex-col border-r border-border">
        <TimelinePanel />
      </aside>

      {/* Center-right: Branch panel */}
      <aside className="flex w-56 min-w-0 flex-shrink-0 flex-col border-r border-border">
        <BranchPanel />
      </aside>

      {/* Right: Preview or Settings */}
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <AnimatePresence mode="wait" initial={false}>
          {rightPanel === 'settings' ? (
            <motion.div
              key="settings"
              {...rightPanelVariants}
              transition={rightPanelTransition}
              className="flex min-h-0 flex-1 flex-col"
            >
              <SettingsPage />
            </motion.div>
          ) : (
            <motion.div
              key="preview"
              {...rightPanelVariants}
              transition={rightPanelTransition}
              className="flex min-h-0 flex-1 flex-col"
            >
              <PreviewPanel />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Draggable theme toggle */}
      <ThemeToggle containerRef={containerRef} />

      {/* Floating commit guide card */}
      {pendingCommitDocName && <EditLoopCard />}
    </div>
  )
}
