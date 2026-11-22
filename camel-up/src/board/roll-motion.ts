import type { BoardRoll } from './layout'

/** The feed holds each authoritative roll through die release, running, settling and camera return. */
export const ROLL_PRESENTATION_MS = 2600
export type RollMovement = NonNullable<BoardRoll['movement']>
const clamp = (n: number) => Math.max(0, Math.min(1, n))
const ramp = (n: number) => {
  const t = clamp(n)
  return t * t * (3 - 2 * t)
}
const interval = (n: number, a: number, b: number) => ramp((n - a) / (b - a))

export function sampleRoll(elapsed: number, move: RollMovement) {
  const modified = move.landing !== move.to
  const main = interval(elapsed, 540, modified ? 1430 : 1850)
  const extra = modified ? interval(elapsed, 1510, 1950) : 0
  const firstSteps = move.landing - move.from,
    extraSteps = move.to - move.landing
  const firstDistance = Math.abs(firstSteps) * main,
    extraDistance = Math.abs(extraSteps) * extra
  const distance = firstDistance + extraDistance
  const part = modified && elapsed >= 1470 ? extra : main
  const strength = interval(part, 0, 0.14) * (1 - interval(part, 0.83, 1))
  const finalPart = modified ? extra : main
  const aim = interval(elapsed, 245, 645) * (1 - interval(elapsed, 2100, 2540))
  const direction = modified && elapsed >= 1470 ? Math.sign(extraSteps) : Math.sign(firstSteps)
  return {
    space: move.from + main * firstSteps + extra * extraSteps,
    distance,
    strength,
    direction,
    departure: interval(distance, 0, 0.42),
    arrival: interval(finalPart, 0.57, 0.98),
    makeRoom: interval(finalPart, 0.48, 0.84),
    cameraWeight: aim,
    secondLeg: modified && elapsed >= 1510,
    settled: elapsed >= ROLL_PRESENTATION_MS,
  }
}

export interface Stride {
  phase: number
  power: number
  bob: number
  pitch: number
  roll: number
}
/** The two legs on each side pace nearly together; the other side follows a half-cycle later. */
export function stride(distance: number, power: number, backwards: boolean): Stride {
  const phase = distance * 1.72 * Math.PI * 2 * (backwards ? -1 : 1)
  const gait: Stride = {
    phase,
    power,
    bob: 0,
    pitch: power * (0.032 * Math.sin(phase * 2 - 0.45) + 0.022 * (backwards ? -1 : 1)),
    roll: power * 0.034 * Math.cos(phase),
  }
  if (power > 0) {
    // Rotate the four sole centers through their actual hip/knee/hock chains. The lowest
    // hoof bears weight, with a brief suspension between contacts instead of a floating pawn.
    let lowest = Infinity
    for (const side of [-1, 1])
      for (const front of [false, true]) {
        const angles = legAngles(gait, front, side)
        const hipX = front ? 0.234 : -0.367,
          kneeX = front ? 0.271 : -0.272,
          ankleX = front ? 0.241 : -0.389
        const soleX = (front ? 0.269 : -0.347) + (side === 1 ? 0.019 : -0.013) + 0.019
        const h = angles.hip,
          k = h + angles.knee,
          a = k + angles.ankle
        const x =
          hipX +
          (kneeX - hipX) * Math.cos(h) +
          0.241 * Math.sin(h) +
          (ankleX - kneeX) * Math.cos(k) +
          0.127 * Math.sin(k) +
          (soleX - ankleX) * Math.cos(a) +
          0.173 * Math.sin(a)
        const y =
          0.546 +
          (kneeX - hipX) * Math.sin(h) -
          0.241 * Math.cos(h) +
          (ankleX - kneeX) * Math.sin(k) -
          0.127 * Math.cos(k) +
          (soleX - ankleX) * Math.sin(a) -
          0.173 * Math.cos(a)
        lowest = Math.min(
          lowest,
          Math.sin(gait.pitch) * x + Math.cos(gait.pitch) * y - Math.sin(gait.roll) * side * 0.17,
        )
      }
    gait.bob = (0.005 - lowest) * 0.99 + power * 0.046 * Math.max(0, Math.sin(phase * 2 - 0.4)) ** 4
  }
  return gait
}
export function legAngles(s: Stride, front: boolean, side: number) {
  const a = s.phase + (side === 1 ? 0 : Math.PI) + (front ? 0.2 : -0.2)
  const swing = Math.max(0, -Math.sin(a))
  return {
    hip: s.power * ((front ? 0.64 : 0.69) * Math.cos(a) + (front ? -0.065 : 0.07)),
    knee: s.power * ((front ? -1.02 : 0.82) * swing + 0.075 * Math.sin(a)),
    ankle: s.power * ((front ? 0.62 : -0.92) * swing - 0.13 * Math.cos(a)),
  }
}
