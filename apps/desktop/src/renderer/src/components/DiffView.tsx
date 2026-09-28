// apps/desktop/src/renderer/src/components/DiffView.tsx
import { useQuery } from '@tanstack/react-query'
import { api } from '@renderer/lib/ipc'
import type { DiffResult } from '@wordgit/shared'

interface DiffViewProps {
  docName: string
  commitIdA: string
  commitIdB: string
}

function DiffSegment({ result }: { result: DiffResult }) {
  if (result.type === 'insert') {
    return (
      <mark className="bg-green-200 dark:bg-green-900 text-green-900 dark:text-green-100 no-underline">
        {result.text}
      </mark>
    )
  }
  if (result.type === 'delete') {
    return (
      <del className="bg-red-200 dark:bg-red-900 text-red-900 dark:text-red-100">
        {result.text}
      </del>
    )
  }
  return <span>{result.text}</span>
}

export function DiffView({ docName, commitIdA, commitIdB }: DiffViewProps) {
  const { data: diffs, isLoading } = useQuery({
    queryKey: ['diff', docName, commitIdA, commitIdB],
    queryFn: () => api.commit.diffText(docName, commitIdA, commitIdB),
  })

  if (isLoading) {
    return (
      <div className="p-4 text-center text-muted-foreground text-sm">
        对比中…
      </div>
    )
  }

  if (!diffs || diffs.length === 0) {
    return (
      <div className="p-4 text-center text-muted-foreground text-sm">
        无差异
      </div>
    )
  }

  return (
    <div className="p-4 font-mono text-sm leading-relaxed whitespace-pre-wrap break-words">
      {diffs.map((result, idx) => (
        <DiffSegment key={idx} result={result} />
      ))}
    </div>
  )
}
