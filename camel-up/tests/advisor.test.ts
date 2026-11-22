import { describe, expect, it } from 'vitest'
import { analyzeGame, type AdvisorResult } from '../src/advisor/analysis'
import { enumerateLeg, exactLegPlacings } from '../src/advisor/chance'
import {
  COLORS,
  createGame,
  legalActions,
  projectGame,
  type Action,
  type GameState,
  type Stacks,
} from '../src/engine'

const create = (n = 3) =>
  createGame(
    Array.from({ length: n }, (_, i) => ({ name: `Seat ${i}` })),
    12,
  )
const settings = { seed: 53, raceSamples: 768, pairedSamples: 48 }
function oneDraw(stacks?: Stacks, n = 3) {
  const g = create(n)
  g.stacks = stacks ?? {
    2: ['green'],
    3: ['yellow'],
    4: ['purple'],
    9: ['blue'],
    10: ['red'],
    14: ['white', 'black'],
  }
  g.remainingDice = ['red', 'blue']
  return g
}
const view = (g: GameState) => projectGame(g, g.turn)
const action = (r: AdvisorResult, a: Action) =>
  r.actions.find((x) => JSON.stringify(x.action) === JSON.stringify(a))!
const odds = (r: AdvisorResult, color: string) => r.racers.find((x) => x.color === color)!

describe('adviser chance calculations', () => {
  it('enumerates the fifth draw and derives ticket-face EV from first and second probabilities', () => {
    const r = analyzeGame(view(oneDraw()), settings)
    expect(r.leg).toEqual({ method: 'exact', samples: 6 })
    for (const c of ['red', 'blue']) {
      const row = odds(r, c)
      expect(row.legFirst).toBeCloseTo(0.5, 12)
      expect(row.legSecond).toBeCloseTo(0.5, 12)
      expect(row.ticketEV).toBeCloseTo(3, 12)
    }
    const red = action(r, { type: 'ticket', color: 'red' })
    expect(red.method).toBe('exact')
    expect(red.ev).toBeCloseTo(3, 12)
    expect(red.standardError).toBe(0)
  })
  it('gives the grey die half the mass and its two colors equal weight when both crazy camels carry racers', () => {
    const g = oneDraw({
      1: ['yellow'],
      2: ['green'],
      3: ['purple'],
      5: ['black', 'red'],
      6: ['white', 'blue'],
    })
    g.remainingDice = ['red', 'grey']
    const r = analyzeGame(view(g), settings)
    expect(r.leg.samples).toBe(9)
    expect(odds(r, 'red').legFirst).toBeCloseTo(2 / 3, 12)
    expect(odds(r, 'blue').legFirst).toBeCloseTo(1 / 3, 12)
  })
  it('recognizes a finish guaranteed in the current leg and ranks backward-carried racers at the rear', () => {
    const g = oneDraw({ 1: ['black', 'yellow', 'purple'], 3: ['red', 'blue', 'green'], 14: ['white'] })
    g.stacks = { 0: g.stacks[1], 3: g.stacks[3], 14: g.stacks[14] }
    g.phase = 'finished'
    const r = analyzeGame(projectGame(g, -1), settings)
    expect(r.leg).toEqual({ method: 'exact', samples: 1 })
    expect(r.race).toEqual({ method: 'exact', samples: 1 })
    expect(odds(r, 'green').raceFirst).toBe(1)
    expect(odds(r, 'yellow').raceLast).toBe(1)
    expect(r.racers.every((c) => c.ticketEV === null)).toBe(true)
    expect(r.actions).toEqual([])
  })
  it('shows exact opening odds and retains the existing seeded move ranking', () => {
    const g = create(),
      v = view(g),
      before = JSON.stringify(v),
      a = analyzeGame(v, settings),
      b = analyzeGame(v, { ...settings, exactLegOdds: false })
    expect(JSON.stringify(v)).toBe(before)
    expect(a.leg).toEqual({ method: 'exact', samples: 320760 })
    expect(a.race).toEqual(b.race)
    const ranking = (result: AdvisorResult) => result.actions.map(({ action, ev }) => ({ action, ev }))
    expect(ranking(a)).toEqual(ranking(b))
    expect(
      analyzeGame(v, { ...settings, seed: 71, raceSamples: 4 }).racers.map((r) => r.legFirst),
    ).toEqual(a.racers.map((r) => r.legFirst))
    for (const key of ['legFirst', 'legSecond', 'raceFirst', 'raceLast'] as const) {
      expect(a.racers.reduce((s, c) => s + c[key], 0)).toBeCloseTo(1, 10)
    }
    g.remainingDice = ['red', 'grey', 'blue', 'green']
    const e = analyzeGame(view(g), settings)
    expect(e.leg.method).toBe('exact')
    expect(e.leg.samples).toBeLessThanOrEqual(1134)
    expect(e.leg.samples).toBeGreaterThan(100)
  })
  it('matches the exhaustive roll sequences with stacks, a grey die and spectator tiles', () => {
    const v = view(
      oneDraw({
        2: ['yellow'],
        4: ['purple', 'black', 'green'],
        8: ['blue'],
        13: ['red'],
        16: ['white'],
      }),
    )
    v.remainingDice = ['red', 'green', 'blue', 'purple', 'grey']
    v.tiles = [
      { owner: 0, space: 15, side: 'cheer' },
      { owner: 1, space: 6, side: 'boo' },
    ]
    const mass = new Map<string, number>()
    const count = enumerateLeg(v, v.tiles, ({ order }, weight) => {
      const pair = order.slice(0, 2).join('/')
      mass.set(pair, (mass.get(pair) ?? 0) + weight)
    })
    const exact = exactLegPlacings(v)
    expect(exact.sequences).toBe(count)
    expect(exact.pairs).toHaveLength(mass.size)
    for (const { first, second, probability } of exact.pairs)
      expect(probability).toBeCloseTo(mass.get(first + '/' + second)!, 10)
  })
})

describe('adviser values and visibility', () => {
  it('includes every legal choice once at eight seats, including paired tile alternatives', () => {
    const v = view(create(8)),
      r = analyzeGame(v, settings),
      key = (a: Action) => JSON.stringify(a)
    expect(r.actions.map((x) => key(x.action)).sort()).toEqual(legalActions(v).map(key).sort())
    expect(
      r.actions.every(
        (x, i) =>
          Number.isFinite(x.ev) &&
          Number.isFinite(x.standardError) &&
          (!i || r.actions[i - 1].ev >= x.ev),
      ),
    ).toBe(true)
    expect(r.actions.filter((a) => a.action.type === 'tile').every((a) => a.samples === 48)).toBe(true)
    expect(r.actions.some((a) => a.action.type === 'partner')).toBe(true)
    expect(analyzeGame(projectGame(create(8), -1), settings).actions).toEqual([])
  })
  it('subtracts an existing spectator tile’s expected income when considering a relocation', () => {
    const g = oneDraw({ 2: ['green', 'yellow', 'purple'], 10: ['black', 'white'], 14: ['red', 'blue'] })
    const start = analyzeGame(view(g), settings)
    expect(action(start, { type: 'tile', space: 15, side: 'cheer' }).ev).toBeCloseTo(1 / 3, 10)
    g.tiles = [{ owner: 0, space: 16, side: 'cheer' }]
    const moved = analyzeGame(view(g), settings)
    expect(action(moved, { type: 'tile', space: 15, side: 'cheer' }).ev).toBeCloseTo(0, 10)
  })
  it('distinguishes printed ticket loss from the actual coin floor and values a partner copy independently', () => {
    const g = oneDraw(
      { 2: ['green', 'yellow', 'purple'], 10: ['black', 'white'], 16: ['blue', 'red'] },
      6,
    )
    g.players[0].coins = 0
    g.players[1].tickets = [{ color: 'red', value: 5 }]
    const r = analyzeGame(view(g), settings)
    expect(r.race.method).toBe('exact')
    expect(odds(r, 'red').raceFirst).toBeCloseTo(1, 12)
    expect(odds(r, 'green').ticketEV).toBe(-1)
    expect(action(r, { type: 'ticket', color: 'green' }).ev).toBe(0)
    expect(action(r, { type: 'partner', partner: 1 }).ev).toBeCloseTo(5, 12)
    expect(action(r, { type: 'roll' }).ev).toBeCloseTo(1, 12)
    g.phase = 'partnership'
    g.players[0].partner = 1
    g.players[1].partner = 0
    g.remainingDice = ['grey']
    g.players[1].tickets.push({ color: 'purple', value: 5 })
    g.players[1].pyramidTickets = 1
    const copy = analyzeGame(view(g), settings)
    expect(copy.actions).toHaveLength(4)
    expect(action(copy, { type: 'copy', ticket: 0 }).ev).toBe(5)
    expect(action(copy, { type: 'copy', ticket: 1 }).ev).toBe(0)
    expect(action(copy, { type: 'copy', ticket: 2 }).ev).toBe(1)
    expect(action(copy, { type: 'copy', ticket: null }).ev).toBe(0)
  })
  it('reports the possible correct payout and never reads the actual hidden prior color or RNG', () => {
    const g = oneDraw({ 2: ['green', 'yellow', 'purple'], 10: ['black', 'white'], 16: ['blue', 'red'] })
    g.bets.winner = [{ seat: 1, color: 'red' }]
    g.hands[1] = COLORS.filter((c) => c !== 'red')
    g.players[1].handCount = 4
    const options = { seed: 4819, raceSamples: 4096, pairedSamples: 32 }
    const a = analyzeGame(view(g), options)
    g.rng = 123
    g.bets.winner[0].color = 'purple'
    g.hands[1] = COLORS.filter((c) => c !== 'purple')
    const b = analyzeGame(view(g), options)
    expect(a).toEqual(b)
    const bet = action(a, { type: 'finish', pile: 'winner', color: 'red' })
    expect(bet.finishRewardRange).toEqual([5, 8])
    // A uniformly hidden single opponent card is correct 1/5 of the time.
    expect(Math.abs(bet.ev - (0.2 * 5 + 0.8 * 8))).toBeLessThan(0.09)
    expect(bet.standardError).toBeGreaterThan(0)
    g.bets.winner = COLORS.map((color) => ({ seat: 1, color }))
    g.hands[1] = []
    g.players[1].handCount = 0
    const certain = action(analyzeGame(view(g), settings), {
      type: 'finish',
      pile: 'winner',
      color: 'red',
    })
    expect(certain.finishRewardRange).toEqual([5, 5])
    expect(certain.ev).toBeCloseTo(5, 12)
    expect(certain.method).toBe('exact')
  })
  it('combines a known finish reward with the cash in each terminal branch instead of flooring an averaged payout', () => {
    const g = oneDraw({
      3: ['purple', 'yellow'],
      12: ['white', 'black'],
      15: ['green'],
      16: ['red', 'blue'],
    })
    g.remainingDice = ['red', 'blue', 'green']
    g.players[0].coins = 0
    g.players[0].tickets = [{ color: 'green', value: 5 }]
    const r = analyzeGame(view(g), settings)
    expect(r.race.method).toBe('exact')
    expect(odds(r, 'green').raceFirst).toBeCloseTo(1 / 3, 12)
    const bet = action(r, { type: 'finish', pile: 'winner', color: 'green' })
    // Green wins precisely when its die is first. The wallet is 5 EP in those branches
    // and empty in every losing branch: the actual added payoff is 8/3, not 8/3 − 2/3.
    expect(bet.ev).toBeCloseTo(8 / 3, 12)
    expect(bet.method).toBe('exact')
    expect(bet.standardError).toBe(0)
  })
})
