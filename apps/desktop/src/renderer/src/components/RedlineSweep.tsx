import { useUiStore } from '../store/uiStore'

export function RedlineSweep({ page }: { page: string }) {
  const theme = useUiStore(s => s.theme), reduceMotion = useUiStore(s => s.reduceMotion)
  return theme === 'redline' && !reduceMotion ? <span key={page} className="wg-redline-sweep" aria-hidden="true"/> : null
}
