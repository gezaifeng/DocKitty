// apps/desktop/src/renderer/src/store/repoStore.ts
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface RepoState {
  repoRoot: string | null
  repoName: string | null
  setRepo(root: string, name: string): void
  clearRepo(): void
}

export const useRepoStore = create<RepoState>()(
  persist(
    (set) => ({
      repoRoot: null,
      repoName: null,
      setRepo: (root, name) => set({ repoRoot: root, repoName: name }),
      clearRepo: () => set({ repoRoot: null, repoName: null }),
    }),
    { name: 'word-git-repo-v1' },
  ),
)
