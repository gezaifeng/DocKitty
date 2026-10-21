// apps/desktop/src/renderer/src/components/SettingsPage.tsx
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Archive, ArrowLeft, Database, ShieldCheck, Settings as SettingsIcon, Trash2 } from 'lucide-react'
import { api } from '@renderer/lib/ipc'
import { keys } from '@renderer/lib/queryKeys'
import { useUiStore } from '@renderer/store/uiStore'
import { useRepoStore } from '@renderer/store/repoStore'
import { StorageStats } from './StorageStats'
import { QuarantineList } from './QuarantineList'
import { RecycleBin } from './RecycleBin'
import { Button } from '@renderer/components/ui/button'
import { Card, CardContent } from '@renderer/components/ui/card'
import type { ScrubResult } from '@wordgit/shared'

function SectionCard({
  icon: Icon,
  title,
  index,
  children,
}: {
  icon: typeof Database
  title: string
  index: number
  children: React.ReactNode
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: Math.min(index * 0.06, 0.3), ease: 'easeOut' }}
    >
      <Card>
        <CardContent className="p-4">
          <div className="mb-3 flex items-center gap-2">
            <Icon className="h-4 w-4 text-primary" aria-hidden />
            <h3 className="text-sm font-semibold">{title}</h3>
          </div>
          {children}
        </CardContent>
      </Card>
    </motion.div>
  )
}

export function SettingsPage() {
  const queryClient = useQueryClient()
  const setRepo = useRepoStore(s => s.setRepo)
  const selectDoc = useUiStore(s => s.selectDoc)
  const setRightPanel = useUiStore((s) => s.setRightPanel)
  const [scrubResult, setScrubResult] = useState<ScrubResult | null>(null)
  const [recycleOpen, setRecycleOpen] = useState(false)

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
        { name: '稿喵备份', extensions: ['wgbak', 'zip'] },
      ])
      if (!srcPath) return
      const destDir = await api.dialog.pickFolder('选择空目录作为恢复位置（不会覆盖已有仓库）')
      if (!destDir) return
      await api.backup.import(srcPath, destDir)
      const restored = await api.repo.open(destDir)
      queryClient.clear()
      selectDoc(null)
      setRepo(restored.repoRoot, restored.repoName)
      setRightPanel('preview')
    },
  })

  return (
    <div className="flex h-full min-w-0 flex-col overflow-y-auto">
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-3">
        <SettingsIcon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <h2 className="min-w-0 flex-1 text-sm font-semibold">设置</h2>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 shrink-0 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          onClick={() => setRightPanel('preview')}
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          返回预览
        </Button>
      </div>

      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-4">
        {/* Storage stats */}
        {stats && (
          <SectionCard icon={Database} title="存储统计" index={0}>
            <StorageStats stats={stats} />
          </SectionCard>
        )}

        {/* Backup */}
        <SectionCard icon={Archive} title="备份" index={1}>
          {(exportMutation.error || importMutation.error) && <p role="alert" className="mb-2 text-sm text-destructive">{(exportMutation.error || importMutation.error)?.message}</p>}
          <div className="flex flex-wrap gap-2">
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
            <p className="mt-2 text-xs text-muted-foreground">
              已导出 {exportMutation.data.fileCount} 个文件
            </p>
          )}
        </SectionCard>

        {/* Scrub */}
        <SectionCard icon={ShieldCheck} title="数据完整性" index={2}>
          {scrubMutation.error && <p role="alert" className="mb-2 text-sm text-destructive">{scrubMutation.error.message}</p>}
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
        </SectionCard>

        {/* Quarantine */}
        <SectionCard icon={Trash2} title="回收区" index={3}>
          <Button variant="outline" size="sm" onClick={() => setRecycleOpen(true)}>打开回收区</Button>
          <p className="my-2 text-sm text-muted-foreground">文档、版本和分支均可在回收区还原。下方为分支快捷还原。</p>
          <QuarantineList entries={quarantineEntries ?? []} />
        </SectionCard>
      </div>
      <RecycleBin open={recycleOpen} onClose={() => setRecycleOpen(false)}/>
    </div>
  )
}
