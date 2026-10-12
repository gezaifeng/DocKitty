import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../test/renderWithProviders'
import { mockApi } from '../test/setup'
import { useUiStore } from '../store/uiStore'
import { EditLoopCard } from './EditLoopCard'

beforeEach(() => {
  useUiStore.setState({
    pendingCommitDocName: 'thesis.docx',
    pendingCommitWorkspacePath: '/tmp/r.wg/workspace/thesis.docx',
  })
  vi.clearAllMocks()
})

describe('EditLoopCard', () => {
  it('renders with the doc name', () => {
    renderWithProviders(<EditLoopCard />)
    expect(screen.getByText(/thesis\.docx/)).toBeInTheDocument()
  })

  it('shows a commit message input', () => {
    renderWithProviders(<EditLoopCard />)
    expect(screen.getByPlaceholderText('描述本次修改…')).toBeInTheDocument()
  })

  it('shows quick tag buttons', () => {
    renderWithProviders(<EditLoopCard />)
    expect(screen.getByRole('button', { name: '导师反馈修改' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '自我修改' })).toBeInTheDocument()
  })

  it('clicking a quick tag fills the message input', async () => {
    renderWithProviders(<EditLoopCard />)
    await userEvent.click(screen.getByRole('button', { name: '导师反馈修改' }))
    expect(screen.getByPlaceholderText('描述本次修改…')).toHaveValue('导师反馈修改')
  })

  it('clicking 提交新版本 calls commit.create and clears pending', async () => {
    mockApi.commit.create.mockResolvedValue({
      docId: 'thesis.docx',
      branch: 'main',
      commitId: 'abc123',
      changed: ['thesis.docx'],
    })
    renderWithProviders(<EditLoopCard />)
    const input = screen.getByPlaceholderText('描述本次修改…')
    await userEvent.type(input, '修改了第三章')
    await userEvent.click(screen.getByRole('button', { name: '提交新版本' }))
    await waitFor(() => {
      expect(mockApi.commit.create).toHaveBeenCalledWith(
        'thesis.docx',
        '修改了第三章',
        'user',
        undefined,
      )
      expect(useUiStore.getState().pendingCommitDocName).toBeNull()
    })
  })

  it('clicking 忽略 clears pending commit without committing', async () => {
    renderWithProviders(<EditLoopCard />)
    await userEvent.click(screen.getByRole('button', { name: '忽略' }))
    expect(mockApi.commit.create).not.toHaveBeenCalled()
    expect(useUiStore.getState().pendingCommitDocName).toBeNull()
  })
})
