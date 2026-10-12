import type { LibraryVersion } from './library.js'

export function defaultVersionPositions(versions: LibraryVersion[]) {
  const byId = new Map(versions.map(v => [v.id, v]))
  const depths = new Map<string, number>()
  function depth(id: string, seen = new Set<string>()): number {
    if (depths.has(id)) return depths.get(id)!
    if (seen.has(id)) return 0
    seen.add(id)
    const value = Math.max(0, ...(byId.get(id)?.parents ?? []).filter(p => byId.has(p)).map(p => depth(p, new Set(seen)) + 1))
    depths.set(id, value); return value
  }
  const branches = [...new Set(versions.map(v => v.branches[0] ?? 'main'))].sort((a, b) => a === b ? 0 : a === 'main' ? -1 : b === 'main' ? 1 : a.localeCompare(b))
  const positions = new Map<string, { x: number; y: number }>()
  let lane = 0
  for (const branch of branches) {
    const rows = new Map<number, number>()
    const members = versions.filter(v => (v.branches[0] ?? 'main') === branch).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
    for (const version of members) {
      const column = depth(version.id), row = rows.get(column) ?? 0
      positions.set(version.id, { x: 65 + column * 265, y: 65 + (lane + row) * 170 })
      rows.set(column, row + 1)
    }
    lane += Math.max(1, ...rows.values())
  }
  return positions
}
