import { describe, expect, it } from 'vitest'
import { chooseBotAction } from '../src/bot.ts'
import { applyAction, COLORS, createGame, legalActions, projectGame } from '../src/engine.ts'
import type { Action, Difficulty, GameState, Seat } from '../src/engine.ts'

const tiers: Difficulty[] = ['easy', 'medium', 'hard']
function solo(botCount: number, seed = 339812): GameState {
  const bots: Seat[] = Array.from({ length: botCount }, (_, i) => ({
    name: `Bot ${i + 1}`,
    difficulty: tiers[i % tiers.length],
  }))
  return createGame([{ name: 'Human' }, ...bots], seed)
}
function runSolo(botCount: number) {
  let game = solo(botCount)
  let turns = 0
  const seen = new Set<number>()
  for (; game.phase !== 'finished' && turns < 450; turns++) {
    const seat = game.turn
    seen.add(seat)
    const view = projectGame(game, seat)
    const tier = game.players[seat].difficulty
    const action: Action = tier
      ? chooseBotAction(view, tier, Math.imul(turns + 1917, 0x9e3779b1))
      : view.phase === 'partnership'
        ? { type: 'copy', ticket: null }
        : { type: 'roll' }
    expect(legalActions(view)).toContainEqual(action)
    game = applyAction(game, seat, action)
  }
  expect(seen.size).toBe(botCount + 1)
  expect(game.phase).toBe('finished')
  expect(game.winners.length).toBeGreaterThan(0)
  expect(game.receipts).toHaveLength(game.leg * (botCount + 1))
  expect(game.players.every((player) => player.coins >= 0)).toBe(true)
}

describe('bot play', () => {
  it.each(tiers)(
    '%s uses only the public table and its own cards and is repeatable with a fixed seed',
    (difficulty) => {
      const fixture = solo(3)
      const red = applyAction(fixture, 0, { type: 'finish', pile: 'loser', color: 'red' })
      const purple = applyAction(fixture, 0, { type: 'finish', pile: 'loser', color: 'purple' })
      purple.rng = 5432467
      const a = projectGame(red, 1)
      const b = projectGame(purple, 1)
      expect(a).toEqual(b)
      const before = JSON.stringify(a)
      const chosen = chooseBotAction(a, difficulty, 2197043)
      expect(chosen).toEqual(chooseBotAction(b, difficulty, 2197043))
      expect(legalActions(a)).toContainEqual(chosen)
      expect(JSON.stringify(a)).toBe(before)
      expect(() => chooseBotAction(projectGame(red, 0), difficulty, 31)).toThrow()
    },
  )
  it.each(tiers)('%s selects a positive partner ticket or declines a loss', (difficulty) => {
    const game = solo(7)
    game.phase = 'partnership'
    game.players[0].partner = 3
    game.players[3].partner = 0
    game.players[3].tickets = [
      { color: 'red', value: 5 },
      { color: 'purple', value: 2 },
    ]
    game.players[3].pyramidTickets = 1
    game.stacks = { 4: ['white', 'black', 'purple', 'green'], 5: ['yellow', 'blue', 'red'] }
    expect(chooseBotAction(projectGame(game, 0), difficulty, 99)).toEqual({ type: 'copy', ticket: 0 })
    game.players[3].tickets.splice(0, 1)
    expect(chooseBotAction(projectGame(game, 0), difficulty, 99)).toEqual({ type: 'copy', ticket: 1 })
    game.players[3].pyramidTickets = 0
    expect(chooseBotAction(projectGame(game, 0), difficulty, 99)).toEqual({
      type: 'copy',
      ticket: null,
    })
  })
  it('hard invests in a certain leg winner even when the race leader is riding on a crazy camel', () => {
    const game = solo(2)
    game.stacks = { 2: ['blue', 'green', 'yellow', 'purple'], 12: ['white'], 15: ['black', 'red'] }
    game.remainingDice = ['grey', 'purple']
    game.rolls = COLORS.slice(0, 4).map((die) => ({ die, value: 1 }))
    game.hands[0] = []
    game.players[0].handCount = 0
    for (const seed of [3178, 9113, 53291]) {
      expect(chooseBotAction(projectGame(game, 0), 'hard', seed)).toEqual({
        type: 'ticket',
        color: 'red',
      })
    }
  })
  it.each([2, 7])('finishes a solo game with %i independently configured bots', runSolo, 15000)
})
