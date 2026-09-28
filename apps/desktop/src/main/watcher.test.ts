import { describe, it, expect, vi, beforeEach } from 'vitest'

// Hoist mock variables so they're available in vi.mock factory
const { mockWatch, mockWatcherOn, mockWatcherClose } = vi.hoisted(() => {
  const mockWatcherOn = vi.fn().mockReturnThis()
  const mockWatcherClose = vi.fn()
  const mockWatch = vi.fn(() => ({ on: mockWatcherOn, close: mockWatcherClose }))
  return { mockWatch, mockWatcherOn, mockWatcherClose }
})

vi.mock('chokidar', () => ({ watch: mockWatch }))

// Mock electron BrowserWindow
const mockSend = vi.fn()
const mockWin = { webContents: { send: mockSend } } as unknown as import('electron').BrowserWindow

import { setMainWindow, watchDoc, stopWatcher } from './watcher.js'

beforeEach(() => {
  stopWatcher()
  vi.clearAllMocks()
})

describe('watchDoc', () => {
  it('calls chokidar.watch with the workspace path', () => {
    setMainWindow(mockWin)
    watchDoc('report.docx', '/repo/workspace/report.docx')
    expect(mockWatch).toHaveBeenCalledWith('/repo/workspace/report.docx', expect.objectContaining({ ignoreInitial: true }))
  })

  it('registers a change handler', () => {
    setMainWindow(mockWin)
    watchDoc('report.docx', '/repo/workspace/report.docx')
    expect(mockWatcherOn).toHaveBeenCalledWith('change', expect.any(Function))
  })

  it('closes previous watcher when called again', () => {
    setMainWindow(mockWin)
    watchDoc('a.docx', '/repo/workspace/a.docx')
    watchDoc('b.docx', '/repo/workspace/b.docx')
    expect(mockWatcherClose).toHaveBeenCalledTimes(1)
  })

  it('sends watcher.change event to renderer on file change', () => {
    setMainWindow(mockWin)
    watchDoc('notes.docx', '/repo/workspace/notes.docx')

    // Grab the 'change' callback registered on the watcher
    const changeCallback = mockWatcherOn.mock.calls.find(
      (call: unknown[]) => call[0] === 'change',
    )?.[1] as (() => void) | undefined
    expect(changeCallback).toBeDefined()
    changeCallback!()

    expect(mockSend).toHaveBeenCalledWith(
      'watcher.change',
      { docName: 'notes.docx', workspacePath: '/repo/workspace/notes.docx' },
    )
  })
})

describe('stopWatcher', () => {
  it('closes the active watcher', () => {
    setMainWindow(mockWin)
    watchDoc('doc.docx', '/repo/workspace/doc.docx')
    stopWatcher()
    expect(mockWatcherClose).toHaveBeenCalledTimes(1)
  })
})
