import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, expect, it, vi } from 'vitest'
import { FileMenu } from './FileMenu'

const { undo, redo } = vi.hoisted(() => ({ undo: vi.fn(async () => ({})), redo: vi.fn(async () => ({})) }))
vi.mock('@renderer/lib/ipc', () => ({ api: { history: { status: async () => ({ canUndo: true, canRedo: true, undoLabel: '连线', redoLabel: '分类' }), undo, redo } } }))
vi.mock('@renderer/store/repoStore', () => ({ useRepoStore: () => ({ repoRoot: 'test-library' }) }))
afterEach(() => { cleanup(); vi.clearAllMocks() })
function mount() {
  const notice = vi.fn()
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><FileMenu onError={vi.fn()} onNotice={notice}/><input aria-label="编辑备注"/></QueryClientProvider>)
  return notice
}
it('closes the file menu outside it and after an operation, while retaining normal toggle behavior', async () => {
  mount(); await waitFor(() => expect(screen.getByText('撤回：连线').closest('button')).not.toBeDisabled())
  const details = document.querySelector('details')!
  fireEvent.click(screen.getByText('文件')); expect(details.open).toBe(true)
  fireEvent.pointerDown(document.body); expect(details.open).toBe(false)
  fireEvent.click(screen.getByText('文件')); fireEvent.click(screen.getByRole('button', { name: /撤回：连线/ }))
  await waitFor(() => expect(undo).toHaveBeenCalledOnce()); expect(details.open).toBe(false)
})
it('supports undo/redo shortcuts without intercepting text editing or a pending wire cancellation', async () => {
  const notice = mount(); await waitFor(() => expect(screen.getByText('撤回：连线').closest('button')).not.toBeDisabled())
  fireEvent.keyDown(screen.getByLabelText('编辑备注'), { key: 'z', ctrlKey: true }); expect(undo).not.toHaveBeenCalled()
  const pending = document.createElement('div'); pending.dataset.graphConnecting = 'true'; document.body.append(pending)
  const cancel = vi.fn(); window.addEventListener('wordgit:cancel-connection', cancel)
  fireEvent.keyDown(document.body, { key: 'z', ctrlKey: true }); expect(cancel).toHaveBeenCalledOnce(); expect(undo).not.toHaveBeenCalled()
  pending.remove(); window.removeEventListener('wordgit:cancel-connection', cancel)
  fireEvent.keyDown(document.body, { key: 'z', ctrlKey: true }); await waitFor(() => expect(notice).toHaveBeenCalledOnce())
  fireEvent.keyDown(document.body, { key: 'z', ctrlKey: true, shiftKey: true }); await waitFor(() => expect(redo).toHaveBeenCalledOnce())
})

it('queues a shortcut during a pending mutation instead of losing it when the dialog closes early', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }), notice = vi.fn()
  const view = render(<QueryClientProvider client={client}><FileMenu busy onError={vi.fn()} onNotice={notice}/></QueryClientProvider>)
  fireEvent.keyDown(document.body, { key: 'z', ctrlKey: true }); expect(undo).not.toHaveBeenCalled()
  view.rerender(<QueryClientProvider client={client}><FileMenu busy={false} onError={vi.fn()} onNotice={notice}/></QueryClientProvider>)
  await waitFor(() => expect(undo).toHaveBeenCalledOnce())
})

it('runs rapid undo and redo requests in order while the preceding request is still saving', async () => {
  let finish!: (value: {}) => void
  undo.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  mount(); await waitFor(() => expect(screen.getByText('撤回：连线').closest('button')).not.toBeDisabled())
  fireEvent.keyDown(document.body, { key: 'z', ctrlKey: true }); await waitFor(() => expect(undo).toHaveBeenCalledOnce())
  fireEvent.keyDown(document.body, { key: 'z', ctrlKey: true, shiftKey: true }); expect(redo).not.toHaveBeenCalled()
  finish({}); await waitFor(() => expect(redo).toHaveBeenCalledOnce())
})
