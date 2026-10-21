import type { Theme } from '../store/uiStore'

// Display names may change; ids remain stable for saved preferences and theme styles.
export const themeOptions: Array<{ id: Theme; label: string; detail: string }> = [
  { id: 'arknights', label: '方舟', detail: '白色指令卡 · 浅灰图形与层叠入场' },
  { id: 'redline', label: '赤幕', detail: '红黑白 · 斜切拼贴与短促入场' },
  { id: 'liquid', label: '琉璃', detail: '浅色玻璃 · 通透磨砂与边缘高光' },
  { id: 'liquid-dark', label: '夜璃', detail: '深色玻璃 · 柔和亮字与流动光影' },
  { id: 'blockframe', label: '积木', detail: '暖纸底色 · 黑框与硬投影' },
  { id: 'raw', label: '粉绿', detail: '粉绿色块 · 直角黑框与硬投影' },
  { id: 'retro', label: '视窗', detail: '桌面窗口 · 凸凹边框与标题栏' },
  { id: 'capsule', label: '胶囊', detail: '圆角容器 · 胶囊按钮与文具标签' },
  { id: 'light', label: '素白', detail: '白色纸面 · 克制细边框' },
  { id: 'paper', label: '暖纸', detail: '暖纸与墨绿 · 宋体标题' },
  { id: 'dark', label: '石墨', detail: '中性炭灰 · 柔和亮字' },
  { id: 'system', label: '系统', detail: '随系统自动切换素白与石墨' },
]
