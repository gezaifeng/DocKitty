import { diffChars } from 'diff'
import { unzipSync } from 'fflate'

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
  const changes = diffChars(textA, textB)
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

/**
 * Extract plain text from a docx buffer (word/document.xml).
 * Strips XML tags to get the raw text content.
 */
export async function extractDocxText(buf: Uint8Array): Promise<string> {
  let parts: Record<string, Uint8Array>
  try {
    parts = unzipSync(buf)
  } catch {
    return ''
  }

  const docXml = parts['word/document.xml']
  if (!docXml) return ''

  const xmlText = new TextDecoder().decode(docXml)
  // Strip all XML tags, leaving only text content
  const plainText = xmlText.replace(/<[^>]+>/g, '')
  // Collapse whitespace
  return plainText.replace(/\s+/g, ' ').trim()
}
