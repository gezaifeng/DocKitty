import { useState } from 'react'
import type { DroppedFile, LibraryDocument } from '@wordgit/shared'
import { api } from '../lib/ipc'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from './ui/dialog'

export function DocumentDropDialog({ files, documents, initialDocument, onClose, onImported, onBusyChange }: {
  files: DroppedFile[]; documents: LibraryDocument[]; initialDocument?: string
  onClose(): void; onImported(docName: string): Promise<void>; onBusyChange(busy: boolean): void
}) {
  const [rows, setRows] = useState(() => files.map(file => ({ file, target: file.kind === 'file' ? initialDocument ?? 'new' : 'skip', name: file.name, done: false, error: '' })))
  const [busy, setBusy] = useState(false)
  const patch = (index: number, values: Partial<typeof rows[number]>) => setRows(current => current.map((row, i) => i === index ? { ...row, ...values } : row))
  async function submit() {
    setBusy(true); onBusyChange(true); let failed = false, latest = ''
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]; if (row.done || row.target === 'skip') continue
      try {
        if (row.target === 'new') { await api.doc.import(row.file.path, row.name.trim()); latest = row.name.trim() }
        else { const document = await api.library.detail(row.target); await api.library.mutate({ type: 'importVersion', docName: row.target, sourcePath: row.file.path, message: row.name.trim() || row.file.name, branch: document.currentBranch }); latest = row.target }
        patch(i, { done: true, error: '' })
      } catch (error) { failed = true; patch(i, { error: (error as Error).message }) }
    }
    try { if (latest) await onImported(latest) } finally { setBusy(false); onBusyChange(false) }
    if (!failed) onClose()
  }
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose() }}><DialogContent className="wg-dialog"><DialogTitle>拖入文档</DialogTitle><DialogDescription>逐项确认作为新文档，或加入已有文档的版本。只读取来源，不移动或修改原文件；文件夹请拖入项目管理。</DialogDescription>
    <div className="wg-drop-items">{rows.map((row, index) => <section className="wg-drop-item" key={row.file.path}><strong>{row.file.name}</strong><small>{row.file.path}</small>{row.file.kind !== 'file' ? <p>文件夹或链接入口不导入版本管理，本项已跳过。</p> : <>
      <label className="wg-field">文档归属<select aria-label={`导入归属 ${row.file.name}`} value={row.target} disabled={busy || row.done} onChange={e => patch(index, { target: e.target.value })}><option value="new">作为新的文档</option>{documents.filter(d => !d.deletedAt).map(d => <option value={d.docName} key={d.docName}>作为“{d.title}”的版本</option>)}<option value="skip">跳过</option></select></label>
      {row.target !== 'skip' && <label className="wg-field">{row.target === 'new' ? '入库文件名（保留扩展名）' : '版本名称'}<input aria-label={`导入名称 ${row.file.name}`} value={row.name} disabled={busy || row.done} onChange={e => patch(index, { name: e.target.value })}/></label>}
    </>}{row.done && <span className="wg-drop-state">已导入</span>}{row.error && <p role="alert">{row.error} · 可调整名称或归属后重试，已导入项不会重复处理。</p>}</section>)}</div>
    <footer className="wg-dialog-actions"><button className="wg-button" disabled={busy} onClick={onClose}>取消</button><button className="wg-button primary" disabled={busy || !rows.some(r => !r.done && r.target !== 'skip' && r.name.trim())} onClick={() => void submit()}>{busy ? '正在导入…' : '确认导入'}</button></footer>
  </DialogContent></Dialog>
}
