import { z } from 'zod'

export interface DroppedFile { path: string; name: string; kind: 'file' | 'folder' | 'link' }
export interface ProjectDropPlan {
  files: Array<DroppedFile & { inside: boolean; suggestedName: string; conflict: boolean }>
  workingFolder: string | null
}
const absolute = z.string().min(1)
export const ProjectDropRequestSchema = z.object({
  projectId: z.string().uuid().optional(),
  newProjectName: z.string().min(1).optional(),
  parentId: z.string().uuid().nullable().optional(),
  workingFolder: absolute.optional(),
  items: z.array(z.object({ path: absolute, action: z.enum(['reference', 'copy', 'move', 'skip']), name: z.string().min(1).optional() })).min(1),
})
export type ProjectDropRequest = z.infer<typeof ProjectDropRequestSchema>
