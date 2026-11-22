import * as T from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { rollSocket } from './layout'
export function diceRackGeometry() {
  const geometries: T.BufferGeometry[] = []
  function part(g: T.BufferGeometry, hex: string, x: number, y: number, z: number) {
    const p = g.index ? g.toNonIndexed() : g
    if (g !== p) g.dispose()
    p.deleteAttribute('uv')
    p.translate(x, y, z)
    const c = new T.Color(hex),
      colors = new Float32Array(p.getAttribute('position').count * 3)
    for (let i = 0; i < colors.length; i += 3) {
      colors[i] = c.r
      colors[i + 1] = c.g
      colors[i + 2] = c.b
    }
    p.setAttribute('color', new T.BufferAttribute(colors, 3))
    geometries.push(p)
  }
  const mid = rollSocket(2)
  part(new RoundedBoxGeometry(2.37, 0.08, 0.51, 2, 0.037), '#563a24', mid.x, 0.045, mid.z)
  for (let i = 0; i < 5; i++) {
    const p = rollSocket(i)
    part(new T.CylinderGeometry(0.198, 0.198, 0.009, 18), '#274138', p.x, 0.09, p.z)
    part(new T.TorusGeometry(0.2, 0.014, 4, 20).rotateX(-Math.PI / 2), '#c9a260', p.x, 0.099, p.z)
  }
  const geometry = mergeGeometries(geometries)!
  geometries.forEach((g) => g.dispose())
  return geometry
}
