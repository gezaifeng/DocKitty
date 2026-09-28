// apps/desktop/src/renderer/src/components/DocListPanel.tsx
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
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
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-3 flex items-center justify-between border-b border-border shrink-0">
        <div>
          <h2 className="font-semibold text-sm">文档</h2>
          {repoName && (
            <p className="text-xs text-muted-foreground truncate max-w-[160px]" title={repoName}>
              {repoName}
            </p>
          )}
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          onClick={() => importMutation.mutate()}
          disabled={importMutation.isPending}
        >
          导入文档
        </Button>
      </div>

      {/* Doc list */}
      <ScrollArea className="flex-1">
        <div className="p-2 flex flex-col gap-1.5">
          {isLoading && (
            <p className="text-center text-muted-foreground text-sm py-8">加载中…</p>
          )}

          {!isLoading && (!docs || docs.length === 0) && (
            <div className="text-center py-10 px-4">
              <p className="text-muted-foreground text-sm">还没有文档</p>
              <p className="text-xs text-muted-foreground mt-1">点击"导入文档"将现有文件添加到仓库</p>
            </div>
          )}

          {docs?.map((doc) => (
            <DocCard
              key={doc.docId}
              doc={doc}
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
