import * as T from 'three'
import { BOARD_DEPTH, BOARD_WIDTH, NUMBERS, inscription, trackPoint } from './layout'
import { paintNumberPlate } from './board-art'

/** Sixteen shallow, bevelled marquetry wedges share the exact artwork coordinates of the cabinet face. */
export function trackRelief() {
  const positions: number[] = [],
    uv: number[] = [],
    colors: number[] = [],
    faceSpaces: number[] = []
  type Vertex = { x: number; z: number; h: number }
  function triangle(a: Vertex, b: Vertex, c: Vertex, tone: number) {
    for (const v of [a, b, c]) {
      positions.push(v.x, v.h, v.z)
      uv.push(v.x / BOARD_WIDTH + 0.5, 0.5 - v.z / BOARD_DEPTH)
      colors.push(tone, tone, tone)
    }
  }
  function loop(a: number, b: number, r0: number, r1: number, h: number) {
    const list: Vertex[] = []
    for (let i = 0; i <= 10; i++) {
      const p = trackPoint(a + ((b - a) * i) / 10, r0)
      list.push({ ...p, h })
    }
    for (let i = 10; i >= 0; i--) {
      const p = trackPoint(a + ((b - a) * i) / 10, r1)
      list.push({ ...p, h })
    }
    return list
  }
  for (const n of NUMBERS) {
    const firstFace = positions.length / 9
    const a = (n - 1) / 16 + 0.0009,
      b = n / 16 - 0.0009
    const low = loop(a, b, 0.81, -0.73, 0.006),
      high = loop(a + 0.0012, b - 0.0012, 0.77, -0.69, 0.07)
    for (let i = 0; i < high.length; i++) {
      const j = (i + 1) % high.length
      triangle(low[i], high[i], high[j], 0.77)
      triangle(low[i], high[j], low[j], 0.77)
    }
    for (let i = 0; i < 10; i++) {
      const opposite = high.length - 1 - i
      triangle(high[i], high[opposite], high[i + 1], 1)
      triangle(high[i + 1], high[opposite], high[opposite - 1], 1)
    }
    for (let face = firstFace; face < positions.length / 9; face++) faceSpaces.push(n)
  }
  const g = new T.BufferGeometry()
  g.setAttribute('position', new T.Float32BufferAttribute(positions, 3))
  g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2))
  g.setAttribute('color', new T.Float32BufferAttribute(colors, 3))
  g.computeVertexNormals()
  g.userData.spaces = Uint8Array.from(faceSpaces)
  return g
}

/** One draw for all physical inscriptions; the phone overview instead uses upright labels. */
export function trackNumbers() {
  const atlas = document.createElement('canvas')
  atlas.width = 512
  atlas.height = 384
  const ctx = atlas.getContext('2d')!,
    coords: number[] = [],
    uv: number[] = [],
    index: number[] = []
  for (const n of NUMBERS) {
    const col = (n - 1) % 4,
      row = Math.floor((n - 1) / 4),
      width = n < 10 ? 0.5 : 0.7,
      height = 0.46,
      p = inscription(n)
    ctx.save()
    ctx.translate((col + 0.5) * 128, (row + 0.5) * 96)
    ctx.scale(128 / width, 96 / height)
    paintNumberPlate(ctx, n, 0, 0)
    ctx.restore()
    const i = coords.length / 3
    coords.push(
      p.x - width / 2,
      0.076,
      p.z - height / 2,
      p.x + width / 2,
      0.076,
      p.z - height / 2,
      p.x + width / 2,
      0.076,
      p.z + height / 2,
      p.x - width / 2,
      0.076,
      p.z + height / 2,
    )
    const l = col / 4,
      r = (col + 1) / 4,
      t = 1 - row / 4,
      b = 1 - (row + 1) / 4
    uv.push(l, t, r, t, r, b, l, b)
    index.push(i, i + 2, i + 1, i, i + 3, i + 2)
  }
  const g = new T.BufferGeometry()
  g.setAttribute('position', new T.Float32BufferAttribute(coords, 3))
  g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2))
  g.setIndex(index)
  g.computeVertexNormals()
  const texture = new T.CanvasTexture(atlas)
  texture.colorSpace = T.SRGBColorSpace
  texture.anisotropy = 4
  const mesh = new T.Mesh(g, new T.MeshLambertMaterial({ map: texture, alphaTest: 0.2 }))
  mesh.receiveShadow = true
  let hiddenMask = 0
  return {
    mesh,
    hide(mask: number) {
      if (mask === hiddenMask) return
      const target = g.index!
      for (let i = 0; i < index.length; i++) {
        const n = Math.floor(i / 6)
        target.setX(i, mask & (1 << n) ? n * 4 : index[i])
      }
      target.needsUpdate = true
      hiddenMask = mask
    },
  }
}
