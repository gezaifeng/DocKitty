import { useUiStore } from '../store/uiStore'

export function ThemedTitle({ text }: { text: string }) {
  const redline = useUiStore(s => s.theme === 'redline')
  return redline ? <>{Array.from(text).map((letter, index) => <span className="wg-title-letter" key={index}>{letter}</span>)}</> : <>{text}</>
}
