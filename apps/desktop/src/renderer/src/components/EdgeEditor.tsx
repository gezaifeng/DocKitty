import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { resolvedEdgeStyle, type EdgeStyle } from '@wordgit/shared'
import { GraphEdge } from './GraphEdge'

export interface EdgeDraft { label: string; note: string; reverse: boolean; style: EdgeStyle }
export function EdgeEditor({ x, y, label, note, style, onPreview, onSave, onDelete, onClose }: {
  x: number; y: number; label: string; note: string; style?: EdgeStyle
  onPreview(value: EdgeDraft): void; onSave(value: EdgeDraft): Promise<boolean>; onDelete?(): Promise<boolean>; onClose(): void
}) {
  const menu = useRef<HTMLDivElement>(null), [value, setValue] = useState<EdgeDraft>({ label, note, reverse: false, style: resolvedEdgeStyle(style) }), [saving, setSaving] = useState(false)
  const [position, setPosition] = useState({ left: x, top: y })
  const drag = useRef<{ pointerId: number; x: number; y: number; left: number; top: number } | null>(null)
  const clamp = (point: { left: number; top: number }) => {
    const box = menu.current?.getBoundingClientRect()
    const left = Math.max(8, Math.min(point.left, window.innerWidth - (box?.width ?? 360) - 8)), top = Math.max(8, Math.min(point.top, window.innerHeight - (box?.height ?? 584) - 8))
    return point.left === left && point.top === top ? point : { left, top }
  }
  useLayoutEffect(() => {
    setPosition(clamp({ left: x, top: y }))
    const fit = () => setPosition(clamp)
    const observer = new ResizeObserver(fit)
    if (menu.current) observer.observe(menu.current)
    window.addEventListener('resize', fit)
    return () => { observer.disconnect(); window.removeEventListener('resize', fit) }
  }, [x, y])
  const [sizeInput, setSizeInput] = useState(String(value.style.arrowSize)), [widthInput, setWidthInput] = useState(String(value.style.width))
  const savingRef = useRef(saving); savingRef.current = saving
  useEffect(() => {
    const outside = (e: PointerEvent) => { if (!savingRef.current && !menu.current?.contains(e.target as Node)) onClose() }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape' && !savingRef.current) { e.stopPropagation(); onClose() } }
    document.addEventListener('pointerdown', outside); document.addEventListener('keydown', key)
    menu.current?.querySelector('input')?.focus()
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', key) }
  }, [])
  const valid = Number(value.style.arrowSize) >= 6 && Number(value.style.arrowSize) <= 24 && Number(value.style.width) >= 1 && Number(value.style.width) <= 6
  const preview = { ...value, style: { ...value.style, arrowSize: Math.max(6, Math.min(24, Number(value.style.arrowSize))), width: Math.max(1, Math.min(6, Number(value.style.width))) } }
  useEffect(() => { onPreview(preview) }, [value])
  const changeStyle = (style: EdgeStyle) => setValue(v => ({ ...v, style: { ...v.style, ...style } }))
  const save = async () => { setSaving(true); try { if (await onSave(value)) onClose() } finally { setSaving(false) } }
  return createPortal(<div ref={menu} className="wg-cat-menu wg-edge-style-menu wg-edge-editor" role="dialog" aria-label="编辑连线" style={position} onContextMenu={e => e.preventDefault()} onPointerDown={e => e.stopPropagation()}>
    <header title="按住标题栏拖动" onPointerDown={e => {
      if (e.button !== 0 || saving || (e.target as Element).closest('button')) return
      e.preventDefault(); e.stopPropagation()
      const box = menu.current!.getBoundingClientRect()
      drag.current = { pointerId: e.pointerId, x: e.clientX, y: e.clientY, left: box.left, top: box.top }
      e.currentTarget.setPointerCapture(e.pointerId)
    }} onPointerMove={e => {
      const start = drag.current
      if (start?.pointerId === e.pointerId) setPosition(clamp({ left: start.left + e.clientX - start.x, top: start.top + e.clientY - start.y }))
    }} onPointerUp={e => {
      const start = drag.current
      if (start?.pointerId !== e.pointerId) return
      setPosition(clamp({ left: start.left + e.clientX - start.x, top: start.top + e.clientY - start.y }))
      drag.current = null; e.currentTarget.releasePointerCapture(e.pointerId)
    }} onPointerCancel={() => { drag.current = null }} onLostPointerCapture={() => { drag.current = null }}><strong>编辑连线</strong><button aria-label="关闭连线编辑" disabled={saving} onClick={onClose}>×</button></header>
    <label className="wg-edge-text-field">关系标签<input aria-label="关系标签" value={value.label} placeholder="留空表示不命名" maxLength={10000} onChange={e => setValue(v => ({ ...v, label: e.target.value }))}/></label>
    <label className="wg-edge-text-field">关系备注<textarea aria-label="关系备注" rows={2} maxLength={10000} value={value.note} onChange={e => setValue(v => ({ ...v, note: e.target.value }))}/></label>
    <button className="wg-button wg-edge-reverse" disabled={saving} aria-pressed={value.reverse} onClick={() => setValue(v => ({ ...v, reverse: !v.reverse }))}>反转箭头</button>
    <svg className="wg-edges wg-edge-style-preview" viewBox="0 0 240 40" aria-label="线条样式预览"><GraphEdge d={value.reverse ? 'M224 20 L14 20' : 'M14 20 L224 20'} style={preview.style}/></svg>
    <label>箭头形状<select aria-label="箭头形状" value={value.style.arrow} onChange={e => changeStyle({ arrow: e.target.value as EdgeStyle['arrow'] })}><option value="triangle">实心三角</option><option value="chevron">开放箭头</option><option value="diamond">菱形箭头</option><option value="none">无箭头</option></select></label>
    <label>箭头大小<span><input aria-label="箭头大小" type="number" min="6" max="24" step="1" value={sizeInput} onChange={e => { setSizeInput(e.target.value); changeStyle({ arrowSize: Number(e.target.value) || 0 }) }}/> px</span></label>
    <label>线条格式<select aria-label="线条格式" value={value.style.line} onChange={e => changeStyle({ line: e.target.value as EdgeStyle['line'] })}><option value="solid">实线</option><option value="dashed">虚线</option><option value="double">双实线</option></select></label>
    <label>线条粗细<span><input aria-label="线条粗细" type="number" min="1" max="6" step="0.5" value={widthInput} onChange={e => { setWidthInput(e.target.value); changeStyle({ width: Number(e.target.value) || 0 }) }}/> px</span></label>
    <p className="wg-edge-style-range">图中实时预览 · 箭头 6–24 px · 线宽 1–6 px</p>
    <footer>{onDelete && <button className="wg-button" disabled={saving} onClick={async () => { setSaving(true); try { if (await onDelete()) onClose() } finally { setSaving(false) } }}>删除关系</button>}<button className="wg-button" disabled={saving} onClick={onClose}>取消</button><button className="wg-button primary" disabled={saving || !valid} onClick={() => void save()}>{saving ? '保存中…' : '保存'}</button></footer>
  </div>, document.body)
}
