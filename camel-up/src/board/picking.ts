import * as T from 'three'
import { trackPoint, type FigureHit } from './layout'
type XY = { x: number; y: number }
const cross = (a: XY, b: XY, c: XY) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)

/** A convex projected silhouette makes a tall figure stack clickable above its numbered space. */
export function stackHit(points: T.Vector3[], camera: T.Camera): FigureHit | undefined {
  const sample = points.map((p) => {
    const v = p.project(camera)
    return { x: (v.x + 1) * 50, y: (1 - v.y) * 50 }
  })
  return polygonHit(sample)
}
function polygonHit(sample: XY[]): FigureHit | undefined {
  sample.sort((a, b) => a.x - b.x || a.y - b.y)
  if (sample.length < 3) return
  const hull = (cloud: XY[]) => {
    const chain: XY[] = []
    for (const p of cloud) {
      while (chain.length > 1 && cross(chain[chain.length - 2], chain[chain.length - 1], p) <= 0)
        chain.pop()
      chain.push(p)
    }
    return chain
  }
  const lower = hull(sample),
    upper = hull([...sample].reverse())
  lower.pop()
  upper.pop()
  const outline = [...lower, ...upper]
  const left = sample[0].x,
    right = sample[sample.length - 1].x,
    top = Math.min(...sample.map((p) => p.y)),
    bottom = Math.max(...sample.map((p) => p.y))
  const width = right - left,
    height = bottom - top
  if (width <= 0 || height <= 0) return
  const polygon =
    'polygon(' +
    outline
      .map(
        (p) =>
          (((p.x - left) / width) * 100).toFixed(1) +
          '% ' +
          (((p.y - top) / height) * 100).toFixed(1) +
          '%',
      )
      .join(',') +
    ')'
  return { left, top, width, height, polygon, outline, order: 3 + Math.round(bottom / 14) }
}
export function coversNumber(hull: FigureHit, x: number, y: number) {
  if (x < hull.left || x > hull.left + hull.width || y < hull.top || y > hull.top + hull.height)
    return false
  const point = { x, y },
    outline = hull.outline
  for (let i = 0; i < outline.length; i++)
    if (cross(outline[i], outline[(i + 1) % outline.length], point) < -0.0001) return false
  return true
}
export function tileHit(n: number, project: (x: number, z: number) => XY) {
  if (n < 1 || n > 16) return
  const points: XY[] = []
  for (let k = 0; k <= 6; k++) {
    const t = (n - 1 + (k + 0.05) / 6.1) / 16
    for (const r of [-0.69, 0.77]) {
      const p = trackPoint(t, r)
      points.push(project(p.x, p.z))
    }
  }
  return polygonHit(points)
}
