// apps/desktop/src/renderer/src/test/setup.ts
import '@testing-library/jest-dom'
import { vi } from 'vitest'

// Mock ResizeObserver (not available in jsdom)
globalThis.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const mockApi = {
  repo: {
    create: vi.fn(),
    open: vi.fn(),
  },
  doc: {
    import: vi.fn(),
    list: vi.fn().mockResolvedValue([]),
    edit: vi.fn().mockResolvedValue({ workspacePath: '/tmp/doc.docx' }),
  },
  commit: {
    create: vi.fn(),
    list: vi.fn().mockResolvedValue([]),
    checkout: vi.fn(),
    diffText: vi.fn().mockResolvedValue([]),
  },
  branch: {
    create: vi.fn(),
    switch: vi.fn(),
    delete: vi.fn(),
  },
  stats: {
    storage: vi.fn().mockResolvedValue({ totalBytes: 0, objectCount: 0, docCount: 0, versionCount: 0 }),
  },
  backup: {
    export: vi.fn(),
    import: vi.fn(),
  },
  maintenance: {
    scrub: vi.fn().mockResolvedValue({ checked: 0, corrupted: [] }),
    quarantine: {
      list: vi.fn().mockResolvedValue([]),
      restore: vi.fn(),
      purge: vi.fn(),
    },
  },
  preview: {
    getBytes: vi.fn().mockResolvedValue({ data: new ArrayBuffer(0), ext: 'docx' }),
  },
  dialog: {
    pickFolder: vi.fn().mockResolvedValue(null),
    pickFile: vi.fn().mockResolvedValue(null),
    savePath: vi.fn().mockResolvedValue(null),
  },
  onWatcherChange: vi.fn().mockReturnValue(() => {}),
}

Object.defineProperty(window, 'wordgit', {
  value: mockApi,
  writable: true,
  configurable: true,
})

export { mockApi }
