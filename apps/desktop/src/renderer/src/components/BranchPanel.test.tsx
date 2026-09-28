import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../test/renderWithProviders'
import { mockApi } from '../test/setup'
import { useUiStore } from '../store/uiStore'
import { BranchPanel } from './BranchPanel'
import type { DocInfo } from '@wordgit/shared'

const SAMPLE_DOC: DocInfo = {
  docId: 'paper.docx',
  docName: 'paper.docx',
  currentBranch: 'main',
  branches: ['main', 'draft'],
  commitCount: 2,
  lastCommitAt: '2026-01-15T10:00:00.000Z',
}

beforeEach(() => {
  useUiStore.setState({ selectedDocName: null })
  vi.clearAllMocks()
})

describe('BranchPanel', () => {
  it('shows empty state when no doc selected', () => {
    renderWithProviders(<BranchPanel />)
    expect(screen.getByText(/选择一个文档/)).toBeInTheDocument()
  })

  it('shows current branch when doc is selected', async () => {
    useUiStore.setState({ selectedDocName: 'paper.docx' })
    mockApi.doc.list.mockResolvedValue([SAMPLE_DOC])
    renderWithProviders(<BranchPanel />)
    await waitFor(() => {
      expect(screen.getByText('main')).toBeInTheDocument()
    })
  })

  it('lists available branches', async () => {
    useUiStore.setState({ selectedDocName: 'paper.docx' })
    mockApi.doc.list.mockResolvedValue([SAMPLE_DOC])
    renderWithProviders(<BranchPanel />)
    await waitFor(() => {
      expect(screen.getByText('draft')).toBeInTheDocument()
    })
  })

  it('clicking a branch button calls branch.switch', async () => {
    useUiStore.setState({ selectedDocName: 'paper.docx' })
    mockApi.doc.list.mockResolvedValue([SAMPLE_DOC])
    mockApi.branch.switch.mockResolvedValue(undefined)
    renderWithProviders(<BranchPanel />)
    await waitFor(() => screen.getByRole('button', { name: '切换' }))
    await userEvent.click(screen.getByRole('button', { name: '切换' }))
    expect(mockApi.branch.switch).toHaveBeenCalledWith('paper.docx', 'draft')
  })

  it('can create a new branch via the input form', async () => {
    useUiStore.setState({ selectedDocName: 'paper.docx' })
    mockApi.doc.list.mockResolvedValue([SAMPLE_DOC])
    mockApi.branch.create.mockResolvedValue(undefined)
    renderWithProviders(<BranchPanel />)
    await waitFor(() => screen.getByPlaceholderText('新分支名'))
    await userEvent.type(screen.getByPlaceholderText('新分支名'), 'feature')
    await userEvent.click(screen.getByRole('button', { name: '创建' }))
    expect(mockApi.branch.create).toHaveBeenCalledWith('paper.docx', 'feature', undefined)
  })
})
