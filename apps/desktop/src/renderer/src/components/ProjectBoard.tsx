import { AkCardArt } from './AkCardArt'
import { useState } from 'react'
import { File, Folder, GripVertical, Pencil, Plus, Trash2 } from 'lucide-react'
import type { ProjectCategory, ProjectNode } from '@wordgit/shared'

export function ProjectBoard({ categories, nodes, selectedId, onSelect, onOpen, onMove, onCategory, onContext }: {
  categories: ProjectCategory[]; nodes: ProjectNode[]; selectedId: string | null
  onSelect(id: string): void; onOpen(id: string): void
  onMove(id: string, categoryId: string): void
  onCategory(action: 'create' | 'rename' | 'delete', category?: ProjectCategory): void
  onContext(node: ProjectNode, x: number, y: number): void
}) {
  const [dragging, setDragging] = useState<string | null>(null), [over, setOver] = useState<string | null>(null)
  const columns = [{ id: '', name: '未分类' }, ...categories]
  return <section className="wg-board wg-project-board" aria-label="项目分类看板">
    <header className="wg-board-heading"><div><h2>把这一层资料，归到合适的分类。</h2><p>全项目共用分类，此处只展示当前层。拖动文件或文件夹分类，也可在详情中选择；分类不会移动来源文件。</p></div><button className="wg-button" onClick={() => onCategory('create')}><Plus size={15}/> 添加分类</button></header>
    <div className="wg-columns">{columns.map(category => {
      const cards = nodes.filter(n => (n.categoryId ?? '') === category.id)
      return <section key={category.id} className={`wg-column ${over === category.id ? 'drag-over' : ''}`} aria-label={`项目分类 ${category.name}`} onDragOver={e => {
        if (e.dataTransfer.types.includes('application/dockitty-project-item')) { e.preventDefault(); setOver(category.id) }
      }} onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(null) }} onDrop={e => {
        const id = e.dataTransfer.getData('application/dockitty-project-item')
        if (nodes.some(n => n.id === id)) { e.preventDefault(); onMove(id, category.id) }
        setDragging(null); setOver(null)
      }}>
        <header className="wg-column-heading"><div><span className="wg-category-dot"/><strong>{category.name}</strong><small>{cards.length}</small></div>{category.id && <div className="wg-column-tools"><button aria-label={`重命名项目分类 ${category.name}`} onClick={() => onCategory('rename', category)}><Pencil size={13}/></button><button aria-label={`删除项目分类 ${category.name}`} onClick={() => onCategory('delete', category)}><Trash2 size={13}/></button></div>}</header>
        <div className="wg-cards">{cards.map(node => <article key={node.id} data-drop-folder={node.kind === 'folder' ? node.id : undefined} tabIndex={0} role="button" aria-label={`看板资料 ${node.title}`} draggable className={`wg-version-card ak-card ${selectedId === node.id ? 'selected' : ''} ${dragging === node.id ? 'dragging' : ''}`} onClick={() => onSelect(node.id)} onDoubleClick={() => onOpen(node.id)} onContextMenu={e => { e.preventDefault(); onContext(node, e.clientX, e.clientY) }} onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(node.id) }
          if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
            e.preventDefault(); const index = columns.indexOf(category), offset = e.key === 'ArrowRight' ? 1 : -1
            onMove(node.id, columns[Math.max(0, Math.min(columns.length - 1, index + offset))].id)
          }
        }} onDragStart={e => { e.dataTransfer.setData('application/dockitty-project-item', node.id); e.dataTransfer.effectAllowed = 'move'; setDragging(node.id) }} onDragEnd={() => { setDragging(null); setOver(null) }}>
          <AkCardArt kind={node.kind === 'folder' ? 'folder' : node.name.split('.').pop()}/><div className="wg-card-eyebrow"><span>{node.kind === 'folder' ? <Folder size={14}/> : <File size={14}/>} {node.kind === 'folder' ? '文件夹' : node.name.split('.').pop()?.toUpperCase()}</span><GripVertical size={13}/></div><h3>{node.title}</h3><p>{node.note || node.name}</p><footer><small>{node.linkTarget ? '链接入口' : node.snapshot ? '历史快照' : '当前内容'}</small><span className="wg-project-card-category">{category.name}</span></footer>
        </article>)}</div>{!cards.length && <div className="wg-column-empty">将当前层的资料拖到这里<br/>或在详情中选择分类</div>}
      </section>
    })}<button className="wg-add-column" onClick={() => onCategory('create')}><Plus size={20}/><span>新分类</span></button></div>
  </section>
}
