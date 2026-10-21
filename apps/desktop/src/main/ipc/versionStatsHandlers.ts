import { ipcMain } from 'electron'
import { getRepo } from '../repoState.js'
import { versionStatistics, exportVersionStatistics } from '../versionStatistics.js'

export async function versionStatsHandler(args: unknown) { return versionStatistics(getRepo(), args) }
export async function exportStatistics(args: unknown) { return exportVersionStatistics(getRepo(), args) }
export function registerVersionStatsHandlers() {
  ipcMain.handle('stats.versions', (_event, args: unknown) => versionStatsHandler(args))
  ipcMain.handle('stats.export', (_event, args: unknown) => exportStatistics(args))
}
