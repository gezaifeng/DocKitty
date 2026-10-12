// apps/desktop/src/renderer/src/components/DocCard.tsx
import { motion } from 'framer-motion'
import { File, FileText, Presentation, Table } from 'lucide-react'
import { cn } from '@renderer/lib/utils'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import type { DocInfo } from '@wordgit/shared'

interface DocCardProps {
  doc: DocInfo
  index: number
  selected: boolean
  onSelect(): void
  onEdit(): void
}

function formatDate(iso: string | null): string {
  if (!iso) return '暂无版本'
  return new Date(iso).toLocaleDateString('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const EXT_ICONS: Record<string, typeof File> = {
  docx: FileText,
  xlsx: Table,
  xls: Table,
  pptx: Presentation,
}

function docIcon(docName: string): typeof File {
  const ext = docName.split('.').pop()?.toLowerCase() ?? ''
  return EXT_ICONS[ext] ?? File
}

export function DocCard({ doc, index, selected, onSelect, onEdit }: DocCardProps) {
  const Icon = docIcon(doc.docName)
  return (
    <motion.div
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: Math.min(index * 0.045, 0.36), ease: 'easeOut' }}
      whileHover={{ y: -2 }}
      className={cn(
        'group cursor-pointer rounded-lg border p-3 outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-ring',
        selected
          ? 'border-primary/60 bg-primary/5 shadow-sm'
          : 'border-border hover:border-primary/40 hover:shadow-md',
      )}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect()
        }
      }}
    >
      <div className="flex items-start gap-2.5">
        <div
          className={cn(
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors',
            selected ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
          )}
        >
          <Icon className="h-4 w-4" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium" title={doc.docName}>
            {doc.docName}
          </p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            <span>{doc.commitCount} 个版本</span>
            <span> · {formatDate(doc.lastCommitAt)}</span>
          </p>
        </div>
        <Badge variant="secondary" className="shrink-0 text-xs">
          {doc.currentBranch}
        </Badge>
      </div>
      <div className="mt-2">
        <Button
          size="sm"
          variant="outline"
          className="h-7 w-full text-xs opacity-90 transition-opacity group-hover:opacity-100"
          onClick={(e) => {
            e.stopPropagation()
            onEdit()
          }}
        >
          编辑
        </Button>
      </div>
    </motion.div>
  )
}
