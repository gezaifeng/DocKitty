import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, act } from '@testing-library/react'
import { LiquidGlassEffects } from './LiquidGlassEffects'
import { useUiStore } from '../store/uiStore'

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); Reflect.deleteProperty(SVGSVGElement.prototype, 'pauseAnimations'); Reflect.deleteProperty(SVGSVGElement.prototype, 'unpauseAnimations'); useUiStore.setState({ theme: 'blockframe', glassBackgroundMotion: true, glassPointerLight: true }) })

describe('background during graph zoom', () => {
  it('pauses continuous wheel zoom then resumes without restarting the SVG', () => {
    vi.useFakeTimers(); const pause = vi.fn(), unpause = vi.fn()
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
    Object.defineProperty(SVGSVGElement.prototype, 'pauseAnimations', { configurable: true, value: pause })
    Object.defineProperty(SVGSVGElement.prototype, 'unpauseAnimations', { configurable: true, value: unpause })
    useUiStore.setState({ theme: 'liquid', glassBackgroundMotion: true, glassPointerLight: false, reduceMotion: false })
    const { unmount } = render(<><LiquidGlassEffects/><div className="wg-graph-canvas" data-testid="graph"/></>)
    const background = document.querySelector('.wg-liquid-background')!, svg = background.querySelector('svg')!
    const graph = document.querySelector('.wg-graph-canvas')!
    fireEvent.wheel(graph); expect(background).toHaveAttribute('data-paused', 'true'); expect(pause).toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(100)); fireEvent.wheel(graph)
    act(() => vi.advanceTimersByTime(100)); expect(background).toHaveAttribute('data-paused', 'true')
    act(() => vi.advanceTimersByTime(60)); expect(background).toHaveAttribute('data-paused', 'false')
    expect(unpause).toHaveBeenCalled(); expect(background.querySelector('svg')).toBe(svg)
    act(() => useUiStore.getState().setFeature('glassBackgroundMotion', false))
    fireEvent.wheel(graph); act(() => vi.advanceTimersByTime(200)); expect(background).toHaveAttribute('data-paused', 'true')
    unmount()
  })
})
