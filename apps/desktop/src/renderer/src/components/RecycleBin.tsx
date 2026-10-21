import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/ipc'
import { useRepoStore } from '../store/repoStore'
import { useUiStore } from '../store/uiStore'
import { keys } from '../lib/queryKeys'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from './ui/dialog'
import { QuarantineList } from './QuarantineList'

export function RecycleBin({ open, onClose, onNotice, onBrowse }: { open: boolean; onClose(): void; onNotice?(message: string): void; onBrowse?(): void }) {
  const repoRoot = useRepoStore(state => state.repoRoot), selectedDocName = useUiStore(state => state.selectedDocName)
  const client = useQueryClient()
  const [tab, setTab] = useState<'documents' | 'versions' | 'branches'>('documents')
  const [docName, setDocName] = useState(selectedDocName ?? ''), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const documents = useQuery({ queryKey: ['library', repoRoot], queryFn: () => api.library.list(), enabled: open })
  const detail = useQuery({ queryKey: ['documentDetail', repoRoot, docName], queryFn: () => api.library.detail(docName), enabled: open && tab === 'versions' && !!docName })
  const branches = useQuery({ queryKey: keys.quarantineList(), queryFn: () => api.maintenance.quarantine.list(), enabled: open })
  useEffect(() => {
    if (open && documents.data && !documents.data.some(doc => doc.docName === docName)) setDocName(selectedDocName && documents.data.some(doc => doc.docName === selectedDocName) ? selectedDocName : documents.data[0]?.docName ?? '')
  }, [open, documents.data, docName, selectedDocName])
  useEffect(() => { if (!open) setError('') }, [open])
  async function restore(action: () => Promise<unknown>) {
    if (busy) return
    setBusy(true); setError('')
    try { await action(); await client.invalidateQueries(); onNotice?.('已从回收区还原') }
    catch (failure) { setError((failure as Error).message) }
    finally { setBusy(false) }
  }
  return <Dialog open={open} onOpenChange={value => { if (!value && !busy) onClose() }}><DialogContent className="wg-dialog wg-wide-dialog">
    <DialogTitle>回收区</DialogTitle><DialogDescription>文档、版本与分支在这里还原。永久删除的内容不在回收区；项目资料移除使用“文件 → 撤回”，不会删除来源文件。</DialogDescription>
    <div role="tablist" aria-label="回收内容类型" className="flex gap-2">{([['documents', '文档'], ['versions', '版本'], ['branches', '分支']] as const).map(([id, label]) => <button key={id} role="tab" aria-selected={tab === id} className={`wg-button ${tab === id ? 'primary' : ''}`} onClick={() => { setTab(id); setError('') }}>{label}</button>)}</div>
    <div className="max-h-[55vh] overflow-y-auto py-3" role="tabpanel" aria-label={tab === 'documents' ? '回收文档' : tab === 'versions' ? '回收版本' : '回收分支'}>
      {error && <p role="alert">{error}</p>}{documents.error && <p role="alert">{documents.error.message}</p>}
      {tab === 'documents' && (documents.isLoading ? <p>正在读取…</p> : documents.data?.some(doc => doc.deletedAt) ? documents.data.filter(doc => doc.deletedAt).map(doc => <div key={doc.docName} className="flex items-center justify-between gap-3 border-b border-border py-3"><div className="min-w-0"><strong className="block truncate">{doc.title}</strong><small>{doc.docName} · 来源文件保留</small></div><button className="wg-button" disabled={busy} onClick={() => void restore(() => api.library.mutate({ type: 'document', docName: doc.docName, deleted: false }))}>还原文档</button></div>) : <p>没有回收的文档。</p>)}
      {tab === 'versions' && <><label className="wg-field">所属文档<select aria-label="回收版本所属文档" value={docName} onChange={event => setDocName(event.target.value)}><option value="" disabled>选择文档</option>{documents.data?.map(doc => <option key={doc.docName} value={doc.docName}>{doc.title}{doc.deletedAt ? '（文档已回收）' : ''}</option>)}</select></label>{detail.error && <p role="alert">{detail.error.message}</p>}{detail.data?.deletedAt && <p>请先在“文档”页还原所属文档。</p>}{detail.isLoading && <p>正在读取…</p>}{detail.data?.versions.filter(version => version.deletedAt).map(version => <div key={version.id} className="flex items-center justify-between gap-3 border-b border-border py-3"><div className="min-w-0"><strong className="block truncate">{version.title}</strong><small>{version.branches.join(' / ')} · 库内历史快照保留</small></div><button className="wg-button" disabled={busy || !!detail.data?.deletedAt} onClick={() => void restore(() => api.library.mutate({ type: 'version', docName, versionId: version.id, deleted: false }))}>还原版本</button></div>)}{!detail.isLoading && !detail.data?.versions.some(version => version.deletedAt) && <p>此文档没有回收的版本。</p>}</>}
      {tab === 'branches' && <>{branches.error && <p role="alert">{branches.error.message}</p>}{branches.isLoading ? <p>正在读取…</p> : <QuarantineList entries={branches.data ?? []} onRestored={() => onNotice?.('分支已从回收区还原')}/>}</>}
    </div>
    <footer className="wg-dialog-actions">{onBrowse && <button className="wg-button" disabled={busy} onClick={() => { onBrowse(); onClose() }}>在工作台查看回收内容</button>}<button className="wg-button" disabled={busy} onClick={onClose}>关闭</button></footer>
  </DialogContent></Dialog>
}
