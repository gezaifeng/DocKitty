// Card dimensions match .wg-graph-node. Keep the line under each card, but
// place its direction marker just outside the destination so it stays visible.
export function projectEdge(from: { x: number; y: number }, to: { x: number; y: number }) {
  const x = from.x + 112.5, y = from.y + 56, tx = to.x + 112.5, ty = to.y + 56
  const dx = tx - x, dy = ty - y, length = Math.hypot(dx, dy)
  if (!length) return { d: `M${x},${y} L${tx},${ty}`, labelX: x, labelY: y - 12 }
  const ux = dx / length, uy = dy / length
  const boundary = Math.min(ux ? 112.5 / Math.abs(ux) : Infinity, uy ? 56 / Math.abs(uy) : Infinity)
  const gap = Math.min(length, boundary + 12)
  return { d: `M${x},${y} L${tx - ux * gap},${ty - uy * gap} L${tx},${ty}`, labelX: (x + tx) / 2 + uy * 12, labelY: (y + ty) / 2 - ux * 12 }
}
