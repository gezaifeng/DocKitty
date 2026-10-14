// apps/desktop/src/renderer/src/store/uiStore.ts
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { GlassPalette } from '../lib/glassPalettes'

export type Theme = 'light' | 'dark' | 'paper' | 'system' | 'blockframe' | 'raw' | 'retro' | 'capsule' | 'liquid' | 'liquid-dark'
export type Feature = 'showGraphWidget' | 'glassBackgroundMotion' | 'glassPointerLight' | 'reduceMotion' | 'reduceTransparency'

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
  showGraphWidget: boolean
  glassBackgroundMotion: boolean
  glassPointerLight: boolean
  glassPalette: GlassPalette
  reduceMotion: boolean
  reduceTransparency: boolean
  setFeature(feature: Feature, enabled: boolean): void
  setGlassPalette(palette: GlassPalette): void
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
      theme: 'blockframe',
      themeButtonPos: null,
      showGraphWidget: true,
      glassBackgroundMotion: true,
      glassPointerLight: true,
      glassPalette: 'jade',
      reduceMotion: false,
      reduceTransparency: false,
      setFeature: (feature, enabled) => set({ [feature]: enabled }),
      setGlassPalette: (glassPalette) => set({ glassPalette }),
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
      version: 2,
      migrate: (state) => ({ theme: (state as Partial<UiState>)?.theme ?? 'blockframe', themeButtonPos: (state as Partial<UiState>)?.themeButtonPos ?? null }),
      partialize: (s) => ({ theme: s.theme, themeButtonPos: s.themeButtonPos, showGraphWidget: s.showGraphWidget, glassBackgroundMotion: s.glassBackgroundMotion, glassPointerLight: s.glassPointerLight, glassPalette: s.glassPalette, reduceMotion: s.reduceMotion, reduceTransparency: s.reduceTransparency }),
    },
  ),
)
