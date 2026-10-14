import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { riffle, drawer, terminal, cabinet, turntable } from '../vendor/hairline/riffle.js'
import { useUiStore } from '../store/uiStore'

const figures = { Riffle: riffle, Drawer: drawer, Terminal: terminal, Cabinet: cabinet, Turntable: turntable }
type FigureName = keyof typeof figures
const descriptions: Record<FigureName, string> = { Riffle: '卡片托盘', Drawer: '抽屉柜', Terminal: '终端记录', Cabinet: '机柜', Turntable: '旋转台' }

export function GraphRiffle() {
  const visible = useUiStore(s => s.showGraphWidget), setFeature = useUiStore(s => s.setFeature)
  const host = useRef<HTMLDivElement>(null)
  const [selected, setSelected] = useState<FigureName>(() => {
    try { const saved = localStorage.getItem('gaomiao-graph-figure'); return saved && Object.hasOwn(figures, saved) ? saved as FigureName : 'Riffle' } catch { return 'Riffle' }
  })
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  useEffect(() => {
    if (!visible || !host.current) return
    const figure = figures[selected](host.current, { play: false, label: descriptions[selected] + '，鼠标互动；右键切换视效' })
    return () => figure.destroy()
  }, [selected, visible])
  useEffect(() => {
    if (!menu) return
    document.querySelector<HTMLButtonElement>('.wg-figure-menu [aria-checked="true"]')?.focus()
    const close = (e: PointerEvent) => { if (!(e.target as HTMLElement).closest('.wg-figure-menu')) setMenu(null) }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(null) }
    document.addEventListener('pointerdown', close); document.addEventListener('keydown', key)
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', key) }
  }, [menu])
  const showMenu = (x: number, y: number) => setMenu({ x: Math.max(8, Math.min(x, window.innerWidth - 240)), y: Math.max(8, Math.min(y, window.innerHeight - 330)) })
  if (!visible) return null
  return <div className="wg-graph-riffle" onPointerDown={e => e.stopPropagation()} onContextMenu={e => { e.preventDefault(); e.stopPropagation(); showMenu(e.clientX, e.clientY) }} onKeyDown={e => { if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) { e.preventDefault(); const r=e.currentTarget.getBoundingClientRect(); showMenu(r.left, r.top) } }}>
    <div ref={host} className="wg-riffle-figure" data-figure={selected}/>
    {menu && createPortal(<div className="wg-cat-menu wg-figure-menu" role="menu" aria-label="切换视效" style={{ left: menu.x, top: menu.y }}><strong>切换视效</strong>{(Object.keys(figures) as FigureName[]).map(name => <button key={name} role="menuitemradio" aria-checked={name === selected} onClick={() => { setSelected(name); setMenu(null); try { localStorage.setItem('gaomiao-graph-figure', name) } catch { /* storage unavailable */ } }}><span>{name} · {descriptions[name]}</span><span aria-hidden="true">{selected === name ? '✓' : ''}</span></button>)}<hr/><button role="menuitem" onClick={() => { setMenu(null); setFeature('showGraphWidget', false) }}>关闭小组件</button></div>, document.body)}
  </div>
}
