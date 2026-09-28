// apps/desktop/src/renderer/src/components/EditLoopCard.tsx
import { useState } from 'react'
import { motion } from 'framer-motion'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@renderer/lib/ipc'
import { keys } from '@renderer/lib/queryKeys'
import { useUiStore } from '@renderer/store/uiStore'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'

const QUICK_TAGS = ['导师反馈修改', '自我修改', '格式整理', '内容增补', '错误修正']

const slideInFromBottom = {
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.22, ease: 'easeOut' as const },
}

export function EditLoopCard() {
  const { pendingCommitDocName, clearPendingCommit } = useUiStore()
  const [message, setMessage] = useState('')
  const queryClient = useQueryClient()

  const commitMutation = useMutation({
    mutationFn: async () => {
      if (!pendingCommitDocName) return
      await api.commit.create(pendingCommitDocName, message || '保存修改', 'user', undefined)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.docList() })
      if (pendingCommitDocName) {
        queryClient.invalidateQueries({ queryKey: keys.commits(pendingCommitDocName) })
      }
      setMessage('')
      clearPendingCommit()
    },
  })

  if (!pendingCommitDocName) return null

  return (
    <motion.div
      {...slideInFromBottom}
      className="fixed bottom-4 right-4 w-96 z-50 shadow-2xl rounded-xl border border-primary/30 bg-card p-4"
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="font-semibold text-sm">检测到文件已保存</p>
          <p className="text-xs text-muted-foreground truncate max-w-[220px]">
            {pendingCommitDocName}
          </p>
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs"
          onClick={clearPendingCommit}
        >
          忽略
        </Button>
      </div>

      <Input
        placeholder="描述本次修改…"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) commitMutation.mutate() }}
        className="mb-2"
      />

      <div className="flex flex-wrap gap-1 mb-3">
        {QUICK_TAGS.map((tag) => (
          <Button
            key={tag}
            variant="outline"
            size="sm"
            className="h-6 text-xs px-2"
            onClick={() => setMessage(tag)}
          >
            {tag}
          </Button>
        ))}
      </div>

      <Button
        className="w-full"
        onClick={() => commitMutation.mutate()}
        disabled={commitMutation.isPending}
      >
        {commitMutation.isPending ? '提交中…' : '提交新版本'}
      </Button>

      {commitMutation.isError && (
        <p className="text-destructive text-xs mt-2 text-center">
          {(commitMutation.error as Error).message}
        </p>
      )}
    </motion.div>
  )
}
