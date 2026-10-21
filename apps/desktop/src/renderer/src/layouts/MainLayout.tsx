// apps/desktop/src/renderer/src/layouts/MainLayout.tsx
import { Workspace } from '@renderer/components/Workspace'
import { useState } from 'react'
import { ManagementPicker, type ManagementMode } from '@renderer/components/ManagementPicker'
import { ProjectWorkspace } from '@renderer/components/ProjectWorkspace'
import { useRepoStore } from '../store/repoStore'
import { useUiStore } from '../store/uiStore'
import { useSessionState } from '../store/useSessionState'
import '../assets/projects.css'

export function MainLayout() {
  const [mode, setMode] = useState<ManagementMode>(() => localStorage.getItem('dockitty-management-mode') === 'projects' ? 'projects' : 'versions')
  const repoRoot = useRepoStore(state => state.repoRoot)
  const [panels, setPanels] = useSessionState<Record<ManagementMode, 'preview' | 'settings'>>(repoRoot, 'management.panels', { versions: 'preview', projects: 'preview' })
  const picker = <ManagementPicker mode={mode} onChange={value => {
    setPanels(previous => ({ ...previous, [mode]: useUiStore.getState().rightPanel }))
    useUiStore.getState().setRightPanel(panels[value])
    setMode(value); localStorage.setItem('dockitty-management-mode', value)
  }}/>
  return mode === 'versions' ? <Workspace modePicker={picker}/> : <ProjectWorkspace modePicker={picker}/>
}
