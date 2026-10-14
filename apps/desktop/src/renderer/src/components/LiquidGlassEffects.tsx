import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useUiStore } from '../store/uiStore'
import { installGlassLight } from '../lib/liquidGlassLight'
import background from '../assets/liquid-glass-background.svg?raw'

export function LiquidGlassEffects() {
  const { theme, glassBackgroundMotion, glassPointerLight, glassPalette, reduceMotion } = useUiStore()
  const [systemReduced, setSystemReduced] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches)
  const backdrop = useRef<HTMLDivElement>(null), enabled = theme === 'liquid' || theme === 'liquid-dark'
  const reduced = reduceMotion || systemReduced
  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)'), change = () => setSystemReduced(media.matches)
    media.addEventListener('change', change); return () => media.removeEventListener('change', change)
  }, [])
  useEffect(() => {
    if (!enabled || reduced || !glassPointerLight) return
    return installGlassLight()
  }, [enabled, reduced, glassPointerLight])
  useEffect(() => {
    if (!enabled) return
    let zooming = false, resume: ReturnType<typeof setTimeout> | undefined
    const sync = () => {
      const svg = backdrop.current?.querySelector('svg')
      if (!svg) return
      const paused = reduced || !glassBackgroundMotion || document.hidden || zooming
      backdrop.current!.dataset.paused = String(paused)
      if (paused) svg.pauseAnimations(); else svg.unpauseAnimations()
    }
    const wheel = (event: WheelEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest('.wg-graph-canvas')) return
      zooming = true; clearTimeout(resume); sync()
      resume = setTimeout(() => { zooming = false; sync() }, 160)
    }
    sync(); document.addEventListener('visibilitychange', sync)
    document.addEventListener('wheel', wheel, true)
    return () => { clearTimeout(resume); document.removeEventListener('visibilitychange', sync); document.removeEventListener('wheel', wheel, true) }
  }, [enabled, reduced, glassBackgroundMotion])
  return enabled ? createPortal(<div ref={backdrop} className="wg-liquid-background" data-palette={glassPalette} aria-hidden="true" dangerouslySetInnerHTML={{ __html: background }}/>, document.body) : null
}
