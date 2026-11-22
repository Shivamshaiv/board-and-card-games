import * as T from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { BOARD_DEPTH as D, BOARD_WIDTH as W } from './layout'
import { fallbackWood, walnutImage, wovenFelt } from './finishes'

function slab(w: number, d: number, top: number, thickness: number, bevel: number, r = 0.25) {
  const s = new T.Shape(),
    x = w / 2,
    z = d / 2
  s.moveTo(-x + r, -z)
  s.lineTo(x - r, -z)
  s.quadraticCurveTo(x, -z, x, -z + r)
  s.lineTo(x, z - r)
  s.quadraticCurveTo(x, z, x - r, z)
  s.lineTo(-x + r, z)
  s.quadraticCurveTo(-x, z, -x, z - r)
  s.lineTo(-x, -z + r)
  s.quadraticCurveTo(-x, -z, -x + r, -z)
  const geom = new T.ExtrudeGeometry(s, {
    depth: thickness,
    bevelEnabled: bevel > 0,
    bevelSize: bevel,
    bevelThickness: bevel,
    bevelSegments: 3,
    curveSegments: 9,
    steps: 1,
  })
  geom.rotateX(-Math.PI / 2).translate(0, top - thickness - bevel, 0)
  const pos = geom.getAttribute('position'),
    normal = geom.getAttribute('normal'),
    uv = geom.getAttribute('uv')
  for (let i = 0; i < pos.count; i++) {
    const x0 = pos.getX(i),
      y = pos.getY(i),
      z0 = pos.getZ(i)
    if (Math.abs(normal.getY(i)) > 0.55) uv.setXY(i, x0 / w + 0.5, 0.5 - z0 / d)
    else uv.setXY(i, Math.abs(normal.getZ(i)) > 0.6 ? x0 / w + 0.5 : z0 / d + 0.5, 0.48 + y * 0.38)
  }
  return geom
}

function plateArt() {
  const c = document.createElement('canvas')
  c.width = 768
  c.height = 128
  const ctx = c.getContext('2d')!
  const sheen = ctx.createLinearGradient(0, 0, 0, 128)
  sheen.addColorStop(0, '#dbc486')
  sheen.addColorStop(0.32, '#c5a76a')
  sheen.addColorStop(0.77, '#a78348')
  sheen.addColorStop(1, '#e4cb90')
  ctx.fillStyle = sheen
  ctx.fillRect(0, 0, 768, 128)
  ctx.strokeStyle = '#6d502d'
  ctx.lineWidth = 3
  ctx.strokeRect(12, 11, 744, 106)
  for (const x of [32, 736]) {
    ctx.fillStyle = '#654622'
    ctx.beginPath()
    ctx.arc(x, 64, 5, 0, 2 * Math.PI)
    ctx.fill()
  }
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = 'bold 58px Georgia'
  ctx.fillStyle = '#54391f'
  ctx.fillText('C A M E L   U P', 384, 65)
  return c
}

export function createCabinet(invalidate: () => void) {
  const group = new T.Group(),
    parts: T.Mesh[] = []
  const wood: T.Texture = new T.CanvasTexture(fallbackWood())
  wood.colorSpace = T.SRGBColorSpace
  wood.anisotropy = 4
  const felt = new T.CanvasTexture(wovenFelt())
  felt.colorSpace = T.SRGBColorSpace
  felt.wrapS = felt.wrapT = T.RepeatWrapping
  felt.repeat.set(12, 8)
  felt.anisotropy = 4
  const brass = new T.MeshStandardMaterial({ color: '#bf9652', metalness: 0.75, roughness: 0.3 })
  const bronze = new T.MeshStandardMaterial({ color: '#79603c', metalness: 0.68, roughness: 0.42 })
  const ebony = new T.MeshPhysicalMaterial({
    color: '#302521',
    roughness: 0.36,
    clearcoat: 0.35,
    clearcoatRoughness: 0.27,
  })
  const walnut = new T.MeshPhysicalMaterial({
    map: wood,
    color: '#e4bd92',
    roughness: 0.42,
    metalness: 0.02,
    clearcoat: 0.4,
    clearcoatRoughness: 0.24,
  })
  const fabric = new T.MeshStandardMaterial({
    map: felt,
    color: '#b4d2bd',
    roughness: 0.98,
    bumpMap: felt,
    bumpScale: 0.012,
  })
  const rail = (g: T.BufferGeometry, m: T.Material) => {
    const mesh = new T.Mesh(g, m)
    mesh.castShadow = true
    mesh.receiveShadow = true
    group.add(mesh)
    parts.push(mesh)
    return mesh
  }
  // The felt runner creates visible negative space around the shadow of the cabinet.
  rail(slab(W + 2.45, D + 2.05, -0.84, 0.055, 0.037, 0.48), fabric)
  rail(slab(W - 0.45, D - 0.45, -0.68, 0.125, 0.045), ebony)
  rail(slab(W - 0.2, D - 0.2, -0.58, 0.075, 0.035), walnut)
  rail(slab(W - 0.12, D - 0.12, -0.48, 0.045, 0.018), brass)
  rail(slab(W - 0.14, D - 0.14, -0.39, 0.075, 0.018), ebony)
  rail(slab(W + 0.03, D + 0.03, -0.16, 0.22, 0.045), walnut)
  rail(slab(W + 0.13, D + 0.13, -0.1, 0.035, 0.016), brass)
  rail(slab(W + 0.19, D + 0.19, -0.049, 0.035, 0.022), walnut)
  rail(slab(W + 0.08, D + 0.08, -0.014, 0.018, 0.01), bronze)
  const plate = new T.CanvasTexture(plateArt())
  plate.colorSpace = T.SRGBColorSpace
  plate.anisotropy = 4
  const nameplate = rail(
    new T.BoxGeometry(2.38, 0.205, 0.037),
    new T.MeshStandardMaterial({ map: plate, metalness: 0.32, roughness: 0.36 }),
  )
  nameplate.position.set(0, -0.295, D / 2 + 0.05)
  const metalCorners: T.BufferGeometry[] = []
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      // Inlaid corner hardware follows both front and side edges.
      metalCorners.push(
        new T.BoxGeometry(0.69, 0.17, 0.028).translate(
          sx * (W / 2 - 0.58),
          -0.302,
          sz * (D / 2 + 0.041),
        ),
      )
      metalCorners.push(
        new T.BoxGeometry(0.028, 0.17, 0.6).translate(
          sx * (W / 2 + 0.041),
          -0.302,
          sz * (D / 2 - 0.55),
        ),
      )
      for (const spot of [0.39, 0.73])
        metalCorners.push(
          new T.SphereGeometry(0.033, 8, 5).translate(
            sx * (W / 2 - spot),
            -0.295,
            sz * (D / 2 + 0.066),
          ),
        )
    }
  const corners = mergeGeometries(metalCorners.map((v) => (v.index ? v.toNonIndexed() : v)))
  if (corners) rail(corners, brass)
  metalCorners.forEach((g) => g.dispose())
  let live = true
  void walnutImage().then((image) => {
    if (image && live) {
      wood.image = image
      wood.needsUpdate = true
      invalidate()
    }
  })
  return {
    group,
    release() {
      live = false
      felt.dispose()
      wood.dispose()
      plate.dispose()
    },
  }
}
