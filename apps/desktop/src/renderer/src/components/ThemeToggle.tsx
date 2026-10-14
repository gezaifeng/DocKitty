// apps/desktop/src/renderer/src/components/ThemeToggle.tsx
import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import { motion, useMotionValue } from 'framer-motion'
import type { PanInfo } from 'framer-motion'
import { Monitor, Moon, Sun } from 'lucide-react'
import { useUiStore } from '@renderer/store/uiStore'
import type { Theme } from '@renderer/store/uiStore'

const THEME_CYCLE: Theme[] = ['system', 'light', 'dark']

const THEME_META: Record<Theme, { icon: typeof Sun; label: string }> = {
  liquid: { icon: Sun, label: '液态玻璃' },
  'liquid-dark': { icon: Moon, label: '液态玻璃 · 深色' },
  system: { icon: Monitor, label: '跟随系统' },
  light: { icon: Sun, label: '浅色' },
  dark: { icon: Moon, label: '深色' },
  blockframe: { icon: Sun, label: 'BlockFrame' },
  raw: { icon: Sun, label: '粉绿方块' },
  retro: { icon: Monitor, label: '经典视窗' },
  capsule: { icon: Sun, label: '胶囊文具' },
  paper: { icon: Sun, label: '纸张书房' },
}

interface ThemeToggleProps {
  containerRef: RefObject<HTMLDivElement | null>
}

export function ThemeToggle({ containerRef }: ThemeToggleProps) {
  const { theme, setTheme, themeButtonPos, setThemeButtonPos } = useUiStore()
  const btnRef = useRef<HTMLButtonElement>(null)
  const dragEndAtRef = useRef(0)
  const x = useMotionValue(themeButtonPos?.x ?? 0)
  const y = useMotionValue(themeButtonPos?.y ?? 0)
  const { icon: Icon, label } = THEME_META[theme]

  // 拖拽松手时按钮仍跟着指针，浏览器会补发一次 click；按松手时间戳区分拖拽与真正的点击
  function handleClick() {
    if (Date.now() - dragEndAtRef.current < 200) return
    const idx = THEME_CYCLE.indexOf(theme)
    setTheme(THEME_CYCLE[(idx + 1) % THEME_CYCLE.length])
  }

  function handleDragEnd(_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) {
    setThemeButtonPos({ x: x.get(), y: y.get() })
    if (Math.hypot(info.offset.x, info.offset.y) > 4) {
      dragEndAtRef.current = Date.now()
    }
  }

  // Keep the button inside the window after resizes
  useEffect(() => {
    function clamp() {
      const btn = btnRef.current
      const container = containerRef.current
      if (!btn || !container) return
      const b = btn.getBoundingClientRect()
      const c = container.getBoundingClientRect()
      let dx = 0
      let dy = 0
      if (b.left < c.left + 8) dx = c.left + 8 - b.left
      if (b.right > c.right - 8) dx = c.right - 8 - b.right
      if (b.top < c.top + 8) dy = c.top + 8 - b.top
      if (b.bottom > c.bottom - 8) dy = c.bottom - 8 - b.bottom
      if (dx !== 0 || dy !== 0) {
        x.set(x.get() + dx)
        y.set(y.get() + dy)
        setThemeButtonPos({ x: x.get(), y: y.get() })
      }
    }
    window.addEventListener('resize', clamp)
    return () => window.removeEventListener('resize', clamp)
  }, [containerRef, x, y, setThemeButtonPos])

  return (
    <motion.button
      ref={btnRef}
      type="button"
      aria-label={`切换主题（当前：${label}）`}
      title={`切换主题（当前：${label}），可拖动到任意位置`}
      onClick={handleClick}
      onDragEnd={handleDragEnd}
      drag
      dragConstraints={containerRef}
      dragMomentum={false}
      dragElastic={0.06}
      whileHover={{ scale: 1.08 }}
      whileTap={{ scale: 0.92 }}
      whileDrag={{ scale: 1.12 }}
      style={{ x, y, top: 12, right: 12, position: 'absolute' }}
      className="z-50 flex h-9 w-9 cursor-grab touch-none items-center justify-center rounded-full border border-border bg-card/90 text-foreground shadow-md backdrop-blur transition-colors hover:border-primary/40 hover:text-primary active:cursor-grabbing"
    >
      <motion.span
        key={theme}
        initial={{ opacity: 0, scale: 0.4, rotate: -45 }}
        animate={{ opacity: 1, scale: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 500, damping: 28 }}
        className="flex"
      >
        <Icon className="h-4 w-4" aria-hidden />
      </motion.span>
    </motion.button>
  )
}
