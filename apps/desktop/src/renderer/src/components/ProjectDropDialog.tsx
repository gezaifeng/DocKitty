import { useEffect, useState } from 'react'
import type { DroppedFile, ProjectLibrary, ProjectDropPlan, ProjectDropRequest } from '@wordgit/shared'
import { api } from '../lib/ipc'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from './ui/dialog'

export function ProjectDropDialog({ files, libraries, initialProject, parentId, onClose, onImported, onBusyChange }: {
  files: DroppedFile[]; libraries: ProjectLibrary[]; initialProject?: string; parentId?: string | null
  onClose(): void; onImported(projectId: string, nodeId?: string): Promise<void>; onBusyChange(busy: boolean): void
}) {
  const [target, setTarget] = useState(initialProject ?? 'new'), [name, setName] = useState(files[0]?.kind === 'folder' ? files[0].name : '新文档库')
  const [folder, setFolder] = useState(''), [plan, setPlan] = useState<ProjectDropPlan | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false), [loading, setLoading] = useState(true)
  const [choices, setChoices] = useState<Record<string, { action: ProjectDropRequest['items'][number]['action']; name: string }>>({})
  useEffect(() => {
    let active = true; setLoading(true); setError('')
    void api.drop!.prepare(files.map(f => f.path), target === 'new' ? undefined : target, target === initialProject ? parentId : null, folder || undefined).then(result => {
      if (!active) return
      setPlan(result); setChoices(Object.fromEntries(result.files.map(file => [file.path, { action: 'reference', name: file.suggestedName }])))
    }).catch(e => { if (active) { setPlan(null); setError((e as Error).message) } }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [target, folder])
  const patch = (file: string, values: Partial<{ action: ProjectDropRequest['items'][number]['action']; name: string }>) => setChoices(current => ({ ...current, [file]: { ...current[file], ...values } }))
  async function pickFolder() { const picked = await api.dialog.pickFolder('选择项目工作文件夹（复制／剪切的目标）'); if (picked) setFolder(picked) }
  async function submit() {
    if (!plan) return
    setBusy(true); onBusyChange(true); setError('')
    try {
      const result = await api.drop!.importProject({ projectId: target === 'new' ? undefined : target, newProjectName: name, parentId: target === initialProject ? parentId : null, workingFolder: folder || undefined, items: plan.files.map(file => ({ path: file.path, ...choices[file.path] })) })
      await onImported(result.projectId, result.nodeIds[0]); onClose()
    } catch (e) { setError((e as Error).message) } finally { setBusy(false); onBusyChange(false) }
  }
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose() }}><DialogContent className="wg-dialog"><DialogTitle>拖入项目资料</DialogTitle><DialogDescription>保留原位置只新增管理卡片；复制保留来源，剪切会移走来源。确认前核对目标目录。复制／剪切支持撤回，外部修改或路径占用会阻止回退。</DialogDescription>
    {!initialProject && <label className="wg-field">导入到<select aria-label="拖入目标项目" value={target} disabled={busy} onChange={e => { setTarget(e.target.value); setFolder('') }}><option value="new">新建项目文档库</option>{libraries.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}
    {target === 'new' && <label className="wg-field">项目名称<input aria-label="拖入新项目名称" value={name} disabled={busy} onChange={e => setName(e.target.value)}/></label>}
    <div className="wg-drop-folder-choice"><div className="wg-drop-path"><strong>工作文件夹</strong><br/>{plan?.workingFolder || '尚未确定；保留原位置导入不需要目标文件夹'}</div><button className="wg-button" disabled={busy || !!parentId} onClick={() => void pickFolder()}>选择目录…</button></div>
    {loading ? <p role="status">正在检查来源和重名文件…</p> : <div className="wg-drop-items">{plan?.files.map(file => <section className="wg-drop-item" key={file.path}><strong>{file.name}</strong><small>{file.path}</small>
      <label className="wg-field">导入方式<select aria-label={`处理方式 ${file.name}`} disabled={busy} value={choices[file.path]?.action ?? 'reference'} onChange={e => patch(file.path, { action: e.target.value as ProjectDropRequest['items'][number]['action'] })}>
        <option value="reference">{file.inside ? '已在工作文件夹中，仅加入当前层' : '保留原位置，仅加入稿喵'}</option>
        {!file.inside && file.kind !== 'link' && <><option value="copy" disabled={!plan.workingFolder}>复制到工作文件夹</option><option value="move" disabled={!plan.workingFolder}>剪切到工作文件夹</option></>}<option value="skip">跳过</option>
      </select></label>
      {['copy', 'move'].includes(choices[file.path]?.action) && <><label className="wg-field">{file.conflict ? '目标有同名文件，请改名导入或选择跳过' : '目标文件名'}<input aria-label={`目标名称 ${file.name}`} value={choices[file.path]?.name ?? file.name} disabled={busy} onChange={e => patch(file.path, { name: e.target.value })}/></label><small>目标：{plan.workingFolder}{' / '}{choices[file.path]?.name}</small></>}
      {file.kind === 'link' && <small>链接仅保留卡片和目标路径，不复制或展开链接内容。</small>}
    </section>)}</div>}
    {error && <p className="wg-dialog-error" role="alert">{error}</p>}
    <footer className="wg-dialog-actions"><button className="wg-button" disabled={busy} onClick={onClose}>取消</button><button className="wg-button primary" disabled={busy || loading || !plan || !Object.values(choices).some(c => c.action !== 'skip') || target === 'new' && !name.trim()} onClick={() => void submit()}>{busy ? '正在导入…' : '确认导入'}</button></footer>
  </DialogContent></Dialog>
}
