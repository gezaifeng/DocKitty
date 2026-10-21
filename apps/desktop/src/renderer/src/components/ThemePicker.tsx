import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { useUiStore, type Theme } from '../store/uiStore'
import { themeOptions } from '../lib/themes'
export function ThemePicker(){
 const {theme,setTheme}=useUiStore(),[open,setOpen]=useState(false),[focus,setFocus]=useState(0),root=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null)
 useEffect(()=>{if(!open)return;const close=(e:PointerEvent)=>{if(!root.current?.contains(e.target as Node))setOpen(false)};document.addEventListener('pointerdown',close);return()=>document.removeEventListener('pointerdown',close)},[open])
 useEffect(()=>{if(open)root.current?.querySelector<HTMLButtonElement>(`[data-option="${focus}"]`)?.focus()},[open,focus])
 const choose=(id:Theme)=>{setTheme(id);setOpen(false);trigger.current?.focus()}
 return <div className="wg-theme-picker" ref={root}><button ref={trigger} className="wg-theme-trigger" role="combobox" aria-label="主题风格" aria-haspopup="listbox" aria-expanded={open} aria-controls="wg-theme-options" data-value={theme} onClick={()=>{setFocus(themeOptions.findIndex(t=>t.id===theme));setOpen(!open)}} onKeyDown={e=>{if(e.key==='ArrowDown'){e.preventDefault();setOpen(true);setFocus(themeOptions.findIndex(t=>t.id===theme))}}}>{themeOptions.find(t=>t.id===theme)?.label}<ChevronDown size={14}/></button>{open&&<div id="wg-theme-options" className="wg-theme-options" role="listbox" aria-label="选择主题" onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();setOpen(false);trigger.current?.focus()}else if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();setFocus(n=>(n+(e.key==='ArrowDown'?1:-1)+themeOptions.length)%themeOptions.length)}else if(e.key==='Tab')setOpen(false)}}>{themeOptions.map((t,i)=><button key={t.id} data-option={i} role="option" aria-selected={theme===t.id} onClick={()=>choose(t.id)}><span className={`wg-theme-swatch ${t.id}`}/><span><strong>{t.label}</strong><small>{t.detail}</small></span>{theme===t.id&&<Check size={14}/>}</button>)}</div>}</div>
}
