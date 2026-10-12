/** Shared artwork for the startup scene, icon and motion preview. t is 0..1. */
export function renderCat(t: number): string {
  const ink = '#284f45', paper = '#fffdf6', mint = '#dceee4', warm = '#e9b98b'
  const clamp = (x: number) => Math.max(0, Math.min(1, x))
  const smooth = (a: number, b: number, value: number) => { const p = clamp((value - a) / (b - a)); return p * p * (3 - 2 * p) }
  const mix = (a: number, b: number, p: number) => a + (b - a) * p
  const num = (x: number) => Number(x.toFixed(3))
  function key(values: number[][]) {
    for (let i = 1; i < values.length; i++) {
      if (t <= values[i][0]) return mix(values[i - 1][1], values[i][1], smooth(values[i - 1][0], values[i][0], t))
    }
    return values[values.length - 1][1]
  }
  const arrival = smooth(.035, .4, t), grip = smooth(.4, .7, t)
  const pulse = Math.sin(Math.PI * clamp((t - .4) / .35)) * (1 - clamp((t - .4) / .35))
  const falling = clamp((t - .035) / .365), cushioning = clamp((t - .4) / .22)
  const px = mix(184, 151, arrival)
  const py = t < .4 ? mix(-66, 134, falling * falling) : t < .62 ? mix(134, 182, 1 - (1 - cushioning) ** 3) : key([[.62, 182], [.76, 171], [.93, 174], [1, 174]])
  const angle = key([[0, -18], [.4, 5], [.62, -2], [.86, 0], [1, 0]])
  const bodyY = 9 * pulse
  const handY = t < .4 ? 184 - 16 * smooth(.24, .4, t) : py + 34 * (1 - grip)
  const left = 101 - 8 * (1 - grip), right = 201 + 8 * (1 - grip)
  const eye = 4.5 * (1 - .8 * pulse)
  const arms = `M105 ${num(154 + bodyY)}Q88 ${num(handY - 20)} ${num(left)} ${num(handY)}M197 ${num(154 + bodyY)}Q215 ${num(handY - 20)} ${num(right)} ${num(handY)}`
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 260" role="img" aria-label="稿喵，小猫接住文稿"><g opacity="${num(smooth(0, .06, t))}">
    <ellipse cx="151" cy="227" rx="70" ry="7" fill="${ink}" opacity=".12"/>
    <g transform="translate(0 ${num(bodyY)})">
      <g data-cat-tail="true" fill="none" stroke-linecap="round"><path d="M179 205C208 218 242 201 241 174C241 161 232 156 224 163" stroke="${ink}" stroke-width="15"/><path d="M179 205C208 218 242 201 241 174C241 161 232 156 224 163" stroke="${warm}" stroke-width="9"/></g>
      <ellipse cx="151" cy="173" rx="55" ry="51" fill="${paper}" stroke="${ink}" stroke-width="4"/>
      <path d="M101 96 101 47l31 23q19-6 38 0l31-23v49q2 43-50 43t-50-43Z" fill="${paper}" stroke="${ink}" stroke-width="4.5" stroke-linejoin="round"/>
      <path d="m109 62 19 16-18 10m83-26-19 16 18 10" fill="${warm}"/>
      <g fill="${ink}"><ellipse cx="131" cy="101" rx="3.5" ry="${num(eye)}"/><ellipse cx="171" cy="101" rx="3.5" ry="${num(eye)}"/></g>
      <path d="m146 115 5 4 5-4m-5 4v5q-8 6-13-1m13 1q8 6 13-1M117 115l-16-3m16 11-16 3m84-11 16-3m-16 11 16 3" fill="none" stroke="${ink}" stroke-width="3" stroke-linecap="round"/>
    </g>
    <path data-cat-arms="true" d="${arms}" fill="none" stroke="${ink}" stroke-width="4" stroke-linecap="round"/>
    <g data-cat-paper="true" transform="translate(${num(px)} ${num(py)}) rotate(${num(angle)})">
      <path d="M-40-40h57l32 23v51q0 7-7 7h-82q-9 0-9-9v-63q0-9 9-9Z" fill="${paper}" stroke="${ink}" stroke-width="4" stroke-linejoin="round"/>
      <path d="M17-40v23h32" fill="${mint}" stroke="${ink}" stroke-width="3" stroke-linejoin="round"/>
      <path d="M-28-10h53m-53 15h53m-53 15h34.45" fill="none" stroke="#7da893" stroke-width="4" stroke-linecap="round"/>
    </g>
    <g data-cat-paws="true" fill="${paper}" stroke="${ink}" stroke-width="4" stroke-linecap="round">
      <ellipse cx="${num(left)}" cy="${num(handY)}" rx="15" ry="12" transform="rotate(${num(-18 * grip)} ${num(left)} ${num(handY)})"/>
      <ellipse cx="${num(right)}" cy="${num(handY)}" rx="15" ry="12" transform="rotate(${num(18 * grip)} ${num(right)} ${num(handY)})"/>
      <path d="M${num(left - 4)} ${num(handY - 3)}v5m6-5v5M${num(right - 3)} ${num(handY - 3)}v5m6-5v5" stroke-width="2"/>
    </g>
  </g></svg>`
}
