import { expect, it } from 'vitest'
import { projectEdge } from './projectEdge'

it('connects card centers and keeps arrows outside the target for every direction', () => {
  for (const to of [{ x: 400, y: 0 }, { x: -400, y: 0 }, { x: 0, y: 300 }, { x: 0, y: -300 }, { x: 300, y: 250 }]) {
    const edge = projectEdge({ x: 0, y: 0 }, to)
    const coordinates = edge.d.match(/-?\d+(?:\.\d+)?/g)!.map(Number)
    expect(coordinates.slice(0, 2)).toEqual([112.5, 56])
    expect(coordinates.slice(-2)).toEqual([to.x + 112.5, to.y + 56])
    const [ax, ay] = coordinates.slice(2, 4)
    expect(ax < to.x || ax > to.x + 225 || ay < to.y || ay > to.y + 112).toBe(true)
  }
})

it('separates labels for opposite directions and handles coincident cards without invalid geometry', () => {
  expect(projectEdge({ x: 0, y: 0 }, { x: 400, y: 0 }).labelY).toBeLessThan(56)
  expect(projectEdge({ x: 400, y: 0 }, { x: 0, y: 0 }).labelY).toBeGreaterThan(56)
  expect(projectEdge({ x: 0, y: 0 }, { x: 0, y: 0 }).d).toBe('M112.5,56 L112.5,56')
})
