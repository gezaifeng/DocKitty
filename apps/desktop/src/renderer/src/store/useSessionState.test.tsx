import { act, renderHook } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { useSessionState, useSessionStore } from './useSessionState'

afterEach(() => { act(() => useSessionStore.setState({ values: {} })) })

it('retains each mode context after unmount without keeping duplicate event handlers mounted', () => {
  const versions = renderHook(() => useSessionState('library-A', 'versions.view', 'overview'))
  act(() => versions.result.current[1]('graph'))
  versions.unmount()
  const projects = renderHook(() => useSessionState('library-A', 'projects.view', 'grid'))
  expect(projects.result.current[0]).toBe('grid')
  act(() => projects.result.current[1]('board'))
  projects.unmount()
  const restored = renderHook(() => useSessionState('library-A', 'versions.view', 'overview'))
  expect(restored.result.current[0]).toBe('graph')
})

it('isolates libraries immediately on switching and applies sequential updates to the right context', () => {
  const hook = renderHook(({ root }) => useSessionState(root, 'projects.folder', ''), { initialProps: { root: 'library-A' } })
  act(() => { hook.result.current[1]('folder-A'); hook.result.current[1](value => value + '/child') })
  hook.rerender({ root: 'library-B' })
  expect(hook.result.current[0]).toBe('')
  act(() => hook.result.current[1]('folder-B'))
  hook.rerender({ root: 'library-A' })
  expect(hook.result.current[0]).toBe('folder-A/child')
})
