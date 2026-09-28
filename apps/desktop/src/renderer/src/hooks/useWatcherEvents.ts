// apps/desktop/src/renderer/src/hooks/useWatcherEvents.ts
import { useEffect } from 'react'
import { api } from '@renderer/lib/ipc'
import { useUiStore } from '@renderer/store/uiStore'

/**
 * 注册 watcher.change IPC 推送事件。
 * 放在根组件（App 或 MainLayout）中调用一次。
 */
export function useWatcherEvents(): void {
  const setPendingCommit = useUiStore((s) => s.setPendingCommit)

  useEffect(() => {
    const unsub = api.onWatcherChange(({ docName, workspacePath }) => {
      setPendingCommit(docName, workspacePath)
    })
    return unsub
  }, [setPendingCommit])
}
