import { diffChars } from 'diff'
import { unzipSync } from 'fflate'
import { SaxesParser } from 'saxes'

/** A bounded character diff for interactive statistics; undefined means unavailable. */
export function diffTextBounded(textA: string, textB: string) {
  return diffChars(textA, textB, { timeout: 120, maxEditLength: 20000 })
}

export interface DiffResult {
  type: 'equal' | 'insert' | 'delete'
  text: string
}

/**
 * Diff two strings at the character level using the Myers algorithm.
 * Suitable for Chinese text where word boundaries are unclear.
 */
export function diffText(textA: string, textB: string): DiffResult[] {
  if (textA.length + textB.length > 160000) throw new Error('文本过长，无法进行交互对比，请导出使用专业比较工具')
  const changes = diffTextBounded(textA, textB)
  if (!changes) throw new Error('差异过多或比较超时，请导出使用专业比较工具')
  const results: DiffResult[] = []
  for (const change of changes) {
    if (!change.value) continue
    if (change.added) {
      results.push({ type: 'insert', text: change.value })
    } else if (change.removed) {
      results.push({ type: 'delete', text: change.value })
    } else {
      results.push({ type: 'equal', text: change.value })
    }
  }
  return results
}

/** Extract visible body text, preserving paragraph, tab and line-break boundaries. */
export async function extractDocxText(buf: Uint8Array): Promise<string> {
  let parts: Record<string, Uint8Array>
  try { parts = unzipSync(buf) } catch { throw new Error('Word 文件损坏，无法读取正文') }
  const xml = parts['word/document.xml']
  if (!xml) throw new Error('Word 文件缺少正文，无法比较')
  const output: string[] = [], parser = new SaxesParser({ xmlns: true })
  let capture = false
  const wordTag = (tag: { local: string; uri: string }, name: string) => tag.local === name && tag.uri.includes('wordprocessingml')
  parser.on('opentag', tag => {
    if (wordTag(tag, 't')) capture = true
    if (wordTag(tag, 'tab')) output.push('\t')
    if (wordTag(tag, 'br') || wordTag(tag, 'cr')) output.push('\n')
  })
  parser.on('text', text => { if (capture) output.push(text) })
  parser.on('closetag', tag => {
    if (wordTag(tag, 't')) capture = false
    if (wordTag(tag, 'p')) output.push('\n')
  })
  try { parser.write(new TextDecoder().decode(xml)).close() } catch { throw new Error('Word 正文 XML 无法解析，请导出使用关联程序查看') }
  return output.join('').trim()
}
