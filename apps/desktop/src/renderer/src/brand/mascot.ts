import cat from '../assets/mascot-tail-fixed/cat.png'
import paper from '../assets/mascot-tail-fixed/paper.png'
export const mascotImages = { cat, paper }

/** A connected image settles in one small arc; no body part is detached or stretched. */
export function poseMascot(root: HTMLElement, elapsed: number) {
  const t = Math.min(1, Math.max(0, elapsed / 620))
  const smooth = (v: number) => v * v * (3 - 2 * v)
  const arriving = t < .7, p = smooth(arriving ? t / .7 : (t - .7) / .3)
  const x = arriving ? -12 + 13 * p : 1 - p
  const y = arriving ? 22 - 25 * p : -3 + 3 * p
  const angle = arriving ? -5 + 6 * p : 1 - p
  const scale = arriving ? .96 + .04 * p : 1
  root.style.opacity = String(smooth(Math.min(1, t / .22)))
  root.style.transform = `translate3d(${x}px, ${y}px, 0) rotate(${angle}deg) scale(${scale})`
}
