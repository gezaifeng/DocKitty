import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { FeaturesMenu } from './FeaturesMenu'
import { useUiStore } from '../store/uiStore'

beforeEach(() => useUiStore.setState({ theme: 'blockframe', showGraphWidget: true, glassBackgroundMotion: true, glassPointerLight: true, glassPalette: 'jade', reduceMotion: false, reduceTransparency: false }))
describe('global features menu', () => {
  it('changes and persists the graph widget setting', () => {
    render(<FeaturesMenu/>); const checkbox = screen.getByRole('menuitemcheckbox', { name: '关系图小组件', hidden: true })
    fireEvent.click(checkbox)
    expect(useUiStore.getState().showGraphWidget).toBe(false)
    expect(JSON.parse(localStorage.getItem('word-git-ui-v1')!).state.showGraphWidget).toBe(false)
    fireEvent.click(checkbox); expect(useUiStore.getState().showGraphWidget).toBe(true)
  })
  it('adds the glass controls in the glass family and closes on outside or Escape', () => {
    useUiStore.setState({ theme: 'liquid' }); const { container } = render(<FeaturesMenu/>)
    const menu = container.querySelector('details')!; menu.open = true
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: '背景流动' }))
    expect(useUiStore.getState().glassBackgroundMotion).toBe(false)
    fireEvent.pointerDown(document.body); expect(menu.open).toBe(false)
    menu.open = true; fireEvent.keyDown(document, { key: 'Escape' }); expect(menu.open).toBe(false)
  })
  it('persists a background palette without changing the theme or effects', () => {
    useUiStore.setState({ theme: 'liquid-dark' }); const { container } = render(<FeaturesMenu/>)
    container.querySelector('details')!.open = true
    fireEvent.click(screen.getByRole('menuitemradio', { name: '蓝白' }))
    expect(useUiStore.getState().glassPalette).toBe('blue-white')
    expect(useUiStore.getState().theme).toBe('liquid-dark')
    expect(useUiStore.getState().glassBackgroundMotion).toBe(true)
    expect(useUiStore.getState().glassPointerLight).toBe(true)
    expect(JSON.parse(localStorage.getItem('word-git-ui-v1')!).state.glassPalette).toBe('blue-white')
  })
})
