// apps/desktop/src/renderer/src/components/EditLoopCard.tsx
import { useState } from 'react'
import { motion } from 'framer-motion'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { BellRing } from 'lucide-react'
import { api } from '@renderer/lib/ipc'
import { keys } from '@renderer/lib/queryKeys'
import { useUiStore } from '@renderer/store/uiStore'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'

const QUICK_TAGS = ['导师反馈修改', '自我修改', '格式整理', '内容增补', '错误修正']

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
      initial={{ opacity: 0, y: 32, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 16, scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
      className="fixed bottom-4 right-4 z-50 w-96 rounded-xl border border-primary/30 bg-card/95 p-4 shadow-2xl backdrop-blur"
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <BellRing className="h-4 w-4" aria-hidden />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold">检测到文件已保存</p>
            <p className="max-w-[230px] truncate text-xs text-muted-foreground" title={pendingCommitDocName}>
              {pendingCommitDocName}
            </p>
          </div>
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 shrink-0 text-xs text-muted-foreground hover:text-foreground"
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

      <div className="mb-3 flex flex-wrap gap-1">
        {QUICK_TAGS.map((tag) => (
          <Button
            key={tag}
            variant="outline"
            size="sm"
            className="h-6 px-2 text-xs"
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
        <p className="mt-2 text-center text-xs text-destructive">
          {(commitMutation.error as Error).message}
        </p>
      )}
    </motion.div>
  )
}
