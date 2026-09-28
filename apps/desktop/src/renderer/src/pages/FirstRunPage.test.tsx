import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../test/renderWithProviders'
import { mockApi } from '../test/setup'
import { useRepoStore } from '../store/repoStore'
import { FirstRunPage } from './FirstRunPage'

beforeEach(() => {
  useRepoStore.setState({ repoRoot: null, repoName: null })
  vi.clearAllMocks()
})

describe('FirstRunPage', () => {
  it('renders create and open buttons', () => {
    renderWithProviders(<FirstRunPage />)
    expect(screen.getByRole('button', { name: /创建新仓库/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /打开已有仓库/ })).toBeInTheDocument()
  })

  it('clicking 创建新仓库 opens folder picker', async () => {
    mockApi.dialog.pickFolder.mockResolvedValue(null) // user cancels
    renderWithProviders(<FirstRunPage />)
    await userEvent.click(screen.getByRole('button', { name: /创建新仓库/ }))
    expect(mockApi.dialog.pickFolder).toHaveBeenCalledWith('选择仓库保存位置')
  })

  it('after folder picked, shows name input and confirm button', async () => {
    mockApi.dialog.pickFolder.mockResolvedValue('/home/user/docs')
    renderWithProviders(<FirstRunPage />)
    await userEvent.click(screen.getByRole('button', { name: /创建新仓库/ }))
    await waitFor(() => {
      expect(screen.getByPlaceholderText('论文仓库')).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: /确认创建/ })).toBeInTheDocument()
  })

  it('creates repo and updates store on confirm', async () => {
    mockApi.dialog.pickFolder.mockResolvedValue('/home/user/docs')
    mockApi.repo.create.mockResolvedValue({
      repoRoot: '/home/user/docs/myrepo.wg',
      repoName: 'myrepo.wg',
    })
    renderWithProviders(<FirstRunPage />)
    await userEvent.click(screen.getByRole('button', { name: /创建新仓库/ }))
    await waitFor(() => screen.getByPlaceholderText('论文仓库'))
    await userEvent.clear(screen.getByPlaceholderText('论文仓库'))
    await userEvent.type(screen.getByPlaceholderText('论文仓库'), 'myrepo')
    await userEvent.click(screen.getByRole('button', { name: /确认创建/ }))
    await waitFor(() => {
      expect(mockApi.repo.create).toHaveBeenCalledWith(
        expect.stringContaining('/home/user/docs'),
        'myrepo',
      )
    })
    expect(useRepoStore.getState().repoRoot).toBeTruthy()
  })

  it('open existing repo flow: picks folder and opens repo', async () => {
    mockApi.dialog.pickFolder.mockResolvedValue('/home/user/existing.wg')
    mockApi.repo.open.mockResolvedValue({
      repoRoot: '/home/user/existing.wg',
      repoName: 'existing.wg',
    })
    renderWithProviders(<FirstRunPage />)
    await userEvent.click(screen.getByRole('button', { name: /打开已有仓库/ }))
    await waitFor(() => {
      expect(mockApi.repo.open).toHaveBeenCalledWith('/home/user/existing.wg')
      expect(useRepoStore.getState().repoRoot).toBe('/home/user/existing.wg')
    })
  })
})
