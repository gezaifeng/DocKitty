import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createPortal } from 'react-dom'
import { Folder, FolderOpen, File, Plus, Import, RefreshCw, ArrowLeft, GitBranch, Grid2X2, Columns3, Link2, Download, Pencil, Trash2, ExternalLink } from 'lucide-react'
import type { ProjectCategory, ProjectLibrary, ProjectNode, ProjectRelation, ProjectRequestData, ProjectImportResult } from '@wordgit/shared'
import { api } from '@renderer/lib/ipc'
import { useRepoStore } from '@renderer/store/repoStore'
import { ThemePicker } from './ThemePicker'
import { SidebarCat } from './SidebarCat'
import { ProjectGraph } from './ProjectGraph'
import { ProjectBoard } from './ProjectBoard'
import { EdgeEditor, type EdgeDraft } from './EdgeEditor'
import { useNotice } from './useNotice'
import { SettingsPage } from './SettingsPage'
import { useUiStore } from '@renderer/store/uiStore'
import { FileMenu } from './FileMenu'
import { FeaturesMenu } from './FeaturesMenu'
import { DocxPreview } from './DocxPreview'
import { XlsxPreview } from './XlsxPreview'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from './ui/dialog'
import { safeProjectHtml } from './projectHtml'
import { ProjectMcpDialog } from './ProjectMcpDialog'
import brandIcon from '../assets/gaomiao.png'
import '../assets/workspace.css'
import '../assets/blockframe.css'
import '../assets/projects.css'

const request = <T,>(value: ProjectRequestData) => api.projects!.request(value) as Promise<T>
const relationLabels = { iteration: '迭代', reference: '参考', example: '示例', dependency: '依赖', custom: '未命名关系' }
const typeLabels: Record<string, string> = { folder: '文件夹', document: '办公文档', sheet: '表格与数据', slide: '演示', markdown: 'Markdown', html: '网页', script: '脚本与代码', image: '图片', other: '其他' }
function nodeType(node: ProjectNode) {
  if (node.linkTarget) return 'other'
  if (node.kind === 'folder') return 'folder'
  const ext = node.name.split('.').pop()?.toLowerCase() ?? ''
  if (['doc', 'docx', 'pdf', 'txt', 'rtf', 'odt'].includes(ext)) return 'document'
  if (['xls', 'xlsx', 'csv', 'tsv'].includes(ext)) return 'sheet'
  if (['ppt', 'pptx'].includes(ext)) return 'slide'
  if (['md', 'markdown'].includes(ext)) return 'markdown'
  if (['html', 'htm'].includes(ext)) return 'html'
  if (['py', 'cpp', 'c', 'h', 'hpp', 'js', 'ts', 'tsx', 'jsx', 'json', 'yaml', 'yml', 'toml', 'xml', 'css', 'sh', 'ps1', 'bat', 'r', 'rs', 'go', 'java', 'sql'].includes(ext)) return 'script'
  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(ext)) return 'image'
  return 'other'
}
function filePath(project: ProjectLibrary, node: ProjectNode): string {
  const names = [node.title], seen = new Set([node.id]); let parentId = node.parentId
  while (parentId) { const parent = project.nodes.find(n => n.id === parentId); if (!parent || seen.has(parent.id)) break; seen.add(parent.id); names.unshift(parent.title); parentId = parent.parentId }
  return names.join(' / ')
}
function FilePreview({ projectId, node, project }: { projectId: string; node: ProjectNode; project: ProjectLibrary }) {
  const [html, setHtml] = useState(''), resources = useRef<string[]>([])
  const assetsVersion = project.nodes.filter(n => n.kind === 'file').map(n => `${n.id}:${n.contentHash ?? ''}`).join('|')
  const query = useQuery({ queryKey: ['project-preview', projectId, node.id, node.contentHash], queryFn: () => request<{ data: ArrayBuffer; ext: string }>({ action: 'readFile', projectId, nodeId: node.id }), enabled: !node.linkTarget })
  useEffect(() => {
    let active = true; setHtml('')
    const value = query.data
    if (value && ['html', 'htm'].includes(value.ext)) {
      const originalPath = (item: ProjectNode) => {
        const parts = [item.name]; let parentId = item.parentId
        while (parentId) { const p = project.nodes.find(n => n.id === parentId); if (!p) break; parts.unshift(p.name); parentId = p.parentId }
        return 'https://dockitty.invalid/' + parts.map(encodeURIComponent).join('/')
      }
      void safeProjectHtml(new TextDecoder().decode(value.data), async (reference, kind) => {
        let target: URL
        try { target = new URL(reference, originalPath(node)) } catch { return null }
        if (target.origin !== 'https://dockitty.invalid') return null
        const candidates = project.nodes.filter(n => n.kind === 'file' && originalPath(n) === target.href)
        const asset = (node.snapshotRootId ? candidates.find(n => n.snapshotRootId === node.snapshotRootId) : undefined) ?? candidates.find(n => !n.snapshot)
        if (!asset || (kind === 'css' && !asset.name.toLowerCase().endsWith('.css'))) return null
        const bytes = await request<{ data: ArrayBuffer; ext: string }>({ action: 'readFile', projectId, nodeId: asset.id })
        if (kind === 'css') return new TextDecoder().decode(bytes.data)
        const mime = ({ png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml' } as Record<string, string>)[bytes.ext]
        if (!mime) return null
        if (!active) return null
        const url = URL.createObjectURL(new Blob([bytes.data], { type: mime })); resources.current.push(url); return url
      }).then(result => { if (active) setHtml(result) }).catch(() => { if (active) setHtml('<p>部分页面资源无法读取，请刷新后重试。</p>') })
    }
    return () => { active = false; resources.current.forEach(url => URL.revokeObjectURL(url)); resources.current = [] }
  }, [query.data, node.id, projectId, assetsVersion])
  if (node.linkTarget) return <div className="wg-preview-empty"><Link2 size={28}/><p>链接入口 · 只记录目标路径，不展开目标内容</p><p className="wg-project-path">{node.linkTarget}</p></div>
  if (query.isLoading) return <p>正在读取文件…</p>
  if (query.error) return <p role="alert">{query.error.message}</p>
  const value = query.data; if (!value) return null
  if (value.ext === 'docx') return <DocxPreview data={value.data}/>
  if (value.ext === 'xlsx') return <XlsxPreview data={value.data}/>
  if (['html', 'htm'].includes(value.ext)) return html ? <iframe className="wg-project-html" title={`HTML 页面预览 ${node.title}`} sandbox="" referrerPolicy="no-referrer" srcDoc={html}/> : <p>正在准备安全页面预览…</p>
  if (['md', 'markdown', 'txt', 'html', 'htm', 'py', 'cpp', 'c', 'h', 'hpp', 'js', 'ts', 'tsx', 'jsx', 'json', 'yaml', 'yml', 'toml', 'xml', 'css', 'csv', 'sh', 'ps1', 'bat', 'r', 'rs', 'go', 'java', 'sql'].includes(value.ext)) return <pre className="wg-text-preview">{new TextDecoder().decode(value.data)}</pre>
  return <div className="wg-preview-empty"><File size={28}/><p>此格式可完整保存与导出；请用关联程序查看内容。</p></div>
}
type Modal = { kind: 'import'; paths: string[] } | { kind: 'node' | 'delete' | 'iteration' | 'preview'; node: ProjectNode } | { kind: 'category'; action: 'create' | 'rename' | 'delete'; category?: ProjectCategory } | { kind: 'relocate'; parent: string }
export function ProjectWorkspace({ modePicker }: { modePicker: ReactNode }) {
  const { repoRoot, setRepo } = useRepoStore(), client = useQueryClient()
  const { rightPanel, setRightPanel } = useUiStore()
  const [projectId, setProjectId] = useState<string | null>(null), [parentId, setParentId] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null), [view, setView] = useState<'grid' | 'graph' | 'board'>('grid'), [search, setSearch] = useState('')
  const [types, setTypes] = useState<string[]>([]), [typesOpen, setTypesOpen] = useState(false)
  const [mcpOpen, setMcpOpen] = useState(false), [helpOpen, setHelpOpen] = useState(false)
  const typesPicker = useRef<HTMLDivElement>(null)
  const [modal, setModal] = useState<Modal | null>(null), [form, setForm] = useState<Record<string, string>>({}), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const [notice, setNotice] = useNotice()
  const [connection, setConnection] = useState<string | 'choose' | null>(null), [menu, setMenu] = useState<{ node: ProjectNode; x: number; y: number } | null>(null)
  const [edgeContext, setEdgeContext] = useState<{ edge: ProjectRelation; x: number; y: number } | null>(null)
  const [edgePreview, setEdgePreview] = useState<EdgeDraft | null>(null)
  const closeEdge = () => { setEdgeContext(null); setEdgePreview(null) }
  useEffect(closeEdge, [projectId, parentId, view, rightPanel])
  useEffect(() => { window.addEventListener('wordgit:history-applied', closeEdge); return () => window.removeEventListener('wordgit:history-applied', closeEdge) }, [])
  useEffect(() => { setProjectId(null); setParentId(null); setSelectedId(null); closeEdge() }, [repoRoot])
  const [focusRequest, setFocusRequest] = useState<{ id: string } | null>(null)
  const [width, setWidth] = useState(() => Number(localStorage.getItem('dockitty-project-inspector-width')) || 320), resize = useRef<{ x: number; width: number } | null>(null)
  const libraries = useQuery({ queryKey: ['projects', repoRoot], queryFn: () => request<ProjectLibrary[]>({ action: 'list' }), refetchInterval: 2000 })
  const detail = useQuery({ queryKey: ['project', repoRoot, projectId], queryFn: () => request<ProjectLibrary>({ action: 'get', projectId: projectId! }), enabled: !!projectId, refetchInterval: 2000 }).data
  const nodes = detail?.nodes.filter(n => n.parentId === parentId && (!types.length || types.includes(nodeType(n))) && (n.title.toLowerCase().includes(search.toLowerCase()) || n.name.toLowerCase().includes(search.toLowerCase()))) ?? []
  const selected = detail?.nodes.find(n => n.id === selectedId)
  const parent = detail?.nodes.find(n => n.id === parentId)
  const previewNode = modal?.kind === 'preview' ? detail?.nodes.find(n => n.id === modal.node.id) : undefined
  useEffect(() => {
    const reconcile = () => { const current = client.getQueryData<ProjectLibrary[]>(['projects', repoRoot]); if (projectId && current && !current.some(p => p.id === projectId)) setProjectId(null) }
    window.addEventListener('wordgit:history-applied', reconcile); return () => window.removeEventListener('wordgit:history-applied', reconcile)
  }, [repoRoot, projectId])
  useEffect(() => { const cancel = (e: KeyboardEvent) => { if (e.key === 'Escape') { setMenu(null); setConnection(null); setTypesOpen(false) } }; window.addEventListener('keydown', cancel); return () => window.removeEventListener('keydown', cancel) }, [])
  useEffect(() => { if (!typesOpen) return; const close = (e: PointerEvent) => { if (!typesPicker.current?.contains(e.target as Node)) setTypesOpen(false) }; window.addEventListener('pointerdown', close); return () => window.removeEventListener('pointerdown', close) }, [typesOpen])
  useEffect(() => { if (!menu) return; const close = () => setMenu(null); window.addEventListener('pointerdown', close); return () => window.removeEventListener('pointerdown', close) }, [menu])
  useEffect(() => { setConnection(null); setSearch(''); setSelectedId(null) }, [projectId])
  useEffect(() => { setConnection(null); setSearch(''); setSelectedId(id => detail?.nodes.find(n => n.id === id)?.parentId === parentId ? id : null) }, [parentId])
  useEffect(() => { if (parentId && detail && !detail.nodes.some(n => n.id === parentId)) setParentId(null) }, [detail, parentId])
  async function run(action: () => Promise<unknown>, message = '') {
    setBusy(true); setError('')
    try { const result = await action(); await client.invalidateQueries({ queryKey: ['projects'] }); await client.invalidateQueries({ queryKey: ['project'] }); await client.invalidateQueries({ queryKey: ['edit-history'] }); if (message) setNotice(message); return result }
    catch (e) { setError((e as Error).message); throw e }
    finally { setBusy(false) }
  }
  const act = (action: () => Promise<unknown>, message?: string) => { void run(action, message).catch(() => {}) }
  function enter(id: string) { setRightPanel('preview'); setProjectId(id); setParentId(null); setSelectedId(null) }
  function openNode(id: string) { const n = detail?.nodes.find(n => n.id === id); if (n?.kind === 'folder') setParentId(n.id); else setSelectedId(id) }
  function select(id: string) {
    setSelectedId(id)
    if (connection === 'choose') setConnection(id)
    else if (connection) {
      if (connection === id) return
      connect(connection, id)
    } else setSelectedId(id)
  }
  function connect(from: string, to: string) {
    setConnection(null)
    if (detail?.relations.some(edge => edge.from === from && edge.to === to)) { setNotice('这两项资料已有同方向连线，可双击修改'); return }
    act(() => request({ action: 'setRelation', projectId: projectId!, relation: { from, to, label: '', note: '' } }), '已连接；双击连线可命名或反转箭头')
  }
  async function importFiles(folder = false) {
    try {
      const paths = folder ? [await api.dialog.pickFolder('选择项目文件夹')].filter((p): p is string => !!p) : await api.dialog.pickFiles!()
      if (!paths.length) return
      setForm({ target: projectId ?? 'new', name: folder ? paths[0].split(/[\\/]/).pop() ?? '新文档库' : '新文档库', unpack: folder ? 'yes' : 'no' }); setModal({ kind: 'import', paths })
    } catch (e) { setError((e as Error).message) }
  }
  function editNode(node: ProjectNode, kind: 'node' | 'delete' | 'iteration') { setMenu(null); setModal({ kind, node }); setForm({ title: kind === 'iteration' ? `${node.title} · 下一轮` : node.title, note: node.note, categoryId: node.categoryId ?? '' }) }
  function editCategory(action: 'create' | 'rename' | 'delete', category?: ProjectCategory) { setModal({ kind: 'category', action, category }); setForm({ name: category?.name ?? '' }); setError('') }
  function editRelation(edge: ProjectRelation, x = window.innerWidth / 2 - 180, y = 100) { setError(''); setMenu(null); setEdgePreview(null); setEdgeContext({ edge, x, y }) }
  async function changeLocation() {
    const parent = await api.dialog.pickFolder('选择文档库新的保存文件夹')
    if (parent) { setError(''); setModal({ kind: 'relocate', parent }) }
  }
  async function exportNode(node: ProjectNode) {
    const destination = await api.dialog.savePath(node.kind === 'folder' ? '导出整个文件夹到新位置' : '导出文件副本', node.name)
    if (destination) await request({ action: 'export', projectId: projectId!, nodeId: node.id, destination })
  }
  async function submit() {
    if (!modal) return
    await run(async () => {
      if (modal.kind === 'import') {
        const target = form.target === 'new' ? (await request<ProjectLibrary>({ action: 'create', name: form.name })).id : form.target
        await request({ action: 'import', projectId: target, paths: modal.paths, unpackFolder: form.unpack === 'yes', parentId: target === projectId ? parentId : null }); enter(target)
      } else if (modal.kind === 'node') await request({ action: 'updateNode', projectId: projectId!, nodeId: modal.node.id, title: form.title, note: form.note, categoryId: form.categoryId })
      else if (modal.kind === 'category') {
        if (modal.action === 'delete') await request({ action: 'deleteCategory', projectId: projectId!, categoryId: modal.category!.id })
        else await request({ action: 'setCategory', projectId: projectId!, category: { id: modal.category?.id, name: form.name } })
      }
      else if (modal.kind === 'delete') await request({ action: 'deleteNode', projectId: projectId!, nodeId: modal.node.id })
      else if (modal.kind === 'iteration') {
        const result = await request<ProjectImportResult>({ action: 'recordIteration', projectId: projectId!, nodeId: modal.node.id, title: form.title, requestId: crypto.randomUUID() }); setSelectedId(result.nodeIds[0])
      } else if (modal.kind === 'relocate') {
        const relocated = await api.repo.relocate(modal.parent)
        client.clear(); setProjectId(null); setParentId(null); setSelectedId(null); setRepo(relocated.repoRoot, relocated.repoName); setRightPanel('preview')
      }
      setModal(null)
    }, '已保存')
  }
  return <div className="wordgit-workspace wg-project-workspace">
    <header className="wg-menubar"><div className="wg-brand"><img src={brandIcon} alt=""/><strong>稿喵</strong></div>{modePicker}<FileMenu busy={busy} onError={setError} onNotice={setNotice}><button disabled={busy || !!parent?.snapshot} onClick={() => void importFiles(false)}>批量导入文件…</button><button disabled={busy || !!parent?.snapshot} onClick={() => void importFiles(true)}>导入文件夹…</button><hr/><button disabled={busy} onClick={() => void changeLocation().catch(e => setError((e as Error).message))}>更改保存位置…</button><hr/><button onClick={() => setRightPanel('settings')}>备份与保存设置</button></FileMenu><FeaturesMenu/><button className="wg-menubutton" onClick={() => setMcpOpen(true)}>接入 Agent</button><div className="wg-menu-spacer"/><div className="wg-theme-label"><span>主题</span><ThemePicker/></div><span className="wg-local">本地项目资料</span><button className="wg-menubutton wg-help-trigger" onClick={() => setHelpOpen(true)}>使用帮助</button></header>
    <div className="wg-projectbar"><div><FolderOpen size={19}/><span>{detail?.name ?? '项目文档库'}</span><small>{detail ? `${detail.nodes.filter(n => !n.parentId).length} 项资料 · ${detail.relations.length} 条关系` : '文件、文件夹与每一轮迭代'}</small></div><div className="wg-project-actions"><button className="wg-button" disabled={busy || !!parent?.snapshot} title={parent?.snapshot ? "历史文件夹快照，请返回当前层导入" : undefined} onClick={() => void importFiles(false)}><Import size={15}/> 批量导入文件</button><button className="wg-button primary" disabled={busy || !!parent?.snapshot} title={parent?.snapshot ? "历史文件夹快照，请返回当前层导入" : undefined} onClick={() => void importFiles(true)}><Folder size={15}/> 导入文件夹</button></div></div>
    <div className="wg-viewbar"><nav aria-label="项目视图">{detail && <><button className={view === 'grid' ? 'active' : ''} aria-pressed={view === 'grid'} onClick={() => { setView('grid'); setRightPanel('preview') } }><Grid2X2 size={16}/> 文件浏览</button><button className={view === 'graph' ? 'active' : ''} aria-pressed={view === 'graph'} onClick={() => { setView('graph'); setRightPanel('preview') } }><GitBranch size={16}/> 文件关系图</button><button className={view === 'board' ? 'active' : ''} aria-pressed={view === 'board'} onClick={() => { setView('board'); setRightPanel('preview') } }><Columns3 size={16}/> 分类看板</button></>}</nav><div className="wg-view-context">{parent ? filePath(detail!, parent) : detail ? '文档库根目录' : '把相关资料收进一个文档库'}</div></div>
    <div className="wg-context-toolbar wg-project-toolbar">
      {detail ? <><button className="wg-button subtle" onClick={() => parent ? setParentId(parent.parentId) : setProjectId(null)}><ArrowLeft size={15}/> {parent ? '返回上一级' : '全部文档库'}</button><span className="wg-project-breadcrumb">{parent ? parent.title : detail.name}</span></> : <span>我的文档库</span>}
      <label className="wg-search"><input aria-label="查找项目资料" placeholder={detail ? '查找当前层资料…' : '查找文档库…'} value={search} onChange={e => setSearch(e.target.value)}/></label>
      {detail && <div className="wg-project-type-picker" ref={typesPicker}><button className="wg-button" aria-label="筛选项目文件类型" aria-expanded={typesOpen} onClick={() => setTypesOpen(!typesOpen)}>{types.length ? `${types.length} 种文件类型` : '所有文件类型'}</button>{typesOpen && <div role="group" aria-label="项目文件类型" className="wg-project-type-options"><button className="wg-button" onClick={() => setTypes([])}>显示全部</button>{Object.entries(typeLabels).map(([value, label]) => <label key={value}><input type="checkbox" checked={types.includes(value)} onChange={e => setTypes(current => e.target.checked ? [...current, value] : current.filter(t => t !== value))}/>{label}</label>)}</div>}</div>}<div className="wg-menu-spacer"/>
      {detail && <><button className={`wg-button ${connection ? 'primary' : ''}`} onClick={() => setConnection(connection ? null : 'choose')}><Link2 size={15}/> {connection ? '取消连接' : '连接资料'}</button><button className="wg-button" disabled={busy} onClick={() => act(async () => { const r = await request<{ added: number; updated: number; removed: number }>({ action: 'refresh', projectId: projectId! }); setNotice(`刷新完成：新增 ${r.added}，更新 ${r.updated}，移除 ${r.removed}`) })}><RefreshCw size={15}/> 刷新</button></>}
    </div>
    {(error || libraries.error) && <div role="alert" className="wg-project-alert">{error || libraries.error?.message}<button onClick={() => setError('')}>关闭</button></div>}
    {connection && <div role="status" className="wg-project-connect">{connection === 'choose' ? '点击第一个文件或文件夹，再点击关系目标。' : '起点已选择，请点击第二项资料。'} 可按 Esc 或“取消连接”退出。</div>}
    {rightPanel === 'settings' ? <div className="wg-settings"><button className="wg-button" onClick={() => setRightPanel('preview')}><ArrowLeft size={14}/> 返回项目</button><SettingsPage/></div> : <main className="wg-project-main">
      {!detail ? <><aside className="wg-nav"><strong>文档库</strong><button className="active"><Folder size={17}/> 全部项目 <span>{libraries.data?.length ?? 0}</span></button><SidebarCat/></aside><section className="wg-project-library-list"><header><h2>每个项目，一个资料库。</h2><p>批量导入文件，或把整个项目文件夹带进来。每次进入只展示一层。</p></header><div className="wg-document-grid" role="list" aria-label="项目文档库">{libraries.data?.filter(p => p.name.toLowerCase().includes(search.toLowerCase())).map(p => <button key={p.id} role="listitem" className="wg-document-card" aria-label={`文档库 ${p.name}`} onClick={() => enter(p.id)}><div className="wg-document-card-heading"><span className="wg-document-type"><FolderOpen size={28}/><small>文档库</small></span><div><strong>{p.name}</strong><small>文件与文件夹 · 关系整理</small></div></div><p>{p.nodes.filter(n => !n.parentId).length} 项资料 <span>·</span> {p.relations.length} 条关系</p><footer><time>{new Date(p.createdAt).toLocaleDateString('zh-CN')}</time><span className="wg-document-state">本地保存</span></footer></button>)}</div>{!libraries.isLoading && !libraries.data?.length && <div className="wg-empty"><FolderOpen size={40}/><h3>从一组资料开始</h3><p>可以导入论文、脚本、演示与迭代文件夹。</p><button className="wg-button primary" onClick={() => void importFiles(true)}>导入我的项目文件夹</button></div>}</section></> : <>
        <section className="wg-project-content">{view === 'graph' ? <ProjectGraph key={projectId + ":" + (parentId ?? "root")} focusRequest={focusRequest} nodes={nodes} categories={detail.categories ?? []} relations={detail.relations} selectedId={selectedId} onSelect={select} onOpen={openNode} onContext={(node, x, y) => { setSelectedId(node.id); setMenu({ node, x: Math.min(x, window.innerWidth - 245), y: Math.min(y, window.innerHeight - 340) }) }} onMove={async (nodeId, position) => { await run(() => request({ action: 'updateNode', projectId: projectId!, nodeId, position })) }} onRelation={editRelation} onConnect={connect} onEdgeContext={editRelation} edgePreview={edgeContext && edgePreview ? { id: edgeContext.edge.id, draft: edgePreview } : null}/> : view === 'board' ? <ProjectBoard categories={detail.categories ?? []} nodes={nodes} selectedId={selectedId} onSelect={select} onOpen={openNode} onMove={(nodeId, categoryId) => act(() => request({ action: 'updateNode', projectId: projectId!, nodeId, categoryId }), '分类已更新')} onCategory={editCategory} onContext={(node, x, y) => { setSelectedId(node.id); setMenu({ node, x: Math.min(x, window.innerWidth - 245), y: Math.min(y, window.innerHeight - 340) }) }}/> : <div className="wg-document-grid-scroll"><div className="wg-document-grid" role="list" aria-label="当前层项目资料">{nodes.map(node => <button key={node.id} role="listitem" className={`wg-document-card ${selectedId === node.id ? 'selected' : ''}`} aria-label={`资料 ${node.title}`} onClick={() => select(node.id)} onDoubleClick={() => openNode(node.id)} onContextMenu={e => { e.preventDefault(); setSelectedId(node.id); setMenu({ node, x: Math.min(e.clientX, window.innerWidth - 245), y: Math.min(e.clientY, window.innerHeight - 340) }) }}><div className="wg-document-card-heading"><span className="wg-document-type">{node.kind === 'folder' ? <Folder size={26}/> : <File size={26}/>}<small>{node.kind === 'folder' ? '文件夹' : node.name.split('.').pop()?.toUpperCase()}</small></span><div><strong>{node.title}</strong><small>{node.name}</small></div></div><p>{node.kind === 'folder' ? `${detail.nodes.filter(n => n.parentId === node.id).length} 个子项` : `${node.size.toLocaleString()} 字节`} <span>·</span> {node.linkTarget ? '链接入口' : node.snapshot ? '历史快照' : '当前内容'}</p><footer>{detail.categories?.find(c => c.id === node.categoryId) && <span className="wg-project-card-category">{detail.categories.find(c => c.id === node.categoryId)!.name}</span>}<time>{node.note || (node.kind === 'folder' ? '双击进入文件夹' : '点击查看详情')}</time><span className="wg-document-state">{node.snapshot ? '已记录' : '可刷新'}</span></footer></button>)}</div>{!nodes.length && <div className="wg-empty"><Folder size={38}/><h3>{search ? '没有匹配的资料' : '这一层还没有资料'}</h3><p>导入文件、文件夹，或刷新获取新增内容。</p></div>}</div>}</section>
        <div className="wg-inspector-resizer" role="separator" tabIndex={0} aria-label="调整项目详情栏宽度" aria-orientation="vertical" onPointerDown={e => { resize.current = { x: e.clientX, width }; e.currentTarget.setPointerCapture(e.pointerId) }} onPointerMove={e => { if (resize.current) { const next = Math.max(260, Math.min(window.innerWidth - 450, resize.current.width + resize.current.x - e.clientX)); setWidth(next); localStorage.setItem('dockitty-project-inspector-width', String(next)) } }} onPointerUp={e => { resize.current = null; e.currentTarget.releasePointerCapture(e.pointerId) }} onPointerCancel={() => { resize.current = null }} onKeyDown={e => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') setWidth(w => Math.max(260, Math.min(window.innerWidth - 450, w + (e.key === 'ArrowLeft' ? 20 : -20)))) }}><span/></div>
        <aside className="wg-inspector wg-project-inspector" style={{ width }}><header><strong>资料与关系详情</strong><span>只读查看</span></header>{selected ? <><h2>{selected.title}</h2><p className="wg-project-path">{filePath(detail, selected)}</p><div className="wg-project-item-actions"><button className="wg-button" disabled={selected.snapshot || !selected.sourcePath || !!selected.linkTarget} onClick={() => act(() => request({ action: 'editFile', projectId: projectId!, nodeId: selected.id }), '已打开来源文件，修改后点击刷新同步')}><Pencil size={14}/> 编辑原文件</button><button className="wg-button" onClick={() => editNode(selected, 'node')}><Pencil size={14}/> 名称与备注</button><button className="wg-button" disabled={!!selected.linkTarget} onClick={() => act(() => exportNode(selected), '已导出副本')}><Download size={14}/> 导出</button><button className="wg-button" disabled={selected.snapshot || !selected.sourcePath || !!selected.linkTarget} onClick={() => editNode(selected, 'iteration')}><Plus size={14}/> 记录下一轮</button><button className="wg-button" onClick={() => editNode(selected, 'delete')}><Trash2 size={14}/> 移除</button></div><label className="wg-project-category-field">资料分类<select aria-label="资料分类" value={selected.categoryId ?? ''} disabled={busy} onChange={e => act(() => request({ action: 'updateNode', projectId: projectId!, nodeId: selected.id, categoryId: e.target.value }), '分类已更新')}><option value="">未分类</option>{detail.categories?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label><section><h3>备注</h3><p>{selected.note || '暂无备注，可记录用途、修改内容或待办。'}</p></section><section><h3>相关资料</h3>{detail.relations.filter(e => e.from === selected.id || e.to === selected.id).map(edge => {
          const other = detail.nodes.find(n => n.id === (edge.from === selected.id ? edge.to : edge.from)); if (!other) return null
          return <div className="wg-project-relation" key={edge.id}><button onClick={() => { setTypes([]); setSearch(''); setParentId(other.parentId); setSelectedId(other.id); setFocusRequest({ id: other.id }) }}><ExternalLink size={14}/><span><strong>{edge.from === selected.id ? '→ ' : '← '}{edge.label || relationLabels[edge.kind]}</strong><small>{filePath(detail, other)}</small></span></button><button className="wg-icon-button" aria-label={`编辑关系 ${edge.label}`} onClick={() => editRelation(edge)}><Pencil size={14}/></button></div>
        })}<button className="wg-button" onClick={() => { setView('graph'); setConnection(null); setFocusRequest({ id: selected.id }); setNotice('左键选中卡片后，按住右键拖到另一张卡片上即可连接') }}><Link2 size={14}/> 添加关系</button></section>{selected.kind === 'folder' ? <button className="wg-button primary" onClick={() => openNode(selected.id)}><FolderOpen size={15}/> 进入文件夹</button> : <section className="wg-project-preview"><h3>内容预览</h3><button className="wg-button wg-preview-expand" onClick={() => { closeEdge(); setModal({ kind: 'preview', node: selected }) }}><ExternalLink size={13}/> 展开预览</button><FilePreview projectId={projectId!} node={selected} project={detail}/></section>}</> : <div className="wg-preview-empty"><File size={32}/><h3>选择一项资料</h3><p>查看内容、备注和跨文件夹关系。</p></div>}</aside>
      </>}
    </main>}<footer className="wg-statusbar"><span>{busy ? '正在处理资料…' : detail ? `${detail.name} · ${parent?.title ?? '根目录'}` : '项目管理 · 本地文档库'}</span><span>刷新更新当前内容 · 明确记录才生成迭代</span></footer>
    {notice && <div className="wg-notice" role="status"><span>{notice}</span><button onClick={() => setNotice('')}>关闭</button></div>}
    {edgeContext && detail && <EdgeEditor key={edgeContext.edge.id} x={edgeContext.x} y={edgeContext.y} label={edgeContext.edge.label} note={edgeContext.edge.note} style={edgeContext.edge.style} onClose={closeEdge} onPreview={setEdgePreview} onDelete={async () => { try { await run(() => request({ action: 'deleteRelation', projectId: projectId!, relationId: edgeContext.edge.id }), '关系已删除'); return true } catch { return false } }} onSave={async draft => { const edge = detail.relations.find(e => e.id === edgeContext.edge.id); if (!edge) return false; try { await run(() => request({ action: 'setRelation', projectId: projectId!, relation: { ...edge, from: draft.reverse ? edge.to : edge.from, to: draft.reverse ? edge.from : edge.to, label: draft.label, note: draft.note, style: draft.style } }), '连线已保存'); return true } catch { return false } }}/>}
    {menu && createPortal(<div role="menu" aria-label="项目资料操作" className="wg-cat-menu wg-project-menu" style={{ left: menu.x, top: menu.y }} onPointerDown={e => e.stopPropagation()}><strong>{menu.node.title}</strong><button role="menuitem" onClick={() => { openNode(menu.node.id); setMenu(null) }}>{menu.node.kind === 'folder' ? '进入文件夹' : '查看文件内容'}</button><button role="menuitem" onClick={() => editNode(menu.node, 'node')}>编辑名称与备注</button><button role="menuitem" disabled={menu.node.snapshot || !menu.node.sourcePath || !!menu.node.linkTarget} onClick={() => editNode(menu.node, 'iteration')}>记录下一轮迭代</button><button role="menuitem" onClick={() => { setConnection(menu.node.id); setMenu(null) }}>连接到另一项资料</button><button role="menuitem" onClick={() => { act(() => exportNode(menu.node), '已导出副本'); setMenu(null) }}>导出文件或文件夹</button><button role="menuitem" onClick={() => editNode(menu.node, 'delete')}>从管理中移除…</button></div>, document.body)}
    <Dialog open={helpOpen} onOpenChange={setHelpOpen}><DialogContent className="wg-dialog wg-wide-dialog"><DialogTitle>项目管理使用帮助</DialogTitle><DialogDescription>把一组资料、文件夹和每轮迭代收进同一文档库。</DialogDescription><div className="wg-project-help"><h3>导入与浏览</h3><p>批量导入文件或整个文件夹，选择已有文档库或新建文档库。文件夹可保留为一张卡片，也可把直接子项放入库根目录；双击文件夹逐层进入。文件类型筛选支持多选。</p><h3>编辑、刷新与历史</h3><p>“编辑原文件”会打开导入来源，修改后点击刷新。打开软件以及 MCP 写入后也会同步。刷新更新当前卡片，不生成历史；需要保存一轮时，在再次刷新之前点击“记录下一轮”，保留上次受管内容并读取当前来源形成下一轮。文件夹可以整体记录。</p><p>来源删除会同步移除当前和历史卡片及连线；来源改名按新文件导入。若想长期保留历史，可先导出副本。软件中的“移除”只删除管理卡片，不删除来源。</p><h3>资料关系</h3><p>左键选中卡片后按住右键拖到另一张卡片即可连接，源卡片不动，松到空白处取消；默认不命名。连线按卡片中心连接并位于卡片下层，箭头指向目标。双击或右键连线均打开“编辑连线”面板，可填写关系标签与备注、反转箭头以及调整箭头形状、大小、线型与粗细。面板标题栏可拖动。改变参数立即在关系图预览；保存后保留，取消、点击面板外或按 Esc 恢复原样。可按 Esc 或点击“取消连接”退出连线模式。跨文件夹关系在详情里列出，点击路径跳转到目标资料。</p><h3>撤回与重做</h3><p>文件菜单保留批量导入文件、导入文件夹、更改保存位置、备份与保存设置，并提供撤回与重做；撤回和重做提示约 2.5 秒后消失。Ctrl+Z 撤回，Ctrl+Shift+Z 或 Ctrl+Y 重做。本次启动保留最近 100 次可恢复操作，包含导入、移除、关系、样式、名称备注、分类与布局。输入框保留文字撤回；外部文件修改不回退。重启或永久删除会清空记录，外部管理数据更新会清除过期记录以保护新内容。</p><h3>分类看板</h3><p>项目内共用分类名称，看板只展示当前文件夹这一层的资料。添加分类后可拖动卡片归类，或在详情和名称编辑窗口中选择分类。重命名会同步更新图卡标签；删除分类只让资料回到未分类，文件、文件夹与关系都会保留。</p><h3>查看与 Agent</h3><p>链接入口只保留卡片与目标路径，不展开或复制目标内容；可进入普通子文件夹导出资料。Markdown 与脚本按文本查看，脚本不会执行。HTML 仅显示安全页面效果，不执行脚本或访问外部网络。办公文档复用内置预览，侧边栏“展开预览”在大窗口中只读查看当前资料或历史快照；文本可滚动，HTML继续禁止脚本与外部网络。其他格式可导出查看。点击“接入 Agent”获取 Codex、Claude Code、Cursor 和 DSH 的配置。</p></div><div className="wg-dialog-actions"><button className="wg-button primary" onClick={() => setHelpOpen(false)}>知道了</button></div></DialogContent></Dialog>
    <ProjectMcpDialog open={mcpOpen} onClose={() => setMcpOpen(false)}/>
    <Dialog open={!!modal} onOpenChange={open => { if (!open && !busy) setModal(null) }}><DialogContent className={`wg-dialog ${modal?.kind === 'preview' ? 'wg-wide-dialog' : ''}`}><DialogTitle>{modal?.kind === 'preview' ? `预览 · ${previewNode?.title ?? modal.node.title}` : modal?.kind === 'category' ? (modal.action === 'create' ? '添加项目分类' : modal.action === 'rename' ? '重命名项目分类' : '删除项目分类') : modal?.kind === 'import' ? '导入项目资料' : modal?.kind === 'relocate' ? '更改文档保存位置' : modal?.kind === 'iteration' ? '记录下一轮迭代' : modal?.kind === 'delete' ? '从文档库移除资料' : '编辑名称与备注'}</DialogTitle><DialogDescription>{modal?.kind === 'preview' ? '只读查看已导入的资料；展开预览不会修改原文件。' : modal?.kind === 'category' ? (modal.action === 'delete' ? '资料将回到未分类，保留所有文件、文件夹与连线。' : '分类在整个项目内共用，看板只展示当前层资料。') : modal?.kind === 'import' ? '选择已有文档库，或把这一组资料创建为新文档库。' : modal?.kind === 'relocate' ? '请先保存并关闭 Word / WPS 等正在编辑的文件。所有文档、版本、项目与整理信息会复制到新位置；原位置保留。' : modal?.kind === 'iteration' ? '保留当前卡片为历史，读取来源最新内容形成下一轮。刷新不会自动创建迭代。' : modal?.kind === 'delete' ? '只移除受管卡片、其子项和相关连线，不删除原文件或文件夹。' : '显示名称与备注不会改写来源文件。'}</DialogDescription>
      {modal?.kind === 'preview' ? <div className="wg-full-preview wg-project-full-preview">{detail && previewNode ? <FilePreview projectId={detail.id} node={previewNode} project={detail}/> : <p>这项资料已从文档库移除。</p>}</div> : modal?.kind === 'category' ? modal.action === 'delete' ? <p>确认删除“{modal.category?.name}”分类？所有层级中使用此分类的资料都会回到未分类。</p> : <div className="wg-form"><label className="wg-field">分类名称<input autoFocus aria-label="项目分类名称" value={form.name ?? ''} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}/></label></div> : modal?.kind === 'import' ? <div className="wg-form"><label className="wg-field">导入到<select aria-label="导入目标文档库" value={form.target} onChange={e => setForm(p => ({ ...p, target: e.target.value }))}><option value="new">新建文档库</option>{libraries.data?.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>{form.target === 'new' && <label className="wg-field">文档库名称<input aria-label="新文档库名称" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}/></label>}<label className="wg-field">文件夹导入方式<select aria-label="文件夹导入方式" value={form.unpack} onChange={e => setForm(p => ({ ...p, unpack: e.target.value }))}><option value="no">保留文件夹为一项资料（可用于整轮迭代）</option>{modal.paths.length === 1 && <option value="yes">把父文件夹的直接子项放入文档库</option>}</select></label><p>{modal.paths.length} 个导入来源</p><div className="wg-project-import-paths">{modal.paths.map(p => <div key={p} className="wg-source-row"><span>{p}</span></div>)}</div></div> : modal?.kind === 'relocate' ? <p className="wg-project-path">{modal.parent}</p> : modal?.kind === 'delete' ? <p>将移除“{modal.node.title}”{modal.node.kind === 'folder' ? '及其中所有受管子项' : ''}。</p> : <div className="wg-form"><label className="wg-field">{modal?.kind === 'iteration' ? '下一轮名称' : '显示名称'}<input aria-label="资料名称" value={form.title ?? ''} onChange={e => setForm(p => ({ ...p, title: e.target.value }))}/></label>{modal?.kind !== 'iteration' && <label className="wg-field">备注<textarea aria-label="资料备注" value={form.note ?? ''} onChange={e => setForm(p => ({ ...p, note: e.target.value }))}/></label>}{modal?.kind === 'node' && <label className="wg-field">分类<select aria-label="编辑资料分类" value={form.categoryId ?? ''} onChange={e => setForm(p => ({ ...p, categoryId: e.target.value }))}><option value="">未分类</option>{detail?.categories?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>}</div>}
      {error && <p role="alert">{error}</p>}{modal?.kind === 'preview' ? <div className="wg-dialog-actions"><button className="wg-button" onClick={() => setModal(null)}>关闭</button></div> : <div className="wg-dialog-actions"><button className="wg-button" disabled={busy} onClick={() => setModal(null)}>取消</button><button className="wg-button primary" disabled={busy} onClick={() => void submit().catch(() => {})}>{busy ? '正在保存…' : modal?.kind === 'import' ? '开始导入' : modal?.kind === 'delete' ? '确认移除' : '保存'}</button></div>}
    </DialogContent></Dialog>
  </div>
}


