import { act, renderHook, cleanup } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useNotice } from './useNotice'

afterEach(() => { cleanup(); vi.useRealTimers() })
it('dismisses history notices after 2.5 seconds and resets the timer for repeated identical operations', () => {
  vi.useFakeTimers(); const { result } = renderHook(() => useNotice())
  act(() => result.current[1]('已撤回：编辑连线'))
  act(() => vi.advanceTimersByTime(2000)); expect(result.current[0]).toBe('已撤回：编辑连线')
  act(() => result.current[1]('已撤回：编辑连线'))
  act(() => vi.advanceTimersByTime(2000)); expect(result.current[0]).toBe('已撤回：编辑连线')
  act(() => vi.advanceTimersByTime(500)); expect(result.current[0]).toBe('')
})
it('never lets an old history timer dismiss a later message and cleans up on unmount', () => {
  vi.useFakeTimers(); const { result, unmount } = renderHook(() => useNotice())
  act(() => result.current[1]('已重做：编辑连线'))
  act(() => result.current[1]('来源更新完成'))
  act(() => vi.advanceTimersByTime(3000)); expect(result.current[0]).toBe('来源更新完成')
  act(() => result.current[1]('已撤回：编辑连线')); unmount(); expect(vi.getTimerCount()).toBe(0)
})
