import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { mascotImages } from '../brand/mascot'
import { useUiStore } from '../store/uiStore'

const gestures = ['摸摸脑袋', '顺顺毛', '轻轻挠下巴'] as const
export function SidebarCat() {
  const cat = useRef<HTMLImageElement>(null)
  const animation = useRef<Animation | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const [reaction, setReaction] = useState('')
  const [spark, setSpark] = useState(0)
  const theme = useUiStore(s => s.theme), reduceMotion = useUiStore(s => s.reduceMotion)
  useEffect(() => {
    if (!menu) return
    document.querySelector<HTMLButtonElement>('.wg-cat-menu button')?.focus()
    const close = (e: PointerEvent) => { if (!(e.target as HTMLElement).closest('.wg-cat-menu')) setMenu(null) }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(null) }
    document.addEventListener('pointerdown', close); document.addEventListener('keydown', key)
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', key) }
  }, [menu])
  useEffect(() => { if (!reaction) return; const timer = setTimeout(() => setReaction(''), 1500); return () => clearTimeout(timer) }, [reaction])
  useEffect(() => () => animation.current?.cancel(), [])
  function pet(index: number) {
    setMenu(null); animation.current?.cancel()
    setReaction(['喵，好舒服。', '毛茸茸，顺好啦。', '呼噜呼噜…'][index])
    if (!cat.current || reduceMotion || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const redline = theme === 'redline' && index === 0
    if (redline) setSpark(value => value + 1)
    const frames = redline ? ['rotate(0)', 'rotate(-9deg) translateY(-9px)', 'rotate(6deg) translateY(-3px)', 'rotate(0)'] : [
      ['none', 'translateY(3px) rotate(-3deg)', 'translateY(1px) rotate(2deg)', 'none'],
      ['none', 'translateX(-4px) rotate(-2deg)', 'translateX(4px) rotate(2deg)', 'none'],
      ['none', 'translateY(-5px) rotate(3deg)', 'translateY(-2px) rotate(-1deg)', 'none'],
    ][index]
    animation.current = cat.current.animate(frames.map(transform => ({ transform })), { duration: redline ? 550 : 700, easing: 'ease-in-out' })
  }
  return <div className="wg-sidebar-cat"><span role="status" className="wg-cat-reaction">{reaction}</span><button aria-label="稿喵小猫，右键抚摸" aria-haspopup="menu" onClick={() => pet(0)} onContextMenu={e => { e.preventDefault(); setMenu({ x: Math.min(e.clientX, window.innerWidth - 205), y: Math.max(8, Math.min(e.clientY, window.innerHeight - 180)) }) }} onKeyDown={e => { if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) { e.preventDefault(); const r=e.currentTarget.getBoundingClientRect(); setMenu({ x:r.left, y:Math.max(8,r.top-150) }) } }}>{theme === 'redline' && spark > 0 && <span key={spark} className="wg-cat-spark" aria-hidden="true">✦</span>}<img ref={cat} src={mascotImages.cat} alt="蓬松的三花猫" draggable={false}/></button>{menu && createPortal(<div role="menu" aria-label="抚摸小猫" className="wg-cat-menu" style={{ left:menu.x,top:menu.y }}>{gestures.map((gesture,index)=><button key={gesture} role="menuitem" onClick={()=>pet(index)}>{gesture}</button>)}</div>,document.body)}</div>
}
