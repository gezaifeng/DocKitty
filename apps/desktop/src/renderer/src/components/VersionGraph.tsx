import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { EdgeDraft } from './EdgeEditor'
import { GraphEdge } from './GraphEdge'
import { GraphRiffle } from './GraphRiffle'
import { createPortal } from 'react-dom'
import { Minus, Plus, Maximize2, GitBranch } from 'lucide-react'
import type { DocumentDetail, LibraryVersion } from '@wordgit/shared'
import { useGraphConnection } from './useGraphConnection'

interface Props {
  detail: DocumentDetail
  versions: LibraryVersion[]
  selectedId: string | null
  compareIds: string[]
  edgePreview?: { from: string; to: string; draft: EdgeDraft } | null
  connecting?: boolean
  layoutEpoch?: number
  onArrange(): void
  onSelect(id: string): void
  onContext?(version: LibraryVersion, x: number, y: number): void
  onPosition(id: string, position: { x: number; y: number }): Promise<boolean>
  onMoveBranch(branch: string, versionId: string): void
  onConnect?(from: string, to: string): void
  onEdgeContext?(edge: { from: string; to: string; label: string }, x: number, y: number): void
  onRelation?(edge: { from: string; to: string; label: string }, x?: number, y?: number): void
}

export function VersionGraph({ detail, versions, selectedId, compareIds, connecting, layoutEpoch = 0, onArrange, onSelect, onContext, onPosition, onMoveBranch, onConnect, onRelation, onEdgeContext, edgePreview }: Props) {
  const arrowId = `version-arrow-${useId().replace(/:/g, '')}`
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  useEffect(() => {
    if (!menu) return
    const close = (e: PointerEvent) => { if (!(e.target as HTMLElement).closest('.wg-layout-menu')) setMenu(null) }
    const cancel = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(null) }
    document.addEventListener('pointerdown', close); document.addEventListener('keydown', cancel)
    document.querySelector<HTMLButtonElement>('.wg-layout-menu button')?.focus()
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', cancel) }
  }, [menu])
  const [zoom, setZoom] = useState(.85)
  const [pan, setPan] = useState({ x: 25, y: 35 })
  const [moving, setMoving] = useState<{ id: string; x: number; y: number } | null>(null)
  const [placed, setPlaced] = useState<Record<string, { x: number; y: number }>>({})
  const moves = useRef(new Map<string, number>())
  useEffect(() => {
    setPlaced(current => Object.fromEntries(Object.entries(current).filter(([id, p]) => {
      const saved = detail.versions.find(v => v.id === id)?.position
      return saved?.x !== p.x || saved?.y !== p.y
    })))
  }, [detail.versions])
  const interaction = useRef<{ id?: string; clientX: number; clientY: number; x: number; y: number; moved: boolean } | null>(null)
  const canvas = useRef<HTMLDivElement>(null)
  const world = useRef<HTMLDivElement>(null)
  const wire = useGraphConnection({ canvas, world, zoom, selectedId, ids: versions.filter(v => !v.deletedAt).map(v => v.id), onConnect: connecting ? undefined : onConnect })
  useEffect(() => { const reset = () => { interaction.current = null; setMoving(null); setPlaced({}); wire.cancel() }; window.addEventListener('wordgit:history-applied', reset); return () => window.removeEventListener('wordgit:history-applied', reset) }, [])
  const viewport = useRef({ zoom, pan }); viewport.current = { zoom, pan }
  useEffect(() => {
    const element = canvas.current
    if (!element) return
    const wheel = (event: WheelEvent) => {
      event.preventDefault()
      const { zoom: old, pan: origin } = viewport.current, rect = element.getBoundingClientRect()
      const cursor = { x: event.clientX - rect.left, y: event.clientY - rect.top }
      const next = Math.max(.2, Math.min(1.8, old * Math.exp(-event.deltaY * (event.deltaMode === 1 ? .024 : .0015))))
      const moved = { x: cursor.x - (cursor.x - origin.x) / old * next, y: cursor.y - (cursor.y - origin.y) / old * next }
      viewport.current = { zoom: next, pan: moved }; setZoom(next); setPan(moved)
    }
    element.addEventListener('wheel', wheel, { passive: false })
    return () => element.removeEventListener('wheel', wheel)
  }, [])
  const points = useMemo(() => new Map(versions.map((v, index) => [v.id, v.position ?? { x: 65 + index * 265, y: 65 }])), [versions])
  const visibleIds = versions.map(v => v.id).sort().join(',')
  useEffect(() => {
    if (!points.size) return
    const visible = [...points.values()]
    setPan({ x: 25 - Math.min(...visible.map(p => p.x)) * viewport.current.zoom, y: 100 - Math.min(...visible.map(p => p.y)) * viewport.current.zoom })
  }, [visibleIds, layoutEpoch])
  const point = (id: string) => moving?.id === id ? moving : placed[id] ?? points.get(id)!
  const width = Math.max(1100, ...[...points.values()].map(p => p.x + 350))
  const height = Math.max(650, ...[...points.values()].map(p => p.y + 220))

  return <section className="wg-graph" aria-label="版本关系图">
    <GraphRiffle/>
    <div className="wg-graph-legend"><GitBranch size={14} /> 左键选中后右键拖动拉线 · 双击连线命名或反转</div>
    {wire.preview && <div className="wg-graph-connect-status" data-graph-connecting="true" role="status">{wire.preview.target ? '松开右键即可连接' : '拖到另一张版本卡片上，松开右键连接'}<button className="wg-button" onClick={wire.cancel}>取消连线</button><small>Esc / Ctrl+Z</small></div>}
    <div className="wg-graph-controls">
      <button aria-label="缩小关系图" onClick={() => setZoom(z => Math.max(.2, z - .15))}><Minus size={15} /></button>
      <span>{Math.round(zoom * 100)}%</span>
      <button aria-label="放大关系图" onClick={() => setZoom(z => Math.min(1.8, z + .15))}><Plus size={15} /></button>
      <button aria-label="复位关系图" onClick={() => { setZoom(.85); setPan({ x: 25, y: 35 }) }}><Maximize2 size={14} /></button>
    </div>
    {menu && createPortal(<div className="wg-version-menu wg-layout-menu" role="menu" aria-label="关系图操作" style={{ left: menu.x, top: menu.y }}><button role="menuitem" onClick={() => { setMenu(null); onArrange() }}>整理布局</button></div>, document.body)}
    <div ref={canvas} className="wg-graph-canvas" onContextMenu={event => { if (wire.suppressContext()) { event.preventDefault(); return } if ((event.target as HTMLElement).closest('.wg-graph-node')) return; event.preventDefault(); setMenu({ x: Math.max(8, Math.min(event.clientX, window.innerWidth - 312)), y: Math.max(8, Math.min(event.clientY, window.innerHeight - 70)) }) }} onPointerDown={event => {
      if (event.button !== 0) return
      if ((event.target as HTMLElement).closest('.wg-node-body,.wg-branch-tags,.wg-edge-action')) return
      interaction.current = { clientX: event.clientX, clientY: event.clientY, ...pan, moved: false }
      event.currentTarget.setPointerCapture(event.pointerId)
    }} onPointerMove={event => {
      if (wire.move(event)) return
      const drag = interaction.current
      if (!drag) return
      const dx = event.clientX - drag.clientX, dy = event.clientY - drag.clientY
      if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true
      if (drag.id) setMoving({ id: drag.id, x: Math.max(0, drag.x + dx / zoom), y: Math.max(0, drag.y + dy / zoom) })
      else {
        setPan({ x: drag.x + dx, y: drag.y + dy })
      }
    }} onPointerUp={event => {
      if (wire.finish(event)) return
      const drag = interaction.current
      if (drag?.id && drag.moved && moving) {
        const id = drag.id, position = { x: moving.x, y: moving.y }
        const sequence = (moves.current.get(id) ?? 0) + 1
        moves.current.set(id, sequence)
        // Keep the drop location while storage and the query refresh catch up.
        setPlaced(current => ({ ...current, [id]: position }))
        void onPosition(id, position).then(saved => {
          if (!saved && moves.current.get(id) === sequence) setPlaced(current => {
            const next = { ...current }; delete next[id]; return next
          })
        })
      }
      else if (drag?.id) {
        onSelect(drag.id)

      }
      interaction.current = null
      setMoving(null)
    }} onPointerCancel={() => { wire.cancel(); interaction.current = null; setMoving(null) }}>
      {!versions.length && <div className="wg-graph-no-results"><GitBranch size={32}/><h2>没有匹配的版本</h2><p>请调整分支或版本筛选；历史文件仍保留在文档库中。</p></div>}
      <div ref={world} className="wg-graph-world" style={{ width, height, transform: `translate(${pan.x}px,${pan.y}px) scale(${zoom})` }}>
        <svg className="wg-edges" width={width} height={height}>
          <defs><marker id={arrowId} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="userSpaceOnUse"><path d="M0 0 L8 4 L0 8 Z" className="wg-edge-arrow"/></marker></defs>
          {versions.flatMap(v => v.parents.map(parent => {
            if (!points.has(parent)) return null
            const draft = edgePreview?.from === parent && edgePreview.to === v.id ? edgePreview.draft : undefined
            const a = point(draft?.reverse ? v.id : parent), b = point(draft?.reverse ? parent : v.id)
            const horizontal = Math.abs(b.x - a.x) >= 225
            const forward = horizontal ? b.x >= a.x : b.y >= a.y
            const startX = horizontal ? a.x + (forward ? 225 : 0) : a.x + 112.5
            const endX = horizontal ? b.x + (forward ? -10 : 235) : b.x + 112.5
            const startY = horizontal ? a.y + 56 : a.y + (forward ? 112 : 0)
            const endY = horizontal ? b.y + 56 : b.y + (forward ? -10 : 122)
            const d = horizontal ? `M${startX},${startY} C${(startX + endX) / 2},${startY} ${(startX + endX) / 2},${endY} ${endX},${endY}` : `M${startX},${startY} C${startX},${(startY + endY) / 2} ${endX},${(startY + endY) / 2} ${endX},${endY}`
            const label = draft?.label ?? v.parentLabels?.[parent] ?? ''
            return <g className="wg-edge-action" key={parent + v.id} role="button" tabIndex={0} aria-label={`版本连线 ${label || '未命名'}`} onPointerDown={e => e.stopPropagation()} onContextMenu={e => { e.preventDefault(); e.stopPropagation(); onEdgeContext?.({ from: parent, to: v.id, label }, e.clientX, e.clientY) }} onDoubleClick={e => { e.stopPropagation(); onRelation?.({ from: parent, to: v.id, label }, e.clientX, e.clientY) }} onKeyDown={e => { if (e.key === 'Enter') onRelation?.({ from: parent, to: v.id, label }) }}>
              <GraphEdge d={d} style={draft?.style ?? v.parentStyles?.[parent]} from={parent} to={v.id}/><path className="wg-edge-hit" d={d}/>{label && <text className="wg-edge-label" x={(startX + endX) / 2} y={(startY + endY) / 2 - 12} textAnchor="middle">{label}</text>}<title>{draft?.note ?? v.parentNotes?.[parent]}</title>
            </g>
          }))}{wire.preview && points.has(wire.preview.from) && <path className="wg-connection-preview" d={`M${point(wire.preview.from).x + 112.5},${point(wire.preview.from).y + 56} L${wire.preview.x},${wire.preview.y}`} markerEnd={`url(#${arrowId})`}/>}
        </svg>
        {versions.map(v => {
          const p = point(v.id)
          const category = detail.categories.find(c => c.id === v.categoryId)
          return <div key={v.id} data-graph-node={v.id} className={`wg-graph-node ${selectedId === v.id ? 'selected' : ''} ${compareIds.includes(v.id) ? 'compared' : ''} ${v.deletedAt ? 'deleted' : ''} ${wire.preview?.target === v.id ? 'wg-connect-target' : ''}`} style={{ left: p.x, top: p.y }} onContextMenu={e => { e.preventDefault(); if (connecting || wire.suppressContext()) return; onSelect(v.id); onContext?.(v, e.clientX, e.clientY) }}>
            <div className="wg-branch-tags"><span className="wg-owner-tag" title={v.branches[0]} draggable={detail.branchHeads[v.branches[0]] === v.id && v.branches[0] !== detail.currentBranch} onPointerDown={e => e.stopPropagation()} onDragStart={e => { e.dataTransfer.setData('application/wordgit-branch', v.branches[0]); e.dataTransfer.effectAllowed = 'move' }}>{v.branches[0]}</span>{category && <span className="wg-category-tag" title={category.name}>{category.name}</span>}</div>
            <button className="wg-node-body" aria-label={`版本节点 ${v.title}`} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(v.id) } }} onPointerDown={event => {
              if (!v.deletedAt && wire.start(event, v.id)) return
              if (event.button !== 0) return
              event.stopPropagation()
              if (connecting) { onSelect(v.id); return }
              interaction.current = { id: v.id, clientX: event.clientX, clientY: event.clientY, x: p.x, y: p.y, moved: false }
              event.currentTarget.parentElement!.parentElement!.parentElement!.setPointerCapture(event.pointerId)
            }} onDragOver={event => { if (event.dataTransfer.types.includes('application/wordgit-branch')) event.preventDefault() }} onDrop={event => {
              const branch = event.dataTransfer.getData('application/wordgit-branch')
              if (branch) { event.preventDefault(); onMoveBranch(branch, v.id) }
            }}>
              <span className="wg-node-code">{v.id.slice(0, 7)}{v.deletedAt ? ' · 已回收' : ''}</span>
              <strong>{v.title}</strong>
              <small>{new Date(v.createdAt).toLocaleDateString('zh-CN')} · {v.revisionCount ? `覆盖 ${v.revisionCount} 次` : '原始快照'}</small>
            </button>
          </div>
        })}
      </div>
    </div>
  </section>
}
