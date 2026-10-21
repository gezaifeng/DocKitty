import { FileText, FolderOpen, FileSpreadsheet, Presentation, BookOpen } from 'lucide-react'
import { useUiStore } from '../store/uiStore'

export function AkCardArt({ kind = '' }: { kind?: string }) {
  const enabled = useUiStore(s => s.theme === 'arknights')
  if (!enabled) return null
  const type = kind.toLowerCase(), Icon = type === 'folder' ? FolderOpen : type.includes('xls') ? FileSpreadsheet : type.includes('ppt') ? Presentation : type === 'md' ? BookOpen : FileText
  return <span className="wg-ak-card-art" aria-hidden="true"><Icon strokeWidth={1.2}/><i/><i/><i/></span>
}
