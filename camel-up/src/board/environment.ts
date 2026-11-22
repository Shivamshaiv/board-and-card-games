import * as T from 'three'

type Point = [number, number, number]
type Tint = string | T.Color
const TAU = Math.PI * 2
const SAND = -2.35
const WATER = -2.52
const PAVE = -2.02
const palette = new Map<string, T.Color>()
function tint(color: Tint): T.Color {
  if (typeof color !== 'string') return color
  if (!palette.has(color)) palette.set(color, new T.Color(color))
  return palette.get(color)!
}
function mix(a: string, b: string, amount: number) {
  return tint(a).clone().lerp(tint(b), amount)
}
function noise(a: number, b = 0) {
  const n = Math.sin(a * 127.1 + b * 311.7) * 43758.5453
  return n - Math.floor(n)
}

class Foliage {
  private points: number[] = []
  private uvs: number[] = []
  private colors: number[] = []
  private indices: number[] = []
  add(place: (t: number, side: number) => Point, color: T.Color) {
    const start = this.points.length / 3,
      segments = 8
    for (let i = 0; i <= segments; i++)
      for (const v of [-1, 0, 1]) {
        this.points.push(...place(i / segments, v))
        this.uvs.push(i / segments, (v + 1) / 2)
        this.colors.push(color.r, color.g, color.b)
      }
    for (let i = 0; i < segments; i++)
      for (let j = 0; j < 2; j++) {
        const n = start + i * 3 + j
        this.indices.push(n, n + 3, n + 4, n, n + 4, n + 1)
      }
  }
  geometry() {
    const g = new T.BufferGeometry()
    g.setAttribute('position', new T.Float32BufferAttribute(this.points, 3))
    g.setAttribute('uv', new T.Float32BufferAttribute(this.uvs, 2))
    g.setAttribute('color', new T.Float32BufferAttribute(this.colors, 3))
    g.setIndex(this.indices)
    g.computeVertexNormals()
    g.computeBoundingSphere()
    return g
  }
}

/** Bake static architecture, textile panels, and foliage into a few vertex-coloured meshes. */
class Batch {
  private positions: number[] = []
  private colors: number[] = []
  private origin: Point = [0, 0, 0]
  private angle = 0
  private cos = 1
  private sin = 0
  constructor(
    readonly foliage?: Foliage,
    readonly thicket?: Foliage,
  ) {}

  local(x: number, y: number, z: number, angle: number, build: () => void) {
    const origin = this.origin,
      previousAngle = this.angle
    this.origin = this.world([x, y, z])
    this.angle += angle
    this.cos = Math.cos(this.angle)
    this.sin = Math.sin(this.angle)
    build()
    this.origin = origin
    this.angle = previousAngle
    this.cos = Math.cos(this.angle)
    this.sin = Math.sin(this.angle)
  }
  world([x, y, z]: Point): Point {
    return [
      this.origin[0] + x * this.cos + z * this.sin,
      this.origin[1] + y,
      this.origin[2] - x * this.sin + z * this.cos,
    ]
  }
  tri(a: Point, b: Point, c: Point, color: Tint) {
    const rgb = tint(color)
    for (const p of [a, b, c]) {
      this.positions.push(...this.world(p))
      this.colors.push(rgb.r, rgb.g, rgb.b)
    }
  }
  quad(a: Point, b: Point, c: Point, d: Point, color: Tint) {
    this.tri(a, b, c, color)
    this.tri(a, c, d, color)
  }
  box(x: number, y: number, z: number, w: number, h: number, d: number, color: Tint) {
    const a = x - w / 2,
      b = x + w / 2,
      f = z + d / 2,
      n = z - d / 2,
      t = y + h
    this.quad([a, y, f], [b, y, f], [b, t, f], [a, t, f], color)
    this.quad([b, y, n], [a, y, n], [a, t, n], [b, t, n], color)
    this.quad([a, y, n], [a, y, f], [a, t, f], [a, t, n], color)
    this.quad([b, y, f], [b, y, n], [b, t, n], [b, t, f], color)
    this.quad([a, t, f], [b, t, f], [b, t, n], [a, t, n], color)
  }
  rod(a: Point, b: Point, foot: number, head: number, color: Tint, sides = 7) {
    const axis = new T.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize()
    const u = new T.Vector3()
      .crossVectors(axis, Math.abs(axis.z) < 0.9 ? new T.Vector3(0, 0, 1) : new T.Vector3(1, 0, 0))
      .normalize()
    const v = new T.Vector3().crossVectors(axis, u)
    const ring = (p: Point, r: number, i: number): Point => {
      const s = r * Math.sin((i * TAU) / sides),
        c = r * Math.cos((i * TAU) / sides)
      return [p[0] + u.x * c + v.x * s, p[1] + u.y * c + v.y * s, p[2] + u.z * c + v.z * s]
    }
    for (let i = 0; i < sides; i++) {
      this.quad(ring(a, foot, i), ring(a, foot, i + 1), ring(b, head, i + 1), ring(b, head, i), color)
      if (head > 0) this.tri(b, ring(b, head, i), ring(b, head, i + 1), color)
    }
  }
  mesh(material: T.Material, name: string) {
    const geometry = new T.BufferGeometry()
    geometry.setAttribute('position', new T.Float32BufferAttribute(this.positions, 3))
    geometry.setAttribute('color', new T.Float32BufferAttribute(this.colors, 3))
    geometry.computeVertexNormals()
    const uv: number[] = [],
      normal = geometry.getAttribute('normal'),
      pos = geometry.getAttribute('position')
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i),
        y = pos.getY(i),
        z = pos.getZ(i)
      const nx = Math.abs(normal.getX(i)),
        ny = Math.abs(normal.getY(i)),
        nz = Math.abs(normal.getZ(i))
      if (ny >= nx && ny >= nz) uv.push(x * 0.58, z * 0.58)
      else if (nx > nz) uv.push(z * 0.58, y * 0.58)
      else uv.push(x * 0.58, y * 0.58)
    }
    geometry.setAttribute('uv', new T.Float32BufferAttribute(uv, 2))
    geometry.computeBoundingSphere()
    const mesh = new T.Mesh(geometry, material)
    mesh.name = name
    this.positions = []
    this.colors = []
    return mesh
  }
}

const nearBank = (x: number) => -11.5 + 1.4 * Math.sin(x * 0.095 + 0.3) + 0.7 * Math.sin(x * 0.22 - 0.5)
const farBank = (x: number) => nearBank(x) - 6.6 - 1.5 * Math.cos(x * 0.14 + 0.45)
const hills = [
  [-38, -33, 16, 9, 6],
  [-24, -45, 23, 10, 8],
  [0, -43, 17, 12, 5.5],
  [23, -37, 20, 9, 6.8],
  [42, -25, 14, 11, 6.5],
  [-40, 0, 11, 20, 5.3],
  [-32, 24, 16, 11, 6.5],
  [-9, 41, 21, 13, 7.2],
  [17, 38, 18, 9, 5.9],
  [41, 13, 13, 19, 7.4],
  [-58, -57, 28, 15, 10],
  [30, -59, 26, 15, 9],
  [-51, 45, 20, 15, 8],
  [56, 46, 19, 13, 10],
]
function sandHeight(x: number, z: number) {
  let h = 0
  for (const [cx, cz, rx, rz, amp] of hills) {
    const dx = (x - cx) / rx
    // A soft windward sweep and steeper leeward slipface form a curved crest.
    const dz = (z - cz - 1.5 * Math.sin(dx * 2.2)) / rz
    const r = dx * dx + dz * dz * (dz < 0 ? 1.5 : 0.8)
    // The racecourt opens onto the river to the north and wind-shaped dunes to the south.
    // The taller southern slipfaces give the reverse trackside camera a real desert horizon.
    if (r < 1) h += amp * (cz < -18 ? 0.28 : 0.57) * Math.pow(1 - r, 1.6)
  }
  return SAND + h
}
function terrain(p: Batch, water: Batch) {
  const start = -68,
    end = 68,
    columns = 50
  for (let i = 0; i < columns; i++) {
    const x0 = start + ((end - start) * i) / columns,
      x1 = start + ((end - start) * (i + 1)) / columns
    for (const back of [false, true]) {
      const edge = (x: number) => (back ? farBank(x) : nearBank(x))
      const limit = back ? -70 : 70,
        rows = 28
      const vertex = (x: number, t: number): Point => {
        const z = edge(x) + (limit - edge(x)) * t
        return [x, sandHeight(x, z), z]
      }
      for (let j = 0; j < rows; j++) {
        const a = vertex(x0, j / rows),
          b = vertex(x1, j / rows),
          c = vertex(x1, (j + 1) / rows),
          d = vertex(x0, (j + 1) / rows)
        const level = (a[1] + b[1] + c[1] + d[1]) / 4 - SAND
        const color =
          j === 0
            ? mix('#928252', '#ae9b65', noise(i))
            : mix('#c59468', '#efc795', Math.min(0.97, 0.23 + level * 0.08 + noise(i, j) * 0.14))
        if (back) p.quad(a, b, c, d, color)
        else p.quad(d, c, b, a, color)
      }
      const z0 = edge(x0),
        z1 = edge(x1),
        shift = back ? 0.23 : -0.23
      p.quad(
        [x0, SAND, z0],
        [x1, SAND, z1],
        [x1, WATER - 0.08, z1 + shift],
        [x0, WATER - 0.08, z0 + shift],
        '#997047',
      )
    }
    for (let row = 0; row < 8; row++) {
      const surf = (x: number, t: number): Point => [
        x,
        WATER,
        nearBank(x) + (farBank(x) - nearBank(x)) * t,
      ]
      const a = surf(x0, row / 8),
        b = surf(x1, row / 8),
        c = surf(x1, (row + 1) / 8),
        d = surf(x0, (row + 1) / 8)
      const depth = Math.sin(((row + 0.5) / 8) * Math.PI)
      water.quad(a, b, c, d, mix('#e7e5bf', '#a4cac2', depth * 0.87 + noise(i, row) * 0.1))
    }
  }
  // Narrow, irregular directional glints follow the current; no per-frame water shader.
  for (let i = 0; i < 260; i++) {
    const x = (noise(i, 2) - 0.5) * 102,
      t = 0.03 + noise(i, 4) * 0.94,
      z = nearBank(x) + (farBank(x) - nearBank(x)) * t
    const w = 0.2 + noise(i, 7) * 1.5,
      d = 0.016 + noise(i, 8) * 0.075
    water.quad(
      [x - w, WATER + 0.012, z],
      [x - w * 0.1, WATER + 0.012, z + d],
      [x + w, WATER + 0.012, z + d * 0.3],
      [x + w * 0.18, WATER + 0.012, z - d * 0.4],
      mix('#abcfc3', '#e4e9c7', noise(i, 3) * 0.61),
    )
  }
}

function terrace(p: Batch) {
  function tier(
    width: number,
    depth: number,
    bottom: number,
    top: number,
    bevel: number,
    color: string,
  ) {
    const w = width / 2,
      d = depth / 2
    const rim: [number, number][] = [
      [-w + bevel, -d],
      [w - bevel, -d],
      [w, -d + bevel],
      [w, d - bevel],
      [w - bevel, d],
      [-w + bevel, d],
      [-w, d - bevel],
      [-w, -d + bevel],
    ]
    for (let i = 0; i < 8; i++) {
      const [x, z] = rim[i],
        [u, v] = rim[(i + 1) % 8]
      p.quad([u, bottom, v], [x, bottom, z], [x, top, z], [u, top, v], color)
      p.tri([0, top, 0], [u, top, v], [x, top, z], color)
    }
  }
  tier(25.6, 17.4, SAND - 0.08, PAVE - 0.07, 0.9, '#ac8057')
  tier(25.4, 17.18, PAVE - 0.07, PAVE - 0.012, 0.86, '#c5a278')
  // Staggered cut-limestone courtyard, visible between the terrace and the riverfront.
  for (let row = 0; row < 13; row++)
    for (let col = 0; col < 14; col++) {
      const x = -12.55 + col * 1.85 + (row % 2 ? 0.8 : 0),
        z = -8.04 + row * 1.3
      if (Math.abs(x) > 11.95 || (Math.abs(x) > 11.2 && Math.abs(z) > 7.5)) continue
      p.box(x, PAVE - 0.07, z, 1.829, 0.07, 1.281, mix('#bc976c', '#ddbd8f', noise(row, col) * 0.76))
    }
  tier(18.6, 11.3, PAVE - 0.02, -1.77, 0.42, '#ab7c52')
  tier(18.24, 10.94, -1.77, -1.67, 0.37, '#dbb681')
  tier(17.96, 10.7, -1.67, -1.3, 0.32, '#a87e56')
  tier(18.05, 10.8, -1.39, -1.34, 0.35, '#896947')
  tier(18.26, 10.99, -1.3, -1.19, 0.36, '#d9b37c')
  tier(18.13, 10.88, -1.19, -1.12, 0.35, '#ebca92')
  for (const side of [-1, 1]) {
    for (let i = -17; i <= 17; i++) {
      const x = i * 0.48,
        z = side * 5.355
      p.quad(
        [x - 0.16, -1.51, z],
        [x, -1.39, z],
        [x + 0.16, -1.51, z],
        [x, -1.62, z],
        i % 3 ? '#c09a63' : '#6b8b7d',
      )
    }
    for (let i = -9; i <= 9; i++) {
      const z = i * 0.49,
        x = side * 8.985
      p.quad(
        [x, -1.51, z - 0.16],
        [x, -1.39, z],
        [x, -1.51, z + 0.16],
        [x, -1.62, z],
        i % 3 ? '#c09a63' : '#6b8b7d',
      )
    }
    for (const x of [-5.7, 5.7])
      for (let step = 0; step < 4; step++) {
        p.box(x, PAVE - 0.02, side * (6.42 - step * 0.26), 2.46, (step + 1) * 0.19, 0.3, '#cfab7b')
      }
  }
}

function urn(p: Batch, x: number, y: number, z: number, s: number, color = '#ac603e') {
  const profile = [
    [0, 0.23],
    [0.12, 0.33],
    [0.51, 0.43],
    [0.73, 0.36],
    [0.84, 0.19],
    [0.92, 0.23],
  ]
  for (let i = 1; i < profile.length; i++) {
    const [h, r] = profile[i - 1],
      [n, q] = profile[i]
    p.rod([x, y + h * s, z], [x, y + n * s, z], r * s, q * s, color, 10)
  }
  p.rod([x, y + 0.92 * s, z], [x, y + 0.955 * s, z], 0.24 * s, 0.24 * s, '#deb77a', 10)
  p.rod([x, y + 0.956 * s, z], [x, y + 0.96 * s, z], 0.16 * s, 0.16 * s, '#513e33', 10)
}

function column(p: Batch, x: number, z: number, h: number, r: number) {
  p.box(x, 0, z, r * 2.7, 0.16, r * 2.7, '#ad8456')
  const drum = (a: number, b: number, ra: number, rb: number, c: string) =>
    p.rod([x, a, z], [x, b, z], ra, rb, c, 10)
  drum(0.14, 0.31, r * 1.22, r, '#ddbb82')
  drum(0.31, h - 0.53, r, r * 0.83, '#c69f6b')
  drum(0.39, 0.44, r * 1.012, r * 1.012, '#557a74')
  drum(h - 0.6, h - 0.57, r * 0.91, r * 0.91, '#bd955c')
  drum(h - 0.57, h - 0.48, r * 0.91, r * 0.94, '#3d6c69')
  drum(h - 0.48, h - 0.19, r * 0.88, r * 1.53, '#cda36c')
  for (let i = 0; i < 10; i++) {
    const a = (TAU * i) / 10
    const leaf = (angle: number, y: number, rad: number): Point => [
      x + Math.cos(angle) * rad,
      y,
      z + Math.sin(angle) * rad,
    ]
    p.tri(
      leaf(a - 0.19, h - 0.235, r * 1.5),
      leaf(a + 0.19, h - 0.235, r * 1.5),
      leaf(a, h - 0.45, r * 0.97),
      '#587d70',
    )
  }
  drum(h - 0.25, h - 0.19, r * 1.4, r * 1.54, '#6e8a79')
  p.box(x, h - 0.19, z, r * 3.2, 0.19, r * 3.2, '#d7af79')
}

function arcade(p: Batch, x: number, z: number, angle: number, n: number, ground = PAVE) {
  p.local(x, ground, z, angle, () => {
    const span = 1.85,
      spring = 1.61,
      inner = 0.72,
      outer = 0.99,
      depth = 0.33
    const w = n * span
    p.box(0, -0.04, 0, w + 0.76, 0.14, 1.19, '#b5946a')
    for (let i = 0; i <= n; i++) column(p, (i - n / 2) * span, 0, spring, 0.215)
    for (let i = 0; i < n; i++) {
      const cx = (i - (n - 1) / 2) * span,
        sections = 11
      const point = (a: number, r: number, d: number): Point => [
        cx + r * Math.cos(a),
        spring + r * Math.sin(a),
        d,
      ]
      for (let j = 0; j < sections; j++) {
        const a = (j * Math.PI) / sections,
          b = ((j + 1) * Math.PI) / sections
        const c = mix('#ba9160', '#e1bd83', 0.25 + noise(i + 1, j) * 0.58)
        for (const side of [-1, 1]) {
          const f = side * depth
          p.quad(point(a, inner, f), point(b, inner, f), point(b, outer, f), point(a, outer, f), c)
          p.quad(
            point(a, outer, f),
            point(b, outer, f),
            [cx + outer * Math.cos(b), 2.7, f],
            [cx + outer * Math.cos(a), 2.7, f],
            '#bc9666',
          )
        }
        p.quad(
          point(a, inner, -depth),
          point(b, inner, -depth),
          point(b, inner, depth),
          point(a, inner, depth),
          '#a17b54',
        )
      }
    }
    p.box(0, 2.69, 0, w + 0.59, 0.16, 0.76, '#ddb881')
    p.box(0, 2.85, 0, w + 0.68, 0.065, 0.82, '#728f7a')
    p.box(0, 2.915, 0, w + 0.83, 0.16, 0.89, '#dab17a')
    for (let i = 0; i < n * 4 + 1; i++) p.box(i * 0.45 - w / 2, 3.075, 0, 0.19, 0.15, 0.44, '#c59b68')
  })
}

function pavilion(
  p: Batch,
  x: number,
  z: number,
  angle: number,
  width: number,
  colors: [string, string],
  ground = PAVE,
) {
  p.local(x, ground, z, angle, () => {
    const d = 2.72,
      h = 3.05
    p.box(0, -0.01, 0, width + 0.43, 0.15, d + 0.4, '#b68e64')
    p.box(0, 0.14, 0, width + 0.18, 0.085, d + 0.14, '#d7b588')
    p.box(0, 0.225, 0, width - 0.15, 0.024, d - 0.15, colors[0])
    // Flatwoven rug with a contrasting border beneath the shaded benches.
    for (const s of [-1, 1]) {
      p.box(0, 0.251, s * (d / 2 - 0.26), width - 0.46, 0.015, 0.055, colors[1])
      p.box(s * (width / 2 - 0.24), 0.251, 0, 0.065, 0.015, d - 0.41, colors[1])
      p.box(0, 0.43, s * 0.88, width - 0.65, 0.24, 0.41, '#9f6f46')
      p.box(0, 0.67, s * 0.88, width - 0.69, 0.12, 0.43, colors[1])
    }
    for (const u of [-1, 1])
      for (const v of [-1, 1]) {
        const px = u * (width / 2 - 0.13),
          pz = v * (d / 2 - 0.09)
        p.rod([px, 0.22, pz], [px, h, pz], 0.074, 0.054, '#885e3f')
        p.rod([px, 0.24, pz], [px, 0.49, pz], 0.105, 0.093, '#b39756')
        p.rod([px, h - 0.17, pz], [px, h + 0.12, pz], 0.093, 0.051, '#d4ad63')
      }
    const peak = h + 0.74,
      strips = 11
    const cloth = (u: number, v: number): Point => [
      u * (width + 0.54),
      h +
        (peak - h) * (1 - Math.abs(v)) -
        0.24 * Math.sin(Math.PI * Math.abs(v)) -
        0.135 * Math.cos(u * Math.PI),
      v * (d * 0.5 + 0.29),
    ]
    for (let i = 0; i < strips; i++) {
      const a = i / strips - 0.5,
        b = (i + 1) / strips - 0.5,
        c = mix(colors[i % 2], colors[(i + 1) % 2], 0.035 + noise(i) * 0.08)
      for (let j = -4; j < 4; j++)
        p.quad(cloth(a, j / 4), cloth(a, (j + 1) / 4), cloth(b, (j + 1) / 4), cloth(b, j / 4), c)
      for (const side of [-1, 1]) {
        const A = cloth(a, side),
          B = cloth(b, side),
          m = (A[0] + B[0]) / 2
        p.quad(A, B, [B[0], B[1] - 0.16, B[2]], [A[0], A[1] - 0.16, A[2]], c)
        p.tri(
          [A[0], A[1] - 0.16, A[2]],
          [B[0], B[1] - 0.16, B[2]],
          [m, (A[1] + B[1]) * 0.5 - 0.26, A[2]],
          c,
        )
        p.quad(
          [A[0], A[1] - 0.06, A[2] + side * 0.003],
          [B[0], B[1] - 0.06, B[2] + side * 0.003],
          [B[0], B[1] - 0.085, B[2] + side * 0.003],
          [A[0], A[1] - 0.085, A[2] + side * 0.003],
          '#d4ae73',
        )
      }
    }
    // Loosely tied, pleated side curtains leave the central river view open.
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        const corner = sx * (width / 2 - 0.1),
          front = sz * (d * 0.5 - 0.08)
        const seam = (fraction: number, level: number): Point => {
          const widths = [0.47, 0.34, 0.12, 0.35],
            elevations = [h - 0.08, h * 0.72, h * 0.42, 0.29]
          return [
            corner - sx * (fraction * widths[level]),
            elevations[level] + (level === 3 ? 0.05 * Math.sin(fraction * 8) : 0),
            front + 0.043 * Math.cos(fraction * Math.PI * 7) + 0.055 * Math.sin(level * 1.7),
          ]
        }
        for (let fold = 0; fold < 7; fold++)
          for (let level = 0; level < 3; level++) {
            const a = fold / 7,
              b = (fold + 1) / 7
            p.quad(
              seam(a, level),
              seam(b, level),
              seam(b, level + 1),
              seam(a, level + 1),
              mix(colors[1], fold % 2 ? '#ae8c66' : '#e3d0a4', fold % 2 ? 0.2 : 0.19),
            )
          }
        p.box(corner - sx * 0.058, h * 0.42 - 0.035, front + 0.035, 0.16, 0.065, 0.09, '#bd994c')
      }
    for (const s of [-1, 1]) {
      const px = s * (width / 2 - 0.13)
      p.rod([px, h - 0.08, -d / 2], [px, peak, 0], 0.04, 0.045, '#815b40')
      p.rod([px, peak, 0], [px, h - 0.08, d / 2], 0.045, 0.04, '#815b40')
      p.rod([px, peak - 0.05, 0], [px, peak + 0.21, 0], 0.08, 0.018, '#d7ae57')
    }
    urn(p, width / 2 + 0.36, 0.03, -0.66, 0.82)
    urn(p, width / 2 + 0.52, 0.03, 0.08, 0.56, '#578d81')
  })
}

function palm(p: Batch, x: number, z: number, height: number, seed: number, ground = SAND) {
  p.local(x, ground, z, noise(seed) * TAU, () => {
    const r = 0.034 * height,
      bend = 0.14 * height
    const trunk = (t: number): Point => [bend * t * t, height * t, 0.13 * Math.sin(t * 1.9)]
    for (let i = 0; i < 9; i++) {
      const a = i / 9,
        b = (i + 1) / 9,
        ra = r * (1.09 - 0.39 * a),
        rb = r * (1.09 - 0.39 * b)
      p.rod(trunk(a), trunk(b), ra, rb, mix('#795d43', '#ba9366', noise(seed, i) * 0.8), 7)
      p.rod(trunk(a + 0.042), trunk(a + 0.069), ra * 1.14, ra * 0.98, '#9e7d52', 7)
      if (height > 4.25)
        for (let j = 0; j < 6; j++) {
          const top = trunk(a + 0.087),
            low = trunk(a + 0.035),
            ang = ((j + i * 0.5) * TAU) / 6
          const edge = (pt: Point, rot: number, rad: number): Point => [
            pt[0] + Math.cos(rot) * rad,
            pt[1],
            pt[2] + Math.sin(rot) * rad,
          ]
          p.tri(
            edge(top, ang - 0.39, ra * 1.01),
            edge(top, ang + 0.39, ra * 1.01),
            edge(low, ang, ra * 1.19),
            j % 2 ? '#94734f' : '#a88255',
          )
        }
    }
    const crown = trunk(1)
    for (let i = 0; i < 17; i++) {
      const a = i * 2.39996 + noise(seed, i) * 0.22,
        ca = Math.cos(a),
        sa = Math.sin(a)
      const upper = i > 10,
        length = height * (upper ? 0.32 : 0.47) * (1 + 0.2 * noise(i, seed))
      function leaf(t: number, side = 0, down = 0): Point {
        const rise =
          height *
          ((upper ? 0.245 : 0.16) * Math.sin(t * Math.PI * 0.81) - (upper ? 0.04 : 0.25) * t * t)
        return [
          crown[0] + length * t * ca - side * sa,
          crown[1] + rise - down,
          crown[2] + length * t * sa + side * ca,
        ]
      }
      const spread = length * 0.172,
        bend = 0.12 + noise(i, seed) * 0.24
      p.foliage?.add(
        (t, side) =>
          p.world(
            leaf(
              t,
              side * spread,
              Math.abs(side) * bend * spread + side * spread * 0.17 * Math.sin(t * 3.4 + i),
            ),
          ),
        mix('#859d7d', '#e7e1a9', 0.24 + noise(seed, i) * 0.65),
      )
    }
    for (let i = 0; i < 3; i++) {
      const a = 2 * i
      const top: Point = [crown[0] + 0.18 * Math.cos(a), crown[1] - 0.11, crown[2] + 0.18 * Math.sin(a)]
      p.rod(top, [top[0] + 0.06, top[1] - 0.4, top[2] + 0.1], 0.105, 0.065, '#bb8340', 6)
    }
  })
}

function reeds(p: Batch, x: number, z: number, seed: number) {
  for (let i = 0; i < 9; i++) {
    const a = noise(i, seed) * TAU,
      s = 0.15 + noise(i + 2, seed) * 0.52
    const px = x + Math.cos(a) * s,
      pz = z + Math.sin(a) * s,
      h = 0.32 + noise(i + 23, seed) * 0.59
    p.tri(
      [px - 0.046, SAND - 0.08, pz],
      [px + 0.046, SAND - 0.08, pz],
      [px + Math.cos(a) * 0.24, SAND + h, pz + Math.sin(a) * 0.23],
      i % 3 ? '#728c55' : '#879c58',
    )
  }
}

function tamarisk(p: Batch, x: number, z: number, h: number, seed: number) {
  p.local(x, sandHeight(x, z), z, noise(seed, 42) * TAU, () => {
    const r = h * 0.34
    p.rod([0, 0, 0], [0, h * 0.66, 0], h * 0.052, h * 0.028, '#77664b', 6)
    for (let i = 0; i < 4; i++) {
      const angle = i * Math.PI * 0.27,
        ca = Math.cos(angle),
        sa = Math.sin(angle)
      const color = mix('#b6c6a4', '#d1d5b2', noise(seed, i))
      p.thicket?.add((t, side) => {
        const width = (t - 0.5) * r * 3.4,
          bulge = Math.sin(t * Math.PI) * 0.12 * h
        return p.world([
          width * ca + sa * bulge + side * r * 0.14,
          h * 0.68 + side * h * 0.35,
          width * sa - ca * bulge,
        ])
      }, color)
    }
    for (let lobe = 0; lobe < 4; lobe++) {
      const a = lobe * 2.39,
        cx = lobe ? Math.cos(a) * r * 0.68 : 0,
        cz = lobe ? Math.sin(a) * r * 0.68 : 0
      const cy = h * (lobe ? 0.65 : 0.75),
        rad = r * (lobe ? 0.47 : 0.66),
        rings = 3
      const crown = (level: number, k: number): Point => {
        const phi = (Math.PI * level) / rings,
          theta = (TAU * k) / 7 + 0.11 * Math.sin(phi * 2)
        const irregular = 1 + 0.11 * noise((k % 7) + lobe * 143 + seed, level)
        return [
          cx + rad * irregular * Math.sin(phi) * Math.cos(theta),
          cy + rad * Math.cos(phi) * 0.91,
          cz + rad * irregular * Math.sin(phi) * Math.sin(theta),
        ]
      }
      for (let j = 0; j < rings; j++)
        for (let k = 0; k < 7; k++) {
          const shade = (1 - j / rings) * 0.59 + noise(seed + k, lobe + j) * 0.29
          p.quad(
            crown(j, k),
            crown(j, k + 1),
            crown(j + 1, k + 1),
            crown(j + 1, k),
            mix('#36583d', '#8a9e62', shade),
          )
        }
    }
  })
}

function fieldsGeometry() {
  const pos: number[] = [],
    uv: number[] = [],
    index: number[] = [],
    wide = 36,
    deep = 9
  for (let i = 0; i <= wide; i++)
    for (let j = 0; j <= deep; j++) {
      const x = -51 + (102 * i) / wide,
        t = j / deep
      const depth = 16.7 + 3.1 * Math.sin(x * 0.13 + 0.7)
      const z = farBank(x) - 0.62 - depth * t
      pos.push(x, sandHeight(x, z) + 0.039, z)
      uv.push((i / wide) * 1.55, 1 - t)
      if (i < wide && j < deep) {
        const n = i * (deep + 1) + j
        index.push(n, n + deep + 1, n + deep + 2, n, n + deep + 2, n + 1)
      }
    }
  const g = new T.BufferGeometry()
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2))
  g.setIndex(index)
  g.computeVertexNormals()
  return g
}

function felucca(p: Batch, x: number, z: number, yaw: number, scale: number) {
  p.local(x, WATER + 0.015, z, yaw, () => {
    const point = (a: number, b: number, c: number): Point => [a * scale, b * scale, c * scale]
    const xs = [-1.55, -1.14, -0.48, 0.42, 1.13, 1.59],
      bs = [0.015, 0.31, 0.45, 0.46, 0.33, 0.018],
      hs = [0.5, 0.33, 0.285, 0.29, 0.36, 0.6]
    for (let i = 0; i < 5; i++) {
      for (const s of [-1, 1]) {
        p.quad(
          point(xs[i], hs[i], s * bs[i]),
          point(xs[i + 1], hs[i + 1], s * bs[i + 1]),
          point(xs[i + 1], 0.035, s * bs[i + 1] * 0.56),
          point(xs[i], 0.035, s * bs[i] * 0.56),
          i === 0 || i === 4 ? '#9e623f' : '#955e3e',
        )
        p.quad(
          point(xs[i], hs[i] + 0.01, s * bs[i]),
          point(xs[i + 1], hs[i + 1] + 0.01, s * bs[i + 1]),
          point(xs[i + 1], hs[i + 1] - 0.07, s * bs[i + 1] * 0.99),
          point(xs[i], hs[i] - 0.07, s * bs[i] * 0.99),
          '#c9aa76',
        )
      }
      p.quad(
        point(xs[i], hs[i] - 0.039, bs[i] * 0.93),
        point(xs[i + 1], hs[i + 1] - 0.039, bs[i + 1] * 0.93),
        point(xs[i + 1], hs[i + 1] - 0.039, -bs[i + 1] * 0.93),
        point(xs[i], hs[i] - 0.039, -bs[i] * 0.93),
        '#705946',
      )
    }
    p.rod(point(-0.25, 0.24, 0), point(-0.34, 2.52, 0), 0.038 * scale, 0.024 * scale, '#896844')
    p.rod(point(-1.06, 0.66, -0.03), point(0.89, 3.28, 0.06), 0.032 * scale, 0.026 * scale, '#94714b')
    const head = point(0.85, 3.23, 0.07),
      tack = point(-1.0, 0.68, -0.03),
      clew = point(1.16, 0.51, 0.31)
    for (let i = 0; i < 6; i++) {
      const at = (t: number): Point => [
        tack[0] + (clew[0] - tack[0]) * t,
        tack[1] + (clew[1] - tack[1]) * t,
        tack[2] + (clew[2] - tack[2]) * t + 0.19 * scale * Math.sin(t * Math.PI),
      ]
      p.tri(head, at(i / 6), at((i + 1) / 6), i % 3 ? '#f4dbad' : '#e8c999')
    }
  })
}

function pyramid(p: Batch, x: number, z: number, size: number, angle: number) {
  p.local(x, sandHeight(x, z) - 0.13, z, angle, () => {
    const h = size * 0.73,
      base = size / 2
    const corners: Point[] = [
      [-base, 0, -base],
      [base, 0, -base],
      [base, 0, base],
      [-base, 0, base],
    ]
    const tip: Point = [0, h, 0]
    for (let i = 0; i < 4; i++) {
      const a = corners[i],
        b = corners[(i + 1) % 4]
      p.tri(a, tip, b, ['#c19b70', '#b58a62', '#d3ad7b', '#e2c08c'][i])
      for (let row = 1; row < 14; row++) {
        const t = row / 15,
          at = (v: Point, level: number): Point => [
            v[0] * (1 - level) * 1.001,
            h * level,
            v[2] * (1 - level) * 1.001,
          ]
        p.quad(at(a, t), at(b, t), at(b, t + 0.0034), at(a, t + 0.0034), i === 1 ? '#ac845f' : '#c09a6d')
      }
      const tt = 0.91
      p.tri(
        [a[0] * (1 - tt) * 1.01, h * tt, a[2] * (1 - tt) * 1.01],
        tip,
        [b[0] * (1 - tt) * 1.01, h * tt, b[2] * (1 - tt) * 1.01],
        '#e4c595',
      )
    }
  })
}

function villageHouse(p: Batch, x: number, z: number, w: number, h: number, yaw: number, dome: boolean) {
  p.local(x, sandHeight(x, z), z, yaw, () => {
    const d = w * 0.76
    p.box(0, 0, 0, w, h, d, '#bc9267')
    p.box(0, h - 0.16, 0, w + 0.11, 0.16, d + 0.11, '#cfac7a')
    for (const side of [-1, 1]) p.box(0, h, side * d * 0.49, w + 0.04, 0.31, 0.13, '#c6a072')
    for (const side of [-1, 1]) p.box(side * w * 0.49, h, 0, 0.13, 0.31, d, '#c6a072')
    p.box(-w * 0.17, 0.02, d * 0.5 + 0.012, 0.55, h * 0.59, 0.015, '#706047')
    for (const side of [-1, 1]) {
      p.box(w * 0.22, h * 0.53, side * (d * 0.5 + 0.01), 0.43, 0.54, 0.025, '#675b48')
      for (let i = 0; i < 3; i++)
        p.box(
          w * 0.22 + (i - 1) * 0.12,
          h * 0.53,
          side * (d * 0.5 + 0.035),
          0.026,
          0.54,
          0.022,
          '#ae8e68',
        )
    }
    if (dome) {
      const r = w * 0.34,
        steps = 5
      for (let i = 0; i < steps; i++) {
        const a = (i * Math.PI * 0.5) / steps,
          b = ((i + 1) * Math.PI * 0.5) / steps
        p.rod(
          [0, h + 0.13 + r * 0.86 * Math.sin(a), 0],
          [0, h + 0.13 + r * 0.86 * Math.sin(b), 0],
          r * Math.cos(a),
          r * Math.cos(b),
          '#dac29a',
          12,
        )
      }
    }
  })
}

// A tileable, anisotropic mineral grain is sampled in architectural world units.
// Its pores also perturb the light across limestone bevels at the trackside camera.
function surfaceTexture(water = false) {
  const size = 192,
    canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!,
    ink = ctx.createImageData(size, size)
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const u = x / size,
        v = y / size,
        grain = noise(x, y),
        i = (y * size + x) * 4
      const broad =
        Math.sin(u * TAU * 2 + 0.6 * Math.sin(v * TAU * 3)) *
        Math.sin(v * TAU * 2 + 0.32 * Math.cos(u * TAU))
      const veins = Math.sin((u * 2 + v * 3) * TAU + 0.6 * Math.cos(v * TAU * 2))
      const value = water
        ? 146 +
          45 * Math.sin((v * 5 + u) * TAU + 0.69 * Math.sin(u * TAU * 2)) +
          20 * Math.sin((v * 11 + u) * TAU)
        : 231 + 5 * broad + 4 * veins + grain * 15 - (grain > 0.962 ? 22 : 0)
      ink.data[i] = ink.data[i + 1] = ink.data[i + 2] = value
      ink.data[i + 3] = 255
    }
  ctx.putImageData(ink, 0, 0)
  if (!water)
    for (let i = 0; i < 42; i++) {
      const x = noise(i, 5) * size,
        y = noise(i, 1) * size
      ctx.strokeStyle = 'rgba(78,66,58,.13)'
      ctx.lineWidth = 0.5 + noise(i, 3) * 0.8
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.quadraticCurveTo(x + 2, y - 2, x + 3 + noise(i, 9) * 6, y - 1)
      ctx.stroke()
    }
  const texture = new T.CanvasTexture(canvas)
  texture.wrapS = texture.wrapT = T.RepeatWrapping
  texture.anisotropy = 4
  return texture
}

/** Surrounding landmarks are separate batches so the GPU can cull distant quadrants. */
export function createEnvironment(invalidate: () => void = () => {}) {
  const group = new T.Group()
  group.name = 'Nile racecourse courtyard'
  const limestone = surfaceTexture(),
    ripples = surfaceTexture(true)
  limestone.colorSpace = T.SRGBColorSpace
  // Most scenery is matte and static. Vertex-lit distant surfaces retain their colour
  // variation without paying for a full metal/roughness lighting pass per pixel.
  const material = new T.MeshLambertMaterial({ vertexColors: true, side: T.DoubleSide, map: limestone })
  let disposed = false
  const images: T.Texture[] = []
  const load = (path: string, ready: (t: T.Texture) => void) => {
    const texture = new T.TextureLoader().load('/art/' + path, (t) => {
      if (!disposed) {
        t.colorSpace = T.SRGBColorSpace
        t.wrapS = t.wrapT = T.RepeatWrapping
        t.anisotropy = 4
        ready(t)
        invalidate()
      }
    })
    images.push(texture)
  }
  const stone = new T.MeshPhongMaterial({
    vertexColors: true,
    side: T.DoubleSide,
    map: limestone,
    bumpMap: limestone,
    bumpScale: 0.028,
    specular: '#332b20',
    shininess: 9,
  })
  load('limestone.webp', (map) => {
    stone.map = map
    stone.bumpMap = map
    stone.bumpScale = 0.057
    stone.needsUpdate = true
  })
  const waterMaterial = new T.MeshPhysicalMaterial({
    vertexColors: true,
    side: T.DoubleSide,
    bumpMap: ripples,
    bumpScale: 0.065,
    roughness: 0.26,
    metalness: 0.18,
    clearcoat: 0.56,
    clearcoatRoughness: 0.25,
  })
  load('nile-water.webp', (map) => {
    map.wrapS = map.wrapT = T.MirroredRepeatWrapping
    map.repeat.set(0.27, 0.82)
    waterMaterial.map = map
    waterMaterial.needsUpdate = true
  })
  const leaves = new Foliage(),
    orchard = new Foliage()
  const add = (name: string, build: (p: Batch) => void, cast = true, mat: T.Material = material) => {
    const p = new Batch(leaves, orchard)
    build(p)
    const m = p.mesh(mat, name)
    m.castShadow = cast
    m.receiveShadow = true
    group.add(m)
  }
  const water = new Batch()
  add('Banks and dune ridges', (p) => terrain(p, water), false)
  group.add(water.mesh(waterMaterial, 'The Nile'))
  const fieldMaterial = new T.MeshLambertMaterial({ color: '#819060', side: T.DoubleSide })
  load('floodplain.webp', (map) => {
    fieldMaterial.map = map
    fieldMaterial.color.set('#f0e8c9')
    fieldMaterial.needsUpdate = true
  })
  const cultivated = new T.Mesh(fieldsGeometry(), fieldMaterial)
  cultivated.name = 'Irrigated floodplain'
  group.add(cultivated)
  add('Limestone terrace and stepped racecourt', terrace, true, stone)
  add(
    'Riverfront shade pavilions and arcades',
    (p) => {
      pavilion(p, 10.1, -6.62, -0.44, 3.04, ['#6b8278', '#bdba99'])
      const arcadeZ = farBank(-6.4) - 2.8
      arcade(p, -6.4, arcadeZ, 0.12, 3, sandHeight(-6.4, arcadeZ))
      pavilion(p, -11.4, -5.4, 1.28, 2.95, ['#a18670', '#c4b59a'])
      arcade(p, 14.2, 1.85, Math.PI / 2 - 0.12, 2, sandHeight(14.2, 1.85))
      urn(p, 9.25, PAVE, -4, 0.94)
      urn(p, 9.64, PAVE, -3.45, 0.67, '#63877b')
      urn(p, -8.87, PAVE, 3.6, 0.98)
      urn(p, -9.62, PAVE, 3.55, 0.78)
    },
    true,
    stone,
  )
  add('Western gardens and riding club', (p) => {
    const groups = [
      [-9.8, -6.5, 4.75],
      [-11.6, -5.2, 5.4],
      [-9.6, 3.8, 3.6],
      [-13.4, 5.0, 5.2],
      [-15.1, 3.3, 4.4],
      [-18.3, -9.0, 4.7],
      [-19.7, -7.7, 3.9],
      [-25, 8, 4.8],
      [-26.6, 9, 4],
    ]
    groups.forEach(([x, z, h], i) => palm(p, x, z, h, i + 6, Math.abs(x) < 12 ? PAVE : SAND))
    pavilion(p, -13.7, 10.3, -0.72, 4.3, ['#477976', '#ddba82'], SAND)
    villageHouse(p, -20, 13.2, 4, 2.35, 0.3, true)
    villageHouse(p, -24, 14, 3.4, 2.9, 0.15, false)
    arcade(p, -19.5, 18, 0.18, 4, SAND)
  })
  add('Eastern garden and village', (p) => {
    const groups = [
      [9.64, -5.83, 5.6],
      [11.27, -6.9, 4.3],
      [12.36, 3.62, 4.36],
      [15.64, 4.83, 5.4],
      [14.88, 6.43, 4.14],
      [18, -7.6, 4.65],
      [20.7, -7.4, 3.72],
      [21.3, 11.6, 4.7],
    ]
    groups.forEach(([x, z, h], i) => palm(p, x, z, h, i + 24, Math.abs(x) < 12 ? PAVE : SAND))
    pavilion(p, 13.7, 10.92, -1.03, 3.68, ['#aa6041', '#edce97'], SAND)
    villageHouse(p, 18.7, 14.57, 4.4, 2.7, -0.5, true)
    villageHouse(p, 21.6, 13.0, 3.2, 2.5, 0.24, false)
    villageHouse(p, 23.35, 15.19, 3.7, 3.15, -0.25, true)
  })
  add(
    'Boats, reeds and distant necropolis',
    (p) => {
      felucca(p, -1.99, nearBank(-1.99) - 3.7, -0.32, 1.1)
      felucca(p, 13.12, nearBank(13.12) - 4.6, 0.16, 0.85)
      felucca(p, -19.4, nearBank(-19.4) - 3.15, 0.47, 0.81)
      for (let i = 0; i < 69; i++) {
        const x = -41 + noise(i, 6) * 82,
          z = i % 3 ? nearBank(x) : farBank(x)
        reeds(p, x, z + (i % 3 ? 0.19 : -0.16), i + 5)
      }
      for (const [i, x] of [-21, -18.3, -1.5, 1.7, 3.98, 16.9, 19.6, 21.9].entries())
        palm(p, x, farBank(x) - 0.45 - noise(i) * 1.2, 2.8 + noise(i, 1) * 1.7, i + 50)
      for (let i = 0; i < 74; i++) {
        const x = -48 + 96 * noise(i, 31),
          z = farBank(x) - 0.58 - noise(i, 53) * 11.8
        tamarisk(p, x, z, 1.09 + noise(i, 6) * 1.5, i)
      }
      for (let i = 0; i < 12; i++) {
        const x = -29 + i * 4.7
        if (x > -1 && x < 7) continue
        tamarisk(p, x, nearBank(x) + 0.48, 1.21 + noise(i + 1) * 0.68, i + 83)
      }
      pyramid(p, -15.6, -35.9, 5.75, 0.19)
      pyramid(p, -8.9, -43.7, 4.6, 0.26)
      pyramid(p, -21.5, -40.7, 3.48, 0.16)
      villageHouse(p, 8.3, -23.91, 3.2, 1.84, 0.24, true)
      villageHouse(p, 11.8, -24.0, 3.25, 2.48, 0.13, false)
      arcade(p, 15.7, -25.1, 0.21, 3, SAND)
      for (let i = 0; i < 5; i++)
        columnInCourt(p, 7.6 + i * 1.59, 22.1 + Math.sin(i * 0.77), 2.5 + noise(i, 4) * 0.24)
      villageHouse(p, -4, 24.87, 3.87, 2.92, -0.1, true)
      villageHouse(p, -7.8, 25.8, 3.37, 2.57, -0.23, false)
    },
    false,
  )
  const leafMaterials: T.MeshLambertMaterial[] = []
  const plant = (batch: Foliage, path: string, name: string, cast: boolean) => {
    const mat = new T.MeshLambertMaterial({
      vertexColors: true,
      side: T.DoubleSide,
      alphaTest: 0.4,
      emissive: '#1e331e',
      emissiveIntensity: 0.19,
    })
    const canopy = new T.Mesh(batch.geometry(), mat)
    canopy.name = name
    canopy.visible = false
    canopy.castShadow = cast
    canopy.receiveShadow = cast
    group.add(canopy)
    load(path, (map) => {
      map.wrapS = map.wrapT = T.ClampToEdgeWrapping
      mat.map = map
      mat.needsUpdate = true
      canopy.visible = true
    })
    leafMaterials.push(mat)
  }
  plant(leaves, 'palm-frond.webp', 'Feathered date-palm canopy', true)
  plant(orchard, 'orchard-leaves.webp', 'Sycamore orchards', false)
  // Painted racers occupy the foreground. A little dust in the courtyard light compresses
  // the dark/light range of its architecture and foliage without blurring the playfield.
  for (const scenic of [material, stone, fieldMaterial, waterMaterial, ...leafMaterials]) {
    scenic.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <opaque_fragment>',
        `
        float courtyardLuma=dot(outgoingLight,vec3(.2126,.7152,.0722));
        float distanceVeil=smoothstep(9.,38.,1./max(gl_FragCoord.w,.0001));
        outgoingLight=mix(mix(vec3(courtyardLuma),outgoingLight,mix(.84,.59,distanceVeil)),
          vec3(.30,.285,.235),mix(.064,.215,distanceVeil));
        #include <opaque_fragment>
      `,
      )
    }
    scenic.customProgramCacheKey = () => 'nile-courtyard-atmosphere-v1'
  }
  return {
    group,
    dispose() {
      disposed = true
      group.traverse((o) => {
        if (o instanceof T.Mesh) o.geometry.dispose()
      })
      for (const mat of [material, stone, fieldMaterial, waterMaterial, ...leafMaterials]) mat.dispose()
      for (const tex of [limestone, ripples, ...images]) tex.dispose()
      group.removeFromParent()
    },
  }
}
function columnInCourt(p: Batch, x: number, z: number, h: number) {
  p.local(x, sandHeight(x, z), z, 0, () => column(p, 0, 0, h, 0.29))
}

/** Infinite background remains stable under orbit while the modelled skyline shows parallax. */
export function configureAtmosphere(scene: T.Scene, invalidate: () => void = () => {}) {
  const studio = scene.environment,
    loader = new T.TextureLoader()
  scene.background = new T.Color('#d6bd9c')
  scene.fog = new T.Fog('#e5c7a2', 27, 85)
  let disposed = false
  function load(path: string, assign: (map: T.Texture) => void) {
    return loader.load('/art/' + path, (map) => {
      if (disposed) return
      map.mapping = T.EquirectangularReflectionMapping
      map.colorSpace = T.SRGBColorSpace
      assign(map)
      invalidate()
    })
  }
  const sky = load('oasis-environment.webp', (map) => {
    scene.background = map
  })
  const reflection = load('oasis-reflection.webp', (map) => {
    scene.environment = map
  })
  return () => {
    disposed = true
    scene.background = null
    scene.environment = studio
    scene.fog = null
    sky.dispose()
    reflection.dispose()
  }
}
