import { useEffect } from 'react'
import { useUiStore } from '../store/uiStore'
import { createEntrance } from '../vendor/ak-ui/effects.mjs'

export function AkThemeEffects() {
  const theme = useUiStore(s => s.theme), reduced = useUiStore(s => s.reduceMotion)
  useEffect(() => {
    if (theme !== 'arknights' || reduced) return
    const controllers = new Map<HTMLElement, ReturnType<typeof createEntrance>>()
    let frame = 0
    const scan = () => {
      frame = 0
      for (const [node, controller] of controllers) if (!node.isConnected) { controller.destroy(); controllers.delete(node) }
      let index = 0
      document.querySelectorAll<HTMLElement>('.wg-document-card,.wg-version-card,.wg-graph-node>.wg-node-body,.wg-stat-cards>section').forEach(node => {
        if (controllers.has(node)) return
        const controller = createEntrance(node, { duration: 420, delay: Math.min(index++ * 45, 180), distance: 16, direction: 'left' })
        controllers.set(node, controller); controller.play()
      })
    }
    const observer = new MutationObserver(() => { if (!frame) frame = requestAnimationFrame(scan) })
    observer.observe(document.body, { childList: true, subtree: true }); scan()
    return () => { observer.disconnect(); cancelAnimationFrame(frame); controllers.forEach(c => c.destroy()) }
  }, [theme, reduced])
  return null
}
