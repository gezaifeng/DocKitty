import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { useUiStore, type Theme } from '../store/uiStore'
export const themeOptions: Array<{id:Theme;label:string;detail:string}> = [
 {id:'liquid',label:'液态玻璃',detail:'流动曲面 · 通透磨砂与边缘高光'},
 {id:'liquid-dark',label:'液态玻璃 · 深色',detail:'深色玻璃 · 柔和亮字与流动光影'},
 {id:'blockframe',label:'BlockFrame 黑框积木',detail:'暖纸底色 · 黑框与硬投影'},
 {id:'raw',label:'粉绿方块',detail:'粉绿色块 · 直角黑框与硬投影'},
 {id:'retro',label:'经典视窗',detail:'桌面窗口 · 凸凹边框与标题栏'},
 {id:'capsule',label:'胶囊文具',detail:'圆角容器 · 胶囊按钮与文具标签'},
 {id:'light',label:'浅色办公',detail:'白色纸面 · 克制细边框'},
 {id:'paper',label:'纸张书房',detail:'暖纸与墨绿 · 宋体标题'},
 {id:'dark',label:'石墨暗色',detail:'中性炭灰 · 柔和亮字'},
 {id:'system',label:'跟随系统',detail:'随系统切换浅色与石墨'},
]
export function ThemePicker(){
 const {theme,setTheme}=useUiStore(),[open,setOpen]=useState(false),[focus,setFocus]=useState(0),root=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null)
 useEffect(()=>{if(!open)return;const close=(e:PointerEvent)=>{if(!root.current?.contains(e.target as Node))setOpen(false)};document.addEventListener('pointerdown',close);return()=>document.removeEventListener('pointerdown',close)},[open])
 useEffect(()=>{if(open)root.current?.querySelector<HTMLButtonElement>(`[data-option="${focus}"]`)?.focus()},[open,focus])
 const choose=(id:Theme)=>{setTheme(id);setOpen(false);trigger.current?.focus()}
 return <div className="wg-theme-picker" ref={root}><button ref={trigger} className="wg-theme-trigger" role="combobox" aria-label="主题风格" aria-haspopup="listbox" aria-expanded={open} aria-controls="wg-theme-options" data-value={theme} onClick={()=>{setFocus(themeOptions.findIndex(t=>t.id===theme));setOpen(!open)}} onKeyDown={e=>{if(e.key==='ArrowDown'){e.preventDefault();setOpen(true);setFocus(themeOptions.findIndex(t=>t.id===theme))}}}>{themeOptions.find(t=>t.id===theme)?.label}<ChevronDown size={14}/></button>{open&&<div id="wg-theme-options" className="wg-theme-options" role="listbox" aria-label="选择主题" onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();setOpen(false);trigger.current?.focus()}else if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();setFocus(n=>(n+(e.key==='ArrowDown'?1:-1)+themeOptions.length)%themeOptions.length)}else if(e.key==='Tab')setOpen(false)}}>{themeOptions.map((t,i)=><button key={t.id} data-option={i} role="option" aria-selected={theme===t.id} onClick={()=>choose(t.id)}><span className={`wg-theme-swatch ${t.id}`}/><span><strong>{t.label}</strong><small>{t.detail}</small></span>{theme===t.id&&<Check size={14}/>}</button>)}</div>}</div>
}
