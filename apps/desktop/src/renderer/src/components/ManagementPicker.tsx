import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, FolderKanban, GitBranch } from 'lucide-react'
export type ManagementMode = 'versions' | 'projects'
export function ManagementPicker({ mode, onChange }: { mode: ManagementMode; onChange(mode: ManagementMode): void }) {
  const [open, setOpen] = useState(false), root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false) }
    document.addEventListener('pointerdown', close); return () => document.removeEventListener('pointerdown', close)
  }, [open])
  return <div className="wg-theme-picker wg-mode-picker" ref={root} onKeyDown={e => { if (e.key === 'Escape') setOpen(false) }}>
    <button className="wg-theme-trigger" role="combobox" aria-label="管理模式" aria-expanded={open} aria-haspopup="listbox" aria-controls="wg-management-options" onClick={() => setOpen(!open)}>{mode === 'versions' ? <GitBranch size={15}/> : <FolderKanban size={15}/>} {mode === 'versions' ? '版本管理' : '项目管理'} <ChevronDown size={14}/></button>
    {open && <div id="wg-management-options" className="wg-theme-options" role="listbox" aria-label="选择管理模式">{(['versions', 'projects'] as const).map(value => <button key={value} role="option" aria-selected={mode === value} onClick={() => { onChange(value); setOpen(false) }}><span>{value === 'versions' ? <GitBranch size={17}/> : <FolderKanban size={17}/>}</span><span><strong>{value === 'versions' ? '版本管理' : '项目管理'}</strong><small>{value === 'versions' ? '文稿版本 · 分类与统计' : '文档库 · 文件夹与资料关系'}</small></span>{mode === value && <Check size={14}/>}</button>)}</div>}
  </div>
}
