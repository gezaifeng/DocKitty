import { useCallback, useEffect, useRef, useState } from 'react'

export function useNotice(defaultDuration?: number) {
  const [notice, setNotice] = useState(''), timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const show = useCallback((message: string) => {
    clearTimeout(timer.current); setNotice(message)
    const duration = /^(已撤回|已重做)/.test(message) ? 2500 : defaultDuration
    if (message && duration) timer.current = setTimeout(() => setNotice(''), duration)
  }, [defaultDuration])
  useEffect(() => () => clearTimeout(timer.current), [])
  return [notice, show] as const
}
