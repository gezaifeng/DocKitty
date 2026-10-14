import { z } from 'zod'
import { EdgeStyleSchema } from './edgeStyle.js'
const id = z.string().uuid()
const label = z.string().min(1).max(10000)
const note = z.string().max(10000)
export const ProjectRequest = z.discriminatedUnion('action', [
  z.object({ action: z.literal('list') }),
  z.object({ action: z.literal('mcpConfig') }),
  z.object({ action: z.literal('mcpLocal'), enabled: z.boolean() }),
  z.object({ action: z.literal('get'), projectId: id }),
  z.object({ action: z.literal('create'), name: label }),
  z.object({ action: z.literal('import'), projectId: id, paths: z.array(z.string().min(1)).min(1), parentId: id.nullable().optional(), unpackFolder: z.boolean().optional(), previousNodeId: id.optional(), requestId: label.optional(), snapshot: z.boolean().optional(), title: label.optional() }),
  z.object({ action: z.literal('refresh'), projectId: id }),
  z.object({ action: z.literal('recordIteration'), projectId: id, nodeId: id, title: label, requestId: label.optional() }),
  z.object({ action: z.literal('updateNode'), projectId: id, nodeId: id, title: label.optional(), note: note.optional(), categoryId: z.union([id, z.literal('')]).nullable().optional(), position: z.object({ x: z.number().finite(), y: z.number().finite() }).optional() }),
  z.object({ action: z.literal('setCategory'), projectId: id, category: z.object({ id: id.optional(), name: label }) }),
  z.object({ action: z.literal('deleteCategory'), projectId: id, categoryId: id }),
  z.object({ action: z.literal('deleteNode'), projectId: id, nodeId: id }),
  z.object({ action: z.literal('setRelation'), projectId: id, relation: z.object({ id: id.optional(), from: id, to: id, kind: z.enum(['iteration', 'reference', 'example', 'dependency', 'custom']).optional(), label: note, note: note.default(''), style: EdgeStyleSchema.optional() }) }),
  z.object({ action: z.literal('deleteRelation'), projectId: id, relationId: id }),
  z.object({ action: z.literal('readFile'), projectId: id, nodeId: id }),
  z.object({ action: z.literal('editFile'), projectId: id, nodeId: id }),
  z.object({ action: z.literal('export'), projectId: id, nodeId: id, destination: label }),
])
export type ProjectRequestData = z.infer<typeof ProjectRequest>
