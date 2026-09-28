// apps/desktop/src/renderer/src/components/SettingsPage.tsx
import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { api } from '@renderer/lib/ipc'
import { keys } from '@renderer/lib/queryKeys'
import { useUiStore } from '@renderer/store/uiStore'
import { StorageStats } from './StorageStats'
import { QuarantineList } from './QuarantineList'
import { Button } from '@renderer/components/ui/button'
import { Separator } from '@renderer/components/ui/separator'
import type { ScrubResult } from '@wordgit/shared'

export function SettingsPage() {
  const setRightPanel = useUiStore((s) => s.setRightPanel)
  const [scrubResult, setScrubResult] = useState<ScrubResult | null>(null)

  const { data: stats } = useQuery({
    queryKey: keys.storageStats(),
    queryFn: () => api.stats.storage(),
  })

  const { data: quarantineEntries } = useQuery({
    queryKey: keys.quarantineList(),
    queryFn: () => api.maintenance.quarantine.list(),
  })

  const scrubMutation = useMutation({
    mutationFn: () => api.maintenance.scrub(),
    onSuccess: (result) => setScrubResult(result),
  })

  const exportMutation = useMutation({
    mutationFn: async () => {
      const destPath = await api.dialog.savePath('选择备份保存位置', 'wordgit-backup.wgbak')
      if (!destPath) return
      return api.backup.export(destPath)
    },
  })

  const importMutation = useMutation({
    mutationFn: async () => {
      const srcPath = await api.dialog.pickFile('选择备份文件', [
        { name: 'word_git 备份', extensions: ['wgbak', 'zip'] },
      ])
      if (!srcPath) return
      const destDir = await api.dialog.pickFolder('选择恢复到的位置')
      if (!destDir) return
      await api.backup.import(srcPath, destDir)
    },
  })

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <h2 className="font-semibold text-sm">设置</h2>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs"
          onClick={() => setRightPanel('preview')}
        >
          返回预览
        </Button>
      </div>

      <div className="p-4 flex flex-col gap-6">
        {/* Storage stats */}
        {stats && (
          <section>
            <h3 className="text-sm font-semibold mb-3">存储统计</h3>
            <StorageStats stats={stats} />
          </section>
        )}

        <Separator />

        {/* Backup */}
        <section>
          <h3 className="text-sm font-semibold mb-3">备份</h3>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => exportMutation.mutate()}
              disabled={exportMutation.isPending}
            >
              备份导出
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => importMutation.mutate()}
              disabled={importMutation.isPending}
            >
              从备份恢复
            </Button>
          </div>
          {exportMutation.data && (
            <p className="text-xs text-muted-foreground mt-2">
              已导出 {exportMutation.data.fileCount} 个文件
            </p>
          )}
        </section>

        <Separator />

        {/* Scrub */}
        <section>
          <h3 className="text-sm font-semibold mb-3">数据完整性</h3>
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setScrubResult(null); scrubMutation.mutate() }}
            disabled={scrubMutation.isPending}
          >
            {scrubMutation.isPending ? '检查中…' : '数据自检'}
          </Button>
          {scrubResult && (
            <div className="mt-2 text-sm">
              <p>已检查 {scrubResult.checked} 个对象</p>
              {scrubResult.corrupted.length === 0 ? (
                <p className="text-green-600 dark:text-green-400">✓ 数据完整，无损坏</p>
              ) : (
                <p className="text-destructive">
                  发现 {scrubResult.corrupted.length} 个损坏对象，请从备份恢复
                </p>
              )}
            </div>
          )}
        </section>

        <Separator />

        {/* Quarantine */}
        <section>
          <h3 className="text-sm font-semibold mb-3">回收区（已删除的分支）</h3>
          <QuarantineList entries={quarantineEntries ?? []} />
        </section>
      </div>
    </div>
  )
}
