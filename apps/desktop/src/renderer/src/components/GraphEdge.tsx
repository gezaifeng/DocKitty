import { useId } from 'react'
import { resolvedEdgeStyle, type EdgeStyle } from '@wordgit/shared'

export function GraphEdge({ d, style, marker = 'end', from, to }: { d: string; style?: EdgeStyle; marker?: 'end' | 'mid'; from?: string; to?: string }) {
  const id = `edge-${useId().replace(/:/g, '')}`, value = resolvedEdgeStyle(style)
  const arrow = value.arrow === 'none' ? undefined : `url(#${id})`
  return <>
    <defs><marker id={id} viewBox="0 0 10 10" markerWidth={value.arrowSize} markerHeight={value.arrowSize} refX="9" refY="5" orient="auto" markerUnits="userSpaceOnUse">
      <path className={`wg-edge-arrow ${value.arrow === 'chevron' ? 'wg-edge-open-arrow' : ''}`} d={value.arrow === 'chevron' ? 'M1 1 L9 5 L1 9' : value.arrow === 'diamond' ? 'M0 5 L5 1 L10 5 L5 9 Z' : 'M0 0 L10 5 L0 10 Z'}/>
    </marker></defs>
    <path className="wg-edge-line" data-from={from} data-to={to} data-line={value.line} data-arrow={value.arrow} data-arrow-size={value.arrowSize} d={d} style={{ strokeWidth: value.line === 'double' ? value.width * 2 + 3 : value.width, strokeDasharray: value.line === 'dashed' ? `${value.width * 4} ${value.width * 3}` : 'none' }}/>
    {value.line === 'double' && <path className="wg-edge-gap" d={d} style={{ strokeWidth: 3 }}/>} 
    <path className="wg-edge-marker" d={d} markerEnd={marker === 'end' ? arrow : undefined} markerMid={marker === 'mid' ? arrow : undefined}/>
  </>
}
