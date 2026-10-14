import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@renderer/lib/ipc'
import { useRepoStore } from '@renderer/store/repoStore'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from './ui/dialog'
export function ProjectMcpDialog({ open, onClose }: { open: boolean; onClose(): void }) {
  const [target, setTarget] = useState<'codex' | 'claude' | 'cursor' | 'dsh'>('codex'), [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false), { repoRoot } = useRepoStore()
  const config = useQuery({ queryKey: ['project-mcp-config', repoRoot], queryFn: () => api.projects!.request({ action: 'mcpConfig' }) as Promise<{ codex: string; claude: string; cursor: string; dsh: string; local: { running: boolean; url?: string; token?: string; error?: string } }>, enabled: open, refetchOnMount: 'always' })
  const destinations = { codex: '添加到 ~/.codex/config.toml；保留文件中的其他设置。', claude: '将 dockitty 配置合并到项目根目录的 .mcp.json。', cursor: '将 dockitty 配置合并到项目 .cursor/mcp.json 或用户级 ~/.cursor/mcp.json。', dsh: '使用 DSH 的 MCP 面板添加本机 Streamable HTTP 服务。' }
  const local = config.data?.local
  const text = target === 'dsh' && local?.running ? `${config.data!.dsh}\n\n服务地址：${local.url}\nBearer Token：${local.token}` : config.data?.[target]
  async function toggleLocal() {
    setBusy(true); setNotice('')
    try { await api.projects!.request({ action: 'mcpLocal', enabled: !local?.running }); await config.refetch() }
    catch (error) { setNotice((error as Error).message) }
    finally { setBusy(false) }
  }
  return <Dialog open={open} onOpenChange={value => { if (!value) onClose() }}><DialogContent className="wg-dialog wg-wide-dialog"><DialogTitle>接入 Agent · MCP</DialogTitle><DialogDescription>让 agent 将资料、迭代和关系写入同一文档库。启动文件使用软件自带运行环境。</DialogDescription><nav className="wg-project-mcp-tabs" aria-label="Agent 配置">{(['codex', 'claude', 'cursor', 'dsh'] as const).map(value => <button key={value} className={`wg-button ${target === value ? 'primary' : ''}`} aria-pressed={target === value} onClick={() => { setTarget(value); setNotice('') }}>{({ codex: 'Codex', claude: 'Claude Code', cursor: 'Cursor', dsh: 'DSH' })[value]}</button>)}</nav><p>{destinations[target]}</p>{target === 'dsh' && <div><button className="wg-button" disabled={busy || !config.data} onClick={() => void toggleLocal()}>{busy ? '正在处理…' : local?.running ? '关闭本机连接' : '开启本机连接'}</button><p>只接受本机带密钥的连接；开启后，随稿喵启动并沿用同一地址。</p>{local?.error && <p role="alert">{local.error}</p>}</div>}{config.error ? <p role="alert">{config.error.message}</p> : <pre className="wg-project-mcp-code">{text ?? '正在准备配置…'}</pre>}<p>常用流程：创建文档库 → 导入资料 → 修改文件 → 刷新；需要保留一轮时调用 record_iteration，并用 set_relation 标注参考或示例。</p>{notice && <p role="status">{notice}</p>}<div className="wg-dialog-actions"><button className="wg-button" onClick={onClose}>关闭</button><button className="wg-button primary" disabled={!text || (target === 'dsh' && !local?.running)} onClick={() => { void navigator.clipboard.writeText(text!).then(() => setNotice('已复制配置'), () => setNotice('复制失败，请选中文字复制')) }}>复制配置</button></div></DialogContent></Dialog>
}
