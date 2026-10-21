import { afterEach, describe, expect, it } from 'vitest'
import { act, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../test/renderWithProviders'
import { useUiStore } from '../store/uiStore'
import { themeOptions } from '../lib/themes'
import { ThemePicker } from './ThemePicker'
import { HelpDocument } from './HelpDocument'

afterEach(() => {
  useUiStore.persist.clearStorage()
  act(() => useUiStore.setState({ theme: 'blockframe' }))
})

describe('two-character theme names', () => {
  it('shows unique two-character names and saves the existing theme id', async () => {
    useUiStore.setState({ theme: 'liquid-dark' })
    renderWithProviders(<ThemePicker />)
    const picker = screen.getByRole('combobox', { name: '主题风格' })
    expect(picker).toHaveTextContent('夜璃')
    await userEvent.click(picker)
    const names = screen.getAllByRole('option').map(option => option.querySelector('strong')!.textContent!)
    expect(names).toHaveLength(12)
    expect(new Set(names).size).toBe(names.length)
    expect(names.every(name => /^[\u4e00-\u9fff]{2}$/.test(name))).toBe(true)
    await userEvent.click(screen.getByRole('option', { name: /^琉璃/ }))
    expect(picker).toHaveTextContent('琉璃')
    const saved = JSON.parse(localStorage.getItem('word-git-ui-v1')!)
    expect(saved.state.theme).toBe('liquid')
    await act(async () => { await useUiStore.persist.rehydrate() })
    expect(useUiStore.getState().theme).toBe('liquid')
  })

  it('uses the same names in the built-in help', () => {
    renderWithProviders(<HelpDocument repoRoot="test-library" />)
    const list = screen.getByRole('list', { name: '主题列表' })
    expect([...list.querySelectorAll('strong')].map(node => node.textContent)).toEqual(themeOptions.map(option => option.label))
  })
})
