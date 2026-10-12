// apps/desktop/src/renderer/src/pages/FirstRunPage.tsx
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { FolderPlus, FolderOpen, ArrowLeft, Loader2 } from 'lucide-react'
import { api } from '@renderer/lib/ipc'
import { useRepoStore } from '@renderer/store/repoStore'
import { Button } from '@renderer/components/ui/button'
import { Card, CardContent } from '@renderer/components/ui/card'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'

type Step = 'landing' | 'naming'

const stepVariants = {
  initial: { opacity: 0, x: 20 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -20 },
}

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
    <div className="flex h-screen items-center justify-center bg-background p-6">
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 26 }}
        className="w-full max-w-[440px]"
      >
        <Card className="border-border/80 shadow-xl shadow-black/5">
          <CardContent className="flex flex-col gap-6 p-8">
            <div className="flex flex-col items-center gap-3 pt-2">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-7 w-7"
                >
                  <path d="M12 3v18" />
                  <path d="M5 8h14" />
                  <path d="M5 16h14" />
                  <circle cx="12" cy="3" r="1.5" fill="currentColor" />
                  <circle cx="5" cy="8" r="1.5" fill="currentColor" />
                  <circle cx="19" cy="8" r="1.5" fill="currentColor" />
                  <circle cx="5" cy="16" r="1.5" fill="currentColor" />
                  <circle cx="19" cy="16" r="1.5" fill="currentColor" />
                </svg>
              </div>
              <div className="text-center">
                <h1 className="text-2xl font-bold tracking-tight">稿喵</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  像 Git 一样管理你的 Office 文档版本
                </p>
              </div>
            </div>

            <AnimatePresence mode="wait" initial={false}>
              {step === 'landing' ? (
                <motion.div
                  key="landing"
                  variants={stepVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  transition={{ duration: 0.18, ease: 'easeOut' }}
                  className="flex flex-col gap-3"
                >
                  <Button
                    onClick={handleCreate}
                    disabled={loading}
                    size="lg"
                    className="w-full cursor-pointer"
                  >
                    <FolderPlus className="h-4 w-4" />
                    创建新仓库
                  </Button>
                  <Button
                    onClick={handleOpen}
                    disabled={loading}
                    variant="outline"
                    size="lg"
                    className="w-full cursor-pointer"
                  >
                    <FolderOpen className="h-4 w-4" />
                    打开已有仓库
                  </Button>
                </motion.div>
              ) : (
                <motion.div
                  key="naming"
                  variants={stepVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  transition={{ duration: 0.18, ease: 'easeOut' }}
                  className="flex flex-col gap-4"
                >
                  <div
                    className="truncate rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground"
                    title={chosenDir}
                  >
                    位置：{chosenDir}
                  </div>
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
                  <Button
                    onClick={handleConfirmCreate}
                    disabled={loading}
                    className="w-full cursor-pointer"
                  >
                    {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                    {loading ? '创建中…' : '确认创建'}
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => setStep('landing')}
                    disabled={loading}
                    className="w-full cursor-pointer text-muted-foreground hover:text-foreground"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    返回
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>

            {error && (
              <motion.p
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center text-sm text-destructive"
                role="alert"
              >
                {error}
              </motion.p>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  )
}
