// apps/desktop/src/renderer/src/components/StorageStats.tsx
import { HardDrive, History } from 'lucide-react'
import type { StorageStats as Stats } from '@wordgit/shared'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}

interface StorageStatsProps {
  stats: Stats
}

export function StorageStats({ stats }: StorageStatsProps) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/40 p-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <History className="h-4 w-4" aria-hidden />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">版本数</p>
          <p className="text-2xl font-bold tabular-nums leading-tight">{stats.versionCount} 个版本</p>
          <p className="text-xs text-muted-foreground">{stats.docCount} 个文档</p>
        </div>
      </div>
      <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/40 p-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <HardDrive className="h-4 w-4" aria-hidden />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">实际占用</p>
          <p className="text-2xl font-bold tabular-nums leading-tight">{formatBytes(stats.totalBytes)}</p>
          <p className="text-xs text-muted-foreground">{stats.objectCount} 个对象</p>
        </div>
      </div>
    </div>
  )
}
