import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  dialog: {
    showOpenDialog: vi.fn(),
    showSaveDialog: vi.fn(),
  },
}))

import { dialog } from 'electron'
import { pickFolder, pickFile, savePath } from './dialogHandlers.js'

beforeEach(() => vi.clearAllMocks())

describe('pickFolder', () => {
  it('returns null when cancelled', async () => {
    vi.mocked(dialog.showOpenDialog).mockResolvedValue({ canceled: true, filePaths: [] })
    const result = await pickFolder({})
    expect(result.path).toBeNull()
  })

  it('returns selected path', async () => {
    vi.mocked(dialog.showOpenDialog).mockResolvedValue({
      canceled: false,
      filePaths: ['/home/user/documents'],
    })
    const result = await pickFolder({ title: '选择位置' })
    expect(result.path).toBe('/home/user/documents')
  })
})

describe('pickFile', () => {
  it('returns file path', async () => {
    vi.mocked(dialog.showOpenDialog).mockResolvedValue({
      canceled: false,
      filePaths: ['/docs/report.docx'],
    })
    const result = await pickFile({})
    expect(result.path).toBe('/docs/report.docx')
  })
})

describe('savePath', () => {
  it('returns null when cancelled', async () => {
    vi.mocked(dialog.showSaveDialog).mockResolvedValue({ canceled: true, filePath: '' as string })
    const result = await savePath({})
    expect(result.path).toBeNull()
  })

  it('returns chosen save path', async () => {
    vi.mocked(dialog.showSaveDialog).mockResolvedValue({
      canceled: false,
      filePath: '/home/user/backup.wgbak',
    })
    const result = await savePath({ defaultName: 'backup.wgbak' })
    expect(result.path).toBe('/home/user/backup.wgbak')
  })
})
