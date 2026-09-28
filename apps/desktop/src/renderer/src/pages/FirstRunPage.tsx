// apps/desktop/src/renderer/src/pages/FirstRunPage.tsx
import { useState } from 'react'
import { api } from '@renderer/lib/ipc'
import { useRepoStore } from '@renderer/store/repoStore'
import { Button } from '@renderer/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@renderer/components/ui/card'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'

type Step = 'landing' | 'naming'

export function FirstRunPage() {
  const { setRepo } = useRepoStore()
  const [step, setStep] = useState<Step>('landing')
  const [chosenDir, setChosenDir] = useState<string>('')
  const [repoName, setRepoName] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleCreate() {
    setError(null)
    const dir = await api.dialog.pickFolder('选择仓库保存位置')
    if (!dir) return
    setChosenDir(dir)
    setRepoName('我的仓库')
    setStep('naming')
  }

  async function handleConfirmCreate() {
    if (!repoName.trim()) {
      setError('请输入仓库名称')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const sep = chosenDir.includes('\\') ? '\\' : '/'
      const repoPath = `${chosenDir}${sep}${repoName.trim()}.wg`
      const { repoRoot } = await api.repo.create(repoPath, repoName.trim())
      setRepo(repoRoot, repoName.trim())
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  async function handleOpen() {
    setError(null)
    const dir = await api.dialog.pickFolder('选择仓库文件夹（*.wg）')
    if (!dir) return
    setLoading(true)
    try {
      const { repoRoot, repoName: n } = await api.repo.open(dir)
      setRepo(repoRoot, n)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex h-screen items-center justify-center bg-background">
      <Card className="w-[440px]">
        <CardHeader>
          <CardTitle className="text-2xl font-bold text-center">word_git</CardTitle>
          <p className="text-center text-muted-foreground text-sm mt-1">
            像 Git 一样管理你的 Office 文档版本
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {step === 'landing' && (
            <>
              <Button onClick={handleCreate} disabled={loading} size="lg" className="w-full">
                创建新仓库
              </Button>
              <Button
                onClick={handleOpen}
                disabled={loading}
                variant="outline"
                size="lg"
                className="w-full"
              >
                打开已有仓库
              </Button>
            </>
          )}

          {step === 'naming' && (
            <>
              <div className="text-sm text-muted-foreground">位置：{chosenDir}</div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="repo-name">仓库名称</Label>
                <Input
                  id="repo-name"
                  placeholder="论文仓库"
                  value={repoName}
                  onChange={(e) => setRepoName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleConfirmCreate() }}
                  autoFocus
                />
              </div>
              <Button onClick={handleConfirmCreate} disabled={loading} className="w-full">
                {loading ? '创建中…' : '确认创建'}
              </Button>
              <Button
                variant="ghost"
                onClick={() => setStep('landing')}
                disabled={loading}
                className="w-full"
              >
                返回
              </Button>
            </>
          )}

          {error && (
            <p className="text-destructive text-sm text-center">{error}</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
