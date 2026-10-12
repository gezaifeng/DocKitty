import { forwardRef } from 'react'
import { mascotImages } from '../brand/mascot'

export const Mascot = forwardRef<HTMLDivElement>(function Mascot(_, ref) {
  return <div className="wg-mascot" ref={ref}><div className="wg-mascot-art">
    <img src={mascotImages.cat} alt="佩戴文档胸牌的三花猫" draggable={false} />
    <span className="wg-badge-anchor" data-version-paper aria-hidden="true" />
  </div></div>
})
