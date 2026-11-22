import { describe, expect, it } from 'vitest'
import * as T from 'three'
import { createRunningCamel } from '../src/board/camel-rig'
import { camelGeometry } from '../src/board/pieces'
import { legAngles, ROLL_PRESENTATION_MS, sampleRoll, stride } from '../src/board/roll-motion'

describe('race presentation', () => {
  it('shows the actual rolled distance, a tile landing, and a separate reverse step', () => {
    const move = { unit: ['white', 'red'], from: 12, landing: 9, to: 10 }
    expect(sampleRoll(0, move)).toMatchObject({
      space: 12,
      cameraWeight: 0,
      strength: 0,
      settled: false,
    })
    expect(sampleRoll(1460, move)).toMatchObject({ space: 9, direction: -1, strength: 0 })
    expect(sampleRoll(1700, move).direction).toBe(1)
    expect(sampleRoll(1800, move).space).toBeGreaterThan(9)
    expect(sampleRoll(ROLL_PRESENTATION_MS, move)).toMatchObject({
      space: 10,
      distance: 4,
      cameraWeight: 0,
      strength: 0,
      settled: true,
    })
  })
  it('reaches the finish crossing and restores the prior camera after the landing', () => {
    const move = { unit: ['blue'], from: 15, landing: 17, to: 17 }
    expect(sampleRoll(1050, move).cameraWeight).toBe(1)
    expect(sampleRoll(2050, move)).toMatchObject({ space: 17, arrival: 1, makeRoom: 1 })
    expect(sampleRoll(2400, move).cameraWeight).toBeLessThan(0.5)
    expect(sampleRoll(ROLL_PRESENTATION_MS, move).cameraWeight).toBe(0)
  })
  it('paces opposite sides in antiphase and has an exact rigid rest pose', () => {
    const rest = stride(0, 0, false),
      active = stride(0, 1, false)
    expect(Math.abs(legAngles(rest, true, 1).hip)).toBe(0)
    expect(legAngles(active, true, 1).hip).toBeGreaterThan(0.4)
    expect(legAngles(active, true, -1).hip).toBeLessThan(-0.4)
    expect(stride(0.3, 1, true).phase).toBe(-stride(0.3, 1, false).phase)
  })
  it('animates the real sculpted feet and leaves saddle vertices rigid', () => {
    const g = camelGeometry('blue'),
      material = new T.MeshBasicMaterial(),
      rig = createRunningCamel(g, material)
    const positions = g.getAttribute('position'),
      indices = g.getAttribute('skinIndex'),
      weights = g.getAttribute('skinWeight')
    const shoes = new Map<number, number>()
    for (let i = 0; i < positions.count; i++) {
      if (positions.getY(i) < 0.065 && weights.getY(i) > 0.99) shoes.set(indices.getY(i), i)
    }
    expect([...shoes.keys()].sort((a, b) => a - b)).toEqual([3, 6, 9, 12])
    const saddle = Array.from({ length: positions.count }, (_, i) => i).find(
      (i) => positions.getY(i) > 0.67 && indices.getX(i) === 0 && weights.getX(i) === 1,
    )!
    const delta = (i: number) => {
      const bind = new T.Vector3().fromBufferAttribute(positions, i)
      return rig.actor.applyBoneTransform(i, bind.clone()).distanceTo(bind)
    }
    rig.apply(stride(0, 0, false))
    rig.actor.updateMatrixWorld(true)
    for (const id of shoes.values()) expect(delta(id)).toBeLessThan(0.00001)
    const excursions = [...shoes.values()].map(() => 0)
    for (const phase of [0, 0.15, 0.3, 0.45]) {
      rig.apply(stride(phase, 1, false))
      rig.actor.updateMatrixWorld(true)
      ;[...shoes.values()].forEach((id, i) => {
        excursions[i] = Math.max(excursions[i], delta(id))
      })
    }
    expect(Math.min(...excursions)).toBeGreaterThan(0.15)
    expect(delta(saddle)).toBeLessThan(0.00001)
    const soles = Array.from({ length: positions.count }, (_, i) => i).filter(
      (i) =>
        positions.getY(i) < 0.017 && [3, 6, 9, 12].includes(indices.getY(i)) && weights.getY(i) > 0.99,
    )
    for (const phase of [0.02, 0.15, 0.28, 0.43, 0.56]) {
      const gait = stride(phase, 1, false)
      rig.apply(gait)
      rig.actor.position.y = gait.bob
      rig.actor.rotation.set(gait.roll, 0, gait.pitch)
      rig.actor.updateMatrixWorld(true)
      const lowest = Math.min(
        ...soles.map((i) => {
          const foot = rig.actor.applyBoneTransform(
            i,
            new T.Vector3().fromBufferAttribute(positions, i),
          )
          return rig.actor.localToWorld(foot).y
        }),
      )
      expect(lowest).toBeGreaterThan(-0.055)
      expect(lowest).toBeLessThan(0.085)
    }
    rig.dispose()
    g.dispose()
    material.dispose()
  })
})
