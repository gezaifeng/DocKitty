// apps/desktop/src/renderer/src/components/QuarantineList.tsx
import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArchiveRestore } from 'lucide-react'
import { api } from '@renderer/lib/ipc'
import { keys } from '@renderer/lib/queryKeys'
import { Button } from '@renderer/components/ui/button'
import { Badge } from '@renderer/components/ui/badge'
import type { QuarantineEntry } from '@wordgit/shared'

interface QuarantineListProps {
  entries: QuarantineEntry[]
  onRestored?(): void
}

export function QuarantineList({ entries, onRestored }: QuarantineListProps) {
  const queryClient = useQueryClient()
  const [names,setNames]=useState<Record<string,string>>({})

  const restoreMutation = useMutation({
    mutationFn: (entryId: string) => names[entryId]?.trim()?api.maintenance.quarantine.restore(entryId,names[entryId].trim()):api.maintenance.quarantine.restore(entryId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.quarantineList() })
      queryClient.invalidateQueries({ queryKey: ['library'] })
      queryClient.invalidateQueries({ queryKey: ['documentDetail'] })
      onRestored?.()
    },
  })

  if (entries.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-dashed border-border p-3 text-muted-foreground">
        <ArchiveRestore className="h-4 w-4 shrink-0 opacity-60" aria-hidden />
        <p className="text-sm">回收区为空</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {restoreMutation.error && <p role="alert" className="text-sm text-destructive">{restoreMutation.error.message}</p>}
      {entries.map((entry) => (
        <div
          key={entry.id}
          className="flex items-center justify-between gap-2 rounded-lg border border-border p-2 transition-colors hover:bg-accent/40"
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-medium" title={entry.docName}>
              {entry.docName}
            </p>
            <div className="mt-0.5 flex items-center gap-1">
              <Badge variant="outline" className="text-xs">{entry.branch}</Badge>
              <span className="text-xs text-muted-foreground">
                {new Date(entry.deletedAt).toLocaleDateString('zh-CN')}
              </span>
            </div>
          </div>
          <input className="wg-restore-name" aria-label={`恢复分支名称 ${entry.branch}`} placeholder={entry.branch} value={names[entry.id]??''} onChange={e=>setNames(n=>({...n,[entry.id]:e.target.value}))} />
          <Button
            size="sm"
            variant="outline"
            className="ml-2 h-7 shrink-0 text-xs"
            onClick={() => restoreMutation.mutate(entry.id)}
            disabled={restoreMutation.isPending}
          >
            还原
          </Button>
        </div>
      ))}
    </div>
  )
}
