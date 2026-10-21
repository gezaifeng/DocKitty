import { afterEach, describe, expect, it } from 'vitest'
import { useUiStore, type Theme } from './uiStore'

afterEach(() => { useUiStore.persist.clearStorage(); useUiStore.setState({ theme: 'blockframe', themeButtonPos: null }) })

describe('saved theme migration', () => {
  it.each<Theme>(['light', 'dark', 'paper', 'system', 'blockframe', 'raw', 'retro', 'capsule', 'liquid', 'liquid-dark', 'redline', 'arknights'])('keeps %s when loading older preferences', async theme => {
    localStorage.setItem('word-git-ui-v1', JSON.stringify({ version: 1, state: { theme, themeButtonPos: { x: 12, y: 34 } } }))
    await useUiStore.persist.rehydrate()
    expect(useUiStore.getState().theme).toBe(theme)
    expect(useUiStore.getState().themeButtonPos).toEqual({ x: 12, y: 34 })
  })
})
