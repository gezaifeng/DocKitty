import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../test/renderWithProviders'
import { mockApi } from '../test/setup'
import { useUiStore } from '../store/uiStore'
import { TimelinePanel } from './TimelinePanel'
import type { CommitNode } from '@wordgit/shared'

const SAMPLE_COMMITS: CommitNode[] = [
  {
    id: 'abc123',
    parents: ['def456'],
    message: '修改第三章',
    author: 'user',
    createdAt: '2026-01-16T09:00:00.000Z',
  },
  {
    id: 'def456',
    parents: [],
    message: '初始版本',
    author: 'import',
    createdAt: '2026-01-15T10:00:00.000Z',
  },
]

beforeEach(() => {
  vi.clearAllMocks()
})

describe('TimelinePanel', () => {
  it('shows empty state when no doc selected', () => {
    useUiStore.setState({ selectedDocName: null })
    renderWithProviders(<TimelinePanel />)
    expect(screen.getByText(/选择一个文档/)).toBeInTheDocument()
  })

  it('shows loading when fetching', () => {
    useUiStore.setState({ selectedDocName: 'report.docx' })
    mockApi.commit.list.mockReturnValue(new Promise(() => {}))
    renderWithProviders(<TimelinePanel />)
    expect(screen.getByText('加载中…')).toBeInTheDocument()
  })

  it('renders commit messages and dates', async () => {
    useUiStore.setState({ selectedDocName: 'report.docx' })
    mockApi.commit.list.mockResolvedValue(SAMPLE_COMMITS)
    renderWithProviders(<TimelinePanel />)
    await waitFor(() => {
      expect(screen.getByText('修改第三章')).toBeInTheDocument()
      expect(screen.getByText('初始版本')).toBeInTheDocument()
    })
  })

  it('clicking 恢复到工作区 calls commit.checkout', async () => {
    useUiStore.setState({ selectedDocName: 'report.docx' })
    mockApi.commit.list.mockResolvedValue(SAMPLE_COMMITS)
    mockApi.commit.checkout.mockResolvedValue({ docId: 'report.docx', commitId: 'abc123' })
    renderWithProviders(<TimelinePanel />)
    await waitFor(() => screen.getAllByRole('button', { name: '恢复到工作区' }))
    const restoreButtons = screen.getAllByRole('button', { name: '恢复到工作区' })
    await userEvent.click(restoreButtons[0])
    expect(mockApi.commit.checkout).toHaveBeenCalledWith('report.docx', { commitId: 'abc123' })
  })
})
