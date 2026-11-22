import * as T from 'three'
import { legAngles, type Stride } from './roll-motion'

const sides = [-1, 1] as const
const ease = (a: number, b: number, v: number) => {
  const t = Math.max(0, Math.min(1, (v - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/** Geometry is painted with weights at construction so the torso, embroidery and saddle stay rigid. */
export function bindCarvingPart(geometry: T.BufferGeometry, part: number) {
  const p = geometry.getAttribute('position'),
    indices = new Uint8Array(p.count * 4),
    weights = new Uint8Array(p.count * 4)
  for (let i = 0; i < p.count; i++) {
    const at = i * 4,
      y = p.getY(i),
      x = p.getX(i)
    let a = 0,
      b = 0,
      mix = 0
    if (part >= 1 && part <= 4) {
      const hip = 1 + (part - 1) * 3
      if (y > 0.465) {
        b = hip
        mix = 1 - ease(0.465, 0.575, y)
      } else if (y > 0.267) {
        a = hip
        b = hip + 1
        mix = 1 - ease(0.267, 0.345, y)
      } else {
        a = hip + 1
        b = hip + 2
        mix = 1 - ease(0.14, 0.207, y)
      }
    } else if (part === 5) {
      if (y > 0.97) {
        a = 13
        b = 14
        mix = Math.max(ease(0.985, 1.095, y), ease(0.6, 0.8, x))
      } else {
        b = 13
        mix = ease(0.48, 0.75, y) * ease(0.18, 0.4, x)
      }
    } else if (part === 6) {
      b = 15
      mix = Math.max(ease(0.51, 0.62, -x), 1 - ease(0.38, 0.56, y))
    }
    indices[at] = a
    indices[at + 1] = b
    weights[at + 1] = Math.round(mix * 255)
    weights[at] = 255 - weights[at + 1]
  }
  geometry.setAttribute('skinIndex', new T.Uint8BufferAttribute(indices, 4))
  geometry.setAttribute('skinWeight', new T.Uint8BufferAttribute(weights, 4, true))
}

/** One articulated actor replaces the running pawn. Six passenger/stationary pawns use ordinary meshes. */
export function createRunningCamel(geometry: T.BufferGeometry, material: T.Material) {
  const actor = new T.SkinnedMesh(geometry, material)
  const bones: T.Bone[] = []
  const add = (parent: T.Bone | undefined, x: number, y: number, z: number) => {
    const b = new T.Bone()
    b.position.set(x, y, z)
    parent?.add(b)
    bones.push(b)
    return b
  }
  const root = add(undefined, 0, 0, 0)
  for (const side of sides)
    for (const front of [false, true]) {
      const x = front ? 0.234 : -0.367,
        kx = front ? 0.271 : -0.272,
        ax = front ? 0.241 : -0.389,
        z = side * 0.147
      const hip = add(root, x, 0.546, z),
        knee = add(hip, kx - x, -0.241, z * 0.12)
      add(knee, ax - kx, -0.127, z * 0.04)
    }
  const neck = add(root, 0.235, 0.52, 0)
  add(neck, 0.395, 0.51, 0)
  add(root, -0.5, 0.56, 0)
  actor.add(root)
  actor.bind(new T.Skeleton(bones))
  actor.visible = false
  actor.frustumCulled = false
  actor.castShadow = true
  actor.receiveShadow = true
  actor.scale.setScalar(0.99)
  function apply(s: Stride) {
    let i = 1
    for (const side of sides)
      for (const front of [false, true]) {
        const angles = legAngles(s, front, side)
        bones[i].rotation.z = angles.hip
        bones[i + 1].rotation.z = angles.knee
        bones[i + 2].rotation.z = angles.ankle
        i += 3
      }
    bones[13].rotation.z = s.power * (0.065 * Math.sin(s.phase * 2 + 0.72) - 0.047)
    bones[14].rotation.z = s.power * (0.047 * Math.sin(s.phase * 2 - 0.45) + 0.037)
    bones[15].rotation.set(
      s.power * 0.19 * Math.sin(s.phase),
      s.power * 0.27 * Math.sin(s.phase - 0.4),
      -s.power * 0.21,
    )
  }
  return { actor, apply, dispose: () => actor.skeleton.dispose() }
}
