import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { DocumentDetail } from '@wordgit/shared'
import { VersionGraph } from './VersionGraph'

// The real SVG engine is verified in the packaged Electron interaction test.
vi.mock('../vendor/hairline/riffle.js', () => { const mount = () => ({ update: vi.fn(), destroy: vi.fn() }); return { riffle: mount, drawer: mount, terminal: mount, cabinet: mount, turntable: mount } })

beforeEach(() => {
  vi.stubGlobal('PointerEvent', MouseEvent)
  Object.defineProperty(Element.prototype, 'setPointerCapture', { configurable: true, value: vi.fn() })
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); delete (Element.prototype as Partial<Element>).setPointerCapture })

it('keeps dropped positions during delayed saves and ignores an older failed drag', async () => {
  const version = { id: 'a', contentId: 'a', parents: [], title: '主稿', note: '', author: '', createdAt: '2026-10-12', branches: ['main'], categoryId: '', order: 0, position: { x: 65, y: 65 }, deletedAt: null, revisionCount: 0 }
  const detail: DocumentDetail = { docName: '稿.txt', title: '稿', deletedAt: null, currentBranch: 'main', branchHeads: { main: 'a' }, categories: [], versions: [version], workspace: { dirty: false, versionId: 'a', exists: true } }
  const pending: Array<(ok: boolean) => void> = []
  const save = vi.fn(() => new Promise<boolean>(resolve => pending.push(resolve)))
  const props = { detail, versions: detail.versions, selectedId: 'a', compareIds: [], onSelect: vi.fn(), onPosition: save, onMoveBranch: vi.fn() }
  const view = render(<VersionGraph onArrange={vi.fn()} {...props} />)
  const node = () => document.querySelector<HTMLElement>('.wg-graph-node')!
  const canvas = document.querySelector('.wg-graph-canvas')!
  const drag = () => {
    fireEvent.pointerDown(screen.getByRole('button', { name: '版本节点 主稿' }), { button: 0, clientX: 100, clientY: 100 })
    fireEvent.pointerMove(canvas, { clientX: 185, clientY: 185 })
    fireEvent.pointerUp(canvas)
  }
  drag()
  expect(node().style.left).toBe('165px')
  expect(node().style.top).toBe('165px')
  drag()
  expect(node().style.left).toBe('265px')
  await act(async () => pending[0](false))
  expect(node().style.left).toBe('265px')
  const updated = { ...version, position: { x: 265, y: 265 } }
  view.rerender(<VersionGraph onArrange={vi.fn()} {...props} detail={{ ...detail, versions: [updated] }} versions={[updated]} />)
  await act(async () => pending[1](true))
  expect(node().style.left).toBe('265px')
})

it('restores the saved position when a layout save fails', async () => {
  const version = { id: 'a', contentId: 'a', parents: [], title: '主稿', note: '', author: '', createdAt: '2026-10-12', branches: ['main'], categoryId: '', order: 0, position: { x: 65, y: 65 }, deletedAt: null, revisionCount: 0 }
  const detail: DocumentDetail = { docName: '稿.txt', title: '稿', deletedAt: null, currentBranch: 'main', branchHeads: { main: 'a' }, categories: [], versions: [version], workspace: { dirty: false, versionId: 'a', exists: true } }
  render(<VersionGraph onArrange={vi.fn()} detail={detail} versions={[version]} selectedId="a" compareIds={[]} onSelect={vi.fn()} onPosition={async () => false} onMoveBranch={vi.fn()} />)
  fireEvent.pointerDown(screen.getByRole('button', { name: '版本节点 主稿' }), { button: 0, clientX: 100, clientY: 100 })
  fireEvent.pointerMove(document.querySelector('.wg-graph-canvas')!, { clientX: 185, clientY: 185 })
  await act(async () => fireEvent.pointerUp(document.querySelector('.wg-graph-canvas')!))
  expect(document.querySelector<HTMLElement>('.wg-graph-node')!.style.left).toBe('65px')
})
