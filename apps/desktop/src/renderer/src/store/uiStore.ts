// apps/desktop/src/renderer/src/store/uiStore.ts
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type Theme = 'light' | 'dark' | 'system'

export interface ThemeButtonPos {
  x: number
  y: number
}

interface UiState {
  selectedDocName: string | null
  pendingCommitDocName: string | null
  pendingCommitWorkspacePath: string | null
  rightPanel: 'preview' | 'settings'
  theme: Theme
  themeButtonPos: ThemeButtonPos | null
  selectDoc(docName: string | null): void
  setPendingCommit(docName: string, workspacePath: string): void
  clearPendingCommit(): void
  setRightPanel(panel: 'preview' | 'settings'): void
  setTheme(theme: Theme): void
  setThemeButtonPos(pos: ThemeButtonPos | null): void
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      selectedDocName: null,
      pendingCommitDocName: null,
      pendingCommitWorkspacePath: null,
      rightPanel: 'preview',
      theme: 'system',
      themeButtonPos: null,
      selectDoc: (docName) => set({ selectedDocName: docName }),
      setPendingCommit: (docName, workspacePath) =>
        set({ pendingCommitDocName: docName, pendingCommitWorkspacePath: workspacePath }),
      clearPendingCommit: () =>
        set({ pendingCommitDocName: null, pendingCommitWorkspacePath: null }),
      setRightPanel: (panel) => set({ rightPanel: panel }),
      setTheme: (theme) => set({ theme }),
      setThemeButtonPos: (pos) => set({ themeButtonPos: pos }),
    }),
    {
      name: 'word-git-ui-v1',
      partialize: (s) => ({ theme: s.theme, themeButtonPos: s.themeButtonPos }),
    },
  ),
)
