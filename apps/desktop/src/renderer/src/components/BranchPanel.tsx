// apps/desktop/src/renderer/src/components/BranchPanel.tsx
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { GitBranch, GitBranchPlus } from 'lucide-react'
import { api } from '@renderer/lib/ipc'
import { keys } from '@renderer/lib/queryKeys'
import { useUiStore } from '@renderer/store/uiStore'
import { Button } from '@renderer/components/ui/button'
import { Badge } from '@renderer/components/ui/badge'
import { Input } from '@renderer/components/ui/input'

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
      <div className="flex h-full flex-col items-center justify-center p-4 text-muted-foreground">
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <GitBranch className="h-6 w-6" aria-hidden />
        </div>
        <p className="text-sm">选择一个文档</p>
        <p className="mt-1 text-center text-xs">从左侧列表选中文档后，这里显示其分支</p>
      </div>
    )
  }

  const currentBranch = doc?.currentBranch ?? '—'
  const branches = doc?.branches ?? []
  const otherBranches = branches.filter((b) => b !== currentBranch)

  return (
    <div className="flex h-full min-w-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-3">
        <GitBranch className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">分支管理</h2>
          <p className="truncate text-xs text-muted-foreground" title={selectedDocName}>
            {selectedDocName}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-4 p-3">
        {/* Current branch */}
        <div>
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">当前分支</p>
          <Badge className="gap-1">
            <GitBranch className="h-3 w-3" aria-hidden />
            {currentBranch}
          </Badge>
        </div>

        {/* Other branches */}
        {otherBranches.length > 0 && (
          <div>
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">其他分支</p>
            <div className="flex flex-col gap-1">
              {otherBranches.map((branch, idx) => (
                <motion.div
                  key={branch}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, delay: Math.min(idx * 0.05, 0.3), ease: 'easeOut' }}
                  className="flex min-w-0 items-center justify-between gap-2 rounded-md px-1.5 py-1 transition-colors hover:bg-accent/50"
                >
                  <span className="min-w-0 flex-1 truncate text-sm" title={branch}>
                    {branch}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 shrink-0 px-2 text-xs"
                    onClick={() => switchMutation.mutate(branch)}
                    disabled={switchMutation.isPending}
                  >
                    切换
                  </Button>
                </motion.div>
              ))}
            </div>
          </div>
        )}

        {/* Create branch */}
        <div>
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">创建分支</p>
          <div className="flex gap-2">
            <Input
              type="text"
              placeholder="新分支名"
              value={newBranch}
              onChange={(e) => setNewBranch(e.target.value)}
              className="h-7 min-w-0 flex-1 px-2 text-sm"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newBranch.trim()) {
                  createMutation.mutate(newBranch.trim())
                }
              }}
            />
            <Button
              size="sm"
              className="h-7 shrink-0 text-xs"
              onClick={() => {
                if (newBranch.trim()) createMutation.mutate(newBranch.trim())
              }}
              disabled={createMutation.isPending || !newBranch.trim()}
            >
              <GitBranchPlus className="h-3.5 w-3.5" aria-hidden />
              创建
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
