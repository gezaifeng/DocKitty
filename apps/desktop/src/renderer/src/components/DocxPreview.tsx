// apps/desktop/src/renderer/src/components/DocxPreview.tsx
import { useEffect, useRef } from 'react'
import { renderAsync } from 'docx-preview'

interface DocxPreviewProps {
  data: ArrayBuffer
}

export function DocxPreview({ data }: DocxPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current || data.byteLength === 0) return
    renderAsync(data, containerRef.current, containerRef.current, {
      className: 'docx-preview',
      inWrapper: false,
      ignoreWidth: true,
    }).catch(console.error)
  }, [data])

  return (
    <div
      ref={containerRef}
      className="prose prose-sm max-w-none p-4 overflow-auto h-full"
    />
  )
}
