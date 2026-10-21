import { useEffect, useRef, useState, type DragEvent } from 'react'
import type { DroppedFile } from '@wordgit/shared'
import { api } from '../lib/ipc'

export function useFileDrop({ disabled, blockedHint, describe, onDrop, onError }: {
  disabled: boolean; describe(target: HTMLElement): string
  blockedHint?: string
  onDrop(files: DroppedFile[], target: HTMLElement): Promise<void>
  onError(message: string): void
}) {
  const [hint, setHint] = useState(''), target = useRef<HTMLElement | null>(null), reading = useRef(false)
  const reset = () => { target.current?.classList.remove('wg-drop-target'); target.current = null; setHint('') }
  const external = (e: DragEvent) => Array.from(e.dataTransfer.types).includes('Files')
  useEffect(() => {
    const prevent = (e: globalThis.DragEvent) => { if (Array.from(e.dataTransfer?.types ?? []).includes('Files')) e.preventDefault() }
    const clear = () => reset()
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') reset() }
    window.addEventListener('dragover', prevent); window.addEventListener('drop', clear); window.addEventListener('drop', prevent); window.addEventListener('blur', clear)
    window.addEventListener('dragend', clear); window.addEventListener('keydown', escape)
    return () => { window.removeEventListener('dragover', prevent); window.removeEventListener('drop', clear); window.removeEventListener('drop', prevent); window.removeEventListener('blur', clear); window.removeEventListener('dragend', clear); window.removeEventListener('keydown', escape); target.current?.classList.remove('wg-drop-target') }
  }, [])
  function over(e: DragEvent<HTMLElement>) {
    if (!external(e)) return
    e.preventDefault(); e.dataTransfer.dropEffect = disabled ? 'none' : 'copy'
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-drop-document],[data-drop-project],[data-drop-folder]')
    if (target.current !== el) { target.current?.classList.remove('wg-drop-target'); target.current = el; if (!disabled) el?.classList.add('wg-drop-target') }
    setHint(disabled ? blockedHint ?? '请先完成当前操作，再拖入文件' : describe(e.target as HTMLElement))
  }
  return {
    hint,
    handlers: {
      onDragEnter: over, onDragOver: over,
      onDragLeave: (e: DragEvent<HTMLElement>) => { if (!e.relatedTarget || !e.currentTarget.contains(e.relatedTarget as Node)) reset() },
      onDrop: (e: DragEvent<HTMLElement>) => {
        if (!external(e)) return
        e.preventDefault(); e.stopPropagation(); reset()
        if (disabled || reading.current) { onError(blockedHint ?? '请先完成当前操作，再拖入文件'); return }
        const element = e.target as HTMLElement
        try {
          const paths = api.drop!.paths(Array.from(e.dataTransfer.files))
          if (!paths.length) { onError('请从文件资源管理器拖入文件或文件夹，网页图片不能直接作为本地文件导入'); return }
          reading.current = true
          void api.drop!.inspect(paths).then(files => onDrop(files, element)).catch(error => onError((error as Error).message)).finally(() => { reading.current = false })
        } catch (error) { onError((error as Error).message) }
      },
    },
  }
}
