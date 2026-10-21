import { AkCardArt } from './AkCardArt'
import { useState } from 'react'
import { Plus, Pencil, Trash2, GripVertical, ArrowUp, ArrowDown } from 'lucide-react'
import type { DocumentDetail, LibraryVersion } from '@wordgit/shared'

interface Props {
  detail: DocumentDetail
  versions: LibraryVersion[]
  selectedId: string | null
  compareIds: string[]
  onSelect(id: string): void
  onMove(id: string, categoryId: string, beforeId?: string): void
  onCategory(action: 'create' | 'rename' | 'delete', category?: { id: string; name: string }): void
  onContext?(version: LibraryVersion, x: number, y: number): void
}

export function VersionBoard({ detail, versions, selectedId, compareIds, onSelect, onMove, onCategory, onContext }: Props) {
  const [dragging, setDragging] = useState<string | null>(null)
  const [over, setOver] = useState<string | null>(null)
  const categories = [{ id: '', name: '未分类' }, ...detail.categories]
  return <section className="wg-board" aria-label="版本分类看板">
    <header className="wg-board-heading"><div><h2>把每一稿，放在合适的位置。</h2><p>分类不改变分支或文件内容。拖动卡片调整分类与先后顺序，也可用版本详情里的菜单移动。</p></div><button className="wg-button" onClick={() => onCategory('create')}><Plus size={15} /> 添加分类</button></header>
    <div className="wg-columns">{categories.map(category => {
      const cards = versions.filter(v => v.categoryId === category.id).sort((a, b) => a.order - b.order || b.createdAt.localeCompare(a.createdAt))
      return <section key={category.id} className={`wg-column ${over === category.id ? 'drag-over' : ''}`} onDragOver={event => { if (event.dataTransfer.types.includes('application/wordgit-version')) { event.preventDefault(); setOver(category.id) } }} onDrop={event => {
        event.preventDefault()
        const id = event.dataTransfer.getData('application/wordgit-version')
        if (id) onMove(id, category.id)
        setDragging(null); setOver(null)
      }} onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver(null) }}>
        <header className="wg-column-heading"><div><span className="wg-category-dot" /><strong>{category.name}</strong><small>{cards.length}</small></div>{category.id && <div className="wg-column-tools"><button aria-label={`重命名分类 ${category.name}`} onClick={() => onCategory('rename', category)}><Pencil size={13} /></button><button aria-label={`删除分类 ${category.name}`} onClick={() => onCategory('delete', category)}><Trash2 size={13} /></button></div>}</header>
        <div className="wg-cards">{cards.map((version, index) => <article key={version.id} tabIndex={0} draggable className={`wg-version-card ak-card ${selectedId === version.id ? 'selected' : ''} ${compareIds.includes(version.id) ? 'compared' : ''} ${dragging === version.id ? 'dragging' : ''}`} onClick={() => onSelect(version.id)} onContextMenu={e => { e.preventDefault(); onSelect(version.id); onContext?.(version, e.clientX, e.clientY) }} onKeyDown={event => {
          if (event.key === 'Enter') onSelect(version.id)
          if (event.altKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
            event.preventDefault()
            const target = categories[Math.max(0, Math.min(categories.length - 1, categories.indexOf(category) + (event.key === 'ArrowRight' ? 1 : -1)))]
            onMove(version.id, target.id)
          }
        }} onDragStart={event => { event.dataTransfer.setData('application/wordgit-version', version.id); event.dataTransfer.effectAllowed = 'move'; setDragging(version.id) }} onDragEnd={() => { setDragging(null); setOver(null) }} onDragOver={event => { if (event.dataTransfer.types.includes('application/wordgit-version')) event.preventDefault() }} onDrop={event => {
          const id = event.dataTransfer.getData('application/wordgit-version')
          if (id && id !== version.id) { event.preventDefault(); event.stopPropagation(); onMove(id, category.id, version.id) }
          setDragging(null); setOver(null)
        }}>
          <AkCardArt kind={detail.docName.split('.').pop()}/><div className="wg-branch-tags"><span className="wg-owner-tag">{version.branches[0]}</span>{category.id && <span className="wg-category-tag">{category.name}</span>}</div><div className="wg-card-eyebrow"><span>{version.branches[0]}</span><GripVertical size={13} /></div><h3>{version.title}</h3><p>{version.note || '点击查看内容和操作；右键选择继续编辑或新建分支。'}</p><footer><small>{new Date(version.createdAt).toLocaleDateString('zh-CN')}{version.revisionCount ? ` · 覆盖 ${version.revisionCount} 次` : ''}</small><div><button disabled={index === 0} aria-label={`上移版本 ${version.title}`} onClick={e => { e.stopPropagation(); onMove(version.id, category.id, cards[index - 1].id) }}><ArrowUp size={13} /></button><button disabled={index === cards.length - 1} aria-label={`下移版本 ${version.title}`} onClick={e => { e.stopPropagation(); onMove(version.id, category.id, cards[index + 2]?.id) }}><ArrowDown size={13} /></button></div></footer>
        </article>)}</div>
        {!cards.length && <div className="wg-column-empty">将版本拖到这里<br />或从版本详情选择分类</div>}
      </section>
    })}<button className="wg-add-column" onClick={() => onCategory('create')}><Plus size={20} /><span>新分类</span></button></div>
  </section>
}
