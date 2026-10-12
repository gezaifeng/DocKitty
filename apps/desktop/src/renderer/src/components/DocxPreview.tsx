// apps/desktop/src/renderer/src/components/DocxPreview.tsx
import { useEffect, useId, useRef, useState } from 'react'
import { renderAsync } from 'docx-preview'

interface DocxPreviewProps {
  data: ArrayBuffer
}

export function DocxPreview({ data }: DocxPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const documentClass = 'wg-document-' + useId().replace(/[^a-zA-Z0-9]/g, '')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!containerRef.current || data.byteLength === 0) return
    let active = true
    let observer: ResizeObserver | undefined
    setError(null)
    const content = document.createElement('div')
    renderAsync(data, content, content, {
      className: documentClass,
      inWrapper: false,
      ignoreWidth: false,
    }).then(() => {
      if (!active || !containerRef.current) return
      const host = containerRef.current
      host.replaceChildren(content)
      content.style.width = 'max-content'
      const pageWidth = content.querySelector('section')?.getBoundingClientRect().width || 794
      content.style.width = pageWidth + 'px'
      let previousWidth = 0
      const fit = () => {
        const width = Math.max(100, host.clientWidth - 24)
        if (width === previousWidth) return
        previousWidth = width
        content.style.zoom = String(Math.min(1.5, width / pageWidth))
      }
      fit(); observer = new ResizeObserver(fit); observer.observe(host)
      // Some manuscripts begin with an empty section. Keep it, but open at the first content page.
      const firstPage = [...content.querySelectorAll('section')].find(page => page.textContent?.trim() || page.querySelector('img,svg,table'))
      if (firstPage) host.scrollTop = firstPage.getBoundingClientRect().top - host.getBoundingClientRect().top - 12
    })
      .catch(e => { if (active) setError((e as Error).message) })
    return () => { active = false; observer?.disconnect() }
  }, [data, documentClass])

  return (
    <>{error && <p role="alert" className="text-destructive text-sm p-4">{error}</p>}<div
      ref={containerRef}
      className="wg-docx-preview"
    /></>
  )
}
