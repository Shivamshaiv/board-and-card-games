import {
  COLORS,
  legalActions,
  rankCamels,
  simulateRoll,
  type Camel,
  type Action,
  type Color,
  type Crazy,
  type Die,
  type GameView,
  type Stacks,
  type Tile,
} from '../engine.ts'

export const dice: Die[] = [...COLORS, 'grey']
export function mixSeed(value: number) {
  value = Math.imul(value ^ (value >>> 16), 0x21f0aaad)
  value = Math.imul(value ^ (value >>> 15), 0x735a2d97)
  return (value ^ (value >>> 15)) >>> 0
}
export function randomSource(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = Math.imul(state ^ (state >>> 15), state | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
export const crossed = (stacks: Stacks) => !!(stacks[0]?.length || stacks[17]?.length)
export interface LegEnd {
  order: Color[]
  hits: number
  crossed: boolean
}
export interface RaceEnd {
  leg: LegEnd
  order: Color[]
}
const coloredFaces: readonly Crazy[] = ['black']
const greyFaces: readonly Crazy[] = ['black', 'white']
const dieFaces = (die: Die) => (die === 'grey' ? greyFaces : coloredFaces)

const camelCodes: Record<Camel, number> = {
  red: 1,
  blue: 2,
  green: 3,
  yellow: 4,
  purple: 5,
  black: 6,
  white: 7,
}

function stackKey(stacks: Stacks) {
  // Each digit is (space 0–17, camel 1–7). Seven base-144 digits fit in a safe integer.
  let key = 0
  for (let space = 0; space <= 17; space++) {
    const stack = stacks[space]
    if (!stack) continue
    for (const camel of stack) key = key * 144 + space * 8 + camelCodes[camel]
  }
  return key
}

/** All leg placings under the current tile layout, before adding any new moves. */
export function exactLegPlacings(view: Pick<GameView, 'stacks' | 'tiles' | 'remainingDice' | 'phase'>) {
  const colorCount = COLORS.length
  const pairCount = colorCount ** 2
  const diceCount = view.remainingDice.length
  const memo = Array.from({ length: 1 << diceCount }, () => new Map<number, Float64Array>())

  function solve(stacks: Stacks, mask: number, count: number): Float64Array {
    const key = stackKey(stacks)
    const table = memo[mask]
    const cached = table.get(key)
    if (cached) return cached

    // Store the count of weighted roll branches alongside the joint probabilities.
    const result = new Float64Array(pairCount + 1)
    if (count <= 1 || crossed(stacks) || view.phase === 'finished') {
      const [first, second] = rankCamels(stacks)
      result[COLORS.indexOf(first) * colorCount + COLORS.indexOf(second)] = 1
      result[pairCount] = 1
    } else {
      for (let i = 0; i < diceCount; i++) {
        if (!(mask & (1 << i))) continue
        const die = view.remainingDice[i]
        const faces = dieFaces(die)
        const weight = 1 / (count * 3 * faces.length)
        for (let value = 1; value <= 3; value++) {
          for (const face of faces) {
            const next = simulateRoll(stacks, view.tiles, die, value, face)
            const child = solve(next.stacks, mask & ~(1 << i), count - 1)
            for (let pair = 0; pair < pairCount; pair++) result[pair] += weight * child[pair]
            // Match enumerateLeg: identical numbered faces of a colored die share one sequence.
            result[pairCount] += child[pairCount]
          }
        }
      }
    }
    table.set(key, result)
    return result
  }

  const result = solve(view.stacks, (1 << diceCount) - 1, diceCount)
  const pairs = COLORS.flatMap((first, i) =>
    COLORS.flatMap((second, j) => {
      const probability = result[i * colorCount + j]
      return probability > 0 ? [{ first, second, probability }] : []
    }),
  )
  return { pairs, sequences: result[pairCount] }
}

export function publicSeed(view: GameView) {
  // Financial history, unrevealed cards, player names and server entropy never seed race odds.
  const text = JSON.stringify([
    view.stacks,
    view.remainingDice,
    view.tiles.map((t) => [t.space, t.side]),
    view.leg,
  ])
  let hash = 2166136261
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619)
  return hash >>> 0
}
/** A grey face is half as likely as an ordinary die face, given its selected die. */
function enumeratePreparedLeg(
  view: GameView,
  tiles: Tile[],
  visit: (outcome: LegEnd, weight: number) => void,
) {
  let leaves = 0
  function walk(stacks: Stacks, bag: Die[], hits: number, done: boolean, weight: number) {
    if (done || bag.length <= 1) {
      leaves++
      visit({ order: rankCamels(stacks), hits, crossed: done }, weight)
      return
    }
    for (let i = 0; i < bag.length; i++) {
      const die = bag[i],
        rest = bag.filter((_, j) => i !== j)
      const faces = dieFaces(die)
      for (let value = 1; value <= 3; value++)
        for (const face of faces) {
          const move = simulateRoll(stacks, tiles, die, value, face)
          walk(
            move.stacks,
            rest,
            hits + Number(move.tile?.owner === view.seat),
            move.crossed,
            weight / (bag.length * 3 * faces.length),
          )
        }
    }
  }
  walk(view.stacks, view.remainingDice, 0, crossed(view.stacks) || view.phase === 'finished', 1)
  return leaves
}
function drawLeg(
  stacks: Stacks,
  remaining: Die[],
  tiles: Tile[],
  seat: number,
  done: boolean,
  random: () => number,
) {
  const bag = [...remaining]
  let hits = 0
  while (!done && bag.length > 1) {
    const i = Math.floor(random() * bag.length),
      die = bag[i]
    bag[i] = bag[bag.length - 1]
    bag.pop()
    const value = 1 + Math.floor(random() * 3),
      grey = random() < 0.5 ? 'black' : 'white'
    const move = simulateRoll(stacks, tiles, die, value, grey)
    if (move.tile?.owner === seat) hits++
    stacks = move.stacks
    done = move.crossed
  }
  return { stacks, hits, done }
}
function firstLeg(view: GameView, tiles: Tile[], random: () => number) {
  return drawLeg(
    view.stacks,
    view.remainingDice,
    tiles,
    view.seat,
    crossed(view.stacks) || view.phase === 'finished',
    random,
  )
}
function samplePreparedLeg(view: GameView, tiles: Tile[], seed: number): LegEnd {
  const l = firstLeg(view, tiles, randomSource(seed))
  return { order: rankCamels(l.stacks), crossed: l.done, hits: l.hits }
}
/** All candidate tiles use the same per-trial stream, including die movement after this leg. */
function samplePreparedRace(view: GameView, tiles: Tile[], seed: number): RaceEnd {
  const random = randomSource(seed)
  let state = firstLeg(view, tiles, random)
  const leg = { order: rankCamels(state.stacks), crossed: state.done, hits: state.hits }
  if (state.done) return { leg, order: leg.order }
  do {
    state = drawLeg(state.stacks, dice, [], view.seat, false, random)
  } while (!state.done)
  return { leg, order: rankCamels(state.stacks) }
}

/** Validate an optional move once before all the shared-randomness trials. */
export function createChanceModel(view: GameView, placement?: Extract<Action, { type: 'tile' }>) {
  let tiles = view.tiles
  if (placement) {
    const legal = legalActions(view).some(
      (a) => a.type === 'tile' && a.space === placement.space && a.side === placement.side,
    )
    if (!legal) throw new Error('This spectator placement is unavailable.')
    tiles = [
      ...view.tiles.filter((t) => t.owner !== view.seat),
      {
        owner: view.seat,
        space: placement.space,
        side: placement.side,
      },
    ]
  }
  return {
    enumerateLeg: (visit: (outcome: LegEnd, weight: number) => void) =>
      enumeratePreparedLeg(view, tiles, visit),
    sampleLeg: (seed: number) => samplePreparedLeg(view, tiles, seed),
    sampleRace: (seed: number) => samplePreparedRace(view, tiles, seed),
  }
}

function sameLayout(a: Tile[], b: Tile[]) {
  return (
    a.length === b.length &&
    a.every((t) => b.some((u) => u.owner === t.owner && u.space === t.space && u.side === t.side))
  )
}

// Existing callers may supply a full layout. It must represent the live position
// or exactly one legal placement by this seat, preserving every opponent's tile.
function modelForLayout(view: GameView, layout: Tile[]) {
  if (layout === view.tiles || sameLayout(view.tiles, layout)) return createChanceModel(view)
  const own = layout.find((t) => t.owner === view.seat)
  if (!own || !sameLayout([...view.tiles.filter((t) => t.owner !== view.seat), own], layout))
    throw new Error('A counterfactual may move only your own spectator tile.')
  return createChanceModel(view, { type: 'tile', space: own.space, side: own.side })
}

export function enumerateLeg(
  view: GameView,
  tiles: Tile[],
  visit: (outcome: LegEnd, weight: number) => void,
) {
  return modelForLayout(view, tiles).enumerateLeg(visit)
}
export function sampleLeg(view: GameView, tiles: Tile[], seed: number) {
  return modelForLayout(view, tiles).sampleLeg(seed)
}
export function sampleRace(view: GameView, tiles: Tile[], seed: number) {
  return modelForLayout(view, tiles).sampleRace(seed)
}
