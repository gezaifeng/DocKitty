// apps/desktop/src/renderer/src/components/DocCard.tsx
import { motion } from 'framer-motion'
import { cn } from '@renderer/lib/utils'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import type { DocInfo } from '@wordgit/shared'

interface DocCardProps {
  doc: DocInfo
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

const fadeInUp = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.2, ease: 'easeOut' },
}

export function DocCard({ doc, selected, onSelect, onEdit }: DocCardProps) {
  return (
    <motion.div
      {...fadeInUp}
      className={cn(
        'p-3 rounded-lg border cursor-pointer transition-colors',
        selected
          ? 'border-primary bg-primary/5'
          : 'border-border hover:border-primary/40 hover:bg-accent/40',
      )}
      onClick={onSelect}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-sm truncate" title={doc.docName}>
            {doc.docName}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            <span>{doc.commitCount} 个版本</span>
            <span> · {formatDate(doc.lastCommitAt)}</span>
          </p>
        </div>
        <Badge variant="secondary" className="shrink-0 text-xs">
          {doc.currentBranch}
        </Badge>
      </div>
      <div className="mt-2 flex gap-1">
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs flex-1"
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
