// apps/desktop/src/renderer/src/components/DocListPanel.tsx
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { FileText, FolderPlus, Upload } from 'lucide-react'
import { api } from '@renderer/lib/ipc'
import { keys } from '@renderer/lib/queryKeys'
import { useRepoStore } from '@renderer/store/repoStore'
import { useUiStore } from '@renderer/store/uiStore'
import { DocCard } from './DocCard'
import { Button } from '@renderer/components/ui/button'
import { ScrollArea } from '@renderer/components/ui/scroll-area'

export function DocListPanel() {
  const repoRoot = useRepoStore((s) => s.repoRoot)
  const repoName = useRepoStore((s) => s.repoName)
  const { selectedDocName, selectDoc } = useUiStore()
  const queryClient = useQueryClient()

  const { data: docs, isLoading } = useQuery({
    queryKey: keys.docList(),
    queryFn: () => api.doc.list(),
    enabled: !!repoRoot,
  })

  const importMutation = useMutation({
    mutationFn: async () => {
      const filePath = await api.dialog.pickFile('选择要导入的文档', [
        { name: 'Office 文档', extensions: ['docx', 'xlsx', 'pptx'] },
        { name: '所有文件', extensions: ['*'] },
      ])
      if (!filePath) return
      await api.doc.import(filePath)
      await queryClient.invalidateQueries({ queryKey: keys.docList() })
    },
  })

  async function handleEdit(docName: string) {
    try {
      await api.doc.edit(docName)
    } catch (e) {
      console.error('编辑失败:', e)
    }
  }

  return (
    <div className="flex h-full min-w-0 flex-col">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-3">
        <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">文档</h2>
          {repoName && (
            <p className="max-w-full truncate text-xs text-muted-foreground" title={repoName}>
              {repoName}
            </p>
          )}
        </div>
        <Button
          size="sm"
          className="h-7 shrink-0 text-xs"
          onClick={() => importMutation.mutate()}
          disabled={importMutation.isPending}
        >
          <Upload className="h-3.5 w-3.5" aria-hidden />
          导入文档
        </Button>
      </div>

      {/* Doc list */}
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-1.5 p-2">
          {isLoading && (
            <p className="py-8 text-center text-sm text-muted-foreground">加载中…</p>
          )}

          {!isLoading && (!docs || docs.length === 0) && (
            <div className="flex flex-col items-center px-4 py-10 text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <FolderPlus className="h-6 w-6" aria-hidden />
              </div>
              <p className="text-sm text-muted-foreground">还没有文档</p>
              <p className="mt-1 text-xs text-muted-foreground">
                点击"导入文档"将现有文件添加到仓库
              </p>
            </div>
          )}

          {docs?.map((doc, idx) => (
            <DocCard
              key={doc.docId}
              doc={doc}
              index={idx}
              selected={selectedDocName === doc.docName}
              onSelect={() => selectDoc(doc.docName)}
              onEdit={() => handleEdit(doc.docName)}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  )
}
