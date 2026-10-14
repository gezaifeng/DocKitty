import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ProjectGraph } from './ProjectGraph'

vi.mock('../vendor/hairline/riffle.js', () => { const mount = () => ({ update: vi.fn(), destroy: vi.fn() }); return { riffle: mount, drawer: mount, terminal: mount, cabinet: mount, turntable: mount } })
beforeEach(() => { vi.stubGlobal('PointerEvent', MouseEvent); Object.defineProperty(Element.prototype, 'setPointerCapture', { configurable: true, value: vi.fn() }) })
afterEach(() => { cleanup(); vi.unstubAllGlobals(); delete (Element.prototype as Partial<Element>).setPointerCapture; delete (document as Partial<Document>).elementFromPoint })
function mount() {
  const node = (id: string, x: number) => ({ id, name: id + '.md', title: id, kind: 'file' as const, parentId: null, note: '', size: 0, createdAt: '2026-10-13', position: { x, y: 0 } })
  const props = { nodes: [node('A', 0), node('B', 300)], relations: [], selectedId: 'A', onSelect: vi.fn(), onOpen: vi.fn(), onContext: vi.fn(), onMove: vi.fn(async () => {}), onRelation: vi.fn(), onConnect: vi.fn() }
  render(<ProjectGraph {...props}/>); const target = screen.getByRole('button', { name: '项目节点 B' })
  Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: vi.fn(() => target) })
  return props
}
it('right-drags a wire to the target without moving the selected card or opening its context menu', () => {
  const props = mount(), source = screen.getByRole('button', { name: '项目节点 A' }), canvas = document.querySelector('.wg-graph-canvas')!
  fireEvent.pointerDown(source, { button: 2, clientX: 100, clientY: 100 })
  fireEvent.pointerMove(canvas, { clientX: 400, clientY: 100 })
  expect(document.querySelector('.wg-connection-preview')).not.toBeNull()
  expect(source.style.left).toBe('0px'); expect(screen.getByRole('button', { name: '项目节点 B' })).toHaveClass('wg-connect-target')
  fireEvent.pointerUp(canvas, { button: 2, clientX: 400, clientY: 100 }); fireEvent.contextMenu(source)
  expect(props.onConnect).toHaveBeenCalledWith('A', 'B'); expect(props.onMove).not.toHaveBeenCalled(); expect(props.onContext).not.toHaveBeenCalled()
})
it('keeps ordinary right-click menus and cancels an unfinished wire with Escape', () => {
  const props = mount(), source = screen.getByRole('button', { name: '项目节点 A' }), canvas = document.querySelector('.wg-graph-canvas')!
  fireEvent.pointerDown(source, { button: 2, clientX: 100, clientY: 100 }); fireEvent.pointerUp(canvas, { button: 2, clientX: 100, clientY: 100 }); fireEvent.contextMenu(source)
  expect(props.onContext).toHaveBeenCalledOnce()
  fireEvent.pointerDown(source, { button: 2, clientX: 100, clientY: 100 }); fireEvent.pointerMove(canvas, { clientX: 400, clientY: 100 }); fireEvent.keyDown(window, { key: 'Escape' }); fireEvent.pointerUp(canvas, { button: 2, clientX: 400, clientY: 100 })
  expect(props.onConnect).not.toHaveBeenCalled(); expect(document.querySelector('.wg-connection-preview')).toBeNull()
})
