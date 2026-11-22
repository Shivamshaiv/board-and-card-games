import * as T from 'three'
import { Parts, brass, brassLight, grid, type Point } from './carving'

const patina = '#287268',
  shadowGold = '#976838'
const inscriptions: number[][][][] = [
  // An ankh, water ripple, sun, eye and reed in shallow brass relief.
  [
    [
      [-0.019, 0.006],
      [-0.032, 0.025],
      [-0.019, 0.045],
      [0.003, 0.047],
      [0.019, 0.032],
      [0.014, 0.015],
      [-0.006, 0.007],
      [-0.006, -0.044],
    ],
    [
      [-0.032, -0.009],
      [0.02, -0.009],
    ],
  ],
  [
    [
      [-0.041, 0.014],
      [-0.02, 0.029],
      [0, 0.014],
      [0.019, 0.029],
      [0.04, 0.014],
    ],
    [
      [-0.041, -0.018],
      [-0.02, -0.004],
      [0, -0.018],
      [0.019, -0.004],
      [0.04, -0.018],
    ],
  ],
  [
    Array.from({ length: 13 }, (_, i) => [
      0.032 * Math.cos((i * Math.PI) / 6),
      0.032 * Math.sin((i * Math.PI) / 6),
    ]),
    [
      [-0.04, -0.044],
      [0.041, -0.044],
    ],
  ],
  [
    [
      [-0.042, 0.003],
      [-0.017, 0.023],
      [0.011, 0.025],
      [0.041, 0.003],
      [0.013, -0.012],
      [-0.012, -0.013],
      [-0.042, 0.003],
    ],
    [
      [0.01, -0.012],
      [-0.005, -0.035],
      [-0.027, -0.034],
    ],
  ],
  [
    [
      [0, -0.045],
      [0, 0.045],
    ],
    [
      [0, 0.024],
      [-0.026, 0.04],
      [-0.024, 0.022],
      [0, 0.009],
    ],
    [
      [0, 0.003],
      [0.027, 0.021],
      [0.024, 0.002],
      [0, -0.011],
    ],
  ],
]

function plinth(
  p: Parts,
  bottom: number,
  top: number,
  height: number,
  mid: number,
  color: string,
  x = 0,
  z = 0,
) {
  p.add(
    new T.CylinderGeometry(top / Math.SQRT2, bottom / Math.SQRT2, height, 4, 1, false, Math.PI / 4),
    color,
    x,
    mid,
    z,
  )
}
/** Coordinates on one of the four outside faces, measured from its centre. */
function facing(face: number, horizontal: number, y: number, outward: number): Point {
  switch (face) {
    case 0:
      return [horizontal, y, outward]
    case 1:
      return [outward, y, -horizontal]
    case 2:
      return [-horizontal, y, -outward]
    default:
      return [-outward, y, horizontal]
  }
}
export function pyramid(p: Parts, x: number, z: number, rotation: number) {
  const start = p.pieces.length
  plinth(p, 2.14, 2.14, 0.048, 0.024, '#665140')
  plinth(p, 2.14, 2.05, 0.069, 0.08, '#c99954')
  plinth(p, 2.05, 2.05, 0.043, 0.136, '#f4ce83')
  plinth(p, 2.008, 1.98, 0.036, 0.175, patina)
  const layers = ['#be853f', '#e2af61', '#ce9348', '#e9b76d', '#d7a153', '#edc078']
  for (let i = 0; i < 6; i++) {
    const width = 1.94 - i * 0.264,
      top = width - 0.202,
      y = 0.192 + i * 0.216
    plinth(p, width, top, 0.191, y + 0.0955, layers[i])
    plinth(p, top + 0.012, top - 0.009, 0.025, y + 0.203, brassLight)
    for (let face = 0; face < 4; face++) {
      // Shallow mortar cuts stop short of the bevels so the stepped block edges catch light.
      const blocks = 6 - i
      for (let j = 1; j < blocks; j++) {
        const dx = (j / blocks - 0.5) * width + ((i + face) % 2 ? 0.05 : -0.015)
        if (i <= 1 && face === 0 && Math.abs(dx) < 0.325) continue
        p.rod(
          facing(face, dx, y + 0.019, width / 2 - 0.007),
          facing(face, dx - 0.01, y + 0.166, top / 2 + 0.019),
          0.008,
          0.006,
          shadowGold,
          5,
        )
      }
      if (i === 2) {
        const coords = (dx: number, dy: number, offset = 0): Point =>
          facing(face, dx, y + 0.095 + dy, width / 2 - (0.095 + dy) * 0.529 + 0.006 + offset)
        const panel = grid(2, 2, (row, column) => coords((column - 0.5) * 0.904, (row - 0.5) * 0.135))
        p.add(panel, face % 2 === 0 ? '#347a70' : '#3c736a')
        for (const edge of [-0.064, 0.064])
          p.rod(coords(-0.451, edge, 0.004), coords(0.451, edge, 0.004), 0.008, 0.008, brassLight, 6)
        for (let glyph = 0; glyph < 5; glyph++) {
          const center = (glyph - 2) * 0.17
          for (const path of inscriptions[(glyph + face) % inscriptions.length]) {
            for (let n = 1; n < path.length; n++)
              p.rod(
                coords(center + path[n - 1][0], path[n - 1][1], 0.009),
                coords(center + path[n][0], path[n][1], 0.009),
                0.007,
                0.007,
                '#ffe0a0',
                6,
              )
          }
        }
      }
    }
  }
  // A lapis collar and polished capstone make the pyramid read in a silhouette.
  plinth(p, 0.356, 0.328, 0.06, 1.515, patina)
  plinth(p, 0.332, 0.004, 0.262, 1.67, '#ffe192')
  const portalZ = 0.962
  p.box(0.478, 0.356, 0.054, '#252b26', 0, 0.241, portalZ - 0.029)
  for (const s of [-1, 1]) {
    const xx = 0.288 * s
    p.box(0.092, 0.064, 0.132, '#946a3e', xx, 0.069, portalZ)
    p.rod([xx, 0.099, portalZ], [xx, 0.421, portalZ], 0.044, 0.034, brass, 10)
    p.rod([xx, 0.419, portalZ], [xx, 0.457, portalZ], 0.036, 0.059, brassLight, 10)
    for (const h of [0.142, 0.368])
      p.rod([xx, h, portalZ], [xx, h + 0.019, portalZ], 0.048, 0.048, patina, 10)
  }
  p.box(0.742, 0.064, 0.167, shadowGold, 0, 0.489, portalZ - 0.008)
  p.box(0.768, 0.047, 0.177, brassLight, 0, 0.541, portalZ - 0.014)
  p.box(0.652, 0.09, 0.045, patina, 0, 0.605, portalZ - 0.067)
  p.oval(0, 0.606, portalZ - 0.04, 0.043, 0.043, 0.026, '#eec272', 0, 12)
  for (const s of [-1, 1]) {
    for (let i = 0; i < 4; i++)
      p.rod(
        [s * (0.043 + i * 0.059), 0.6, portalZ - 0.039],
        [s * (0.091 + i * 0.061), 0.625, portalZ - 0.038],
        0.009,
        0.012,
        brassLight,
        6,
      )
  }
  // Identical narrow enamel friezes on the other facades keep an orbit interesting.
  for (const face of [1, 2, 3]) {
    for (let i = -2; i <= 2; i++) {
      const h = i * 0.166
      const corners = [
        facing(face, h - 0.066, 0.482, 0.807),
        facing(face, h, 0.537, 0.778),
        facing(face, h + 0.066, 0.482, 0.807),
      ]
      p.rod(corners[0], corners[1], 0.012, 0.012, patina, 6)
      p.rod(corners[1], corners[2], 0.012, 0.012, patina, 6)
    }
  }
  for (let i = start; i < p.pieces.length; i++) p.pieces[i].rotateY(rotation).translate(x, 0, z)
}

export function palm(p: Parts, x: number, z: number, size: number, angle: number) {
  const h = 1.61 * size,
    sway = 0.16 * size
  const trunk = (t: number): Point => [x + sway * Math.sin(t * 1.58), h * t, z - 0.085 * size * t * t]
  for (let i = 0; i < 12; i++) {
    const t = i / 12,
      u = (i + 1) / 12,
      r = (0.085 - 0.035 * t) * size
    p.rod(trunk(t), trunk(u), r * 1.15, r, ['#8e6845', '#ab8151', '#9f7344'][i % 3], 9)
    const tip = trunk(u)
    p.rod([tip[0], tip[1] - 0.018 * size, tip[2]], tip, r * 1.1, r * 1.26, '#c19965', 9)
  }
  const crown = trunk(1)
  for (let i = 0; i < 12; i++) {
    const a = angle + ((i % 8) * Math.PI) / 4 + (i >= 8 ? 0.27 : 0),
      upper = i >= 8
    const length = (upper ? 0.55 : 0.84 + (i % 3) * 0.08) * size
    const tint = ['#32755d', '#407c55', '#58874b', '#346953'][i % 4]
    const edge = ['#569064', '#719952', '#89a35f', '#52895f'][i % 4]
    const leaf = (t: number, side: number, yOffset = 0): Point => [
      crown[0] + Math.cos(a) * length * t - Math.sin(a) * side,
      crown[1] +
        size * ((upper ? 0.49 : 0.24) * Math.sin(t * Math.PI) - (upper ? 0.01 : 0.29) * t * t) +
        yOffset,
      crown[2] + Math.sin(a) * length * t + Math.cos(a) * side,
    ]
    p.add(
      grid(8, 3, (row, col) => {
        const t = row / 7,
          w = (0.014 + 0.016 * Math.sin(t * Math.PI)) * size
        return leaf(t, (col - 1) * w, col === 1 ? 0.011 * size : 0)
      }),
      edge,
    )
    for (let j = 1; j <= 7; j++) {
      const t = j / 9.3,
        span = size * (0.049 + 0.112 * Math.sin(t * Math.PI)) * (upper ? 0.76 : 1)
      for (const hand of [-1, 1]) {
        const mid = leaf(t + 0.045, hand * span * 0.48, -0.01 * size)
        const tip = leaf(t + 0.152, hand * span, -0.031 * size)
        const base = leaf(t - 0.032, 0, 0.004 * size),
          base2 = leaf(t + 0.096, 0, 0.004 * size)
        const geo = new T.BufferGeometry()
        const verts =
          hand === 1
            ? [base, mid, base2, base, tip, mid, mid, tip, base2]
            : [base2, mid, base, mid, tip, base, base2, tip, mid]
        geo.setAttribute('position', new T.Float32BufferAttribute(verts.flat(), 3))
        geo.computeVertexNormals()
        p.add(geo, j % 3 === 0 ? edge : tint)
      }
    }
  }
  for (let i = 0; i < 4; i++) {
    const a = angle + (i * Math.PI) / 2
    p.oval(
      crown[0] + Math.cos(a) * 0.07 * size,
      h - 0.055 * size,
      crown[2] + Math.sin(a) * 0.07 * size,
      0.047 * size,
      0.083 * size,
      0.042 * size,
      '#aa6834',
      0,
      8,
    )
  }
}

export function finishArch(p: Parts, x: number, z: number) {
  const post = 0.76
  for (const side of [-1, 1]) {
    const zz = z + post * side
    p.box(0.249, 0.075, 0.234, '#71523e', x, 0.039, zz)
    p.box(0.204, 0.067, 0.183, brass, x, 0.107, zz)
    p.add(new T.CylinderGeometry(0.066, 0.087, 1.29, 10), '#c79a51', x, 0.782, zz)
    for (const y of [0.185, 0.245, 1.255, 1.303])
      p.add(
        new T.CylinderGeometry(0.088, 0.088, 0.033, 10),
        y < 0.21 || y > 1.29 ? brassLight : patina,
        x,
        y,
        zz,
      )
    p.add(new T.CylinderGeometry(0.117, 0.072, 0.103, 10), brass, x, 1.407, zz)
    p.box(0.197, 0.058, 0.204, brassLight, x, 1.484, zz)
    p.oval(x, 1.635, zz, 0.06, 0.098, 0.06, brassLight, 0, 10)
  }
  const lintel = (height: number, width: number, depth: number, color: string) => {
    const geo = grid(
      20,
      4,
      (i, j) => {
        const t = i / 19,
          curve = 0.142 * Math.sin(Math.PI * t),
          dd = [-1, -1, 1, 1][j],
          up = [0, 1, 1, 0][j]
        return [x + (dd * depth) / 2, height + curve + up * width, z - post + 2 * post * t]
      },
      true,
    )
    p.add(geo, color)
  }
  lintel(1.45, 0.094, 0.168, '#975b34')
  lintel(1.5, 0.062, 0.18, patina)
  lintel(1.563, 0.027, 0.198, brassLight)
  for (const side of [-1, 1]) {
    p.oval(x + side * 0.095, 1.666, z, 0.018, 0.068, 0.068, brassLight, 0, 12)
    for (let i = 0; i < 4; i++)
      for (const hand of [-1, 1]) {
        const z0 = z + hand * (0.1 + i * 0.093)
        p.rod(
          [x + side * 0.091, 1.651 - i * 0.012, z0],
          [x + side * 0.091, 1.666 - i * 0.012, z0 + hand * 0.05],
          0.009,
          0.013,
          brassLight,
          6,
        )
      }
  }
  for (const side of [-1, 1]) {
    const zz = z + post * side
    // Sewn cloth pennant with a three-dimensional curl and a notched fly.
    p.rod([x, 1.498, zz], [x - 0.42, 1.498, zz], 0.012, 0.012, '#765735', 7)
    p.add(
      grid(6, 3, (i, j) => {
        const t = i / 5,
          v = j / 2
        return [
          x - 0.03 - 0.358 * t,
          1.485 - v * (0.188 - 0.065 * Math.abs(t - 0.5) * 2),
          zz + Math.sin(t * 5 + 0.2) * 0.048 * v,
        ]
      }),
      side === 1 ? '#a94b39' : '#345d64',
    )
  }
}
