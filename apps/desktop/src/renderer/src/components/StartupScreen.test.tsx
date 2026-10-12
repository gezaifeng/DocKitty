import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRef } from 'react'
import { StartupScreen } from './StartupScreen'

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => setTimeout(() => cb(performance.now()), 16))
  vi.stubGlobal('cancelAnimationFrame', clearTimeout)
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({ left: 450, top: 360, right: 548, bottom: 441, width: 98, height: 81, x: 450, y: 360, toJSON: () => ({}) })
  Object.defineProperty(Element.prototype, 'animate', { configurable: true, value: vi.fn((_frames, options) => {
    let timer: ReturnType<typeof setTimeout>
    const finished = new Promise<void>(resolve => { timer = setTimeout(resolve, options.duration + (options.delay ?? 0)) })
    return { finished, cancel: () => clearTimeout(timer) }
  }) })
})
afterEach(() => {
  cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals()
  delete (Element.prototype as Partial<Element>).animate
})

describe('startup choreography', () => {
  it('holds the complete cat illustration until loading finishes, then expands the actual current document', async () => {
    const ref = createRef<HTMLDivElement>(), done = vi.fn()
    const result = render(<><div ref={ref}><div className="wg-page-content" /><img className="wg-page-origin" /></div><StartupScreen ready={false} revealRef={ref} onFinish={done} /></>)
    await act(async () => { await vi.advanceTimersByTimeAsync(2100) })
    expect(screen.getByRole('status')).toHaveAttribute('data-phase', 'waiting')
    expect(done).not.toHaveBeenCalled()
    const source = document.querySelector('[data-version-paper]')!
    expect(source.closest('.wg-mascot')!.querySelectorAll('img')).toHaveLength(1)
    result.rerender(<><div ref={ref}><div className="wg-page-content" /><img className="wg-page-origin" /></div><StartupScreen ready revealRef={ref} onFinish={done} /></>)
    expect(screen.getByRole('status')).toHaveAttribute('data-phase', 'expanding')
    expect(ref.current!.style.clipPath).toContain('450px')
    expect(ref.current!.style.transform).toBe('')
    expect(document.querySelector('.wg-opening-paper')).toBeNull()
    await act(async () => { await vi.advanceTimersByTimeAsync(440) })
    expect(ref.current!.style.clipPath).toBe('none')
    expect(ref.current!.querySelector<HTMLElement>('.wg-page-content')!.style.opacity).toBe('1')
    expect(done).toHaveBeenCalledOnce()
  })

  it('keeps the startup background hidden when finished animations are cancelled', async () => {
    const ref = createRef<HTMLDivElement>()
    const done = vi.fn(() => {
      const background = document.querySelector<HTMLElement>('.wg-startup-backdrop')!
      expect(background.style.opacity).toBe('0')
      expect(background.style.visibility).toBe('hidden')
      expect(ref.current!.style.zIndex).toBe('')
    })
    render(<><div ref={ref}><div className="wg-page-content" /><img className="wg-page-origin" /></div><StartupScreen ready revealRef={ref} onFinish={done} /></>)
    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
    await act(async () => { await vi.advanceTimersByTimeAsync(440) })
    expect(done).toHaveBeenCalledOnce()
    expect(document.querySelector<HTMLElement>('.wg-startup-backdrop')!.style.opacity).toBe('0')
  })

  it('does not expand early when loading finishes before the connection animation', async () => {
    const ref = createRef<HTMLDivElement>(), done = vi.fn()
    render(<><div ref={ref}><div className="wg-page-content" /><img className="wg-page-origin" /></div><StartupScreen ready revealRef={ref} onFinish={done} /></>)
    await act(async () => { await vi.advanceTimersByTimeAsync(400) })
    expect(screen.getByRole('status')).toHaveAttribute('data-phase', 'connecting')
    expect(done).not.toHaveBeenCalled()
    await act(async () => { await vi.advanceTimersByTimeAsync(280) })
    expect(screen.getByRole('status')).toHaveAttribute('data-phase', 'expanding')
  })

  it('skips both motions when reduced motion is enabled', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
    const ref = createRef<HTMLDivElement>(), done = vi.fn()
    render(<><div ref={ref}><div className="wg-page-content" /><img className="wg-page-origin" /></div><StartupScreen ready revealRef={ref} onFinish={done} /></>)
    await act(async () => { await vi.advanceTimersByTimeAsync(1) })
    expect(done).toHaveBeenCalledOnce()
    expect(Element.prototype.animate).not.toHaveBeenCalled()
  })
})
