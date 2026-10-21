import { useQuery } from '@tanstack/react-query'
import { api } from '@renderer/lib/ipc'
import { DocxPreview } from './DocxPreview'
import { XlsxPreview } from './XlsxPreview'

export function VersionPreview({ repoRoot, docName, versionId, contentId }: { repoRoot: string; docName: string; versionId: string; contentId: string }) {
  const { data, error, isLoading } = useQuery({
    queryKey: ['versionPreview', repoRoot, docName, versionId, contentId],
    queryFn: () => api.preview.getBytes(docName, versionId),
  })
  if (isLoading) return <div className="wg-preview-empty">正在读取历史快照…</div>
  if (error) return <div className="wg-preview-empty" role="alert">{(error as Error).message}</div>
  if (!data) return null
  if (data.ext === 'docx') return <DocxPreview data={data.data} />
  if (data.ext === 'xlsx') return <XlsxPreview data={data.data} />
  if (['txt', 'md', 'csv', 'json', 'xml', 'html'].includes(data.ext)) return <pre className="wg-text-preview">{new TextDecoder().decode(data.data)}</pre>
  return <div className="wg-preview-empty"><strong>此格式使用系统应用查看</strong><p>点击“打开临时副本”或“导出副本”，用 Word、WPS、Excel 等查看。当前草稿不会被替换。</p></div>
}
