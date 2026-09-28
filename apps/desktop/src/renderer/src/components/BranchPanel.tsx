// apps/desktop/src/renderer/src/components/BranchPanel.tsx
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@renderer/lib/ipc'
import { keys } from '@renderer/lib/queryKeys'
import { useUiStore } from '@renderer/store/uiStore'
import { Button } from '@renderer/components/ui/button'
import { Badge } from '@renderer/components/ui/badge'

export function BranchPanel() {
  const selectedDocName = useUiStore((s) => s.selectedDocName)
  const queryClient = useQueryClient()
  const [newBranch, setNewBranch] = useState('')

  const { data: docs } = useQuery({
    queryKey: keys.docList(),
    queryFn: () => api.doc.list(),
    enabled: !!selectedDocName,
  })

  const doc = docs?.find((d) => d.docName === selectedDocName)

  const switchMutation = useMutation({
    mutationFn: (branch: string) => api.branch.switch(selectedDocName!, branch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.docList() })
    },
  })

  const createMutation = useMutation({
    mutationFn: (branch: string) => api.branch.create(selectedDocName!, branch, undefined),
    onSuccess: () => {
      setNewBranch('')
      queryClient.invalidateQueries({ queryKey: keys.docList() })
    },
  })

  if (!selectedDocName) {
    return (
      <div className="flex flex-col h-full items-center justify-center text-muted-foreground p-4">
        <p className="text-sm">选择一个文档</p>
        <p className="text-xs mt-1">从左侧列表选中文档后，这里显示其分支</p>
      </div>
    )
  }

  const currentBranch = doc?.currentBranch ?? '—'
  const branches = doc?.branches ?? []
  const otherBranches = branches.filter((b) => b !== currentBranch)

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-border shrink-0">
        <h2 className="font-semibold text-sm">分支管理</h2>
        <p className="text-xs text-muted-foreground mt-0.5 truncate">{selectedDocName}</p>
      </div>

      <div className="p-3 flex flex-col gap-4">
        {/* Current branch */}
        <div>
          <p className="text-xs text-muted-foreground mb-1">当前分支</p>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{currentBranch}</Badge>
          </div>
        </div>

        {/* Other branches */}
        {otherBranches.length > 0 && (
          <div>
            <p className="text-xs text-muted-foreground mb-1">其他分支</p>
            <div className="flex flex-col gap-1">
              {otherBranches.map((branch) => (
                <div key={branch} className="flex items-center justify-between gap-2">
                  <span className="text-sm">{branch}</span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 text-xs px-2"
                    onClick={() => switchMutation.mutate(branch)}
                    disabled={switchMutation.isPending}
                  >
                    切换
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Create branch */}
        <div>
          <p className="text-xs text-muted-foreground mb-1">创建分支</p>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="新分支名"
              value={newBranch}
              onChange={(e) => setNewBranch(e.target.value)}
              className="flex-1 h-7 text-sm border border-border rounded px-2 bg-background"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newBranch.trim()) {
                  createMutation.mutate(newBranch.trim())
                }
              }}
            />
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => {
                if (newBranch.trim()) createMutation.mutate(newBranch.trim())
              }}
              disabled={createMutation.isPending || !newBranch.trim()}
            >
              创建
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
