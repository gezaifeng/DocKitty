import { describe, expect, it } from 'vitest'
import { safeProjectHtml } from './projectHtml'
describe('static HTML preview', () => {
  it('keeps page content and inline styles while removing executable and external-resource elements', async () => {
    const value = await safeProjectHtml('<html><head><style>h1{color:red}</style><meta http-equiv="refresh" content="0;url=https://example.com"></head><body onload="alert(1)"><h1>项目结果</h1><script>window.bad=true</script><iframe src="https://example.com"></iframe><img src="https://example.com/p.png"><a href="https://example.com" onclick="alert(1)">链接</a><form action="https://example.com"><input></form></body></html>')
    const doc = new DOMParser().parseFromString(value, 'text/html')
    expect(doc.querySelector('h1')?.textContent).toBe('项目结果')
    expect(doc.querySelector('style')?.textContent).toContain('color:red')
    expect(doc.querySelectorAll('script,iframe,object,embed,base')).toHaveLength(0)
    expect(doc.body.hasAttribute('onload')).toBe(false)
    expect(doc.querySelector('img')?.hasAttribute('src')).toBe(false)
    expect(doc.querySelector('a')?.hasAttribute('href')).toBe(false)
    expect(doc.querySelector('form')?.hasAttribute('action')).toBe(false)
    expect(doc.querySelector('meta[http-equiv]')?.getAttribute('content')).toContain("script-src 'none'")
  })
  it('supports managed local styles and images but never permits executable source attributes', async () => {
    const value = await safeProjectHtml('<link rel="stylesheet" href="style.css"><img src="figure.png"><svg><use href="https://example.com/shape.svg#x"/></svg>', async (reference, kind) => kind === 'css' && reference === 'style.css' ? 'body{background:#fff}' : reference === 'figure.png' ? 'blob:managed-image' : null)
    const doc = new DOMParser().parseFromString(value, 'text/html')
    expect(doc.querySelector('link')).toBeNull()
    expect(doc.querySelector('style')?.textContent).toContain('background:#fff')
    expect(doc.querySelector('img')?.getAttribute('src')).toBe('blob:managed-image')
    expect(doc.querySelector('use')?.hasAttribute('href')).toBe(false)
  })
})
