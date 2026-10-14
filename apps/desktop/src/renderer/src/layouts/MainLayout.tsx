// apps/desktop/src/renderer/src/layouts/MainLayout.tsx
import { Workspace } from '@renderer/components/Workspace'
import { useState } from 'react'
import { ManagementPicker, type ManagementMode } from '@renderer/components/ManagementPicker'
import { ProjectWorkspace } from '@renderer/components/ProjectWorkspace'
import '../assets/projects.css'

export function MainLayout() {
  const [mode, setMode] = useState<ManagementMode>(() => localStorage.getItem('dockitty-management-mode') === 'projects' ? 'projects' : 'versions')
  const picker = <ManagementPicker mode={mode} onChange={value => { setMode(value); localStorage.setItem('dockitty-management-mode', value) }}/>
  return mode === 'versions' ? <Workspace modePicker={picker}/> : <ProjectWorkspace modePicker={picker}/>
}
