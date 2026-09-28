// apps/desktop/src/renderer/src/components/StorageStats.tsx
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@renderer/components/ui/card'
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
    <div className="grid grid-cols-2 gap-3">
      <Card>
        <CardHeader className="p-3 pb-1">
          <CardTitle className="text-xs font-medium text-muted-foreground">版本数</CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-0">
          <p className="text-2xl font-bold">{stats.versionCount} 个版本</p>
          <p className="text-xs text-muted-foreground">{stats.docCount} 个文档</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="p-3 pb-1">
          <CardTitle className="text-xs font-medium text-muted-foreground">实际占用</CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-0">
          <p className="text-2xl font-bold">{formatBytes(stats.totalBytes)}</p>
          <p className="text-xs text-muted-foreground">{stats.objectCount} 个对象</p>
        </CardContent>
      </Card>
    </div>
  )
}
