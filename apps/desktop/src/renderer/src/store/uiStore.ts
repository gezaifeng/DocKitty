// apps/desktop/src/renderer/src/store/uiStore.ts
import { create } from 'zustand'

interface UiState {
  selectedDocName: string | null
  pendingCommitDocName: string | null
  pendingCommitWorkspacePath: string | null
  rightPanel: 'preview' | 'settings'
  selectDoc(docName: string | null): void
  setPendingCommit(docName: string, workspacePath: string): void
  clearPendingCommit(): void
  setRightPanel(panel: 'preview' | 'settings'): void
}

export const useUiStore = create<UiState>()((set) => ({
  selectedDocName: null,
  pendingCommitDocName: null,
  pendingCommitWorkspacePath: null,
  rightPanel: 'preview',
  selectDoc: (docName) => set({ selectedDocName: docName }),
  setPendingCommit: (docName, workspacePath) =>
    set({ pendingCommitDocName: docName, pendingCommitWorkspacePath: workspacePath }),
  clearPendingCommit: () =>
    set({ pendingCommitDocName: null, pendingCommitWorkspacePath: null }),
  setRightPanel: (panel) => set({ rightPanel: panel }),
}))
