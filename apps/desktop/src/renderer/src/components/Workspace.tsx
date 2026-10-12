import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Files, FolderOpen, GitBranch, Columns3, Plus, Import, Search, FileText, FileSpreadsheet, Presentation, File, Save, Pencil, Trash2, RotateCcw, Download, ArrowLeft, Settings, X, Check, Archive, Copy, GitCompare, ExternalLink } from 'lucide-react'
import { api } from '@renderer/lib/ipc'
import { useRepoStore } from '@renderer/store/repoStore'
import { useUiStore } from '@renderer/store/uiStore'
import type { LibraryVersion, LibraryMutation } from '@wordgit/shared'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from './ui/dialog'
import { VersionGraph } from './VersionGraph'
import { VersionBoard } from './VersionBoard'
import { VersionPreview } from './VersionPreview'
import { DiffView } from './DiffView'
import { SettingsPage } from './SettingsPage'
import { ThemePicker } from './ThemePicker'
import { VersionStatistics } from './VersionStatistics'
import { HelpDocument } from './HelpDocument'
import { SidebarCat } from './SidebarCat'
import '../assets/workspace.css'
import '../assets/blockframe.css'
import brandIcon from '../assets/gaomiao.png'

type View = 'overview' | 'graph' | 'board' | 'stats'
const viewLabels = { overview: '总览工作台', graph: '版本关系图', board: '分类看板', stats: '版本统计' }
const formatLabels: Record<string, string> = { all: '全部文档', docx: '文稿', xlsx: '表格与数据', pptx: '演示资料', other: '其他格式' }
type Modal = { kind: 'import' | 'new' | 'save' | 'version' | 'document' | 'category' | 'edit' | 'branch' | 'deleteBranch' | 'compare' | 'help' | 'preview' | 'relations' | 'deleteVersion' | 'note'; version?: LibraryVersion; category?: { id: string; name: string }; action?: 'create' | 'rename' }
  | { kind: 'confirm'; title: string; description: string; task: () => Promise<unknown>; success: string }

const extension = (name: string) => name.includes('.') ? name.split('.').pop()!.toLowerCase() : ''
const baseName = (name: string) => name.split(/[\\/]/).pop() ?? name
function FileIcon({ name, size = 18 }: { name: string; size?: number }) {
  const ext = extension(name)
  if (['doc', 'docx'].includes(ext)) return <FileText size={size} className="wg-word-icon" />
  if (['xls', 'xlsx', 'csv'].includes(ext)) return <FileSpreadsheet size={size} className="wg-sheet-icon" />
  if (['ppt', 'pptx'].includes(ext)) return <Presentation size={size} className="wg-slide-icon" />
  return <File size={size} />
}

export function Workspace() {
  const { repoRoot, repoName, setRepo } = useRepoStore()
  const { selectedDocName, selectDoc, rightPanel, setRightPanel } = useUiStore()
  const queryClient = useQueryClient()
  const [view, setView] = useState<View>('overview')
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [fileFilter, setFileFilter] = useState('all')
  const [branchFilter, setBranchFilter] = useState('current')
  const [showDeleted, setShowDeleted] = useState(false)
  const [layoutEpoch, setLayoutEpoch] = useState(0)
  const [historyOpen, setHistoryOpen] = useState(true)
  const [versionSearch,setVersionSearch]=useState(''),[categoryFilter,setCategoryFilter]=useState('all')
  const [compareIds, setCompareIds] = useState<string[]>([])
  const [compareMode, setCompareMode] = useState(false)
  const [connection, setConnection] = useState<{ action: 'connectPrevious' | 'connectNext'; first?: string } | null>(null)
  useEffect(() => { setConnection(null) }, [selectedDocName, view])
  useEffect(() => { if (!connection) return; const cancel = (e: KeyboardEvent) => { if (e.key === 'Escape') setConnection(null) }; window.addEventListener('keydown', cancel); return () => window.removeEventListener('keydown', cancel) }, [connection])
  const [modal, setModal] = useState<Modal | null>(null)
  const [form, setForm] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [failure, setFailure] = useState('')
  const [context, setContext] = useState<{ version: LibraryVersion; x: number; y: number } | null>(null)
  const [inspectorWidth, setInspectorWidth] = useState(() => Number(localStorage.getItem('gaomiao-inspector-width')) || 320)
  const resizing = useRef<{ x: number; width: number; userSelect: string } | null>(null)
  const resizeWidth = (width: number) => { const next = Math.max(280, Math.min(900, window.innerWidth - 480, width)); setInspectorWidth(next); localStorage.setItem('gaomiao-inspector-width', String(next)) }
  useEffect(() => { const fit = () => resizeWidth(inspectorWidth); window.addEventListener('resize', fit); return () => window.removeEventListener('resize', fit) }, [inspectorWidth])
  useEffect(() => {
    if (!context) return
    document.querySelector<HTMLButtonElement>('.wg-version-menu button:not(:disabled)')?.focus()
    const outside = (event: PointerEvent) => { if (!(event.target as HTMLElement).closest('.wg-version-menu')) setContext(null) }
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape' || event.key === 'Tab') setContext(null)
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault(); const items = [...document.querySelectorAll<HTMLButtonElement>('.wg-version-menu button:not(:disabled)')]
        const index = items.indexOf(document.activeElement as HTMLButtonElement); items[(index + (event.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus()
      }
    }
    document.addEventListener('pointerdown', outside); document.addEventListener('keydown', key)
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', key) }
  }, [context])
  const contextVersion = (version: LibraryVersion, x: number, y: number) => setContext({ version, x: Math.max(8, Math.min(x, window.innerWidth - 312)), y: Math.max(8, Math.min(y, window.innerHeight - 650)) })
  const docsKey = ['library', repoRoot]
  const detailKey = ['documentDetail', repoRoot, selectedDocName]
  const docsQuery = useQuery({ queryKey: docsKey, queryFn: () => api.library.list(), enabled: !!repoRoot, refetchInterval: 4000 })
  const detailQuery = useQuery({ queryKey: detailKey, queryFn: () => api.library.detail(selectedDocName!), enabled: !!selectedDocName, refetchInterval: 4000 })
  const docs = docsQuery.data ?? []
  const detail = detailQuery.data
  const visibleDocs = docs.filter(d => !!d.deletedAt === showDeleted && (!search || (d.title + d.docName).toLowerCase().includes(search.toLowerCase())) && (fileFilter === 'all' || fileFilter === extension(d.docName) || fileFilter === 'docx' && extension(d.docName) === 'doc' || fileFilter === 'xlsx' && ['xls', 'csv'].includes(extension(d.docName)) || fileFilter === 'pptx' && extension(d.docName) === 'ppt' || fileFilter === 'other' && !['docx', 'doc', 'xlsx', 'xls', 'csv', 'pptx', 'ppt'].includes(extension(d.docName))))
  const viewedBranch = branchFilter === 'current' ? detail?.currentBranch : branchFilter
  const matchesVersion=(v:LibraryVersion)=>(categoryFilter==='all'||v.categoryId===categoryFilter)&&(!versionSearch||(v.title+' '+v.note+' '+v.author+' '+v.id+' '+new Date(v.createdAt).toLocaleDateString('zh-CN')).toLowerCase().includes(versionSearch.toLowerCase()))
  const versions = useMemo(() => (detail?.versions ?? []).filter(v => !!v.deletedAt === showDeleted && (branchFilter === 'all' || v.branches.includes(viewedBranch ?? ''))&&matchesVersion(v)), [detail?.versions, showDeleted, branchFilter,viewedBranch,categoryFilter,versionSearch])
  const selectedVersion = detail?.versions.find(v => v.id === selectedVersionId) ?? null
  const workingVersion = detail?.versions.find(v => v.id === detail.workspace.versionId)
  useEffect(()=>{if(detail&&categoryFilter!=='all'&&categoryFilter!==''&&!detail.categories.some(c=>c.id===categoryFilter))setCategoryFilter('all')},[detail?.categories,categoryFilter])

  useEffect(() => { setSelectedVersionId(null); setCompareIds([]); setCompareMode(false); setBranchFilter('current');setCategoryFilter('all');setVersionSearch('') }, [selectedDocName, repoRoot])
  useEffect(() => { if (detail) { setSelectedVersionId(detail.branchHeads[detail.currentBranch] ?? null); setBranchFilter('current') } }, [detail?.docName, detail?.currentBranch])
  useEffect(() => {
    if (!detail) return
    if (!selectedVersionId) setSelectedVersionId(detail.versions.find(v => !v.deletedAt)?.id ?? detail.versions[0]?.id ?? null)
  }, [detail, selectedVersionId])
  useEffect(() => api.onWatcherChange(event => {
    if (event.status === 'error') setNotice('自动记录暂停：' + event.message)
    else if (event.versionId && event.docName === selectedDocName && (!event.branch || event.branch === detail?.currentBranch)) { setSelectedVersionId(event.versionId); setNotice(event.status === 'created' ? '首次保存已生成下一版本；之后保存更新这一稿' : '这份编辑稿已更新，没有增加版本节点') }
    queryClient.invalidateQueries({ queryKey: ['library', repoRoot] })
    queryClient.invalidateQueries({ queryKey: ['documentDetail', repoRoot] })
  }), [queryClient, repoRoot, selectedDocName, detail?.currentBranch])
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(''), 5500); return () => clearTimeout(timer) }, [notice])

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['library'] }),
      queryClient.invalidateQueries({ queryKey: ['documentDetail'] }),
      queryClient.invalidateQueries({ queryKey: ['versionPreview'] }),
      queryClient.invalidateQueries({ queryKey: ['diff'] }),
      queryClient.invalidateQueries({ queryKey: ['docs'] }),
      queryClient.invalidateQueries({ queryKey: ['stats'] }),
      queryClient.invalidateQueries({ queryKey: ['quarantine'] }),
    ])
  }
  async function run(task: () => Promise<unknown>, success = ''): Promise<boolean> {
    if (busy) return false
    setBusy(true); setFailure('')
    try { await task(); await refresh(); if (success) setNotice(success); return true }
    catch (error) { setFailure((error as Error).message); return false }
    finally { setBusy(false) }
  }
  const mutate = (request: LibraryMutation, success = '') => run(() => api.library.mutate(request), success)
  const changeForm = (key: string, value: string) => setForm(f => ({ ...f, [key]: value }))

  function open(kind: Modal['kind'], version?: LibraryVersion, category?: { id: string; name: string }, action?: 'create' | 'rename') {
    if (kind === 'confirm') return
    setFailure('')
    setForm({
      name: kind === 'version' ? version?.title ?? '' : kind === 'document' ? detail?.title ?? '' : kind === 'category' ? category?.name ?? '' : '',
      note: version?.note ?? '', categoryId: version?.categoryId ?? '', format: 'docx',
      mode: 'new', importMode: selectedDocName ? 'version' : 'document', docName: selectedDocName ?? '',
      source: '', branch: detail?.currentBranch ?? 'main',
    })
    if (kind === 'save') {
      let preference = 'new'
      try { preference = localStorage.getItem('wordgit-save-mode') ?? 'new' } catch { /* storage unavailable */ }
      setForm(f => ({ ...f, name: preference === 'replace' ? workingVersion?.title ?? '修订内容' : '保存修改', mode: preference }))
    }
    if (kind === 'edit' && detail && version) {
      const head = (detail.branchHeads[detail.currentBranch] === version.id ? detail.currentBranch : undefined) ?? Object.keys(detail.branchHeads).find(b => detail.branchHeads[b] === version.id && !b.startsWith('保护-'))
      setForm(f => ({ ...f, operation: head ? 'continue' : 'fork', branch: head ?? '', name: head ? '' : '改稿-' + new Date().toISOString().slice(5, 16).replace(/[:T]/g, '-') }))
    }
    if (kind === 'deleteBranch' && detail) setForm(f => ({ ...f, branch: Object.keys(detail.branchHeads).find(b => b !== detail.currentBranch) ?? '' }))
    if (kind === 'deleteVersion') setForm(f => ({ ...f, mode: 'remove', deleteSource: 'false', acknowledged: 'false' }))
    setModal({ kind, version, category, action } as Modal)
  }
  function selectVersion(id: string) {
    setSelectedVersionId(id)
    if (connection && detail) {
      if (!connection.first) { setConnection({ ...connection, first: id }); return }
      if (connection.first === id) { setNotice('请选择另一份版本'); return }
      void mutate({ type: 'relations', docName: detail.docName, versionId: connection.first, action: connection.action, targetVersionId: id }, '版本连接已保存').then(ok => { if (ok) setConnection(null) })
      return
    }
    if (compareMode) setCompareIds(ids => ids.includes(id) ? ids.filter(x => x !== id) : ids.length < 2 ? [...ids, id] : [ids[1], id])
  }
  function confirm(title: string, description: string, task: () => Promise<unknown>, success: string) { setFailure(''); setModal({ kind: 'confirm', title, description, task, success }) }

  function tidyLayout() {
    setContext(null); setConnection(null)
    if (selectedDocName) void mutate({ type: 'layout', docName: selectedDocName }, '布局已整理，版本连接、分支与分类保持不变').then(ok => { if (ok) setLayoutEpoch(value => value + 1) })
  }

  function relationAction(action: 'disconnectPrevious' | 'disconnectNext' | 'connectPrevious' | 'connectNext' | 'moveBranch', version: LibraryVersion) {
    setContext(null)
    if (action === 'connectPrevious' || action === 'connectNext') {
      setView('graph'); setBranchFilter('all'); setCompareMode(false); setConnection({ action }); return
    }
    if (action === 'disconnectPrevious' || action === 'disconnectNext') {
      confirm(action === 'disconnectPrevious' ? '断开与前版本的连接？' : '断开与后版本的连接？', '只改变连接线，不删除文件。断开后版本仍保留其分支归属，可成为独立版本。', () => api.library.mutate({ type: 'relations', docName: selectedDocName!, versionId: version.id, action }), '版本连接已断开')
    } else {
      open('relations', version)
      setForm(f => ({ ...f, relationAction: action, targetVersionId: '', branch: detail?.currentBranch ?? 'main' }))
    }
  }

  function moveVersion(id: string, categoryId: string, beforeId?: string) {
    if (!detail || !selectedDocName) return
    const ordered = detail.versions.filter(v => !v.deletedAt && v.categoryId === categoryId && v.id !== id).sort((a, b) => a.order - b.order || b.createdAt.localeCompare(a.createdAt)).map(v => v.id)
    const before = beforeId ? ordered.indexOf(beforeId) : -1
    ordered.splice(before < 0 ? ordered.length : before, 0, id)
    void mutate({ type: 'arrange', docName: selectedDocName, categoryId, versionIds: ordered }, '版本位置已保存，三个视图保持一致')
  }
  function categoryAction(action: 'create' | 'rename' | 'delete', category?: { id: string; name: string }) {
    if (!selectedDocName) return
    if (action === 'delete') confirm('删除这个分类？', `“${category!.name}”中的版本会回到未分类，文件内容和历史均保留。`, () => api.library.mutate({ type: 'category', docName: selectedDocName, action: 'delete', categoryId: category!.id }), '分类已删除，版本已回到未分类')
    else open('category', undefined, category, action)
  }
  function moveBranch(branch: string, versionId: string) {
    if (!selectedDocName) return
    const target = detail?.versions.find(v => v.id === versionId)
    confirm('调整分支的继续编辑起点', `将“${branch}”指向“${target?.title}”。原路线会保留为保护分支；当前工作区不会被覆盖。之后可以选择这条分支继续编辑。`, async () => {
      const result = await api.library.mutate({ type: 'moveBranch', docName: selectedDocName, branch, versionId })
      if (result.protectedBranch) setNotice('原路线已保留在 ' + result.protectedBranch)
    }, '分支起点已更新，原路线已保留')
  }
  async function exportSelected() {
    if (!selectedDocName || !selectedVersion) return
    const ext = extension(selectedDocName)
    const stem = selectedDocName.replace(/\.[^.]+$/, '')
    const destination = await api.dialog.savePath('导出历史副本（使用新文件名）', `${stem}-${selectedVersion.id.slice(0, 7)}${ext ? '.' + ext : ''}`)
    if (destination) await mutate({ type: 'export', docName: selectedDocName, versionId: selectedVersion.id, destination }, '历史副本已导出，当前草稿保持原样')
  }
  async function changeLocation() {
    const parent = await api.dialog.pickFolder('选择文档库新的保存文件夹')
    if (!parent) return
    confirm('更改文档保存位置', '请先保存并关闭 Word / WPS 等正在编辑的文件。所有文档、版本与分类会复制到新位置，原位置保留为副本；已有文档库不会被覆盖。', async () => {
      const result = await api.repo.relocate(parent)
      queryClient.clear(); selectDoc(null); setSelectedVersionId(null); setView('overview'); setShowDeleted(false); setRepo(result.repoRoot, result.repoName)
    }, '保存位置已更改，原文档库副本仍保留')
  }

  async function submit() {
    if (!modal) return
    const ok = await run(async () => {
      if (modal.kind === 'confirm') { await modal.task(); setNotice(modal.success); return }
      if (modal.kind === 'new') {
        const result = await api.library.mutate({ type: 'createDocument', name: form.name, format: form.format as 'docx' | 'xlsx' | 'txt' })
        selectDoc(result.docName!); setSelectedVersionId(result.versionId!); setView('overview'); setShowDeleted(false)
        try {
          await api.library.mutate({ type: 'edit', docName: result.docName! })
          setNotice('文档已创建并交给系统编辑器，保存后回到这里选择保存方式')
        } catch (error) {
          setFailure('文档已创建，但系统编辑器未能打开。可使用“打开当前工作区”重试：' + (error as Error).message)
        }
      } else if (modal.kind === 'import') {
        if (!form.source) throw new Error('请先选择要导入的文件')
        if (form.importMode === 'document') {
          const name = form.name.trim() || baseName(form.source)
          const result = await api.doc.import(form.source, name)
          selectDoc(name); setSelectedVersionId(result.commitId); setView('overview'); setShowDeleted(false)
          setNotice('新文档已加入工作台；以后同稿的旧版请选择“已有文档的版本”')
        } else {
          if (!form.docName) throw new Error('请选择版本所属的文档')
          const d = await api.library.detail(form.docName)
          const result = await api.library.mutate({ type: 'importVersion', docName: form.docName, sourcePath: form.source, message: form.name.trim() || baseName(form.source), branch: d.currentBranch })
          selectDoc(form.docName); setSelectedVersionId(result.versionId!); setShowDeleted(false)
          setNotice('版本已加入同一文档，原工作区没有被替换')
        }
      } else if (modal.kind === 'save') {
        const result = await api.library.mutate({ type: 'save', docName: selectedDocName!, message: form.name, mode: form.mode as 'new' | 'replace' })
        try { localStorage.setItem('wordgit-save-mode', form.mode) } catch { /* storage unavailable */ }
        setSelectedVersionId(result.versionId!); setNotice(result.changed ? form.mode === 'replace' ? '当前版本已覆盖，没有增加版本节点；可撤销这次替换' : '新版本已保留，旧稿仍在' : '文件内容没有变化，无需增加版本')
      } else if (modal.kind === 'note') {
        await api.library.mutate({ type: 'version', docName: selectedDocName!, versionId: modal.version!.id, note: form.note })
        setNotice('版本备注已保存')
      } else if (modal.kind === 'version') {
        await api.library.mutate({ type: 'version', docName: selectedDocName!, versionId: modal.version!.id, title: form.name, note: form.note, categoryId: form.categoryId })
        setNotice('版本名称、说明与分类已同步')
      } else if (modal.kind === 'relations') {
        const action = form.relationAction as 'connectPrevious' | 'connectNext' | 'moveBranch'
        if (action !== 'moveBranch' && !form.targetVersionId) throw new Error('请选择要连接的版本')
        await api.library.mutate({ type: 'relations', docName: selectedDocName!, versionId: modal.version!.id, action, branch: action === 'moveBranch' ? form.branch : undefined, targetVersionId: form.targetVersionId || undefined })
        setBranchFilter('all'); setNotice('分支与版本连接已更新，文件正文保持不变')
      } else if (modal.kind === 'deleteVersion') {
        if (form.mode === 'remove') await api.library.mutate({ type: 'version', docName: selectedDocName!, versionId: modal.version!.id, deleted: true })
        else {
          if (form.acknowledged !== 'true') throw new Error('请勾选永久删除确认')
          await api.library.mutate({ type: 'purgeVersion', docName: selectedDocName!, versionId: modal.version!.id, deleteSource: form.deleteSource === 'true', confirmedSourcePath: form.deleteSource === 'true' ? modal.version!.sourcePath : undefined })
          setSelectedVersionId(null)
        }
        setNotice(form.mode === 'remove' ? '版本已从管理列表移入回收区，文件保留' : '该版本和选定的文件已彻底删除')
      } else if (modal.kind === 'document') {
        await api.library.mutate({ type: 'document', docName: selectedDocName!, title: form.name })
        setNotice('文档显示名称已更新，原文件名与历史保持一致')
      } else if (modal.kind === 'category') {
        await api.library.mutate({ type: 'category', docName: selectedDocName!, action: modal.action ?? 'create', name: form.name, categoryId: modal.category?.id })
        setNotice('分类已保存')
      } else if (modal.kind === 'branch') {
        await api.branch.create(selectedDocName!, form.name, { fromCommitId: modal.version!.id })
        setNotice('新分支已建立；选择继续编辑即可打开这一路线的稿件')
      } else if (modal.kind === 'deleteBranch') {
        if (!form.branch) throw new Error('请选择非当前分支')
        await api.branch.delete(selectedDocName!, form.branch)
        setNotice('分支已进入设置页的回收区，内容仍可还原')
      } else if (modal.kind === 'edit') {
        const branch = form.operation === 'fork' ? form.name.trim() : form.branch
        if (!branch) throw new Error('请选择分支或填写新的改稿路线名称')
        await api.library.mutate({ type: 'edit', docName: selectedDocName!, versionId: modal.version!.id, branch, mode: form.operation === 'replace' ? 'replace' : 'new', title: form.operation === 'replace' ? undefined : form.title || undefined })
        setBranchFilter('current'); setNotice(form.operation === 'replace' ? '已打开独立编辑副本；保存后覆盖选中版本，可撤销' : '已打开独立新稿；首次保存自动创建下一版本，后续保存更新同一稿。导入源文件不受影响')
      }
    })
    if (ok) setModal(null)
  }

  const modalTitle = !modal ? '' : modal.kind === 'confirm' ? modal.title : ({ import: '把文件放到正确的位置', new: '新建一份受管文档', save: '保存这次修改', version: '整理版本信息', document: '修改文档显示名称', category: modal.action === 'rename' ? '重命名分类' : '添加版本分类', edit: '从这份稿件继续编辑', branch: '从此版本创建分支', deleteBranch: '删除一条分支引用', compare: '两份版本的内容比较', help: '稿喵使用帮助', preview: '展开历史文档预览', relations: '调整版本归属与连接', deleteVersion: '删除这个版本', note: '编辑版本备注' }[modal.kind])
  const modalDescription = modal?.kind === 'note' ? '记录这一稿的修改内容、投稿用途或待办事项。备注保存在版本信息中，不改变文档正文。' : modal?.kind === 'relations' ? '可以保持独立，也可以手动建立前后连接；软件会阻止循环连接。' : modal?.kind === 'deleteVersion' ? '从管理中删除可还原；彻底删除会清除该版本的文件内容，请核对路径。' : modal?.kind === 'preview' ? '只读查看历史快照；预览和展开不会修改文档。' : modal?.kind === 'help' ? '从第一份文档到多次修订：开始、编辑、整理、备份。' : modal?.kind === 'confirm' ? modal.description : modal?.kind === 'compare' ? '比较只读取历史快照，不改变当前文档。Word 正文、Excel 单元格和幻灯片文本可比较；复杂排版与修订语义不在此视图中呈现。' : modal?.kind === 'save' ? `当前编辑来源：${workingVersion?.title ?? '工作区'}。小修小改可覆盖同版本，重要变化可另存为新版本。` : modal?.kind === 'import' ? '同一份文档的旧稿和新稿，选择“已有文档的版本”，工作台就只显示一份文档。' : '操作会保存在当前仓库，三个视图共用同一份数据。'

  if (!repoRoot) return null
  return <div className="wordgit-workspace">
    <header className="wg-menubar"><div className="wg-brand"><img src={brandIcon} alt="" /><strong>稿喵</strong></div><details className="wg-menu"><summary>文件</summary><div><button onClick={() => open('new')} disabled={busy}>新建文档…</button><button onClick={() => open('import')} disabled={busy}>导入文档 / 版本…</button><hr /><button onClick={() => void changeLocation()} disabled={busy}>更改保存位置…</button><hr /><button onClick={() => setRightPanel('settings')}>备份与保存设置</button></div></details><button className="wg-menubutton" onClick={() => open('help')}>使用帮助</button><div className="wg-menu-spacer" /><div className="wg-theme-label"><span>主题</span><ThemePicker /></div><span className="wg-local">本地文档库</span></header>
    <div className="wg-projectbar"><div><FolderOpen size={18} /><span>{repoName}</span><small title={repoRoot}>{repoRoot}</small></div><div className="wg-project-actions"><button className="wg-button" onClick={() => open('new')} disabled={busy}><Plus size={15} /> 新建文档</button><button className="wg-button primary" onClick={() => open('import')} disabled={busy}><Import size={15} /> 导入文档 / 版本</button><button className="wg-icon-button" aria-pressed={rightPanel === 'settings'} aria-label="保存与备份设置" onClick={() => setRightPanel('settings')}><Settings size={17} /></button></div></div>
    <div className="wg-viewbar"><nav aria-label="工作台视图"><button aria-pressed={view === 'overview' && rightPanel !== 'settings'} className={view === 'overview' && rightPanel !== 'settings' ? 'active' : ''} onClick={() => { setView('overview'); setRightPanel('preview') }}><Files size={16} /> 总览工作台</button><button aria-pressed={view === 'graph' && rightPanel !== 'settings'} className={view === 'graph' && rightPanel !== 'settings' ? 'active' : ''} onClick={() => { setView('graph'); setRightPanel('preview') }}><GitBranch size={16} /> 版本关系图</button><button aria-pressed={view === 'board' && rightPanel !== 'settings'} className={view === 'board' && rightPanel !== 'settings' ? 'active' : ''} onClick={() => { setView('board'); setRightPanel('preview') }}><Columns3 size={16} /> 分类看板</button><button aria-pressed={view === 'stats' && rightPanel !== 'settings'} className={view === 'stats' && rightPanel !== 'settings' ? 'active' : ''} onClick={() => { setView('stats'); setRightPanel('preview') }}><GitCompare size={16} /> 版本统计</button></nav><div className="wg-view-context">{detail ? <><FileIcon name={detail.docName} /><span>{detail.title}</span><small>{detail.versions.filter(v => !v.deletedAt).length} 个版本</small></> : <span>先从工作台选中一份文档</span>}</div></div>
    {(failure || docsQuery.error || detailQuery.error) && <div className="wg-error" role="alert"><span>{failure || (docsQuery.error as Error)?.message || (detailQuery.error as Error)?.message}</span><button onClick={() => { setFailure(''); void refresh() }}>重试 / 刷新</button></div>}
    {rightPanel === 'settings' ? <div className="wg-settings"><button className="wg-button" onClick={() => setRightPanel('preview')}><ArrowLeft size={14} /> 返回工作台</button><SettingsPage /></div> : <>
      {connection && <div className="wg-connect-banner" role="status"><strong>{connection.first ? '② 点击要连接的' + (connection.action === 'connectPrevious' ? '前版本' : '后版本') : '① 点击需要调整连接的版本'}</strong><span>{connection.first ? detail?.versions.find(v => v.id === connection.first)?.title : '依次左键点击两个版本卡片 · Esc 可取消'}</span><button className="wg-button" onClick={() => setConnection(null)}>取消连接</button></div>}
      <div className="wg-context-toolbar" style={view === 'stats' ? { display: 'none' } : undefined}>{view === 'overview' ? <><label className="wg-search"><Search size={15} /><input placeholder="查找文档名称…" aria-label="查找文档" value={search} onChange={e => setSearch(e.target.value)} /></label><select aria-label="文件类型" value={fileFilter} onChange={e => setFileFilter(e.target.value)}><option value="all">所有格式</option><option value="docx">Word 文稿</option><option value="xlsx">Excel 表格</option><option value="pptx">PowerPoint</option><option value="other">其他格式</option></select></> : <><button className="wg-button subtle" onClick={() => setView('overview')}><ArrowLeft size={14} /> 返回总览</button>{detail && <select aria-label="查看分支" value={branchFilter} onChange={e => setBranchFilter(e.target.value)}><option value="current">当前分支 · {detail?.currentBranch}</option><option value="all">全部分支的版本</option>{Object.keys(detail?.branchHeads ?? {}).map(branch => <option key={branch} value={branch}>{branch}</option>)}</select>}</>}
        {detail&&<details className="wg-version-filters"><summary><Search size={14}/> 查找版本{versionSearch||categoryFilter!=='all'?' · 已筛选':''}</summary><div><label>名称、说明、作者或日期<input aria-label="查找版本" placeholder="例如：导师意见、2026/10/11…" value={versionSearch} onChange={e=>setVersionSearch(e.target.value)}/></label><label>分类<select aria-label="筛选版本分类" value={categoryFilter} onChange={e=>setCategoryFilter(e.target.value)}><option value="all">全部分类</option><option value="">未分类</option>{detail.categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><button className="wg-button subtle" onClick={()=>{setVersionSearch('');setCategoryFilter('all')}}>清除筛选</button></div></details>}<div className="wg-toolbar-spacer" /><button aria-pressed={showDeleted} className={`wg-button subtle ${showDeleted ? 'is-active' : ''}`} onClick={() => { setShowDeleted(s => !s); setCompareIds([]) }}><Archive size={14} /> {showDeleted ? '返回正常内容' : '回收内容'}</button>{detail && <button className="wg-button" disabled={busy || !!detail.deletedAt} onClick={() => detail.draft && !detail.workspace.dirty ? void mutate({ type: 'save', docName: detail.docName, mode: 'new', message: detail.draft.title }, '独立编辑副本已同步；后续保存更新同一稿') : open('save')}><Save size={14} /> {detail.draft && !detail.workspace.dirty ? '同步编辑副本' : '保存工作区'}</button>}
      </div>
      <div className={`wg-main-area ${view === 'overview' ? 'overview' : view === 'stats' ? 'statistics' : ''}`}>
        <AnimatePresence mode="wait" initial={false}><motion.div key={view} className="wg-main-view" initial={{ opacity: 0, y: 7 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} transition={{ duration: .2 }}>
          {view === 'stats' && detail ? <VersionStatistics key={detail.docName} detail={detail} onSelect={selectVersion} onOpenVersion={id=>{setSelectedVersionId(id);setView('overview');setHistoryOpen(true)}} onCompare={(a,b)=>{setCompareIds([a,b]);open('compare')}} /> : view === 'overview' ? <div className="wg-overview"><aside className="wg-nav"><h2>文档</h2><button aria-pressed={fileFilter === 'all'} className={fileFilter === 'all' ? 'active' : ''} onClick={() => setFileFilter('all')}><Files size={16} /> 全部文档 <small>{docs.filter(d => !d.deletedAt).length}</small></button><button aria-pressed={fileFilter === 'docx'} className={fileFilter === 'docx' ? 'active' : ''} onClick={() => setFileFilter('docx')}><FileText size={16} /> 文稿</button><button aria-pressed={fileFilter === 'xlsx'} className={fileFilter === 'xlsx' ? 'active' : ''} onClick={() => setFileFilter('xlsx')}><FileSpreadsheet size={16} /> 表格与数据</button><button aria-pressed={fileFilter === 'pptx'} className={fileFilter === 'pptx' ? 'active' : ''} onClick={() => setFileFilter('pptx')}><Presentation size={16} /> 演示资料</button><SidebarCat /></aside><div className="wg-file-center"><div className="wg-files-heading"><strong>{showDeleted ? '文档回收区' : formatLabels[fileFilter]}</strong><small>{visibleDocs.length} 份文档 · 每稿仅一条</small></div>
            <div className="wg-document-grid-scroll"><div className="wg-document-grid" role="list" aria-label="受管文档">{visibleDocs.map(doc => <button key={doc.docName} role="listitem" aria-label={`文档 ${doc.title}`} aria-current={doc.docName === selectedDocName ? 'true' : undefined} className={`wg-document-card ${doc.docName === selectedDocName ? 'selected' : ''}`} onClick={() => selectDoc(doc.docName)} onDoubleClick={() => { selectDoc(doc.docName); setView('graph') }}><div className="wg-document-card-heading"><span className="wg-document-type"><FileIcon name={doc.docName} size={25}/><small>{extension(doc.docName).toUpperCase()}</small></span><div><strong>{doc.title}</strong><small title={doc.docName}>{doc.docName}</small></div></div><p>{doc.versionCount} 个版本 <span>·</span> {doc.currentBranch}</p><footer><time>最近记录：{doc.lastModified ? new Date(doc.lastModified).toLocaleDateString('zh-CN') : '—'}</time><span className={`wg-document-state ${doc.dirty ? 'dirty' : ''}`}>{doc.deletedAt ? '已回收' : doc.dirty ? '有修改' : '已记录'}</span></footer></button>)}</div>              {!visibleDocs.length && <div className="wg-empty"><Files size={35} /><h3>{search ? '没有匹配的文档' : showDeleted ? '文档回收区为空' : fileFilter !== 'all' ? `暂无${formatLabels[fileFilter]}` : '从第一份文档开始'}</h3><p>{search ? '换一个关键词或文件类型试试。' : '可导入现有稿件，也可创建 Word、Excel 或文本文件。'}</p>{!showDeleted && !search && <button className="wg-button primary" onClick={() => open('import')}>导入我的文档</button>}</div>}
            </div>
            {detail && <section className={`wg-history-drawer ${historyOpen ? '' : 'collapsed'}`}><header><strong>{detail.title} / {branchFilter === 'all' ? '全部分支版本' : `${viewedBranch} 分支版本`}</strong><button aria-expanded={historyOpen} onClick={() => setHistoryOpen(v => !v)}>{historyOpen ? '收起 −' : '展开 ＋'}</button></header>{historyOpen && <div className="wg-history-rows">{versions.map(version => <button key={version.id} className={version.id === selectedVersionId ? 'selected' : ''} onClick={() => selectVersion(version.id)} onContextMenu={e => { e.preventDefault(); selectVersion(version.id); contextVersion(version, e.clientX, e.clientY) }}><span className="wg-history-number">{version.id.slice(0, 7)}</span><strong>{version.title}</strong><small>{version.branches.filter(b => !b.startsWith('保护-')).join(' / ') || '保护记录'}</small><time>{new Date(version.createdAt).toLocaleDateString('zh-CN')}</time></button>)}{!versions.length && <p className="wg-muted">此筛选下没有版本。</p>}</div>}</section>}
          </div></div> : detail ? view === 'graph' ? <VersionGraph key={detail.docName} detail={detail} versions={detail.versions.filter(v => (!!v.deletedAt === showDeleted) && (branchFilter === 'all' || v.branches.includes(viewedBranch ?? ''))&&matchesVersion(v))} selectedId={selectedVersionId} compareIds={compareIds} connecting={!!connection} layoutEpoch={layoutEpoch} onArrange={tidyLayout} onSelect={selectVersion} onContext={contextVersion} onPosition={async (id, position) => { try { await api.library.mutate({ type: 'version', docName: detail.docName, versionId: id, position }); await queryClient.invalidateQueries({ queryKey: ['documentDetail', repoRoot, detail.docName] }); return true } catch (error) { setFailure((error as Error).message); return false } }} onMoveBranch={moveBranch} /> : <VersionBoard detail={detail} versions={versions} selectedId={selectedVersionId} compareIds={compareIds} onSelect={selectVersion} onMove={moveVersion} onCategory={categoryAction} onContext={contextVersion} /> : <section className="wg-view-entry" aria-label={`${viewLabels[view]}文档选择`}><header><span className="wg-entry-icon">{view === 'graph' ? <GitBranch size={32}/> : view === 'board' ? <Columns3 size={32}/> : <GitCompare size={32}/>}</span><div><h1>{viewLabels[view]}</h1><p>{view === 'graph' ? '沿分支追踪每一稿的来路，查看节点、比较版本或继续编辑。' : view === 'board' ? '用分类整理草稿、审阅稿和定稿，拖动版本卡片安排顺序。' : '选择文档与分支，查看字数趋势、结构变化和保存活动。'}</p></div></header><div className="wg-entry-selection"><h2>选择要查看的文档</h2>{docs.filter(d=>!d.deletedAt).length ? <div className="wg-entry-docs">{docs.filter(d=>!d.deletedAt).map(d=><button key={d.docName} onClick={()=>selectDoc(d.docName)}><FileIcon name={d.docName}/><strong>{d.title}</strong><small>{d.versionCount} 个版本 →</small></button>)}</div> : <><p>文档库暂时为空。导入或新建文档后，即可在这里{view === 'graph' ? '查看真实版本关系' : view === 'board' ? '整理版本分类' : '分析真实版本数据'}。</p><div className="wg-entry-actions"><button className="wg-button primary" onClick={()=>open('import')}><Import size={16}/> 导入文档</button><button className="wg-button" onClick={()=>open('new')}><Plus size={16}/> 新建文档</button></div></>}</div></section>}
        </motion.div></AnimatePresence>
        <div className="wg-inspector-resizer" role="separator" aria-label="调整详情栏宽度" aria-orientation="vertical" aria-valuemin={280} aria-valuemax={Math.min(900, window.innerWidth - 480)} aria-valuenow={Math.round(inspectorWidth)} tabIndex={0} onPointerDown={e => { if (e.button !== 0) return; resizing.current = { x: e.clientX, width: inspectorWidth, userSelect: document.body.style.userSelect }; document.body.style.userSelect = 'none'; e.currentTarget.setPointerCapture(e.pointerId) }} onPointerMove={e => { if (resizing.current) resizeWidth(resizing.current.width + resizing.current.x - e.clientX) }} onLostPointerCapture={() => { if (resizing.current) document.body.style.userSelect = resizing.current.userSelect; resizing.current = null }} onPointerUp={e => e.currentTarget.releasePointerCapture(e.pointerId)} onKeyDown={e => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); resizeWidth(inspectorWidth + (e.key === 'ArrowLeft' ? 20 : -20)) } }}><span/></div><aside className="wg-inspector" style={{ width: inspectorWidth }}><header><strong>{detail ? '文稿与版本详情' : '快速查看'}</strong><span>只读预览</span></header>{detail ? <>
          <div className="wg-document-info"><div><FileIcon name={detail.docName} size={21} /><h2>{detail.title}</h2></div><p>{detail.docName} · 当前分支 <strong>{detail.currentBranch}</strong></p><div className="wg-small-actions"><button disabled={busy} onClick={() => open('document')}><Pencil size={12} /> 改名称</button>{detail.deletedAt ? <button disabled={busy} onClick={() => void mutate({ type: 'document', docName: detail.docName, deleted: false }, '文档已还原')}><RotateCcw size={12} /> 还原文档</button> : <button disabled={busy} onClick={() => confirm('把文档移到回收区？', '所有版本、分支和工作区文件都会保留，可随时还原。', () => api.library.mutate({ type: 'document', docName: detail.docName, deleted: true }), '文档已移至回收区')}><Trash2 size={12} /> 回收文档</button>}</div></div>
          <div className="wg-workspace-status"><span className={detail.workspace.dirty ? 'dirty-dot' : 'clean-dot'} /><div><strong>{detail.workspace.dirty ? '工作区有尚未记录的修改' : detail.workspace.exists ? '工作区内容已记录' : '工作区文件缺失'}</strong><small>来源：{workingVersion?.title ?? '未确定'}{workingVersion?.deletedAt ? '（已回收）' : ''}</small>{detail.draft && <small title={detail.draft.path}>独立编辑副本：{detail.draft.path.split('/').pop()} · {detail.draft.versionId ? '保存更新同一稿' : '首次修改保存后创建下一版'}</small>}</div><button aria-label="打开当前工作区" title="直接用系统程序编辑当前文件" disabled={busy || !!detail.deletedAt} onClick={() => void mutate({ type: 'edit', docName: detail.docName }, '已打开独立编辑副本；保存后自动记录，导入源文件不受影响')}><ExternalLink size={15} /></button></div>
          <div className="wg-branch-control"><label>当前分支<select aria-label="切换编辑分支" value={detail.currentBranch} disabled={busy || !!detail.deletedAt} onChange={e => { const branch = e.target.value; confirm('切换编辑路线', '有变化的当前稿会先自动保存一个保护版本，再切到所选路线。', () => api.branch.switch(detail.docName, branch), '已切换路线，未提交内容已保护') }}>
            {Object.keys(detail.branchHeads).map(branch => <option key={branch} value={branch}>{branch}</option>)}
          </select></label><button className="wg-icon-button" aria-label="删除非当前分支" disabled={busy || Object.keys(detail.branchHeads).length < 2} onClick={() => open('deleteBranch')}><Trash2 size={13} /></button></div>
          <div className="wg-compare-controls"><button aria-pressed={compareMode} className={`wg-button subtle ${compareMode ? 'is-active' : ''}`} onClick={() => { setCompareMode(v => !v); setCompareIds([]) }}><GitCompare size={14} /> {compareMode ? `选择中 ${compareIds.length}/2` : '选择两版比较'}</button><button disabled={compareIds.length !== 2} className="wg-button" onClick={() => open('compare')}>开始对比</button></div>
          {selectedVersion ? <><div className="wg-selected-version"><span>{selectedVersion.id.slice(0, 7)}{selectedVersion.deletedAt ? ' / 回收版本' : ''}</span><h3>{selectedVersion.title}</h3><section className="wg-version-remark" aria-label="版本备注"><header><strong>版本备注</strong><button className="wg-button subtle" disabled={busy} onClick={() => open('note', selectedVersion)}><Pencil size={12}/> 编辑</button></header>{selectedVersion.note.length > 180 ? <details className="wg-version-note"><summary>展开备注与导入来源</summary><p>{selectedVersion.note}</p></details> : <p>{selectedVersion.note || '暂无备注，可记录修改内容或投稿用途。'}</p>}</section><small>{new Date(selectedVersion.createdAt).toLocaleString('zh-CN')} · {selectedVersion.author}</small></div><button className="wg-button wg-preview-expand" onClick={() => open('preview', selectedVersion)}><ExternalLink size={13}/> 展开预览</button><div className="wg-preview-pane"><VersionPreview key={selectedVersion.contentId} repoRoot={repoRoot} docName={detail.docName} versionId={selectedVersion.id} contentId={selectedVersion.contentId} /></div>
            <div className="wg-version-actions"><button className="wg-button primary" disabled={busy || !!selectedVersion.deletedAt || !!detail.deletedAt} onClick={() => open('edit', selectedVersion)}><Pencil size={14} /> 从此稿继续编辑</button><button className="wg-button" disabled={busy} onClick={() => open('version', selectedVersion)}>名称 / 说明 / 分类</button><button className="wg-button" disabled={busy} onClick={() => open('branch', selectedVersion)}><GitBranch size={14} /> 建分支</button><button className="wg-button" disabled={busy} onClick={() => void exportSelected()}><Download size={14} /> 导出副本</button><button className="wg-button" disabled={busy} onClick={() => void mutate({ type: 'openCopy', docName: detail.docName, versionId: selectedVersion.id }, '已用系统应用打开历史副本')}><Copy size={14} /> 打开历史副本</button><button className="wg-button" disabled={busy || !!selectedVersion.deletedAt} onClick={() => confirm('恢复此稿到工作区', '会先自动保护工作区的修改，再恢复所选内容。历史不会被删除。', () => api.commit.checkout(detail.docName, { commitId: selectedVersion.id }), '历史内容已恢复到工作区')}><RotateCcw size={14} /> 恢复工作区</button>{selectedVersion.revisionCount > 0 && <button className="wg-button" disabled={busy} onClick={() => confirm('撤销最近一次覆盖', '版本恢复到上一次覆盖前的内容。现有工作区文件不自动替换，可继续编辑或另存。', () => api.library.mutate({ type: 'undoReplacement', docName: detail.docName, versionId: selectedVersion.id }), '最近一次替换已撤销')}><RotateCcw size={14} /> 撤销覆盖</button>}{selectedVersion.deletedAt ? <button className="wg-button" disabled={busy} onClick={() => void mutate({ type: 'version', docName: detail.docName, versionId: selectedVersion.id, deleted: false }, '版本已还原')}><RotateCcw size={14} /> 还原此版本</button> : <button className="wg-button danger" disabled={busy} onClick={() => confirm('回收此版本？', '该稿会从正常列表和看板隐藏，内容保留。关系图保留祖先标记，以免历史来源断裂。', () => api.library.mutate({ type: 'version', docName: detail.docName, versionId: selectedVersion.id, deleted: true }), '版本已回收，可从回收内容还原')}><Trash2 size={14} /> 回收版本</button>}</div></> : <div className="wg-preview-empty">选择一份版本以预览和操作。</div>}
        </> : <div className="wg-empty"><FileText size={32} /><h3>选一份文档</h3><p>所有格式都能保存版本。选中文档后，关系图、看板和预览会共用这份文档的数据。</p></div>}</aside>
      </div>
    </>}
    <footer className="wg-statusbar"><span>{busy ? '正在保存操作…' : detail ? `${detail.title} · ${view === 'overview' ? '总览' : view === 'graph' ? '版本关系图' : view === 'stats' ? '版本统计' : '分类看板'} · 工作区${detail.workspace.dirty ? '有修改' : '已记录'}` : '导入文件，开始保留每一次修改'}</span><span>文件由 Word / WPS / Excel 编辑 · 历史预览只读</span></footer>
    <AnimatePresence>{notice && <motion.div className="wg-notice" role="status" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}><Check size={16} /><span>{notice}</span><button aria-label="关闭提示" onClick={() => setNotice('')}><X size={14} /></button></motion.div>}</AnimatePresence>
    {context && createPortal(<div className="wg-version-menu" role="menu" aria-label="版本操作" style={{ left: context.x, top: context.y }}><strong>{context.version.title}</strong>
      <button role="menuitem" disabled={busy || !!context.version.deletedAt || !Object.values(detail?.branchHeads ?? {}).includes(context.version.id)} onClick={() => { open('edit', context.version); setForm(f => ({ ...f, operation: 'continue' })); setContext(null) }}>沿现有分支创建下一稿</button>
      <button role="menuitem" disabled={busy || !!context.version.deletedAt} onClick={() => { open('edit', context.version); setForm(f => ({ ...f, operation: 'fork', name: '新分支-' + Date.now().toString().slice(-6) })); setContext(null) }}>从此版本新建分支并编辑</button>
      <button role="menuitem" disabled={busy || !!context.version.deletedAt || !Object.values(detail?.branchHeads ?? {}).includes(context.version.id)} onClick={() => { open('edit', context.version); setForm(f => ({ ...f, operation: 'replace' })); setContext(null) }}>修改选中版本，不增加节点</button><hr/>
      <button role="menuitem" onClick={() => { open('preview', context.version); setContext(null) }}>展开只读预览</button><button role="menuitem" onClick={() => { open('version', context.version); setContext(null) }}>名称 / 说明 / 分类</button><button role="menuitem" disabled={busy} onClick={() => { open('note', context.version); setContext(null) }}>编辑备注</button><button role="menuitem" onClick={() => { void exportSelected(); setContext(null) }}>导出副本</button>
      {!context.version.deletedAt && <><hr/><button role="menuitem" disabled={busy} onClick={() => relationAction('moveBranch', context.version)}>修改分支归属</button><button role="menuitem" disabled={busy || !context.version.parents.length} onClick={() => relationAction('disconnectPrevious', context.version)}>断开与前版本的连接</button><button role="menuitem" disabled={busy || !detail?.versions.some(v => v.parents.includes(context.version.id))} onClick={() => relationAction('disconnectNext', context.version)}>断开与后版本的连接</button><button role="menuitem" disabled={busy} onClick={() => relationAction('connectPrevious', context.version)}>手动连接到前版本</button><button role="menuitem" disabled={busy} onClick={() => relationAction('connectNext', context.version)}>手动连接到后版本</button></>}
      {view === 'graph' && <><hr/><button role="menuitem" disabled={busy} onClick={tidyLayout}>整理布局</button></>}
      <hr/><button role="menuitem" className="danger" disabled={busy} onClick={() => { open('deleteVersion', context.version); setContext(null) }}>删除版本…</button>
    </div>, document.body)}
    <Dialog open={!!modal} onOpenChange={isOpen => { if (!isOpen && !busy) setModal(null) }}><DialogContent className={`wg-dialog ${['compare', 'help', 'preview'].includes(modal?.kind ?? '') ? 'wg-wide-dialog' : ''}`}><DialogTitle>{modalTitle}</DialogTitle><DialogDescription>{modalDescription}</DialogDescription>
      {failure && <p className="wg-dialog-error" role="alert">{failure}</p>}
      {modal?.kind === 'compare' ? <div className="wg-comparison"><div className="wg-comparison-head"><span>{detail?.versions.find(v => v.id === compareIds[0])?.title}</span><span>→</span><span>{detail?.versions.find(v => v.id === compareIds[1])?.title}</span></div>{selectedDocName && compareIds.length === 2 && <DiffView docName={selectedDocName} commitIdA={compareIds[0]} commitIdB={compareIds[1]} />}</div> : modal?.kind === 'preview' && detail && modal.version ? <div className="wg-full-preview"><VersionPreview repoRoot={repoRoot} docName={detail.docName} versionId={modal.version.id} contentId={modal.version.contentId}/></div> : modal?.kind === 'help' ? <HelpDocument repoRoot={repoRoot} /> : modal && <form onSubmit={e => { e.preventDefault(); void submit() }}>
        {modal.kind === 'import' && <><div className="wg-radio-options"><label><input type="radio" name="importMode" value="document" checked={form.importMode === 'document'} onChange={() => changeForm('importMode', 'document')} /><div><strong>一份新的文档</strong><small>工作台新增一条文档记录</small></div></label><label><input type="radio" name="importMode" value="version" checked={form.importMode === 'version'} onChange={() => changeForm('importMode', 'version')} /><div><strong>已有文档的新稿或旧稿</strong><small>归入同一文档，不重复创建文档</small></div></label></div>{form.importMode === 'version' && <label className="wg-field">属于哪份文档<select value={form.docName} onChange={e => changeForm('docName', e.target.value)} required><option value="">请选择文档</option>{docs.filter(d => !d.deletedAt).map(d => <option key={d.docName} value={d.docName}>{d.title}</option>)}</select></label>}<div className="wg-source-row"><span>{form.source || '尚未选择文件'}</span><button type="button" className="wg-button" disabled={busy} onClick={() => void run(async () => { const source = await api.dialog.pickFile('选择要导入的文件'); if (source) setForm(f => ({ ...f, source, name: baseName(source) })) })}>选择文件…</button></div><label className="wg-field">{form.importMode === 'document' ? '入库文件名（保留正确扩展名）' : '这个版本的名称'}<input value={form.name} onChange={e => changeForm('name', e.target.value)} required /></label></>}
        {modal.kind === 'new' && <><label className="wg-field">文档名称<input autoFocus value={form.name} placeholder="例如：毕业论文" required onChange={e => changeForm('name', e.target.value)} /></label><label className="wg-field">格式<select value={form.format} onChange={e => changeForm('format', e.target.value)}><option value="docx">Word 文稿 .docx</option><option value="xlsx">Excel 表格 .xlsx</option><option value="txt">纯文本 .txt</option></select></label><p className="wg-field-hint">创建后使用系统默认程序打开。其他格式可导入现有模板。</p></>}
        {modal.kind === 'save' && <><div className="wg-radio-options"><label><input type="radio" name="saveMode" checked={form.mode === 'replace'} onChange={() => changeForm('mode', 'replace')} /><div><strong>覆盖当前编辑的版本</strong><small>不增加节点，适合润色；保留撤销替换记录</small></div></label><label><input type="radio" name="saveMode" checked={form.mode === 'new'} onChange={() => changeForm('mode', 'new')} /><div><strong>另存为新版本</strong><small>在当前分支继续，旧稿仍完整保留</small></div></label></div><label className="wg-field">版本名称<input autoFocus value={form.name} required onChange={e => changeForm('name', e.target.value)} /></label></>}
        {['version', 'document', 'category', 'branch'].includes(modal.kind) && <label className="wg-field">{modal.kind === 'branch' ? '分支名称（支持中文）' : '名称'}<input autoFocus value={form.name} required onChange={e => changeForm('name', e.target.value)} /></label>}
        {modal.kind === 'deleteBranch' && <><label className="wg-field">需要回收的路线<select value={form.branch} onChange={e => changeForm('branch', e.target.value)}>{Object.keys(detail?.branchHeads ?? {}).filter(b => b !== detail?.currentBranch).map(branch => <option key={branch} value={branch}>{branch}</option>)}</select></label><p className="wg-field-hint">当前分支不能删除。只移除分支引用，不删除共同历史；可从设置还原分支。</p></>}
        {modal.kind === 'note' && <><div className="wg-version-choice"><FileText size={25}/><strong>{modal.version!.title}</strong></div><label className="wg-field">版本备注<textarea autoFocus value={form.note} onChange={e => changeForm('note', e.target.value)} rows={6} placeholder="例如：TIP 投稿格式调整，待导师确认摘要。" /></label></>}
        {modal.kind === 'version' && <><label className="wg-field">修改说明<textarea value={form.note} onChange={e => changeForm('note', e.target.value)} rows={3} /></label><label className="wg-field">版本分类<select value={form.categoryId} onChange={e => changeForm('categoryId', e.target.value)}><option value="">未分类</option>{detail?.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label></>}
        {modal.kind === 'relations' && <><div className="wg-version-choice"><FileText size={25}/><div><strong>{modal.version!.title}</strong><p>{form.relationAction === 'moveBranch' ? '更换归属会断开此稿与原前后版本的连接。其他稿件和正文保留。' : '添加连接线，不修改文件正文；可跨分支选取来源版本。'}</p></div></div>{form.relationAction === 'moveBranch' && <label className="wg-field">新的分支归属<select aria-label="新的分支归属" value={form.branch} onChange={e => setForm(f => ({ ...f, branch: e.target.value, targetVersionId: detail?.versions.find(v => v.id === detail.branchHeads[e.target.value] && v.id !== modal.version!.id && v.branches.includes(e.target.value))?.id ?? '' }))}>{Object.keys(detail?.branchHeads ?? {}).filter(b => !b.startsWith('保护-')).map(b => <option key={b} value={b}>{b}</option>)}</select></label>}<label className="wg-field">{form.relationAction === 'connectNext' ? '连接到后版本' : '连接到前版本'}<select aria-label="连接版本" value={form.targetVersionId} onChange={e => changeForm('targetVersionId', e.target.value)} required={form.relationAction !== 'moveBranch'}><option value="">{form.relationAction === 'moveBranch' ? '保持独立，不连接其他版本' : '请选择版本'}</option>{detail?.versions.filter(v => !v.deletedAt && v.id !== modal.version!.id && (form.relationAction !== 'moveBranch' || v.branches.includes(form.branch))).map(v => <option key={v.id} value={v.id}>{v.title} · {v.id.slice(0,7)}</option>)}</select></label><p className="wg-field-hint">{form.relationAction === 'connectNext' ? '连接方向：本稿 → 选中的后版本' : form.targetVersionId ? '连接方向：选中的前版本 → 本稿' : '本稿成为此分支下的独立版本。'}</p></>}
        {modal.kind === 'deleteVersion' && <><div className="wg-version-choice"><FileText size={25}/><strong>{modal.version!.title}</strong></div><div className="wg-radio-options"><label><input type="radio" name="deleteMode" checked={form.mode === 'remove'} onChange={() => changeForm('mode', 'remove')}/><div><strong>仅从版本管理中删除</strong><small>移入回收区，可还原；导入文件与库内内容保留。</small></div></label><label><input type="radio" name="deleteMode" checked={form.mode === 'purge'} onChange={() => changeForm('mode', 'purge')}/><div><strong>彻底删除该版本和文件</strong><small>清除库内该稿内容及对应编辑副本，断开前后连接，不可从回收区还原。</small></div></label></div>{form.mode === 'purge' && <div className="wg-delete-details"><p>其他版本仍引用的共享内容会保留。</p>{modal.version!.sourcePath ? <><label className="wg-check"><input type="checkbox" checked={form.deleteSource === 'true'} onChange={e => changeForm('deleteSource', String(e.target.checked))}/>同时删除导入到软件时的那份文件</label><code>{modal.version!.sourcePath}</code><p>请核对以上完整路径。测试库的路径应位于测试文件夹中。</p></> : <p>此稿尚未记录可删除的导入文件路径，只能删除库内副本。</p>}<label className="wg-check"><input type="checkbox" checked={form.acknowledged === 'true'} onChange={e => changeForm('acknowledged', String(e.target.checked))}/>我确认永久删除该版本及以上勾选的文件</label></div>}</>}
        {modal.kind === 'edit' && <><div className="wg-edit-source"><FileText size={20}/><div><strong>{modal.version?.title}</strong><small>只编辑稿喵内的独立副本，导入源文件不受影响。</small></div></div><div className="wg-radio-options">
          <label><input type="radio" name="editOperation" checked={form.operation === 'continue'} disabled={!Object.values(detail?.branchHeads ?? {}).includes(modal.version!.id)} onChange={() => changeForm('operation', 'continue')}/><div><strong>沿现有分支创建下一稿</strong><small>所选版本须为分支末端；首次保存新增版本，之后更新同一稿。</small></div></label>
          <label><input type="radio" name="editOperation" checked={form.operation === 'fork'} onChange={() => changeForm('operation', 'fork')}/><div><strong>从此版本新建分支</strong><small>适合历史稿或换刊投稿；原分支和后续版本不改变。</small></div></label>
          <label><input type="radio" name="editOperation" checked={form.operation === 'replace'} disabled={!Object.values(detail?.branchHeads ?? {}).includes(modal.version!.id)} onChange={() => changeForm('operation', 'replace')}/><div><strong>修改选中版本，不增加节点</strong><small>使用独立副本；保存后覆盖此稿，保留撤销记录。</small></div></label>
        </div>{form.operation === 'fork' ? <label className="wg-field">新分支名称<input value={form.name} onChange={e => changeForm('name', e.target.value)} placeholder="例如：杂志B投稿" required/></label> : <label className="wg-field">目标分支<select aria-label="目标编辑分支" value={form.branch} onChange={e => changeForm('branch', e.target.value)}>{Object.entries(detail?.branchHeads ?? {}).filter(([, head]) => head === modal.version?.id).map(([branch]) => <option key={branch} value={branch}>{branch}</option>)}</select></label>}{form.operation !== 'replace' && <label className="wg-field">新稿名称（可留空自动命名）<input value={form.title ?? ''} onChange={e => changeForm('title', e.target.value)} placeholder="例如：杂志B第一轮格式修改"/></label>}<p className="wg-field-hint">使用 Word / WPS 编辑，Ctrl+S 后自动记录。未修改不会产生正式版本。已有分支只能从其末端继续；历史稿请新建分支。</p></>}

        <footer className="wg-dialog-actions"><button type="button" className="wg-button" disabled={busy} onClick={() => setModal(null)}>取消</button><button type="submit" className="wg-button primary" disabled={busy}>{busy ? '正在处理…' : modal.kind === 'new' ? '创建并打开' : modal.kind === 'edit' ? '打开并继续编辑' : modal.kind === 'import' ? '确认导入' : modal.kind === 'save' ? form.mode === 'replace' ? '覆盖当前版本' : '另存新版本' : '确认'}</button></footer>
      </form>}
      {(modal?.kind === 'compare' || modal?.kind === 'help' || modal?.kind === 'preview') && <footer className="wg-dialog-actions"><button className="wg-button" onClick={() => setModal(null)}>关闭</button></footer>}
    </DialogContent></Dialog>
  </div>
}

