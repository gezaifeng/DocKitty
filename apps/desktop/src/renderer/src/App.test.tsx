import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { renderWithProviders } from './test/renderWithProviders'
import { mockApi } from './test/setup'
import { useRepoStore } from './store/repoStore'
import { App } from './App'

beforeEach(() => {
  useRepoStore.setState({ repoRoot: null, repoName: null })
  vi.clearAllMocks()
  vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
  mockApi.repo.bootstrap.mockResolvedValue({ repoRoot: '/tmp/r.wg', repoName: '我的文档' })
})
afterEach(() => vi.unstubAllGlobals())

describe('App', () => {
  it('opens document management without a repository picker', async () => {
    renderWithProviders(<App />)
    await waitFor(() => expect(document.querySelector('.wg-startup')).not.toBeInTheDocument())
    expect(screen.getByText('稿喵')).toBeInTheDocument()
    expect(screen.queryByText('创建新仓库')).not.toBeInTheDocument()
    expect(mockApi.repo.bootstrap).toHaveBeenCalledWith(undefined)
  })

  it('shows main layout when repo is set', async () => {
    useRepoStore.setState({ repoRoot: '/tmp/r.wg', repoName: 'r.wg' })
    renderWithProviders(<App />)
    await waitFor(() => {
      expect(mockApi.repo.bootstrap).toHaveBeenCalledWith('/tmp/r.wg')
    })
    // Main layout contains the doc list panel heading
    await waitFor(() => expect(document.querySelector('.wg-startup')).not.toBeInTheDocument())
  })
  it('shows recovery when the saved location cannot be opened', async () => {
    mockApi.repo.bootstrap.mockRejectedValue(new Error('保存位置无法访问'))
    renderWithProviders(<App />)
    await screen.findByText('稿喵暂时无法打开文档库')
    expect(screen.getByRole('alert')).toHaveTextContent('保存位置无法访问')
    expect(screen.getByRole('button', { name: '选择原文档库位置' })).toBeVisible()
    expect(screen.queryByText('创建新仓库')).not.toBeInTheDocument()
  })
})
