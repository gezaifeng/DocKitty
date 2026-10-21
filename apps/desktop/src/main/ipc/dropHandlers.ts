import { ipcMain } from 'electron'
import { z } from 'zod'
import { inspectDroppedFiles, prepareProjectDrop, importDroppedProject, createDroppedProjects } from '@wordgit/core'
import { ProjectDropRequestSchema } from '@wordgit/shared'
import { getRepo } from '../repoState.js'

const paths = z.array(z.string().min(1)).min(1)
export function registerDropHandlers() {
  ipcMain.handle('drop.inspect', (_event, input: unknown) => inspectDroppedFiles(paths.parse(input)))
  ipcMain.handle('drop.prepare', (_event, input: unknown) => {
    const request = z.object({ paths, projectId: z.string().uuid().optional(), parentId: z.string().uuid().nullable().optional(), workingFolder: z.string().optional() }).parse(input)
    return prepareProjectDrop(getRepo(), request.paths, request.projectId, request.parentId, request.workingFolder)
  })
  ipcMain.handle('drop.project', (_event, input: unknown) => importDroppedProject(getRepo(), ProjectDropRequestSchema.parse(input)))
  ipcMain.handle('drop.projects', (_event, input: unknown) => createDroppedProjects(getRepo(), paths.parse(input)))
}
