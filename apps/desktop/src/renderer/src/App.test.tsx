import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { renderWithProviders } from './test/renderWithProviders'
import { mockApi } from './test/setup'
import { useRepoStore } from './store/repoStore'
import { App } from './App'

beforeEach(() => {
  useRepoStore.setState({ repoRoot: null, repoName: null })
  vi.clearAllMocks()
})

describe('App', () => {
  it('shows first-run page when no repo is set', () => {
    renderWithProviders(<App />)
    expect(screen.getByText('创建新仓库')).toBeInTheDocument()
  })

  it('shows main layout when repo is set', async () => {
    mockApi.repo.open.mockResolvedValue({ repoRoot: '/tmp/r.wg', repoName: 'r.wg' })
    useRepoStore.setState({ repoRoot: '/tmp/r.wg', repoName: 'r.wg' })
    renderWithProviders(<App />)
    await waitFor(() => {
      expect(screen.queryByText('加载中…')).not.toBeInTheDocument()
    })
    // Main layout contains the doc list panel heading
    expect(screen.getByText('文档')).toBeInTheDocument()
  })
})
