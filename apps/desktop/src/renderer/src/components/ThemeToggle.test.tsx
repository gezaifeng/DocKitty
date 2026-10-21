// apps/desktop/src/renderer/src/components/ThemeToggle.test.tsx
import { describe, it, expect, beforeEach } from 'vitest'
import { screen, fireEvent, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createRef } from 'react'
import { renderWithProviders } from '../test/renderWithProviders'
import { useUiStore } from '../store/uiStore'
import { ThemeToggle } from './ThemeToggle'

// jsdom 没有 PointerEvent；framer-motion 的拖拽依赖 pointer 事件，
// 用 MouseEvent 派生出带 pointerId/pointerType/isPrimary 的指针事件让拖拽生命周期真正跑起来
class FakePointerEvent extends MouseEvent {
  constructor(
    type: string,
    init: MouseEventInit & { pointerId?: number; pointerType?: string; isPrimary?: boolean } = {},
  ) {
    const { pointerId = 1, pointerType = 'mouse', isPrimary = true, ...mouseInit } = init
    super(type, mouseInit)
    Object.defineProperty(this, 'pointerId', { value: pointerId })
    Object.defineProperty(this, 'pointerType', { value: pointerType })
    Object.defineProperty(this, 'isPrimary', { value: isPrimary })
  }
}

function firePointer(target: Element, type: string, clientX: number, clientY: number) {
  target.dispatchEvent(
    new FakePointerEvent(type, {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX,
      clientY,
    }),
  )
}

function renderToggle() {
  const containerRef = createRef<HTMLDivElement>()
  renderWithProviders(
    <div ref={containerRef}>
      <ThemeToggle containerRef={containerRef} />
    </div>,
  )
}

beforeEach(() => {
  useUiStore.setState({ theme: 'system', themeButtonPos: null })
})

describe('ThemeToggle', () => {
  it('shows the current theme in the accessible label', () => {
    renderToggle()
    expect(
      screen.getByRole('button', { name: '切换主题（当前：系统）' }),
    ).toBeInTheDocument()
  })

  it('clicking cycles system → light → dark → system', async () => {
    renderToggle()
    const btn = screen.getByRole('button', { name: /切换主题/ })
    expect(useUiStore.getState().theme).toBe('system')

    await userEvent.click(btn)
    expect(useUiStore.getState().theme).toBe('light')

    await userEvent.click(btn)
    expect(useUiStore.getState().theme).toBe('dark')

    await userEvent.click(btn)
    expect(useUiStore.getState().theme).toBe('system')
  })

  it('updates the label after the theme changes', async () => {
    renderToggle()
    await userEvent.click(screen.getByRole('button', { name: /切换主题/ }))
    expect(
      screen.getByRole('button', { name: '切换主题（当前：素白）' }),
    ).toBeInTheDocument()
  })

  it('dragging the button does not toggle the theme', async () => {
    renderToggle()
    const btn = screen.getByRole('button', { name: /切换主题/ })
    // framer 的 onDragEnd 经 frame.postRender 延迟到下一帧触发，轮询等它执行完
    await act(async () => {
      firePointer(btn, 'pointerdown', 300, 40)
      firePointer(btn, 'pointermove', 360, 160)
      firePointer(btn, 'pointermove', 420, 280)
      firePointer(btn, 'pointerup', 420, 280)
      const deadline = Date.now() + 1000
      while (useUiStore.getState().themeButtonPos === null && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 16))
      }
    })
    // themeButtonPos 被写入 = handleDragEnd 已执行（拖拽生命周期完整跑通）
    expect(useUiStore.getState().themeButtonPos).toEqual({
      x: expect.any(Number),
      y: expect.any(Number),
    })
    // 拖拽结束后按钮仍跟着指针，浏览器会补发一次 click —— 这正是被修复的 bug 路径
    fireEvent.click(btn, { clientX: 420, clientY: 280 })
    expect(useUiStore.getState().theme).toBe('system')
  })
})
