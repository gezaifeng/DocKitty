import { useEffect, useRef, useState, type RefObject } from 'react'
import { poseMascot } from '../brand/mascot'
import { Mascot } from './Mascot'
import '../assets/startup.css'

export function StartupScreen({ ready, revealRef, onFinish, reduceMotion = false }: {
  reduceMotion?: boolean
  ready: boolean
  revealRef: RefObject<HTMLDivElement | null>
  onFinish: () => void
}) {
  const mascot = useRef<HTMLDivElement>(null)
  const backdrop = useRef<HTMLDivElement>(null)
  const exiting = useRef(false)
  const [caught, setCaught] = useState(false)
  const [phase, setPhase] = useState('connecting')
  const [systemReduced, setSystemReduced] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false)

  const reduced = reduceMotion || systemReduced

  useEffect(() => {
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    const change = () => setSystemReduced(media?.matches ?? false)
    media?.addEventListener('change', change)
    return () => media?.removeEventListener('change', change)
  }, [])

  useEffect(() => {
    if (!mascot.current) return
    let frame = 0, active = true, completed = false
    let start: number | undefined
    exiting.current = false
    const tick = (now: number) => {
      if (!active || exiting.current || !mascot.current) return
      start ??= now
      const elapsed = reduced ? 620 : now - start
      poseMascot(mascot.current, elapsed)
      if (elapsed >= 620 && !completed) { completed = true; setCaught(true); setPhase('waiting') }
      if (!reduced && !completed) frame = requestAnimationFrame(tick)
    }
    const images = Array.from(document.querySelectorAll<HTMLImageElement>('.wg-page-origin,.wg-mascot img'))
    void Promise.allSettled(images.map(img => img.decode?.())).then(() => {
      if (!active) return
      if (reduced) tick(performance.now())
      else frame = requestAnimationFrame(tick)
    })
    return () => { active = false; cancelAnimationFrame(frame) }
  }, [reduced])

  useEffect(() => {
    if (!ready || !caught || !revealRef.current) return
    const page = revealRef.current
    const content = page.querySelector<HTMLElement>('.wg-page-content')
    const origin = page.querySelector<HTMLElement>('.wg-page-origin,.wg-mascot img')
    const finish = () => {
      Object.assign(page.style, { clipPath: 'none', visibility: 'visible' })
      if (content) content.style.opacity = '1'
      if (origin) origin.style.opacity = '0'
      if (backdrop.current) Object.assign(backdrop.current.style, { opacity: '0', visibility: 'hidden' })
      onFinish()
    }
    exiting.current = true
    if (reduced) { finish(); return }
    const source = mascot.current?.querySelector('[data-version-paper]')
    if (!source || !backdrop.current || !page.animate || !content || !origin) { finish(); return }
    const rect = source.getBoundingClientRect()
    const inset = `inset(${rect.top}px ${window.innerWidth - rect.right}px ${window.innerHeight - rect.bottom}px ${rect.left}px round 8px)`
    const transform = `translate(${rect.left}px,${rect.top}px) scale(${rect.width / window.innerWidth},${rect.height / window.innerHeight})`
    Object.assign(page.style, { clipPath: inset, visibility: 'visible' })
    origin.style.transform = transform
    // Expand the page boundary while keeping the workspace text at its native size.
    setPhase('expanding')
    const expansion = page.animate([
      { clipPath: inset, offset: 0 },
      { clipPath: 'inset(0px 0px 0px 0px round 0px)', offset: 1 },
    ], { duration: 360, easing: 'cubic-bezier(.2,.85,.2,1)', fill: 'forwards' })
    const animations = [expansion,
      origin.animate([{ transform }, { transform: 'none' }], { duration: 360, easing: 'cubic-bezier(.2,.85,.2,1)', fill: 'forwards' }),
      content.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220, delay: 45, fill: 'forwards' }),
      origin.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 90, delay: 35, fill: 'forwards' }),
      backdrop.current.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 360, fill: 'forwards' }),
    ]
    let active = true
    expansion.finished.then(() => {
      if (!active) return
      finish()
      // Commit final values before removing the animation fill, avoiding a reset frame.
      animations.forEach(animation => animation.cancel())
    }).catch(() => {})
    return () => { active = false; animations.forEach(animation => animation.cancel()) }
  }, [ready, caught, reduced, revealRef, onFinish])

  return <div className="wg-startup" data-phase={phase} role="status" aria-label="稿喵正在启动">
    <div className="wg-startup-backdrop" ref={backdrop}>
      <div className="wg-startup-content"><Mascot ref={mascot} />
        <h1>稿喵</h1><p>每一稿，都有迹可循。</p>
        <small>{ready ? '文档已就绪' : '正在打开你的文档…'}</small>
      </div>
    </div>
  </div>
}
