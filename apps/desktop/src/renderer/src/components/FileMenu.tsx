import { useEffect, useRef, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@renderer/lib/ipc'
import { useRepoStore } from '@renderer/store/repoStore'

export function FileMenu({ children, busy = false, onError, onNotice }: { children?: ReactNode; busy?: boolean; onError(message: string): void; onNotice(message: string): void }) {
  const menu = useRef<HTMLDetailsElement>(null), running = useRef(false), { repoRoot } = useRepoStore(), client = useQueryClient()
  const pending = useRef<Array<'undo' | 'redo'>>([]), busyState = useRef(busy); busyState.current = busy
  const state = useQuery({ queryKey: ['edit-history', repoRoot], queryFn: () => api.history!.status(), enabled: !!repoRoot && !!api.history, refetchInterval: 1500 }).data
  async function perform(action: 'undo' | 'redo') {
    if (!api.history) return
    if (busyState.current || running.current) { pending.current.push(action); return }
    running.current = true
    try {
      const current = await api.history.status()
      if (!current[action === 'undo' ? 'canUndo' : 'canRedo']) return
      const result = await api.history[action]() as { workspaceEditsPreserved?: boolean }; await client.invalidateQueries()
      window.dispatchEvent(new Event('wordgit:history-applied'))
      onNotice(`${action === 'undo' ? '已撤回' : '已重做'}：${current[action === 'undo' ? 'undoLabel' : 'redoLabel']}${result.workspaceEditsPreserved ? '（编辑器中的新修改已保留）' : ''}`)
    } catch (error) { onError((error as Error).message); await client.invalidateQueries({ queryKey: ['edit-history'] }) }
    finally { running.current = false; if (!busyState.current && pending.current.length) void perform(pending.current.shift()!) }
  }
  useEffect(() => { if (!busy && !running.current && pending.current.length) void perform(pending.current.shift()!) }, [busy])
  useEffect(() => {
    const outside = (event: PointerEvent) => { if (!menu.current?.contains(event.target as Node) && menu.current) menu.current.open = false }
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && menu.current) menu.current.open = false
      if (!(event.ctrlKey || event.metaKey) || !['z', 'y'].includes(event.key.toLowerCase()) || event.altKey) return
      if (event.target instanceof Element && event.target.closest('input,textarea,[contenteditable="true"],[contenteditable=""]')) return
      event.preventDefault()
      const action = event.key.toLowerCase() === 'y' || event.shiftKey ? 'redo' : 'undo'
      if (action === 'undo' && document.querySelector('[data-graph-connecting="true"]')) { window.dispatchEvent(new Event('wordgit:cancel-connection')); return }
      void perform(action)
    }
    document.addEventListener('pointerdown', outside); document.addEventListener('keydown', key)
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', key) }
  }, [state, busy])
  return <details className="wg-menu" ref={menu} onBlurCapture={event => { if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false }}><summary>文件</summary><div onClick={event => { if ((event.target as HTMLElement).closest('button') && menu.current) menu.current.open = false }}>
    <button disabled={busy || !state?.canUndo} title={state?.undoLabel ?? '暂无可撤回操作'} onClick={() => void perform('undo')}><span>撤回{state?.undoLabel ? `：${state.undoLabel}` : ''}</span><kbd>Ctrl+Z</kbd></button>
    <button disabled={busy || !state?.canRedo} title={state?.redoLabel ?? '暂无可重做操作'} onClick={() => void perform('redo')}><span>重做{state?.redoLabel ? `：${state.redoLabel}` : ''}</span><kbd>Ctrl+Shift+Z</kbd></button>
    {children && <><hr/>{children}</>}
  </div></details>
}
