import * as T from 'three'
import { hudInsets, trackPoint } from './layout'

export type CameraPreset = 'table' | 'trackside' | 'overhead' | 'follow'
const PRESETS = {
  table: { yaw: 0.22, pitch: 0.65 },
  trackside: { yaw: -0.28, pitch: 0.34 },
  overhead: { yaw: 0.04, pitch: 1.11 },
}
const bound = (value: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, value))

export function createViewpoint(showcase: boolean, immersive: boolean) {
  const camera = Object.assign(new T.PerspectiveCamera(36, 1, 0.14, 135), { manual: true })
  let yaw = showcase ? -0.26 : PRESETS.table.yaw,
    pitch = showcase ? 0.21 : PRESETS.table.pitch,
    zoom = 1
  let tracking = false,
    chaseYaw = 0,
    chaseLift = 0,
    lastFollow = 0
  let selectedPreset: CameraPreset = 'table'
  const chaseTarget = new T.Vector3(),
    aim = new T.Vector3(),
    eye = new T.Vector3()
  const homeEye = new T.Vector3(),
    homeAngle = new T.Quaternion(),
    homeProjection = new T.Matrix4()
  const target = new T.Vector3(),
    direction = new T.Vector3(),
    right = new T.Vector3(),
    up = new T.Vector3()
  const points: T.Vector3[] = []
  // The visible playing surface is the rounded racing rail. The rectangular cabinet's
  // four unused corners may extend past the frame while every numbered space remains visible.
  for (let i = 0; i < 48; i++) {
    const p = trackPoint(i / 48, 1.025)
    points.push(new T.Vector3(p.x, 0.1, p.z), new T.Vector3(p.x, -0.24, p.z))
  }
  function frame(w: number, h: number, stacks: readonly T.Vector3[]) {
    if (!w || !h) return
    const hud = immersive && !showcase && w >= 980 && h >= 650
    const reserved = hudInsets(w, h, hud)
    const left = reserved.left,
      rightInset = reserved.right,
      bottom = reserved.bottom
    const top = reserved.top + (showcase || hud ? 0 : w < 600 ? 29 : 19)
    const usableWidth = w - left - rightInset,
      usableHeight = h - top - bottom
    const portrait = w < 600,
      aspect = usableWidth / usableHeight
    camera.clearViewOffset()
    camera.aspect = aspect
    const portraitTurn =
      portrait && !showcase && selectedPreset === 'table' ? bound((1.65 - aspect) / 0.92, 0, 1) : 0
    const fitYaw = yaw + portraitTurn * 1.12
    const fitPitch = pitch + (portrait && !showcase ? 0.09 : 0) + portraitTurn * 0.22
    camera.fov = showcase ? 40 : 38
    camera.filmOffset = showcase && w >= 850 ? -6.4 : 0
    camera.updateProjectionMatrix()
    direction.set(
      Math.sin(fitYaw) * Math.cos(fitPitch),
      Math.sin(fitPitch),
      Math.cos(fitYaw) * Math.cos(fitPitch),
    )
    target.set(showcase ? 0.78 : 0, showcase ? 1.1 : 0.28, showcase ? 1.55 : -0.08)
    right.set(direction.z, 0, -direction.x).normalize()
    up.crossVectors(direction, right).normalize()
    let distance = 0
    if (showcase) {
      distance = Math.max(6.6, 6.9 / Math.max(0.65, aspect))
    } else {
      const tanY = Math.tan(T.MathUtils.degToRad(camera.fov * 0.5)),
        tanX = tanY * aspect
      const freeX = portrait ? 0.965 : 0.972,
        freeY = portrait ? 0.95 : 0.966
      const silhouette = [...points, ...stacks].map((pt) => {
        const delta = pt.clone().sub(target)
        return { x: delta.dot(right), y: delta.dot(up), depth: delta.dot(direction) }
      })
      function boundsAt(d: number) {
        let xmin = Infinity,
          xmax = -Infinity,
          ymin = Infinity,
          ymax = -Infinity
        for (const p of silhouette) {
          const x = p.x / ((d - p.depth) * tanX),
            y = p.y / ((d - p.depth) * tanY)
          xmin = Math.min(xmin, x)
          xmax = Math.max(xmax, x)
          ymin = Math.min(ymin, y)
          ymax = Math.max(ymax, y)
        }
        return { xmin, xmax, ymin, ymax }
      }
      let lo = Math.max(...silhouette.map((p) => p.depth)) + 1,
        hi = 70
      for (let i = 0; i < 16; i++) {
        const mid = (lo + hi) * 0.5,
          b = boundsAt(mid)
        if (b.xmax - b.xmin > 2 * freeX || b.ymax - b.ymin > 2 * freeY) lo = mid
        else hi = mid
      }
      distance = Math.max(9.2, hi)
      const b = boundsAt(distance / zoom)
      const dx = (b.xmin + b.xmax) * usableWidth * 0.25,
        dy = -(b.ymin + b.ymax) * usableHeight * 0.25
      camera.setViewOffset(usableWidth, usableHeight, dx - left, dy - top, w, h)
    }
    camera.position.copy(target).addScaledVector(direction, distance / zoom)
    camera.lookAt(target)
    camera.updateMatrixWorld()
  }
  function preset(name: CameraPreset) {
    selectedPreset = name
    tracking = name === 'follow'
    lastFollow = 0
    if (name === 'follow') {
      chaseYaw = 0
      chaseLift = 0
      zoom = 1
      return
    }
    yaw = PRESETS[name].yaw
    pitch = PRESETS[name].pitch
    zoom = 1
  }
  function orbit(dx: number, dy: number) {
    if (tracking) {
      chaseYaw = bound(chaseYaw - dx * 0.006, -1.4, 1.4)
      chaseLift = bound(chaseLift + dy * 0.006, -0.4, 1.8)
      return
    }
    yaw = bound(yaw - dx * 0.0052, -1.0, 1.0)
    pitch = bound(pitch + dy * 0.0042, 0.19, 1.22)
  }
  function magnify(factor: number) {
    zoom = bound(zoom * factor, 0.74, 1.5)
  }
  function follow(
    w: number,
    h: number,
    x: number,
    z: number,
    nx: number,
    nz: number,
    height: number,
    lift: number,
    reverse: boolean,
    moving: boolean,
    automatic = false,
  ) {
    const inset = hudInsets(w, h, immersive),
      sw = w - inset.left - inset.right,
      sh = h - inset.top - inset.bottom
    const aspect = sw / sh,
      offset = Math.atan2(nx, nz) + (automatic ? 0 : chaseYaw) + (reverse ? 0.57 : -0.57)
    const distance = Math.max(aspect < 1 ? 4.25 : 3.55, (height + 0.48) / 0.65) / (automatic ? 1 : zoom)
    aim.set(x, Math.max(0.7, height * 0.52) + lift * 0.8, z)
    eye.set(
      x + Math.sin(offset) * distance,
      aim.y + (automatic ? 0.49 : 0.72) + height * 0.095 + (automatic ? 0 : chaseLift),
      z + Math.cos(offset) * distance,
    )
    const now = performance.now(),
      blend = moving && lastFollow ? 1 - Math.exp(-Math.min(100, now - lastFollow) / 46) : 1
    if (automatic) {
      camera.position.copy(eye)
    } else {
      camera.position.lerp(eye, blend)
      chaseTarget.lerp(aim, blend)
      lastFollow = now
    }
    camera.fov = 43
    camera.filmOffset = 0
    camera.aspect = aspect
    camera.setViewOffset(sw, sh, -inset.left, -inset.top, w, h)
    camera.lookAt(automatic ? aim : chaseTarget)
    camera.updateMatrixWorld()
  }
  function chase(
    w: number,
    h: number,
    where: { x: number; z: number; nx: number; nz: number },
    height: number,
    lift: number,
    reverse: boolean,
    weight: number,
  ) {
    if (weight <= 0) return
    if (weight === 1) {
      follow(w, h, where.x, where.z, where.nx, where.nz, height, lift, reverse, false, true)
      return
    }
    homeEye.copy(camera.position)
    homeAngle.copy(camera.quaternion)
    homeProjection.copy(camera.projectionMatrix)
    follow(w, h, where.x, where.z, where.nx, where.nz, height, lift, reverse, false, true)
    camera.position.lerp(homeEye, 1 - weight)
    camera.position.y += Math.sin(weight * Math.PI) * 0.82
    camera.quaternion.slerp(homeAngle, 1 - weight)
    for (let i = 0; i < 16; i++)
      camera.projectionMatrix.elements[i] = T.MathUtils.lerp(
        homeProjection.elements[i],
        camera.projectionMatrix.elements[i],
        weight,
      )
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert()
    camera.updateMatrixWorld()
  }
  return { camera, frame, preset, orbit, magnify, follow, chase }
}
