import { registerRepoHandlers } from './repoHandlers.js'
import { registerDocHandlers } from './docHandlers.js'
import { registerCommitHandlers } from './commitHandlers.js'
import { registerBranchHandlers } from './branchHandlers.js'
import { registerMaintenanceHandlers } from './maintenanceHandlers.js'
import { registerDialogHandlers } from './dialogHandlers.js'
import { registerPreviewHandlers } from './previewHandlers.js'
import { registerLibraryHandlers } from './libraryHandlers.js'
import { registerVersionStatsHandlers } from './versionStatsHandlers.js'

export function registerAllHandlers(): void {
  registerRepoHandlers()
  registerDocHandlers()
  registerCommitHandlers()
  registerBranchHandlers()
  registerMaintenanceHandlers()
  registerDialogHandlers()
  registerPreviewHandlers()
  registerLibraryHandlers()
  registerVersionStatsHandlers()
}
