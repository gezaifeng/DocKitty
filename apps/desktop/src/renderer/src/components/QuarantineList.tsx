// apps/desktop/src/renderer/src/components/QuarantineList.tsx
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@renderer/lib/ipc'
import { keys } from '@renderer/lib/queryKeys'
import { Button } from '@renderer/components/ui/button'
import { Badge } from '@renderer/components/ui/badge'
import type { QuarantineEntry } from '@wordgit/shared'

interface QuarantineListProps {
  entries: QuarantineEntry[]
}

export function QuarantineList({ entries }: QuarantineListProps) {
  const queryClient = useQueryClient()

  const restoreMutation = useMutation({
    mutationFn: (entryId: string) => api.maintenance.quarantine.restore(entryId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.quarantineList() })
    },
  })

  if (entries.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">回收区为空</p>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {entries.map((entry) => (
        <div
          key={entry.id}
          className="flex items-center justify-between p-2 rounded-lg border border-border"
        >
          <div className="min-w-0">
            <p className="text-sm font-medium">{entry.docName}</p>
            <div className="flex items-center gap-1 mt-0.5">
              <Badge variant="outline" className="text-xs">{entry.branch}</Badge>
              <span className="text-xs text-muted-foreground">
                {new Date(entry.deletedAt).toLocaleDateString('zh-CN')}
              </span>
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs shrink-0 ml-2"
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
