import { describe, expect, it } from 'vitest'
import { camelBearing, spaceLap, trackPoint } from '../src/board/layout'
import {
  applyAction,
  createGame,
  legalActions,
  projectGame,
  rankCamels,
  simulateRoll,
  spectatorPlacementBlock,
  type Side,
  type Stacks,
  type Tile,
} from '../src/engine'

const signs: Side[] = ['cheer', 'boo']
const newRace = () => createGame([{ name: 'Alex' }, { name: 'Maya' }, { name: 'Rafi' }], 17)
const board = (stacks: Stacks): Stacks =>
  Object.assign(Object.fromEntries(Array.from({ length: 18 }, (_, n) => [n, []])), stacks)

describe('spectator placement invariants', () => {
  it('offers both faces on exactly the spaces that leave a separated final arrangement', () => {
    const game = newRace()
    game.stacks = board({
      3: ['red', 'green', 'yellow'],
      13: ['blue', 'purple'],
      15: ['black', 'white'],
    })
    for (const own of [0, 2, 6, 12, 16]) {
      for (let other = 2; other <= 16; other++) {
        if (game.stacks[other].length || (own && Math.abs(own - other) < 2)) continue
        for (const face of signs) {
          game.tiles = [{ owner: 1, space: other, side: face }]
          if (own) game.tiles.push({ owner: 0, space: own, side: 'cheer' })
          const view = projectGame(game, 0)
          const listed = legalActions(view).filter((a) => a.type === 'tile')
          for (let n = 1; n <= 16; n++) {
            const permitted =
              n !== 1 && n !== own && game.stacks[n].length === 0 && Math.abs(n - other) > 1
            expect(spectatorPlacementBlock(view, 0, n) === null).toBe(permitted)
            expect(listed.filter((a) => a.space === n).map((a) => a.side)).toEqual(
              permitted ? signs : [],
            )
          }
        }
      }
    }
  })

  it('rejects both faces between existing tiles and replaces the owner’s tile atomically', () => {
    let g = newRace()
    g = applyAction(g, 0, { type: 'tile', space: 8, side: 'cheer' })
    g = applyAction(g, 1, { type: 'tile', space: 10, side: 'boo' })
    expect(spectatorPlacementBlock(g, 2, 9)).toContain('spaces 8 and 10')
    for (const side of signs)
      for (const space of [7, 8, 9, 10, 11])
        expect(() => applyAction(g, 2, { type: 'tile', space, side })).toThrow()
    g = applyAction(g, 2, { type: 'tile', space: 12, side: 'cheer' })
    const old = structuredClone(g)
    expect(() => applyAction(g, 0, { type: 'tile', space: 8, side: 'boo' })).toThrow(/different space/)
    expect(g).toEqual(old)
    const moved = applyAction(g, 0, { type: 'tile', space: 7, side: 'boo' })
    expect(g.tiles).toEqual(old.tiles)
    expect(moved.tiles.filter((t) => t.owner === 0)).toEqual([{ owner: 0, space: 7, side: 'boo' }])
    expect(moved.tiles.some((t) => t.space === 8)).toBe(false)
    expect(moved.events.at(-1)?.text).toContain('from space 8 to 7, boo side up')
  })

  it('takes the upper unit from its source and reinserts it below the waiting remainder after a one-step boo', () => {
    const stacks = board({
      4: ['yellow', 'red', 'blue'],
      8: ['purple', 'green'],
      15: ['white', 'black'],
    })
    const tile: Tile = { owner: 2, space: 5, side: 'boo' }
    const m = simulateRoll(stacks, [tile], 'red', 1)
    expect([m.from, m.landing, m.to]).toEqual([4, 5, 4])
    expect(m.stacks[4]).toEqual(['red', 'blue', 'yellow'])
    expect(m.unit).toEqual(['red', 'blue'])
    expect(m.tile).toEqual(tile)
    expect(stacks[4]).toEqual(['yellow', 'red', 'blue'])
  })

  it('finishes from a cheer at 16 and ranks a backwards-carried unit least advanced', () => {
    const stacks = board({
      2: ['black', 'blue', 'green'],
      8: ['white', 'yellow'],
      15: ['red', 'purple'],
    })
    const forward = simulateRoll(stacks, [{ owner: 2, space: 16, side: 'cheer' }], 'red', 1)
    expect(forward.to).toBe(17)
    expect(rankCamels(forward.stacks).slice(0, 2)).toEqual(['purple', 'red'])
    const reverse = simulateRoll(stacks, [], 'grey', 2, 'black')
    expect(reverse.to).toBe(0)
    expect(rankCamels(reverse.stacks).slice(-2)).toEqual(['green', 'blue'])
  })
  it('keeps racing and crazy pawns facing their own directions around every bend, including during a reverse step', () => {
    for (let n = 1; n <= 16; n += 0.125) {
      const before = trackPoint(spaceLap(n) - 0.0001),
        after = trackPoint(spaceLap(n) + 0.0001)
      const dx = after.x - before.x,
        dz = after.z - before.z,
        length = Math.hypot(dx, dz)
      for (const color of ['red', 'black', 'white']) {
        const angle = camelBearing(n, color),
          alignment = (Math.cos(angle) * dx - Math.sin(angle) * dz) / length
        expect(color === 'red' ? alignment : -alignment).toBeGreaterThan(0.999)
      }
    }
  })
})
