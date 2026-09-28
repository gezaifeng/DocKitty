// apps/desktop/src/renderer/src/components/PreviewPanel.tsx
import { useQuery } from '@tanstack/react-query'
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
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
        <h2 className="font-semibold text-sm">
          {selectedDocName ? `预览：${selectedDocName}` : '预览'}
        </h2>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs"
          onClick={() => setRightPanel('settings')}
        >
          设置
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {!selectedDocName && (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <p className="text-sm">选择一个文档以查看预览</p>
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
                    <p className="text-sm">暂不支持预览 .{previewData.ext} 文件</p>
                    <p className="text-xs mt-1">可在时间线中选择版本恢复到工作区后用系统应用打开</p>
                  </div>
                </div>
              )}
          </>
        )}
      </div>
    </div>
  )
}
