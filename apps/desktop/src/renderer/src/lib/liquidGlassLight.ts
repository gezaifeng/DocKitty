export const glassSurfaces = '.wg-menubar,.wg-project-actions,.wg-viewbar nav,.wg-theme-trigger,.wg-button,.wg-icon-button,.wg-viewbar nav button,.wg-nav>button,.wg-stat-sidebar section button,.wg-search,.wg-nav,.wg-inspector,.wg-file-center,.wg-graph-canvas,.wg-document-card,.wg-graph-node,.wg-version-card,.wg-stat-sidebar,.wg-stat-chart-panel,.wg-stat-cards section,.wg-stat-detail,.wg-stat-table,.wg-theme-options,.wg-menu>div,.wg-version-menu,.wg-cat-menu,.wg-edge-style-menu,.wg-dialog,.wg-project-library-list,.wg-column,.wg-settings .bg-card,.wg-settings button'

// Backgrounds stay attached to the padding box when content scrolls. Account
// for transformed cards and the border, without adding a scroll offset.
export function glassPoint(panel: HTMLElement, clientX: number, clientY: number) {
  const rect = panel.getBoundingClientRect()
  return { x: (clientX - rect.left) * panel.offsetWidth / rect.width - panel.clientLeft, y: (clientY - rect.top) * panel.offsetHeight / rect.height - panel.clientTop }
}

export function installGlassLight() {
  type Point = { x: number; y: number; time: number }
  type Light = { x: number; y: number; clientX: number; clientY: number; active: boolean; points: Point[] }
  const lights = new Map<HTMLElement, Light>(), lifetime = 700
  let frame = 0
  const head = (x: number, y: number) => `radial-gradient(ellipse 170px 135px at ${x}px ${y}px,rgba(255,255,255,.25) 0%,rgba(255,255,255,.12) 25%,rgba(255,255,255,.035) 55%,rgba(255,255,255,0) 100%)`
  function schedule() { if (!frame) frame = requestAnimationFrame(paint) }
  function leave(panel: HTMLElement, light: Light, time: number) {
    if (!light.active) return
    light.points.push({ x: light.x, y: light.y, time }); light.active = false
    panel.style.removeProperty('--wg-light-head')
  }
  function move(event: PointerEvent) {
    if (event.pointerType === 'touch') return
    const panel = event.target instanceof Element ? event.target.closest<HTMLElement>(glassSurfaces) : null, time = performance.now()
    for (const [other, light] of lights) if (other !== panel) leave(other, light, time)
    if (panel && panel.offsetWidth && panel.offsetHeight) {
      const point = glassPoint(panel, event.clientX, event.clientY)
      let light = lights.get(panel)
      if (!light) { light = { ...point, clientX: event.clientX, clientY: event.clientY, active: true, points: [] }; lights.set(panel, light) }
      else if (light.active && Math.hypot(point.x - light.x, point.y - light.y) > 6) { light.points.push({ x: light.x, y: light.y, time }); light.points = light.points.slice(-16) }
      Object.assign(light, point, { clientX: event.clientX, clientY: event.clientY, active: true })
      panel.dataset.glassLight = ''; panel.style.setProperty('--wg-light-x', String(point.x)); panel.style.setProperty('--wg-light-y', String(point.y))
      // No interpolation, transition or frame queue between pointer and source.
      panel.style.setProperty('--wg-light-head', head(point.x, point.y))
    }
    if (lights.size) schedule()
  }
  function paint(time: number) {
    frame = 0; let fading = false
    for (const [panel, light] of lights) {
      if (!panel.isConnected) { lights.delete(panel); continue }
      // Keep the source under a stationary pointer while a card or its parent
      // animates. Pointer events still update it immediately, without easing.
      if (light.active) {
        const point = glassPoint(panel, light.clientX, light.clientY)
        if (point.x !== light.x || point.y !== light.y) {
          Object.assign(light, point)
          panel.style.setProperty('--wg-light-x', String(point.x)); panel.style.setProperty('--wg-light-y', String(point.y))
          panel.style.setProperty('--wg-light-head', head(point.x, point.y))
        }
        fading = true
      }
      light.points = light.points.filter(point => time - point.time < lifetime)
      const traces = light.points.map(point => {
        const opacity = .052 * Math.pow(Math.max(0, 1 - (time - point.time) / lifetime), 1.7)
        return `radial-gradient(ellipse 125px 105px at ${point.x}px ${point.y}px,rgba(255,255,255,${opacity.toFixed(4)}) 0%,rgba(255,255,255,${(opacity * .28).toFixed(4)}) 48%,rgba(255,255,255,0) 100%)`
      })
      panel.style.setProperty('--wg-light-traces', traces.length ? traces.join(',') : 'linear-gradient(transparent,transparent)')
      if (traces.length) fading = true
      else if (!light.active) { panel.removeAttribute('data-glass-light'); panel.style.removeProperty('--wg-light-traces'); lights.delete(panel) }
    }
    if (fading) schedule()
  }
  function clear() {
    cancelAnimationFrame(frame); frame = 0
    for (const panel of lights.keys()) { panel.removeAttribute('data-glass-light'); for (const property of ['--wg-light-head', '--wg-light-traces', '--wg-light-x', '--wg-light-y']) panel.style.removeProperty(property) }
    lights.clear()
  }
  const exit = (event: PointerEvent) => { if (!event.relatedTarget) { for (const [panel, light] of lights) leave(panel, light, performance.now()); if (lights.size) schedule() } }
  const hidden = () => { if (document.hidden) clear() }
  document.addEventListener('pointermove', move, true); document.addEventListener('pointerout', exit, true)
  document.addEventListener('visibilitychange', hidden); window.addEventListener('blur', clear)
  return () => { clear(); document.removeEventListener('pointermove', move, true); document.removeEventListener('pointerout', exit, true); document.removeEventListener('visibilitychange', hidden); window.removeEventListener('blur', clear) }
}
