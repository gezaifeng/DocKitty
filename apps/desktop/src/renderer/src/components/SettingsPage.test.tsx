import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../test/renderWithProviders'
import { mockApi } from '../test/setup'
import { SettingsPage } from './SettingsPage'
import type { StorageStats, QuarantineEntry } from '@wordgit/shared'

const SAMPLE_STATS: StorageStats = {
  totalBytes: 1024 * 1024 * 5,   // 5 MB
  objectCount: 120,
  docCount: 3,
  versionCount: 24,
}

const SAMPLE_QUARANTINE: QuarantineEntry[] = [
  {
    id: 'q1',
    docId: 'report.docx',
    docName: 'report.docx',
    branch: 'draft-v1',
    commitId: 'aaa',
    deletedAt: '2026-01-10T00:00:00.000Z',
  },
]

beforeEach(() => {
  vi.clearAllMocks()
  mockApi.stats.storage.mockResolvedValue(SAMPLE_STATS)
  mockApi.maintenance.quarantine.list.mockResolvedValue([])
})

describe('SettingsPage', () => {
  it('shows storage stats', async () => {
    renderWithProviders(<SettingsPage />)
    await waitFor(() => {
      expect(screen.getByText(/24 个版本/)).toBeInTheDocument()
      expect(screen.getByText(/3 个文档/)).toBeInTheDocument()
    })
  })

  it('shows 备份导出 button', () => {
    renderWithProviders(<SettingsPage />)
    expect(screen.getByRole('button', { name: /备份导出/ })).toBeInTheDocument()
  })

  it('clicking 备份导出 opens save dialog', async () => {
    mockApi.dialog.savePath.mockResolvedValue(null)
    renderWithProviders(<SettingsPage />)
    await userEvent.click(screen.getByRole('button', { name: /备份导出/ }))
    expect(mockApi.dialog.savePath).toHaveBeenCalled()
  })

  it('shows quarantine entries when they exist', async () => {
    mockApi.maintenance.quarantine.list.mockResolvedValue(SAMPLE_QUARANTINE)
    renderWithProviders(<SettingsPage />)
    await waitFor(() => {
      expect(screen.getByText('draft-v1')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: '还原' })).toBeInTheDocument()
    })
  })

  it('clicking 还原 calls quarantine.restore', async () => {
    mockApi.maintenance.quarantine.list.mockResolvedValue(SAMPLE_QUARANTINE)
    mockApi.maintenance.quarantine.restore.mockResolvedValue(undefined)
    renderWithProviders(<SettingsPage />)
    await waitFor(() => screen.getByRole('button', { name: '还原' }))
    await userEvent.click(screen.getByRole('button', { name: '还原' }))
    expect(mockApi.maintenance.quarantine.restore).toHaveBeenCalledWith('q1')
  })

  it('shows scrub button and runs scrub on click', async () => {
    renderWithProviders(<SettingsPage />)
    const scrubBtn = screen.getByRole('button', { name: /数据自检/ })
    await userEvent.click(scrubBtn)
    await waitFor(() => {
      expect(mockApi.maintenance.scrub).toHaveBeenCalled()
    })
  })
})
