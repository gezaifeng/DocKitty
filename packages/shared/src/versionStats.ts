export interface VersionStatistic {
  id: string
  title: string
  createdAt: string
  values: Record<string, number>
  unavailable?: string
  author?: string
  category?: string
  contentId?: string
  baselineValues?: Record<string, number>
  sections?: Array<{ id: string; title: string; characters: number }>
  changes?: Array<{ kind: string; name: string; before?: string; after?: string }>
  changeCount?: number
  columns?: Array<{ sheet: string; column: string; count: number; sum: number; mean: number; min: number; max: number }>
}
export interface VersionStatistics {
  branch: string
  versions: VersionStatistic[]
  metrics: Array<{ id: string; label: string; unit: string; group: string }>
  activity: Array<{ date: string; count: number }>
  scope: string
  summary?: { firstAt?: string; lastAt?: string; spanDays: number; averageHours?: number; medianHours?: number; duplicateVersions: number; commonVersions?: number; exclusiveVersions?: number }
  distribution?: { categories: Array<{ label: string; count: number }>; authors: Array<{ label: string; count: number }> }
  baselineId?: string
  baseline?: { title: string; values: Record<string,number>; sections?: VersionStatistic['sections'] }
}

export interface StatisticsOptions { baselineId?: string; compareBranch?: string; onlyExclusive?: boolean }
