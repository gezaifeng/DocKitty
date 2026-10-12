// apps/desktop/src/renderer/src/lib/queryKeys.ts
export const keys = {
  docList: () => ['docs'] as const,
  commits: (docName: string, branch?: string) =>
    ['commits', docName, branch ?? 'current'] as const,
  storageStats: () => ['stats', 'storage'] as const,
  quarantineList: () => ['quarantine'] as const,
} as const
