import { describe, expect, it } from 'vitest'
import {
  COLORS,
  applyAction,
  createGame,
  legalActions,
  projectGame,
  rankCamels,
  type GameState,
  type Tile,
} from '../src/engine'
import { chooseBotAction } from '../src/bot'
import { analyzeGame } from '../src/advisor/analysis'
import {
  createChanceModel,
  enumerateLeg,
  exactLegPlacings,
  sampleLeg,
  sampleRace,
} from '../src/advisor/chance'
import { enumerateNextRoll } from '../src/advisor/next-roll'
import {
  expectedCorrectFinishReward,
  finalWallet,
  finishLedger,
  legWallet,
  modelPriorCards,
  publicTransactionBalances,
} from '../src/advisor/value'

const fresh = () => createGame([{ name: 'Ada' }, { name: 'Bo' }, { name: 'Lee' }], 913)
const getView = (g: GameState) => projectGame(g, g.turn)
const roll = { type: 'roll' } as const

// Independently materialize every die/face through the real turn entry point.
// Bucketing a numbered racing face gives weight two; each grey number/ink is unique.
function physicalDraws(g: GameState) {
  const all = new Map<string, { state: GameState; weight: number }>()
  const total = g.remainingDice.reduce((n, die) => n + (die === 'grey' ? 6 : 3), 0)
  for (let seed = 1; all.size < total && seed < 4000; seed++) {
    const state = applyAction({ ...g, rng: seed }, g.turn, roll)
    const face = state.events.slice(g.events.length).find((e) => e.roll)!.roll!
    const key = [face.die, face.value, face.greyColor ?? ''].join('/')
    if (!all.has(key))
      all.set(key, { state, weight: (face.die === 'grey' ? 1 : 2) / (6 * g.remainingDice.length) })
  }
  expect(all.size).toBe(total)
  return all
}

describe('counterfactual move boundaries', () => {
  it('rejects illegal tile boards in every exported trial path, and allows a real adjacent relocation', () => {
    const g = fresh()
    g.stacks = { 2: [...COLORS], 14: ['black', 'white'] }
    g.tiles = [
      { owner: 0, space: 8, side: 'cheer' },
      { owner: 1, space: 11, side: 'boo' },
    ]
    g.remainingDice = ['red', 'grey']
    const v = getView(g)
    const other = v.tiles[1]
    const tile = (space: number): Tile => ({ owner: 0, space, side: 'boo' })
    const illegal = [
      [tile(1), other],
      [tile(2), other],
      [tile(8), other],
      [tile(10), other],
      [tile(11), other],
      [tile(12), other],
      [other],
      [tile(9)],
      [tile(9), { ...other, space: 15 }],
      [tile(9), other, other],
    ]
    for (const layout of illegal) {
      expect(() => sampleLeg(v, layout, 91)).toThrow()
      expect(() => sampleRace(v, layout, 91)).toThrow()
      expect(() => enumerateLeg(v, layout, () => {})).toThrow()
    }
    expect(() => createChanceModel(v, { type: 'tile', space: 8, side: 'cheer' })).toThrow()
    const moved = applyAction(g, 0, { type: 'tile', space: 9, side: 'boo' })
    expect(sampleRace(v, [other, tile(9)], 91)).toEqual(
      sampleRace(projectGame(moved, 0), moved.tiles, 91),
    )
    expect(() =>
      createChanceModel(projectGame(g, 1), { type: 'tile', space: 13, side: 'cheer' }),
    ).toThrow()
  })
  it('every ranked or chosen tile on a crowded table is accepted by the authoritative turn validator', () => {
    const g = fresh()
    g.stacks = { 2: ['purple', 'green'], 5: ['red'], 13: ['yellow', 'blue'], 15: ['white', 'black'] }
    g.tiles = [
      { owner: 0, space: 8, side: 'cheer' },
      { owner: 1, space: 11, side: 'boo' },
      { owner: 2, space: 4, side: 'cheer' },
    ]
    const v = getView(g),
      options = { seed: 71, raceSamples: 24, pairedSamples: 6 }
    const rows = analyzeGame(v, options).actions.filter((r) => r.action.type === 'tile')
    expect(rows.map((x) => JSON.stringify(x.action)).sort()).toEqual(
      legalActions(v)
        .filter((a) => a.type === 'tile')
        .map((a) => JSON.stringify(a))
        .sort(),
    )
    for (const row of rows) expect(() => applyAction(g, 0, row.action)).not.toThrow()
    for (const level of ['easy', 'medium', 'hard'] as const)
      for (const seed of [11, 709381, 90387125]) {
        const chosen = chooseBotAction(v, level, seed)
        expect(() => applyAction(g, 0, chosen)).not.toThrow()
      }
  })
})

describe('physical dice against the actual turn and settlement engine', () => {
  it('matches grey face selection, directional tiles and all resulting stacks for every fifth draw', () => {
    const g = fresh()
    g.stacks = { 5: ['black', 'yellow'], 7: ['purple'], 10: ['green'], 11: ['white', 'red', 'blue'] }
    g.tiles = [
      { owner: 0, space: 4, side: 'cheer' },
      { owner: 1, space: 9, side: 'boo' },
      { owner: 2, space: 13, side: 'boo' },
    ]
    g.remainingDice = ['grey', 'red']
    g.rolls = (['blue', 'purple', 'yellow', 'green'] as const).map((die) => ({ die, value: 1 }))
    g.players[0].pyramidTickets = 4
    const outcomes = physicalDraws(g),
      forecast = enumerateNextRoll(getView(g))
    expect(forecast.total).toBe(12)
    for (const b of forecast.branches) {
      const engine = outcomes.get([b.die, b.value, b.ink ?? ''].join('/'))!
      expect(b.weight / forecast.total).toBe(engine.weight)
      expect(b.movement.stacks).toEqual(engine.state.stacks)
      expect(b.order).toEqual(rankCamels(engine.state.stacks))
      expect(engine.state.leg).toBe(2)
      expect(engine.state.remainingDice).toHaveLength(6)
    }
  })
  it('matches exact first/second probabilities against forced authoritative two-draw games, including an early reverse finish', () => {
    const g = fresh()
    g.stacks = {
      1: ['black', 'yellow'],
      4: ['purple'],
      9: ['red'],
      10: ['blue', 'green'],
      13: ['white'],
    }
    g.remainingDice = ['red', 'blue', 'grey']
    g.rolls = (['purple', 'yellow', 'green'] as const).map((die) => ({ die, value: 1 }))
    g.players[0].pyramidTickets = 3
    const pairs = new Map<string, number>()
    let reverse = 0
    function walk(state: GameState, p: number) {
      if (state.phase === 'finished' || state.leg !== g.leg) {
        const order = rankCamels(state.stacks),
          key = order.slice(0, 2).join('/')
        pairs.set(key, (pairs.get(key) ?? 0) + p)
        if (state.stacks[0]?.length) reverse += p
      } else for (const b of physicalDraws(state).values()) walk(b.state, p * b.weight)
    }
    walk(g, 1)
    // Grey is drawn with probability 2/3. Blue-first 3 loads white; a subsequent
    // grey white-ink face then selects white instead of black (1/3 × 1/3 × 1/2 × 1/2).
    expect(reverse).toBeCloseTo(2 / 3 - 1 / 36, 12)
    const exact = exactLegPlacings(getView(g))
    for (const pair of exact.pairs)
      expect(pair.probability).toBeCloseTo(pairs.get([pair.first, pair.second].join('/'))!, 12)
    expect(exact.pairs.length).toBe(pairs.size)
  })
})

describe('finish settlement and hidden-card beliefs', () => {
  it('reconstructs benchmark wallets from public payments throughout a complete real-engine race', () => {
    let g = fresh()
    g = applyAction(g, 0, { type: 'finish', pile: 'winner', color: 'red' })
    g = applyAction(g, 1, { type: 'ticket', color: 'purple' })
    g = applyAction(g, 2, { type: 'tile', space: 5, side: 'cheer' })
    let moves = 0
    while (g.phase !== 'finished' && moves++ < 200) {
      const v = projectGame(g, 0)
      expect(v.players[1].coins).toBeNull()
      expect(publicTransactionBalances(v)).toEqual(g.players.map((p) => p.coins))
      g = applyAction(g, g.turn, roll)
    }
    expect(g.phase).toBe('finished')
    expect(g.events.some((e) => e.movement?.tile)).toBe(true)
    const final = projectGame(g, 0)
    expect(final.finishResults).toHaveLength(1)
    // The benchmark helper needs only the number of players, never their balances.
    final.players.forEach((p) => {
      p.coins = null
    })
    expect(publicTransactionBalances(final)).toEqual(g.players.map((p) => p.coins))
  })
  it('keeps predictions independent of opponents’ balances, secret colors and the live dice stream', () => {
    const source = fresh()
    source.bets.winner = [{ seat: 1, color: 'red' }]
    source.hands[1] = COLORS.filter((c) => c !== 'red')
    source.players[1].handCount = 4
    const other = structuredClone(source)
    other.players[1].coins = 27
    other.bets.winner[0].color = 'purple'
    other.hands[1] = COLORS.filter((c) => c !== 'purple')
    other.rng = 0x7156937
    const a = getView(source),
      b = getView(other),
      opts = { seed: 789, raceSamples: 20, pairedSamples: 5, exactLegOdds: false }
    expect(a.players[1].coins).toBeNull()
    expect(b.players[1].coins).toBeNull()
    expect(analyzeGame(a, opts)).toEqual(analyzeGame(b, opts))
    for (const level of ['easy', 'medium', 'hard'] as const)
      expect(chooseBotAction(a, level, 12503)).toEqual(chooseBotAction(b, level, 12503))
  })
  it('matches card-by-card zero-floor timing when a new winner changes what can be charged in the loser pile', () => {
    const g = fresh()
    g.stacks = {
      1: ['purple'],
      3: ['blue'],
      6: ['yellow', 'green'],
      14: ['white', 'black'],
      16: ['red'],
    }
    g.remainingDice = ['red', 'grey']
    g.rolls = (['blue', 'green', 'purple', 'yellow'] as const).map((die) => ({ die, value: 1 }))
    g.players[2].pyramidTickets = 4
    g.players[0].coins = 0
    g.players[0].tickets = [{ color: 'yellow', value: 5 }]
    g.bets = {
      winner: [
        { seat: 0, color: 'blue' },
        { seat: 1, color: 'red' },
      ],
      loser: [
        { seat: 0, color: 'yellow' },
        { seat: 0, color: 'purple' },
      ],
    }
    g.hands[0] = ['red', 'green']
    g.players[0].handCount = 2
    g.hands[1] = COLORS.filter((c) => c !== 'red')
    g.players[1].handCount = 4
    const v = getView(g),
      newCard = { type: 'finish', pile: 'winner', color: 'red' } as const
    const baseline = physicalDraws({ ...g, turn: 1 }).get('red/1/')!.state
    const withCard = physicalDraws(applyAction(g, 0, newCard)).get('red/1/')!.state
    const order = rankCamels(baseline.stacks),
      end = { order, hits: 0, crossed: true },
      ledger = finishLedger(g.bets, 0, order)
    const start = legWallet(v, end)
    expect(start).toBe(0)
    expect(finalWallet(start, ledger)).toBe(baseline.players[0].coins)
    expect(finalWallet(start, ledger, newCard)).toBe(withCard.players[0].coins)
    expect(withCard.players[0].coins - baseline.players[0].coins).toBe(4)
  })
  it('bounds a previous bettor with multiple face-down cards to one correct card and keeps bot tiers inside the possible award', () => {
    const g = fresh()
    g.stacks = { 1: ['black', 'purple'], 7: ['green', 'yellow', 'blue'], 12: ['white'], 16: ['red'] }
    g.remainingDice = ['red', 'grey']
    g.tickets.red = [3, 2, 2]
    g.players[2].tickets = [{ color: 'red', value: 5 }]
    g.bets.winner = [{ seat: 0, color: 'purple' }, ...COLORS.map((color) => ({ seat: 1, color }))]
    g.hands[0] = COLORS.filter((c) => c !== 'purple')
    g.players[0].handCount = 4
    g.hands[1] = []
    g.players[1].handCount = 0
    const v = getView(g)
    expect(expectedCorrectFinishReward(v, 'winner')).toBe(5)
    for (const seed of [9, 17627, 91471])
      for (const level of ['medium', 'hard'] as const)
        expect(chooseBotAction(v, level, seed)).toEqual({
          type: 'finish',
          color: 'red',
          pile: 'winner',
        })
    g.bets.winner.pop()
    g.hands[1] = ['purple']
    g.players[1].handCount = 1
    expect(expectedCorrectFinishReward(getView(g), 'winner')).toBeCloseTo(5.6, 12)
    g.bets.loser = [{ seat: 1, color: 'purple' }]
    g.hands[1] = []
    g.players[1].handCount = 0
    for (let seed = 0; seed < 30; seed++) {
      const belief = modelPriorCards(getView(g), seed)
      const rival = (['winner', 'loser'] as const)
        .flatMap((p) => belief[p].filter((b) => b.seat === 1).map((b) => b.color))
        .sort()
      expect(rival).toEqual([...COLORS].sort())
      expect(belief.winner[0].color).toBe('purple')
    }
  })
})
