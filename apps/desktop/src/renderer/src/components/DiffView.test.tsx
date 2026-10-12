import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { renderWithProviders } from '../test/renderWithProviders'
import { mockApi } from '../test/setup'
import { useUiStore } from '../store/uiStore'
import { DiffView } from './DiffView'
import type { DiffResult } from '@wordgit/shared'

const DIFF_RESULTS: DiffResult[] = [
  { type: 'equal', text: '今天天气' },
  { type: 'delete', text: '很好' },
  { type: 'insert', text: '不错' },
]

beforeEach(() => {
  useUiStore.setState({ selectedDocName: null })
  vi.clearAllMocks()
})

describe('DiffView', () => {
  it('shows loading state while fetching diff', async () => {
    mockApi.commit.diffText.mockReturnValue(new Promise(() => {}))
    renderWithProviders(
      <DiffView docName="paper.docx" commitIdA="abc" commitIdB="def" />,
    )
    expect(screen.getByText(/对比中/)).toBeInTheDocument()
  })

  it('renders equal text without highlights', async () => {
    mockApi.commit.diffText.mockResolvedValue(DIFF_RESULTS)
    renderWithProviders(
      <DiffView docName="paper.docx" commitIdA="abc" commitIdB="def" />,
    )
    await waitFor(() => {
      expect(screen.getByText('今天天气')).toBeInTheDocument()
    })
  })

  it('renders deleted text with delete styling', async () => {
    mockApi.commit.diffText.mockResolvedValue(DIFF_RESULTS)
    renderWithProviders(
      <DiffView docName="paper.docx" commitIdA="abc" commitIdB="def" />,
    )
    await waitFor(() => {
      const delEl = screen.getByText('很好')
      expect(delEl).toBeInTheDocument()
    })
  })

  it('renders inserted text with insert styling', async () => {
    mockApi.commit.diffText.mockResolvedValue(DIFF_RESULTS)
    renderWithProviders(
      <DiffView docName="paper.docx" commitIdA="abc" commitIdB="def" />,
    )
    await waitFor(() => {
      const insEl = screen.getByText('不错')
      expect(insEl).toBeInTheDocument()
    })
  })

  it('shows empty state when diff has no results', async () => {
    mockApi.commit.diffText.mockResolvedValue([])
    renderWithProviders(
      <DiffView docName="paper.docx" commitIdA="abc" commitIdB="def" />,
    )
    await waitFor(() => {
      expect(screen.getByText(/无差异/)).toBeInTheDocument()
    })
  })
})
