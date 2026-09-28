import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { renderWithProviders } from '../test/renderWithProviders'
import { mockApi } from '../test/setup'
import { useUiStore } from '../store/uiStore'
import { PreviewPanel } from './PreviewPanel'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('PreviewPanel', () => {
  it('shows empty state when no doc selected', () => {
    useUiStore.setState({ selectedDocName: null })
    renderWithProviders(<PreviewPanel />)
    expect(screen.getByText(/选择一个文档/)).toBeInTheDocument()
  })

  it('shows loading state while fetching bytes', async () => {
    useUiStore.setState({ selectedDocName: 'report.docx' })
    mockApi.preview.getBytes.mockReturnValue(new Promise(() => {}))
    renderWithProviders(<PreviewPanel />)
    expect(screen.getByText('加载预览…')).toBeInTheDocument()
  })

  it('shows unsupported message for unknown ext', async () => {
    useUiStore.setState({ selectedDocName: 'data.csv' })
    mockApi.preview.getBytes.mockResolvedValue({
      data: new ArrayBuffer(0),
      ext: 'csv',
    })
    renderWithProviders(<PreviewPanel />)
    await waitFor(() => {
      expect(screen.getByText(/暂不支持预览/)).toBeInTheDocument()
    })
  })
})
