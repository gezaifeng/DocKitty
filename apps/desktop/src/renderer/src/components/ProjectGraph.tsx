import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { Folder, File, Minus, Plus, Maximize2 } from 'lucide-react'
import type { ProjectCategory, ProjectNode, ProjectRelation } from '@wordgit/shared'
import { GraphRiffle } from './GraphRiffle'
import type { EdgeDraft } from './EdgeEditor'
import { GraphEdge } from './GraphEdge'
import { projectEdge } from './projectEdge'
import { useGraphConnection } from './useGraphConnection'

export function ProjectGraph({ nodes, relations, categories = [], selectedId, focusRequest, onSelect, onOpen, onContext, onMove, onRelation, onConnect, onEdgeContext, edgePreview }: {
  nodes: ProjectNode[]; relations: ProjectRelation[]; selectedId: string | null
  categories?: ProjectCategory[]
  edgePreview?: { id: string; draft: EdgeDraft } | null
  focusRequest?: { id: string } | null
  onSelect(id: string): void; onOpen(id: string): void
  onContext(node: ProjectNode, x: number, y: number): void
  onMove(id: string, position: { x: number; y: number }): Promise<void>
  onRelation(relation: ProjectRelation, x?: number, y?: number): void
  onConnect?(from: string, to: string): void
  onEdgeContext?(edge: ProjectRelation, x: number, y: number): void
}) {
  const arrowId = `project-arrow-${useId().replace(/:/g, '')}`
  const [zoom, setZoom] = useState(1), [pan, setPan] = useState({ x: 20, y: 100 })
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({})
  const drag = useRef<{ id?: string; x: number; y: number; origin: { x: number; y: number }; moved: boolean } | null>(null)
  const viewport = useRef<HTMLDivElement>(null), moved = useRef(false)
  const world = useRef<HTMLDivElement>(null)
  const nodePosition = (n: ProjectNode) => positions[n.id] ?? n.position
  const wire = useGraphConnection({ canvas: viewport, world, zoom, selectedId, ids: nodes.map(n => n.id), onConnect })
  const source = nodes.find(n => n.id === wire.preview?.from)
  useEffect(() => { const reset = () => { drag.current = null; setPositions({}); wire.cancel() }; window.addEventListener('wordgit:history-applied', reset); return () => window.removeEventListener('wordgit:history-applied', reset) }, [])
  useLayoutEffect(() => {
    const target = nodes.find(n => n.id === focusRequest?.id), bounds = viewport.current?.getBoundingClientRect()
    if (!target || !bounds) return
    const position = nodePosition(target)
    setPan({ x: bounds.width / 2 - (position.x + 112.5) * zoom, y: bounds.height / 2 - (position.y + 56) * zoom })
  }, [focusRequest])
  useEffect(() => {
    if (drag.current) return
    setPositions(previous => {
      const next = { ...previous }
      for (const n of nodes) if (next[n.id]?.x === n.position.x && next[n.id]?.y === n.position.y) delete next[n.id]
      for (const id of Object.keys(next)) if (!nodes.some(n => n.id === id)) delete next[id]
      return next
    })
  }, [nodes])
  const zoomAt = (value: number, x: number, y: number) => {
    const next = Math.max(.25, Math.min(2, value))
    setPan(p => ({ x: x - (x - p.x) * next / zoom, y: y - (y - p.y) * next / zoom })); setZoom(next)
  }
  const finish = () => {
    const active = drag.current; drag.current = null
    if (active?.id && active.moved) {
      const position = positions[active.id]
      if (position) void onMove(active.id, position).catch(() => setPositions(p => { const next = { ...p }; delete next[active.id!]; return next }))
    }
  }
  const fit = () => {
    const bounds = viewport.current?.getBoundingClientRect(); if (!bounds || !nodes.length) return
    const minX = Math.min(...nodes.map(n => nodePosition(n).x)), minY = Math.min(...nodes.map(n => nodePosition(n).y))
    const width = Math.max(...nodes.map(n => nodePosition(n).x + 225)) - minX, height = Math.max(...nodes.map(n => nodePosition(n).y + 112)) - minY
    const next = Math.min(1, (bounds.width - 80) / width, (bounds.height - 130) / height)
    setZoom(next); setPan({ x: 40 - minX * next, y: 120 - minY * next })
  }
  return <div className="wg-graph wg-project-graph">
    <div className="wg-graph-legend">左键选中后右键拖动拉线 · 双击连线命名或反转箭头</div>
    {wire.preview && <div className="wg-graph-connect-status" data-graph-connecting="true" role="status">{wire.preview.target ? '松开右键即可连接' : '拖到另一张卡片上，松开右键连接'}<button className="wg-button" onClick={wire.cancel}>取消连线</button><small>Esc / Ctrl+Z</small></div>}
    <div className="wg-graph-controls"><button aria-label="缩小关系图" onClick={() => zoomAt(zoom - .1, 250, 150)}><Minus size={15}/></button><span>{Math.round(zoom * 100)}%</span><button aria-label="放大关系图" onClick={() => zoomAt(zoom + .1, 250, 150)}><Plus size={15}/></button><button aria-label="适应项目关系图" onClick={fit}><Maximize2 size={15}/></button></div>
    <div ref={viewport} className="wg-graph-canvas" onWheel={e => { const rect = e.currentTarget.getBoundingClientRect(); zoomAt(zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1), e.clientX - rect.left, e.clientY - rect.top) }} onPointerDown={e => {
      if (e.button !== 0 || e.target !== e.currentTarget) return
      e.currentTarget.setPointerCapture(e.pointerId); drag.current = { x: e.clientX, y: e.clientY, origin: pan, moved: false }; moved.current = false
    }} onPointerMove={e => {
      if (wire.move(e)) return
      const active = drag.current; if (!active) return
      const dx = e.clientX - active.x, dy = e.clientY - active.y
      if (Math.abs(dx) + Math.abs(dy) > 3) { active.moved = true; moved.current = true }
      if (active.id) setPositions(p => ({ ...p, [active.id!]: { x: active.origin.x + dx / zoom, y: active.origin.y + dy / zoom } }))
      else setPan({ x: active.origin.x + dx, y: active.origin.y + dy })
    }} onPointerUp={e => { if (!wire.finish(e)) finish() }} onPointerCancel={() => { wire.cancel(); finish() }}>
      <div ref={world} className="wg-graph-world" style={{ transform: `translate(${pan.x}px,${pan.y}px) scale(${zoom})` }}>
        <svg className="wg-edges wg-project-edges" width="1" height="1"><defs><marker id={arrowId} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="userSpaceOnUse"><path d="M0 0 L8 4 L0 8 Z" className="wg-edge-arrow"/></marker></defs>{relations.map(edge => {
          const from = nodes.find(n => n.id === edge.from), to = nodes.find(n => n.id === edge.to); if (!from || !to) return null
          const draft = edgePreview?.id === edge.id ? edgePreview.draft : undefined
          const { d, labelX, labelY } = projectEdge(nodePosition(draft?.reverse ? to : from), nodePosition(draft?.reverse ? from : to))
          const label = draft?.label ?? edge.label
          return <g key={edge.id} role="button" tabIndex={0} aria-label={`关系 ${label || '未命名关系'}`} onPointerDown={e => e.stopPropagation()} onContextMenu={e => { e.preventDefault(); e.stopPropagation(); onEdgeContext?.(edge, e.clientX, e.clientY) }} onDoubleClick={e => { e.stopPropagation(); onRelation(edge, e.clientX, e.clientY) }} onKeyDown={e => { if (e.key === 'Enter') onRelation(edge) }}>
            <GraphEdge d={d} style={draft?.style ?? edge.style} marker="mid" from={edge.from} to={edge.to}/>
            <path className="wg-edge-hit" d={d}/>
            {label && <text x={labelX} y={labelY} textAnchor="middle">{label}</text>}<title>{draft?.note ?? edge.note}</title>
          </g>
        })}{wire.preview && source && <path className="wg-connection-preview" d={`M${nodePosition(source).x + 112.5},${nodePosition(source).y + 56} L${wire.preview.x},${wire.preview.y}`} markerEnd={`url(#${arrowId})`}/>}</svg>
        {nodes.map(node => <div key={node.id} data-graph-node={node.id} role="button" tabIndex={0} aria-label={`项目节点 ${node.title}`} className={`wg-graph-node ${node.id === selectedId ? 'selected' : ''} ${wire.preview?.target === node.id ? 'wg-connect-target' : ''}`} style={nodePosition(node) && { left: nodePosition(node).x, top: nodePosition(node).y }} onClick={() => { if (!moved.current) onSelect(node.id) }} onDoubleClick={() => onOpen(node.id)} onKeyDown={e => { if (e.key === 'Enter') onOpen(node.id) }} onContextMenu={e => { e.preventDefault(); if (wire.suppressContext()) return; onContext(node, e.clientX, e.clientY) }} onPointerDown={e => {
          if (wire.start(e, node.id)) return
          if (e.button !== 0) return
          e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId); moved.current = false
          drag.current = { id: node.id, x: e.clientX, y: e.clientY, origin: nodePosition(node), moved: false }
        }}>{categories.find(c => c.id === node.categoryId) && <div className="wg-branch-tags"><span className="wg-category-tag" title={categories.find(c => c.id === node.categoryId)!.name}>{categories.find(c => c.id === node.categoryId)!.name}</span></div>}<div className="wg-node-body"><span className="wg-node-code">{node.kind === 'folder' ? <Folder size={16}/> : <File size={16}/>} {node.kind === 'folder' ? '文件夹' : node.name.split('.').pop()?.toUpperCase()} {node.snapshot ? '· 历史快照' : ''}</span><strong>{node.title}</strong><small>{node.note || '独立资料 · 可连接与整理'}</small></div></div>)}
      </div>
    </div>
    <GraphRiffle/>
  </div>
}
