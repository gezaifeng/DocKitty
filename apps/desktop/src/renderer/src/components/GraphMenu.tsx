import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export function GraphMenu({ x, y, actions, onClose }: { x: number; y: number; actions: Array<{ label: string; run(): void; disabled?: boolean }>; onClose(): void }) {
  const root = useRef<HTMLDivElement>(null), [position, setPosition] = useState({ left: x, top: y })
  useLayoutEffect(() => {
    const menu = root.current!
    setPosition({ left: Math.max(8, Math.min(x, innerWidth - menu.offsetWidth - 8)), top: Math.max(8, Math.min(y, innerHeight - menu.offsetHeight - 8)) })
    root.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
  }, [x, y])
  useEffect(() => {
    const close = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) onClose() }
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Tab') onClose()
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
      e.preventDefault()
      const buttons = [...root.current!.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')], index = buttons.indexOf(document.activeElement as HTMLButtonElement)
      buttons[(index + (e.key === 'ArrowDown' ? 1 : buttons.length - 1)) % buttons.length]?.focus()
    }
    document.addEventListener('pointerdown', close); document.addEventListener('keydown', key)
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', key) }
  }, [onClose])
  return createPortal(<div ref={root} className="wg-version-menu wg-layout-menu wg-graph-menu" role="menu" aria-label="关系图操作" style={position} onContextMenu={e => e.preventDefault()}>{actions.map(action => <button key={action.label} role="menuitem" disabled={action.disabled} onClick={() => { onClose(); action.run() }}>{action.label}</button>)}</div>, document.body)
}
