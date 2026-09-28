// apps/desktop/src/renderer/src/components/TimelinePanel.tsx
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { Clock, RotateCcw } from 'lucide-react'
import { api } from '@renderer/lib/ipc'
import { keys } from '@renderer/lib/queryKeys'
import { useUiStore } from '@renderer/store/uiStore'
import { Button } from '@renderer/components/ui/button'
import { Badge } from '@renderer/components/ui/badge'
import { ScrollArea } from '@renderer/components/ui/scroll-area'
import type { CommitNode } from '@wordgit/shared'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('zh-CN', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

interface CommitEntryProps {
  commit: CommitNode
  index: number
  isLatest: boolean
  onRestore(): void
}

const commitItemVariants = {
  initial: { opacity: 0, x: -10 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -10 },
}

function CommitEntry({ commit, index, isLatest, onRestore }: CommitEntryProps) {
  return (
    <motion.div
      variants={commitItemVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={{
        duration: 0.2,
        delay: Math.min(index * 0.05, 0.4),
        ease: 'easeOut' as const,
      }}
      className="flex gap-3 rounded-lg py-3 transition-colors hover:bg-accent/40"
    >
      {/* Timeline dot */}
      <div className="mt-1 flex w-4 shrink-0 flex-col items-center">
        <div
          className={
            isLatest
              ? 'h-3 w-3 rounded-full border-2 border-primary bg-primary ring-4 ring-primary/15'
              : 'h-3 w-3 rounded-full border-2 border-muted-foreground/50 bg-background'
          }
        />
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-1">
          <p className="min-w-0 flex-1 break-words text-sm font-medium leading-snug">
            {commit.message}
          </p>
          {isLatest && (
            <Badge variant="secondary" className="shrink-0 text-xs">最新</Badge>
          )}
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {commit.author} · {formatDate(commit.createdAt)}
        </p>
        <div className="mt-1.5">
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
            onClick={onRestore}
          >
            <RotateCcw className="h-3 w-3" aria-hidden />
            恢复到工作区
          </Button>
        </div>
      </div>
    </motion.div>
  )
}

export function TimelinePanel() {
  const selectedDocName = useUiStore((s) => s.selectedDocName)
  const queryClient = useQueryClient()

  const { data: commits, isLoading } = useQuery({
    queryKey: keys.commits(selectedDocName ?? '', undefined),
    queryFn: () => api.commit.list(selectedDocName!),
    enabled: !!selectedDocName,
  })

  const restoreMutation = useMutation({
    mutationFn: (commitId: string) =>
      api.commit.checkout(selectedDocName!, { commitId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.docList() })
    },
  })

  if (!selectedDocName) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-4 text-muted-foreground">
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <Clock className="h-6 w-6" aria-hidden />
        </div>
        <p className="text-sm">选择一个文档</p>
        <p className="mt-1 text-center text-xs">从左侧列表选中文档后，这里显示它的版本历史</p>
      </div>
    )
  }

  return (
    <div className="flex h-full min-w-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-3">
        <Clock className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">时间线</h2>
          <p className="truncate text-xs text-muted-foreground" title={selectedDocName}>
            {selectedDocName}
          </p>
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="px-3">
          {isLoading && (
            <p className="py-8 text-center text-sm text-muted-foreground">加载中…</p>
          )}

          {!isLoading && (!commits || commits.length === 0) && (
            <p className="py-8 text-center text-sm text-muted-foreground">暂无版本历史</p>
          )}

          <AnimatePresence initial={false}>
            {commits?.map((commit, idx) => (
              <div key={commit.id}>
                <CommitEntry
                  commit={commit}
                  index={idx}
                  isLatest={idx === 0}
                  onRestore={() => restoreMutation.mutate(commit.id)}
                />
                {idx < commits.length - 1 && (
                  <div className="ml-[22px] h-2 border-l border-dashed border-muted-foreground/30" />
                )}
              </div>
            ))}
          </AnimatePresence>
        </div>
      </ScrollArea>
    </div>
  )
}
