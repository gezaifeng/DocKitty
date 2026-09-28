// apps/desktop/src/renderer/src/components/PreviewPanel.tsx
import { useQuery } from '@tanstack/react-query'
import { Eye, FileQuestion, Settings } from 'lucide-react'
import { api } from '@renderer/lib/ipc'
import { useUiStore } from '@renderer/store/uiStore'
import { DocxPreview } from './DocxPreview'
import { XlsxPreview } from './XlsxPreview'
import { Button } from '@renderer/components/ui/button'

export function PreviewPanel() {
  const { selectedDocName, setRightPanel } = useUiStore()

  const { data: previewData, isLoading } = useQuery({
    queryKey: ['preview', selectedDocName],
    queryFn: () => api.preview.getBytes(selectedDocName!),
    enabled: !!selectedDocName,
  })

  return (
    <div className="flex h-full min-w-0 flex-col">
      {/* Toolbar */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
        <Eye className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold" title={selectedDocName ?? undefined}>
          {selectedDocName ? `预览：${selectedDocName}` : '预览'}
        </h2>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 shrink-0 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          onClick={() => setRightPanel('settings')}
        >
          <Settings className="h-3.5 w-3.5" aria-hidden />
          设置
        </Button>
      </div>

      {/* Content */}
      <div className="min-h-0 flex-1 overflow-hidden">
        {!selectedDocName && (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <div className="flex flex-col items-center">
              <Eye className="mb-3 h-8 w-8 opacity-40" aria-hidden />
              <p className="text-sm">选择一个文档以查看预览</p>
            </div>
          </div>
        )}

        {selectedDocName && isLoading && (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <p className="text-sm">加载预览…</p>
          </div>
        )}

        {selectedDocName && !isLoading && previewData && (
          <>
            {previewData.ext === 'docx' && (
              <DocxPreview data={previewData.data} />
            )}
            {(previewData.ext === 'xlsx' || previewData.ext === 'xls') && (
              <XlsxPreview data={previewData.data} />
            )}
            {previewData.ext !== 'docx' &&
              previewData.ext !== 'xlsx' &&
              previewData.ext !== 'xls' && (
                <div className="flex h-full items-center justify-center text-muted-foreground">
                  <div className="text-center">
                    <FileQuestion className="mx-auto mb-3 h-10 w-10 opacity-40" aria-hidden />
                    <p className="text-sm">暂不支持预览 .{previewData.ext} 文件</p>
                    <p className="mt-1 text-xs">可在时间线中选择版本恢复到工作区后用系统应用打开</p>
                  </div>
                </div>
              )}
          </>
        )}
      </div>
    </div>
  )
}
