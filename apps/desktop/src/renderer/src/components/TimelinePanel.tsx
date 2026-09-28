// apps/desktop/src/renderer/src/components/TimelinePanel.tsx
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
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
  docName: string
  isLatest: boolean
  onRestore(): void
}

function CommitEntry({ commit, isLatest, onRestore }: CommitEntryProps) {
  return (
    <div className="flex gap-3 py-3">
      {/* Timeline dot */}
      <div className="flex flex-col items-center w-4 shrink-0 mt-1">
        <div
          className={`w-3 h-3 rounded-full border-2 ${
            isLatest ? 'bg-primary border-primary' : 'bg-background border-muted-foreground'
          }`}
        />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-1">
          <p className="text-sm font-medium leading-tight">{commit.message}</p>
          {isLatest && (
            <Badge variant="secondary" className="text-xs shrink-0">最新</Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          {commit.author} · {formatDate(commit.createdAt)}
        </p>
        <div className="mt-1.5 flex gap-1">
          <Button
            size="sm"
            variant="outline"
            className="h-6 text-xs px-2"
            onClick={onRestore}
          >
            恢复到工作区
          </Button>
        </div>
      </div>
    </div>
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
      <div className="flex flex-col h-full items-center justify-center text-muted-foreground p-4">
        <p className="text-sm">选择一个文档</p>
        <p className="text-xs mt-1">从左侧列表选中文档后，这里显示它的版本历史</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-border shrink-0">
        <h2 className="font-semibold text-sm">时间线</h2>
        <p className="text-xs text-muted-foreground truncate">{selectedDocName}</p>
      </div>

      <ScrollArea className="flex-1">
        <div className="px-3">
          {isLoading && (
            <p className="text-center text-muted-foreground text-sm py-8">加载中…</p>
          )}

          {!isLoading && (!commits || commits.length === 0) && (
            <p className="text-center text-muted-foreground text-sm py-8">暂无版本历史</p>
          )}

          {commits?.map((commit, idx) => (
            <div key={commit.id}>
              <CommitEntry
                commit={commit}
                docName={selectedDocName}
                isLatest={idx === 0}
                onRestore={() => restoreMutation.mutate(commit.id)}
              />
              {idx < commits.length - 1 && (
                <div className="ml-[22px] border-l border-dashed border-muted-foreground/30 h-2" />
              )}
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  )
}
