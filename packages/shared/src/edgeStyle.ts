import { z } from 'zod'

export const EdgeStyleSchema = z.object({
  arrow: z.enum(['triangle', 'chevron', 'diamond', 'none']).optional(),
  arrowSize: z.number().finite().min(6).max(24).optional(),
  line: z.enum(['solid', 'dashed', 'double']).optional(),
  width: z.number().finite().min(1).max(6).optional(),
})
export type EdgeStyle = z.infer<typeof EdgeStyleSchema>
export function resolvedEdgeStyle(style?: EdgeStyle) {
  return { arrow: style?.arrow ?? 'triangle', arrowSize: style?.arrowSize ?? 8, line: style?.line ?? 'solid', width: style?.width ?? 1.5 } as const
}
