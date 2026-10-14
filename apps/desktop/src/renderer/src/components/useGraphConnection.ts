import { useEffect, useRef, useState, type PointerEvent, type RefObject } from 'react'

export function useGraphConnection({ canvas, world, zoom, selectedId, ids, onConnect }: {
  canvas: RefObject<HTMLDivElement | null>; world: RefObject<HTMLDivElement | null>; zoom: number
  selectedId: string | null; ids: string[]; onConnect?: (from: string, to: string) => void
}) {
  const active = useRef<{ id: string; pointerId: number; x: number; y: number; moved: boolean } | null>(null)
  const suppressMenu = useRef(false)
  const [preview, setPreview] = useState<{ from: string; x: number; y: number; target: string | null } | null>(null)
  const cancel = () => {
    if (active.current) suppressMenu.current = true
    active.current = null; setPreview(null)
  }
  useEffect(() => {
    const key = (event: KeyboardEvent) => { if (active.current && event.key === 'Escape') { event.preventDefault(); cancel() } }
    window.addEventListener('keydown', key); window.addEventListener('wordgit:cancel-connection', cancel)
    return () => { window.removeEventListener('keydown', key); window.removeEventListener('wordgit:cancel-connection', cancel) }
  }, [])
  useEffect(() => { if (active.current && active.current.id !== selectedId) cancel() }, [selectedId, ids.join('|')])
  function targetAt(x: number, y: number) {
    const node = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-graph-node]')
    const id = node?.dataset.graphNode
    return node && canvas.current?.contains(node) && id && ids.includes(id) && id !== active.current?.id ? id : null
  }
  return {
    preview, cancel,
    start(event: PointerEvent, id: string) {
      suppressMenu.current = false
      if (event.button !== 2 || id !== selectedId || !onConnect) return false
      event.preventDefault(); event.stopPropagation()
      event.currentTarget.setPointerCapture(event.pointerId)
      active.current = { id, pointerId: event.pointerId, x: event.clientX, y: event.clientY, moved: false }
      return true
    },
    move(event: PointerEvent) {
      const drag = active.current
      if (!drag) return false
      if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 4) drag.moved = true
      if (drag.moved) {
        suppressMenu.current = true
        const origin = world.current?.getBoundingClientRect()
        if (origin) setPreview({ from: drag.id, x: (event.clientX - origin.left) / zoom, y: (event.clientY - origin.top) / zoom, target: targetAt(event.clientX, event.clientY) })
      }
      return true
    },
    finish(event: PointerEvent) {
      const drag = active.current
      if (!drag) return false
      const target = targetAt(event.clientX, event.clientY)
      active.current = null; setPreview(null)
      if (drag.moved) {
        suppressMenu.current = true; event.preventDefault()
        if (target) onConnect?.(drag.id, target)
      }
      return true
    },
    suppressContext() { return suppressMenu.current || !!active.current?.moved },
  }
}
