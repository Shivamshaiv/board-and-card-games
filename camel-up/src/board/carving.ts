import * as T from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { bindCarvingPart } from './camel-rig'

export type Point = [number, number, number]
type Ring = [number, number, number, number, number]
export type BodyRing = [number, number, number, number]
export const brass = '#e8b660'
export const brassLight = '#ffde94'
export const leather = '#57352f'

function between(a: number, b: number, c: number, d: number, t: number) {
  const m0 = (c - a) * 0.5,
    m1 = (d - b) * 0.5
  return b + t * (m0 + t * (3 * (c - b) - 2 * m0 - m1 + t * (2 * (b - c) + m0 + m1)))
}
function curve<T extends number[]>(nodes: T[], steps: number): T[] {
  const rows: T[] = []
  for (let i = 0; i < nodes.length - 1; i++) {
    for (let s = 0; s < steps; s++)
      rows.push(
        nodes[i].map((v, k) =>
          between(
            nodes[Math.max(0, i - 1)][k],
            v,
            nodes[i + 1][k],
            nodes[Math.min(nodes.length - 1, i + 2)][k],
            s / steps,
          ),
        ) as T,
      )
  }
  return [...rows, nodes[nodes.length - 1]]
}
export function grid(
  rows: number,
  cols: number,
  point: (row: number, col: number) => Point,
  close = false,
) {
  const vertices: number[] = [],
    indices: number[] = []
  for (let row = 0; row < rows; row++)
    for (let col = 0; col < cols; col++) vertices.push(...point(row, col))
  for (let row = 0; row < rows - 1; row++)
    for (let col = 0; col < (close ? cols : cols - 1); col++) {
      const a = row * cols + col,
        b = a + cols,
        c = row * cols + ((col + 1) % cols),
        d = c + cols
      indices.push(a, b, c, c, b, d)
    }
  const result = new T.BufferGeometry()
  result.setAttribute('position', new T.Float32BufferAttribute(vertices, 3))
  result.setIndex(indices)
  result.computeVertexNormals()
  return result
}
export function mixColor(a: string, b: string, t: number) {
  return '#' + new T.Color(a).lerp(new T.Color(b), t).getHexString()
}

/** Every sculpture is a single vertex-painted mesh. Its cut, inlay and raised trim share one material. */
export class Parts {
  pieces: T.BufferGeometry[] = []
  rigPart = 0
  readonly woodColors?: Set<string>
  constructor(woodColors?: string[]) {
    if (woodColors) this.woodColors = new Set(woodColors)
  }
  add(geometry: T.BufferGeometry, color: string, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
    const geo = geometry
    // Keep shared smooth vertices so the seven figures also fit low-memory GPU buffers.
    if (!geo.index) geo.setIndex(Array.from({ length: geo.getAttribute('position').count }, (_, i) => i))
    geo.deleteAttribute('uv')
    if (rx) geo.rotateX(rx)
    if (ry) geo.rotateY(ry)
    if (rz) geo.rotateZ(rz)
    if (x || y || z) geo.translate(x, y, z)
    const tint = new T.Color(color),
      a = new Float32Array(geo.getAttribute('position').count * 3)
    for (let i = 0; i < a.length; i += 3) {
      a[i] = tint.r
      a[i + 1] = tint.g
      a[i + 2] = tint.b
    }
    geo.setAttribute('color', new T.BufferAttribute(a, 3))
    if (this.woodColors) {
      bindCarvingPart(geo, this.rigPart)
      const weights = new Uint8Array(geo.getAttribute('position').count)
      if (this.woodColors.has(color)) weights.fill(255)
      geo.setAttribute('woodGrain', new T.BufferAttribute(weights, 1, true))
      if (!geo.hasAttribute('inlayUv')) {
        const uv = new Float32Array(geo.getAttribute('position').count * 2).fill(-2)
        geo.setAttribute('inlayUv', new T.BufferAttribute(uv, 2))
      }
    }
    this.pieces.push(geo)
  }
  box(w: number, h: number, d: number, color: string, x: number, y: number, z: number) {
    this.add(new T.BoxGeometry(w, h, d), color, x, y, z)
  }
  oval(
    x: number,
    y: number,
    z: number,
    a: number,
    b: number,
    c: number,
    color: string,
    rz = 0,
    segments = 12,
  ) {
    this.add(
      new T.SphereGeometry(1, segments, Math.max(5, Math.floor(segments * 0.57))).scale(a, b, c),
      color,
      x,
      y,
      z,
      0,
      0,
      rz,
    )
  }
  rod(a: Point, b: Point, r0: number, r1: number, color: string, edges = 8) {
    const v = new T.Vector3(...a),
      w = new T.Vector3(...b),
      d = w.clone().sub(v)
    const geo = new T.CylinderGeometry(r1, r0, d.length(), edges)
    geo.applyQuaternion(new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), d.normalize()))
    const mid = v.lerp(w, 0.5)
    this.add(geo, color, mid.x, mid.y, mid.z)
  }
  cut(geometry: T.BufferGeometry, color: string, strength: number) {
    const unshared = geometry.toNonIndexed()
    geometry.dispose()
    const smooth = unshared.getAttribute('normal').clone()
    unshared.computeVertexNormals()
    const normals = unshared.getAttribute('normal')
    const n = new T.Vector3(),
      f = new T.Vector3()
    for (let i = 0; i < normals.count; i++) {
      n.fromBufferAttribute(smooth, i)
      f.fromBufferAttribute(normals, i)
      n.lerp(f, strength).normalize()
      normals.setXYZ(i, n.x, n.y, n.z)
    }
    this.add(unshared, color)
  }
  /** Elliptical section along a gently curved spine in the x/y plane. */
  sweep(nodes: Ring[], color: string, sides = 10, samples = 2) {
    const rows = curve(nodes, samples)
    this.add(
      grid(
        rows.length,
        sides,
        (i, j) => {
          const [x, y, z, r, w] = rows[i],
            prev = rows[Math.max(0, i - 1)],
            next = rows[Math.min(rows.length - 1, i + 1)]
          const dx = next[0] - prev[0],
            dy = next[1] - prev[1],
            len = Math.hypot(dx, dy) || 1
          const angle = (2 * Math.PI * j) / sides,
            s = Math.sin(angle) * Math.max(0.001, r)
          return [x - (dy / len) * s, y + (dx / len) * s, z + Math.cos(angle) * Math.max(0.001, w)]
        },
        true,
      ),
      color,
    )
  }
  finish() {
    const geometry = mergeGeometries(this.pieces)!
    for (const part of this.pieces) part.dispose()
    geometry.computeBoundingBox()
    geometry.computeBoundingSphere()
    return geometry
  }
}

// Anatomical cross-sections through the rump, true hump, withers and breast.
const bodyRows = curve<BodyRing>(
  [
    [-0.56, 0.48, 0.52, 0.018],
    [-0.51, 0.37, 0.63, 0.14],
    [-0.41, 0.32, 0.69, 0.207],
    [-0.31, 0.3, 0.72, 0.229],
    [-0.21, 0.315, 0.811, 0.232],
    [-0.125, 0.327, 0.888, 0.219],
    [-0.055, 0.324, 0.862, 0.214],
    [0.025, 0.313, 0.767, 0.217],
    [0.095, 0.304, 0.704, 0.225],
    [0.177, 0.3, 0.696, 0.235],
    [0.256, 0.306, 0.727, 0.226],
    [0.324, 0.346, 0.717, 0.185],
    [0.386, 0.41, 0.629, 0.112],
    [0.404, 0.465, 0.527, 0.025],
  ],
  3,
)
function bodyAt(x: number): BodyRing {
  let hi = 1
  while (hi < bodyRows.length - 1 && bodyRows[hi][0] < x) hi++
  const a = bodyRows[hi - 1],
    b = bodyRows[hi],
    t = (x - a[0]) / (b[0] - a[0] || 1)
  return a.map((v, k) => v + (b[k] - v) * t) as BodyRing
}
// Angle is zero at the hump and reaches either flank at ±π/2.
function surface(row: BodyRing, angle: number, pad = 0): Point {
  const [x, low, top, w] = row,
    cy = (low + top) / 2
  return [x, cy + Math.cos(angle) * ((top - low) / 2 + pad), Math.sin(angle) * (w + pad)]
}
function blanket(
  p: Parts,
  x0: number,
  x1: number,
  a0: number,
  a1: number,
  pad: number,
  color: string,
  rows = 8,
  columns = 13,
  embroidered = false,
) {
  const high = Math.max(a0, a1),
    low = Math.min(a0, a1)
  const geometry = grid(rows, columns, (i, j) =>
    surface(bodyAt(x0 + ((x1 - x0) * i) / (rows - 1)), high + ((low - high) * j) / (columns - 1), pad),
  )
  if (embroidered) {
    const coords: number[] = []
    for (let i = 0; i < rows; i++)
      for (let j = 0; j < columns; j++)
        coords.push(i / (rows - 1), 1 - Math.abs(high + ((low - high) * j) / (columns - 1)) / high)
    geometry.setAttribute('inlayUv', new T.Float32BufferAttribute(coords, 2))
  }
  p.add(geometry, color)
}
const marks: Record<string, number[][][]> = {
  red: [
    [
      [-0.09, 0],
      [0, 0.065],
      [0.09, 0],
      [0, -0.065],
      [-0.09, 0],
    ],
  ],
  blue: [
    [
      [-0.09, 0.035],
      [-0.04, 0.052],
      [0.025, 0.014],
      [0.088, 0.028],
    ],
    [
      [-0.09, -0.021],
      [-0.04, -0.004],
      [0.025, -0.042],
      [0.088, -0.028],
    ],
  ],
  green: [
    [
      [-0.086, -0.042],
      [-0.014, 0.062],
      [0.045, -0.042],
      [-0.086, -0.042],
    ],
    [
      [0.014, -0.042],
      [0.056, 0.025],
      [0.096, -0.042],
    ],
  ],
  purple: [
    [
      [0, 0.065],
      [0.02, 0.018],
      [0.086, 0],
      [0.02, -0.018],
      [0, -0.065],
      [-0.02, -0.018],
      [-0.086, 0],
      [-0.02, 0.018],
      [0, 0.065],
    ],
  ],
  black: [
    [
      [-0.056, -0.053],
      [0.056, 0.053],
    ],
    [
      [-0.056, 0.053],
      [0.056, -0.053],
    ],
  ],
  white: [
    Array.from({ length: 13 }, (_, i) => [
      0.069 * Math.cos((i * Math.PI) / 6),
      0.054 * Math.sin((i * Math.PI) / 6),
    ]),
  ],
  yellow: Array.from({ length: 8 }, (_, i) => [
    [0.021 * Math.cos((i * Math.PI) / 4), 0.021 * Math.sin((i * Math.PI) / 4)],
    [0.074 * Math.cos((i * Math.PI) / 4), 0.062 * Math.sin((i * Math.PI) / 4)],
  ]),
}
export function carvedCamel(body: string, color: string) {
  const skin = mixColor(body, '#e8b080', color === 'black' ? 0.13 : 0.22)
  const shadow = mixColor(body, '#4f301c', 0.24)
  const p = new Parts([body, skin, shadow])
  const nearBlack = '#241e25'
  const rug: Record<string, string> = {
    red: '#752d28',
    green: '#264b39',
    yellow: '#895923',
    blue: '#224465',
    purple: '#573954',
    white: '#5a625c',
    black: '#82684c',
  }
  // Angles run backwards here to orient the smooth exterior toward the light.
  p.cut(
    grid(bodyRows.length, 16, (i, j) => surface(bodyRows[i], (-j * Math.PI) / 8), true),
    body,
    0.24,
  )
  for (const side of [-1, 1]) {
    for (const front of [false, true]) {
      p.rigPart = 1 + (side === 1 ? 2 : 0) + (front ? 1 : 0)
      const z = side * 0.147,
        stagger = side === 1 ? 0.019 : -0.013
      const hip = front ? 0.234 : -0.367,
        knee = front ? 0.271 : -0.272,
        hock = front ? 0.241 : -0.389
      const foot = (front ? 0.269 : -0.347) + stagger
      p.sweep(
        [
          [hip, 0.546, z, 0.086, 0.074],
          [hip, 0.427, z * 1.04, 0.103, 0.082],
          [knee, 0.305, z * 1.12, 0.066, 0.061],
          [hock, 0.178, z * 1.16, 0.048, 0.046],
          [foot - 0.015, 0.084, z * 1.16, 0.042, 0.042],
          [foot + 0.008, 0.052, z * 1.16, 0.045, 0.042],
        ],
        body,
        10,
      )
      p.oval(knee, 0.304, z * 1.14, 0.061, 0.045, 0.061, shadow, 0.09, 9)
      for (const toe of [-1, 1]) {
        const hoof = new T.CylinderGeometry(0.74, 1, 0.047, 10, 1, false, Math.PI / 10).scale(
          0.068,
          1,
          0.035,
        )
        p.add(hoof, '#75502d', foot + 0.019, 0.034, z * 1.16 + toe * 0.021, 0, 0, -0.043)
        const shoe = new T.CylinderGeometry(0.98, 1, 0.01, 10, 1, false, Math.PI / 10).scale(
          0.069,
          1,
          0.036,
        )
        p.add(shoe, '#9d783d', foot + 0.019, 0.009, z * 1.16 + toe * 0.021, 0, 0, -0.035)
      }
    }
  }
  // The upright S-curve is carved separately at the breast to keep the airspace below the jaw.
  p.rigPart = 5
  p.sweep(
    [
      [0.186, 0.456, 0, 0.145, 0.171],
      [0.284, 0.539, 0, 0.147, 0.151],
      [0.374, 0.624, 0, 0.131, 0.133],
      [0.441, 0.736, 0, 0.106, 0.112],
      [0.491, 0.855, 0, 0.091, 0.098],
      [0.55, 0.975, 0, 0.085, 0.091],
      [0.642, 1.069, 0, 0.084, 0.085],
    ],
    body,
    12,
    3,
  )
  const headStart = p.pieces.length
  const face = curve<BodyRing>(
    [
      [0.414, 1.136, 1.189, 0.029],
      [0.461, 1.092, 1.228, 0.084],
      [0.508, 1.081, 1.245, 0.103],
      [0.547, 1.092, 1.245, 0.11],
      [0.595, 1.102, 1.213, 0.1],
      [0.641, 1.096, 1.18, 0.089],
      [0.68, 1.087, 1.167, 0.09],
      [0.731, 1.079, 1.153, 0.087],
      [0.78, 1.085, 1.146, 0.067],
      [0.812, 1.092, 1.132, 0.031],
    ],
    2,
  )
  const cheekPoint = (row: BodyRing, angle: number): Point => {
    const [x, low, top, width] = row,
      cs = Math.cos(angle),
      ss = Math.sin(angle)
    return [
      x,
      (low + top) / 2 + (Math.sign(cs) * Math.pow(Math.abs(cs), 0.77) * (top - low)) / 2,
      Math.sign(ss) * Math.pow(Math.abs(ss), 0.79) * width,
    ]
  }
  p.cut(
    grid(face.length, 12, (i, j) => cheekPoint(face[i], (-j * Math.PI) / 6), true),
    body,
    0.42,
  )
  const muzzleStrap = (from: number, to: number, pad: number, color: string) => {
    p.add(
      grid(
        3,
        18,
        (i, j) => {
          const x = from + ((to - from) * i) / 2,
            lo = face.findIndex((section) => section[0] > x) - 1,
            a = face[lo],
            b = face[lo + 1]
          const f = (x - a[0]) / (b[0] - a[0]),
            section = a.map((v, k) => v + (b[k] - v) * f) as BodyRing
          section[1] -= pad
          section[2] += pad
          section[3] += pad
          return cheekPoint(section, (-j * Math.PI) / 9)
        },
        true,
      ),
      color,
    )
  }
  muzzleStrap(0.651, 0.675, 0.0035, brass)
  muzzleStrap(0.655, 0.671, 0.0055, leather)
  p.sweep(
    [
      [0.594, 1.088, 0, 0.026, 0.065],
      [0.65, 1.074, 0, 0.032, 0.078],
      [0.712, 1.065, 0, 0.023, 0.072],
      [0.768, 1.071, 0, 0.018, 0.059],
      [0.799, 1.082, 0, 0.006, 0.034],
    ],
    shadow,
    10,
    2,
  )
  for (const side of [-1, 1]) {
    const z = (v: number) => side * v
    p.sweep(
      [
        [0.483, 1.223, z(0.049), 0.032, 0.031],
        [0.455, 1.264, z(0.064), 0.037, 0.028],
        [0.425, 1.291, z(0.08), 0.026, 0.019],
        [0.414, 1.295, z(0.084), 0.012, 0.009],
        [0.409, 1.295, z(0.086), 0.003, 0.003],
      ],
      body,
      9,
      2,
    )
    p.oval(0.445, 1.27, z(0.084), 0.013, 0.029, 0.006, skin, 0.68, 8)
    const almond = (cx: number, cy: number, cz: number, w: number, h: number, color: string) => {
      const shape = new T.Shape()
      shape.moveTo(-w, -h * 0.14)
      shape.quadraticCurveTo(-w * 0.06, h * 1.63, w, h * 0.07)
      shape.quadraticCurveTo(-w * 0.05, -h * 1.2, -w, -h * 0.14)
      const geo = new T.ShapeGeometry(shape, 5)
      if (side < 0) geo.rotateY(Math.PI).scale(-1, 1, 1)
      p.add(geo, color, cx, cy, z(cz))
    }
    // Eyes and nostrils are dark incisions in the carved planes, with a raised wooden brow.
    almond(0.555, 1.192, 0.104, 0.045, 0.019, '#875c33')
    almond(0.555, 1.193, 0.106, 0.032, 0.012, nearBlack)
    p.oval(0.566, 1.195, z(0.108), 0.0038, 0.0035, 0.0017, '#d2ad71', 0, 7)
    p.sweep(
      [
        [0.494, 1.198, z(0.089), 0.006, 0.004],
        [0.523, 1.215, z(0.095), 0.012, 0.013],
        [0.553, 1.219, z(0.096), 0.012, 0.014],
        [0.579, 1.208, z(0.093), 0.007, 0.008],
        [0.593, 1.2, z(0.088), 0.004, 0.004],
      ],
      shadow,
      7,
      2,
    )
    almond(0.759, 1.123, 0.081, 0.023, 0.008, '#503327')
    p.rod([0.699, 1.079, z(0.086)], [0.765, 1.085, z(0.068)], 0.005, 0.005, leather, 7)
    p.rod([0.764, 1.085, z(0.068)], [0.804, 1.102, z(0.033)], 0.005, 0.004, leather, 7)
    const cheek: Point = [0.578, 1.122, z(0.091)]
    p.rod([0.471, 1.188, z(0.092)], cheek, 0.012, 0.011, leather)
    p.rod(cheek, [0.702, 1.109, z(0.089)], 0.01, 0.008, leather)
    p.oval(...cheek, 0.016, 0.016, 0.008, brassLight, 0, 8)
    // A leather rein hangs clear of the neck, leaving a readable gap from the side.
    const rein: Point[] = [
      cheek,
      [0.536, 0.997, z(0.124)],
      [0.437, 0.846, z(0.145)],
      [0.328, 0.782, z(0.149)],
      [0.251, 0.775, z(0.158)],
    ]
    for (let i = 1; i < rein.length; i++) p.rod(rein[i - 1], rein[i], 0.006, 0.006, '#6b4730', 7)
    p.oval(0.251, 0.775, z(0.158), 0.024, 0.023, 0.01, brass, 0, 8)
  }
  for (let i = headStart; i < p.pieces.length; i++) p.pieces[i].translate(0.137, -0.066, 0)
  for (const side of [-1, 1]) {
    // A gilt breastband follows the shoulder and climbs toward the poll.
    const path: Point[] = [
      [0.125, 0.547, 0.23 * side],
      [0.229, 0.56, 0.231 * side],
      [0.314, 0.6, 0.174 * side],
      [0.383, 0.664, 0.135 * side],
      [0.444, 0.746, 0.116 * side],
      [0.49, 0.839, 0.102 * side],
      [0.528, 0.933, 0.092 * side],
      [0.588, 1.024, 0.087 * side],
    ]
    const patch = grid(path.length, 3, (i, j) => {
      const before = path[Math.max(i - 1, 0)],
        after = path[Math.min(i + 1, path.length - 1)],
        v = path[i]
      const dx = after[0] - before[0],
        dy = after[1] - before[1],
        len = Math.hypot(dx, dy) || 1
      const width = (j - 1) * 0.031
      return [v[0] - (dy / len) * width, v[1] + (dx / len) * width, v[2] + side * 0.005]
    })
    const neckUv: number[] = []
    for (let i = 0; i < path.length; i++)
      for (let j = 0; j < 3; j++) neckUv.push(i / (path.length - 1), -0.02 - (0.96 * j) / 2)
    patch.setAttribute('inlayUv', new T.Float32BufferAttribute(neckUv, 2))
    p.add(patch, rug[color] ?? leather)
    for (const edge of [-1, 1]) {
      const points: Point[] = path.map((v, i) => {
        const b = path[Math.max(i - 1, 0)],
          a = path[Math.min(i + 1, path.length - 1)],
          dx = a[0] - b[0],
          dy = a[1] - b[1],
          len = Math.hypot(dx, dy)
        return [v[0] - (dy / len) * 0.032 * edge, v[1] + (dx / len) * 0.032 * edge, v[2] + side * 0.008]
      })
      for (let i = 1; i < points.length; i++) p.rod(points[i - 1], points[i], 0.007, 0.007, brass, 6)
    }
    for (let i = 1; i < path.length - 1; i++) {
      const v = path[i]
      p.oval(v[0], v[1], v[2] + side * 0.012, 0.006, 0.008, 0.004, brassLight, -0.42, 7)
    }
    p.rod([0.686, 1.053, 0.073 * side], [0.673, 0.987, 0.08 * side], 0.005, 0.005, brass, 6)
    p.rod([0.673, 0.989, 0.08 * side], [0.669, 0.953, 0.08 * side], 0.005, 0.017, brassLight, 7)
  }
  p.rigPart = 6
  p.sweep(
    [
      [-0.494, 0.57, 0, 0.027, 0.027],
      [-0.572, 0.545, 0.011, 0.031, 0.027],
      [-0.604, 0.43, 0.035, 0.022, 0.026],
      [-0.611, 0.34, 0.042, 0.018, 0.02],
      [-0.633, 0.29, 0.047, 0.019, 0.014],
    ],
    body,
    8,
  )
  p.sweep(
    [
      [-0.615, 0.346, 0.045, 0.017, 0.018],
      [-0.624, 0.3, 0.048, 0.039, 0.03],
      [-0.652, 0.258, 0.057, 0.024, 0.017],
      [-0.673, 0.252, 0.056, 0.002, 0.002],
    ],
    shadow,
    8,
  )
  p.rigPart = 0
  const cloth = rug[color] ?? '#6e4134'
  blanket(p, -0.348, 0.059, -1.94, 1.94, 0.008, '#d7ae66', 12, 19)
  blanket(p, -0.336, 0.045, -1.88, 1.88, 0.013, cloth, 12, 25, true)
  for (const x of [-0.312, 0.021]) blanket(p, x, x + 0.012, -1.85, 1.85, 0.016, '#d9ad68', 3, 23)
  for (const x of [-0.282, -0.213, -0.144, -0.075, -0.006]) {
    const [bx, by, bz] = surface(bodyAt(x), 0, 0.018)
    p.oval(bx, by, bz, 0.014, 0.005, 0.027, '#e4c089', 0, 8)
  }
  for (const dir of [-1, 1]) {
    const s = dir > 0 ? 1 : -1
    blanket(p, -0.336, 0.045, s * 1.68, s * 1.74, 0.018, '#e6c17f', 10, 3)
    blanket(p, -0.336, 0.045, s * 1.77, s * 1.8, 0.018, '#f7d99b', 10, 3)
    for (let i = 0; i < 7; i++) {
      const x = -0.316 + i * 0.053,
        knot = surface(bodyAt(x), s * 1.91, 0.014)
      p.rod(
        knot,
        [x + 0.005, knot[1] - 0.032, knot[2] + s * 0.009],
        0.007,
        0.004,
        i % 2 ? brass : cloth,
        5,
      )
    }
    const decal = (dx: number, dy: number): Point => {
      const x = -0.147 + dx,
        section = bodyAt(x),
        cy = (section[1] + section[2]) / 2,
        y = 0.605 + dy
      const a = Math.acos(T.MathUtils.clamp((y - cy) / ((section[2] - section[1]) / 2 + 0.018), -1, 1))
      return surface(section, s * a, 0.022)
    }
    for (const stroke of marks[color] ?? marks.red)
      for (let i = 1; i < stroke.length; i++)
        p.rod(
          decal(stroke[i - 1][0], stroke[i - 1][1]),
          decal(stroke[i][0], stroke[i][1]),
          0.008,
          0.008,
          '#ffe5ae',
          6,
        )
    if (color === 'yellow') p.oval(...decal(0, 0), 0.029, 0.029, 0.011, brassLight, 0, 8)
  }
  // Four flat-topped leather saddle pads meet the hooves even when the upper piece faces the other way.
  // At the renderer's .99 model scale their upper face coincides with its .71 stack spacing.
  for (const x of [-0.321, 0.321])
    for (const side of [-1, 1]) {
      const z = 0.167 * side
      p.oval(x, 0.66, z, 0.106, 0.057, 0.06, shadow, 0, 10)
      const pad = new T.Shape(),
        w = 0.108,
        d = 0.061,
        r = 0.02
      pad.moveTo(-w + r, -d)
      pad.lineTo(w - r, -d)
      pad.quadraticCurveTo(w, -d, w, -d + r)
      pad.lineTo(w, d - r)
      pad.quadraticCurveTo(w, d, w - r, d)
      pad.lineTo(-w + r, d)
      pad.quadraticCurveTo(-w, d, -w, d - r)
      pad.lineTo(-w, -d + r)
      pad.quadraticCurveTo(-w, -d, -w + r, -d)
      const shaped = (depth: number) =>
        new T.ExtrudeGeometry(pad, { depth, bevelEnabled: false, curveSegments: 2 }).rotateX(
          -Math.PI / 2,
        )
      p.add(shaped(0.014), brass, x, 0.685, z)
      p.add(shaped(0.025), rug[color] ?? leather, x, 0.699, z)
      p.oval(x, 0.704, z + side * 0.06, 0.017, 0.009, 0.003, brassLight, 0, 7)
    }
  return p.finish()
}
