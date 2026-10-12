import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../test/renderWithProviders'
import { mockApi } from '../test/setup'
import { useRepoStore } from '../store/repoStore'
import { useUiStore } from '../store/uiStore'
import { DocListPanel } from './DocListPanel'
import type { DocInfo } from '@wordgit/shared'

const SAMPLE_DOC: DocInfo = {
  docId: 'report.docx',
  docName: 'report.docx',
  currentBranch: 'main',
  branches: ['main'],
  commitCount: 3,
  lastCommitAt: '2026-01-15T10:00:00.000Z',
}

beforeEach(() => {
  useRepoStore.setState({ repoRoot: '/tmp/r.wg', repoName: 'r.wg' })
  useUiStore.setState({ selectedDocName: null })
  vi.clearAllMocks()
})

describe('DocListPanel', () => {
  it('shows loading state initially', () => {
    mockApi.doc.list.mockReturnValue(new Promise(() => {})) // never resolves
    renderWithProviders(<DocListPanel />)
    expect(screen.getByText('加载中…')).toBeInTheDocument()
  })

  it('shows empty state when no documents', async () => {
    mockApi.doc.list.mockResolvedValue([])
    renderWithProviders(<DocListPanel />)
    await waitFor(() => {
      expect(screen.getByText(/还没有文档/)).toBeInTheDocument()
    })
  })

  it('renders doc cards with metadata', async () => {
    mockApi.doc.list.mockResolvedValue([SAMPLE_DOC])
    renderWithProviders(<DocListPanel />)
    await waitFor(() => {
      expect(screen.getByText('report.docx')).toBeInTheDocument()
      expect(screen.getByText('3 个版本')).toBeInTheDocument()
      expect(screen.getByText('main')).toBeInTheDocument()
    })
  })

  it('clicking doc card selects that doc', async () => {
    mockApi.doc.list.mockResolvedValue([SAMPLE_DOC])
    renderWithProviders(<DocListPanel />)
    await waitFor(() => screen.getByText('report.docx'))
    await userEvent.click(screen.getByText('report.docx'))
    expect(useUiStore.getState().selectedDocName).toBe('report.docx')
  })

  it('clicking 编辑 calls api.doc.edit', async () => {
    mockApi.doc.list.mockResolvedValue([SAMPLE_DOC])
    renderWithProviders(<DocListPanel />)
    await waitFor(() => screen.getByRole('button', { name: '编辑' }))
    await userEvent.click(screen.getByRole('button', { name: '编辑' }))
    expect(mockApi.doc.edit).toHaveBeenCalledWith('report.docx')
  })

  it('clicking 导入文档 opens file picker', async () => {
    mockApi.doc.list.mockResolvedValue([])
    renderWithProviders(<DocListPanel />)
    await waitFor(() => screen.getByRole('button', { name: '导入文档' }))
    await userEvent.click(screen.getByRole('button', { name: '导入文档' }))
    expect(mockApi.dialog.pickFile).toHaveBeenCalled()
  })
})
