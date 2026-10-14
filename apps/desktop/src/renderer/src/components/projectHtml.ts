export async function safeProjectHtml(source: string, resolve?: (reference: string, kind: 'image' | 'css') => Promise<string | null>): Promise<string> {
  const doc = new DOMParser().parseFromString(source, 'text/html')
  doc.querySelectorAll('script, iframe, object, embed, base').forEach(el => el.remove())
  doc.querySelectorAll('meta[http-equiv]').forEach(el => el.remove())
  for (const el of doc.querySelectorAll('*')) {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase()
      if (name.startsWith('on') || ['srcdoc', 'srcset', 'action', 'formaction', 'ping', 'poster', 'data', 'xlink:href'].includes(name)) el.removeAttribute(attr.name)
    }
    if (el.hasAttribute('src')) {
      const value = el.getAttribute('src') ?? ''
      const url = el.tagName === 'IMG' ? (/^data:image\//i.test(value) ? value : await resolve?.(value, 'image')) : null
      if (url) el.setAttribute('src', url); else el.removeAttribute('src')
    }
    if (el.hasAttribute('href')) {
      const value = el.getAttribute('href') ?? ''
      if (el.tagName === 'LINK' && el.getAttribute('rel')?.toLowerCase() === 'stylesheet') {
        const css = await resolve?.(value, 'css')
        if (css) { const style = doc.createElement('style'); style.textContent = css; el.replaceWith(style) } else el.remove()
      } else if (!value.startsWith('#')) el.removeAttribute('href')
    }
  }
  const csp = doc.createElement('meta')
  csp.setAttribute('http-equiv', 'Content-Security-Policy')
  csp.setAttribute('content', "default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'")
  doc.head.prepend(csp)
  return '<!doctype html>\n' + doc.documentElement.outerHTML
}
