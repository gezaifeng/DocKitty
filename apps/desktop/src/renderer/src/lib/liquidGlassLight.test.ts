import { describe, expect, it, vi } from 'vitest'
import { glassPoint, installGlassLight } from './liquidGlassLight'

function panel(width = 204, height = 104, scale = 1) {
  const element = document.createElement('div')
  Object.defineProperties(element, { offsetWidth: { value: width }, offsetHeight: { value: height }, clientLeft: { value: 2 }, clientTop: { value: 2 } })
  element.getBoundingClientRect = () => new DOMRect(100, 200, width * scale, height * scale)
  return element
}

describe('glass light coordinate alignment', () => {
  it('uses the padding origin rather than the outer border', () => {
    expect(glassPoint(panel(), 152, 222)).toEqual({ x: 50, y: 20 })
  })
  it('keeps the light under the pointer on a zoomed graph card', () => {
    expect(glassPoint(panel(204, 104, .5), 151, 226)).toEqual({ x: 100, y: 50 })
  })
  it('does not offset the light when a detail panel scrolls', () => {
    const element = panel(); element.scrollTop = 400; element.scrollLeft = 120
    expect(glassPoint(element, 152, 222)).toEqual({ x: 50, y: 20 })
  })
  it('updates immediately, keeps old traces fixed and follows a moving surface', () => {
    const element = panel(); element.className = 'wg-graph-node'; document.body.append(element)
    let top = 200, frame: FrameRequestCallback = () => {}
    element.getBoundingClientRect = () => new DOMRect(100, top, 204, 104)
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frame = callback; return 1 })
    vi.stubGlobal('cancelAnimationFrame', () => {})
    const dispose = installGlassLight()
    try {
      element.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 152, clientY: 222 }))
      expect(element.style.getPropertyValue('--wg-light-head')).toContain('at 50px 20px')
      element.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 220, clientY: 222 }))
      expect(element.style.getPropertyValue('--wg-light-head')).toContain('at 118px 20px')
      top = 190; frame(performance.now())
      expect(element.style.getPropertyValue('--wg-light-head')).toContain('at 118px 30px')
      expect(element.style.getPropertyValue('--wg-light-traces')).toContain('at 50px 20px')
      frame(performance.now() + 800)
      expect(element.style.getPropertyValue('--wg-light-traces')).toBe('linear-gradient(transparent,transparent)')
    } finally { dispose(); element.remove(); vi.unstubAllGlobals() }
  })
})
