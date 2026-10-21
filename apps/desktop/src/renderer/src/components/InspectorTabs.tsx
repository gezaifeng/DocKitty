import { useId, useRef, type ReactNode } from 'react'
import '../assets/inspector.css'

export function InspectorTabs({ value, onChange, tabs }: { value: string; onChange(value: string): void; tabs: Array<{ id: string; label: string; content: ReactNode }> }) {
  const id = useId(), root = useRef<HTMLElement>(null), current = tabs.find(tab => tab.id === value) ?? tabs[0]
  return <div className="wg-inspector-tabs">
    <nav ref={root} role="tablist" aria-label="详情分区" onKeyDown={event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
      event.preventDefault()
      const index = tabs.indexOf(current), next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length
      onChange(tabs[next].id); root.current?.querySelectorAll<HTMLButtonElement>('button')[next]?.focus()
    }}>{tabs.map(tab => <button key={tab.id} type="button" role="tab" id={`${id}-${tab.id}`} aria-controls={`${id}-panel`} aria-selected={tab.id === current.id} tabIndex={tab.id === current.id ? 0 : -1} onClick={() => onChange(tab.id)}>{tab.label}</button>)}</nav>
    <section className="wg-inspector-tabpanel" role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-${current.id}`}>{current.content}</section>
  </div>
}
