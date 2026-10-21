import { useEffect, useRef } from 'react'
import { Check } from 'lucide-react'
import { useUiStore, type Feature } from '../store/uiStore'
import { glassPalettes } from '../lib/glassPalettes'

export function FeaturesMenu() {
  const state = useUiStore(), menu = useRef<HTMLDetailsElement>(null)
  const glass = state.theme === 'liquid' || state.theme === 'liquid-dark'
  useEffect(() => {
    const outside = (event: PointerEvent) => { if (menu.current && !menu.current.contains(event.target as Node)) menu.current.open = false }
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape' && menu.current?.open) { menu.current.open = false; menu.current.querySelector('summary')?.focus() } }
    document.addEventListener('pointerdown', outside); document.addEventListener('keydown', key)
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', key) }
  }, [])
  const toggle = (feature: Feature, label: string) => <button key={feature} role="menuitemcheckbox" aria-checked={state[feature]} onClick={() => state.setFeature(feature, !state[feature])}><span>{label}</span><Check size={14} aria-hidden="true" style={{ visibility: state[feature] ? 'visible' : 'hidden' }}/></button>
  return <details className="wg-menu wg-features-menu" ref={menu} onBlurCapture={event => { if (event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false }}>
    <summary>功能</summary><div role="menu" aria-label="全局功能">
      <strong className="wg-feature-heading">显示</strong>{toggle('showGraphWidget', '关系图小组件')}{toggle('reduceTransparency', '减少透明度')}
      <hr/><strong className="wg-feature-heading">动效</strong>{toggle('reduceMotion', '减少动态效果')}
      {glass && <><hr/><strong className="wg-feature-heading">玻璃效果</strong>{toggle('glassBackgroundMotion', '背景流动')}{toggle('glassPointerLight', '指针光效')}<hr/><strong className="wg-feature-heading">背景配色</strong><div className="wg-glass-palettes" role="group" aria-label="玻璃背景配色">{glassPalettes.map(palette => <button key={palette.id} role="menuitemradio" aria-checked={state.glassPalette === palette.id} onClick={() => state.setGlassPalette(palette.id)}><span className="wg-palette-swatch" aria-hidden="true" style={{ background: `linear-gradient(135deg,${palette.colors[0]},${palette.colors[1]})` }}/><span>{palette.label}</span><Check size={12} aria-hidden="true" style={{ visibility: state.glassPalette === palette.id ? 'visible' : 'hidden' }}/></button>)}</div></>}
    </div>
  </details>
}
