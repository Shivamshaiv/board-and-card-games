import { describe, expect, it } from 'vitest'
import { createGame, projectGame, type Action, type GameState } from '../src/engine'
import { analyzeGame, type ActionEstimate } from '../src/advisor/analysis'
import { compareMoves, moveEvidence } from '../src/advisor/move-evidence'

function position(count = 3) {
  const g = createGame(
    Array.from({ length: count }, (_, i) => ({ name: i === 1 ? 'Mara' : `Player ${i}` })),
    13,
  )
  g.stacks = {
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
function analyze(g: GameState) {
  const v = projectGame(g, g.turn),
    r = analyzeGame(v, { seed: 778, raceSamples: 128, pairedSamples: 32 })
  return {
    v,
    r,
    for: (a: Action) => {
      const e = r.actions.find((x) => JSON.stringify(x.action) === JSON.stringify(a))
      if (!e) throw new Error('Test requested a move outside the legal action set.')
      return moveEvidence(v, r, e)
    },
  }
}
const eq = (label: string, probability: number, value: number) =>
  expect.objectContaining({
    label,
    probability: expect.closeTo(probability, 10),
    payout: [value, value],
  })

describe('action-specific move evidence', () => {
  it('shows the printed distribution for a leg ticket and keeps it distinct from incremental wallet value', () => {
    const first = analyze(position()).for({ type: 'ticket', color: 'red' })
    expect(first.outcomes).toEqual([
      eq('First place', 0.5, 5),
      eq('Second place', 0.5, 1),
      eq('Third to fifth', 0, -1),
    ])
    expect(first.facts).not.toContainEqual({ label: 'Average printed return', value: '+3 EP' })
    expect(first.why).toContain('100% chance to finish first or second')
    expect(first.ev).toBeCloseTo(3, 12)
    const empty = position()
    empty.players[0].coins = 0
    const loser = analyze(empty).for({ type: 'ticket', color: 'green' })
    expect(loser.ev).toBe(0)
    expect(loser.facts).toContainEqual({ label: 'Average printed return', value: '-1 EP' })
    expect(loser.evNote).toMatch(/coins you have/)
  })
  it('uses the correct winning or losing probability and exposes both possible positive prizes', () => {
    const g = position()
    g.stacks = { 2: ['yellow', 'green', 'purple'], 13: ['black', 'white'], 16: ['blue', 'red'] }
    g.bets.winner = [
      { seat: 1, color: 'red' },
      { seat: 1, color: 'blue' },
    ]
    const data = analyze(g),
      win = data.for({ type: 'finish', pile: 'winner', color: 'red' }),
      lose = data.for({ type: 'finish', pile: 'loser', color: 'yellow' })
    expect(win.outcomes[0].payout).toEqual([5, 8])
    expect(win.outcomes[0].probability).toBeCloseTo(1, 12)
    expect(win.outcomes[1].payout).toEqual([-1, -1])
    expect(win.outcomeMethod).toBe('exact')
    expect(win.instruction).toContain('Overall winner')
    expect(lose.title).toBe('Bet on Yellow to finish last')
    expect(lose.outcomes[0]).toEqual(eq('Finishes last', 1, 8))
  })
  it('gives a tile’s income distribution even when moving it has no incremental benefit', () => {
    const g = position()
    g.stacks = { 3: ['purple', 'yellow', 'green'], 11: ['black', 'white'], 14: ['blue', 'red'] }
    g.tiles = [{ owner: 0, side: 'cheer', space: 16 }]
    const tile = analyze(g).for({ type: 'tile', space: 15, side: 'boo' })
    expect(tile.outcomes).toEqual([eq('No landings', 2 / 3, 0), eq('1 landing', 1 / 3, 1)])
    expect(tile.ev).toBeCloseTo(0, 12)
    expect(tile.facts).toContainEqual({ label: 'Change in landing income', value: '0 EP' })
    expect(tile.facts).toContainEqual({ label: 'Expected income on space 16', value: '+0.33 EP' })
    expect(tile.why).toMatch(/0.33 landings.*1 EP/)
    expect(tile.instruction).toMatch(/space 15/)
  })
  it('uses the joint first-and-second distribution to value a choice of partner tickets', () => {
    const g = position(6)
    g.players[1].tickets = [
      { color: 'red', value: 5 },
      { color: 'blue', value: 5 },
    ]
    const partner = analyze(g).for({ type: 'partner', partner: 1 })
    expect(partner.ev).toBeCloseTo(5, 12)
    expect(partner.outcomes).toEqual([eq('Copy a 5 EP payout', 1, 5)])
    expect(partner.title).toBe('Partner with Mara')
    g.players[1].tickets = [{ color: 'red', value: 5 }]
    const p = analyze(g).for({ type: 'partner', partner: 1 })
    expect(p.outcomes).toEqual([eq('Copy a 5 EP payout', 0.5, 5), eq('Copy a 1 EP payout', 0.5, 1)])
  })
  it('distinguishes a guaranteed pyramid ticket from its possible effect on a broke player’s balance', () => {
    const g = position()
    g.players[0].coins = 0
    g.players[0].tickets = [
      { color: 'green', value: 3 },
      { color: 'purple', value: 5 },
    ]
    const roll = analyze(g).for({ type: 'roll' })
    expect(roll.ev).toBe(0)
    expect(roll.outcomes).toEqual([eq('Pyramid ticket', 1, 1)])
    expect(roll.why).toMatch(/final draw/i)
  })
  it('uses known settlement payouts, including decline and a negative partner ticket', () => {
    const g = position(6)
    g.phase = 'partnership'
    g.remainingDice = ['grey']
    g.players[0].partner = 1
    g.players[1].partner = 0
    g.players[1].tickets = [{ color: 'purple', value: 5 }]
    g.players[1].pyramidTickets = 1
    const data = analyze(g)
    const copy = data.for({ type: 'copy', ticket: 0 })
    expect(copy.why).toContain('outside the top two')
    expect(copy.outcomes).toEqual([eq('Copy payout', 1, -1)])
    expect(data.for({ type: 'copy', ticket: 1 }).outcomes).toEqual([eq('Copy payout', 1, 1)])
    expect(data.for({ type: 'copy', ticket: null }).outcomes).toEqual([eq('No copy', 1, 0)])
  })
  it('conserves outcome probability for each available action on an eight-seat opening', () => {
    const g = createGame(
        Array.from({ length: 8 }, (_, i) => ({ name: `Player ${i}` })),
        9,
      ),
      { r, v } = analyze(g)
    for (const e of r.actions) {
      const m = moveEvidence(v, r, e)
      expect(m.outcomes.reduce((s, x) => s + x.probability, 0)).toBeCloseTo(1, 9)
      expect(
        m.outcomes.every((x) => x.probability >= 0 && x.probability <= 1 && x.payout[1] >= x.payout[0]),
      ).toBe(true)
      expect(m.title.length).toBeGreaterThan(4)
      expect(m.instruction.length).toBeGreaterThan(4)
    }
  })
})

describe('move comparison', () => {
  const estimate = (
    ev: number,
    method: ActionEstimate['method'],
    standardError = 0,
  ): ActionEstimate => ({
    action: { type: 'roll' },
    ev,
    method,
    standardError,
    samples: 512,
    label: '',
    reason: '',
  })
  it('uses equality for exact ties and uncertainty for nearby sampled alternatives', () => {
    expect(compareMoves(estimate(1, 'exact'), estimate(1 + 1e-13, 'exact')).kind).toBe('tie')
    expect(compareMoves(estimate(1, 'sampled', 0.15), estimate(1.1, 'exact')).kind).toBe('close')
    expect(compareMoves(estimate(1, 'sampled'), estimate(1, 'sampled')).kind).toBe('close')
    expect(compareMoves(estimate(3, 'sampled', 0.02), estimate(1, 'exact'))).toMatchObject({
      kind: 'higher',
      gap: 2,
    })
    expect(compareMoves(estimate(1, 'exact'), estimate(1.001, 'exact')).text).toContain(
      'under 0.01 EP less',
    )
  })
})
