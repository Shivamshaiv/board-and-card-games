import { describe, expect, it } from 'vitest'
import {
  applyAction,
  COLORS,
  copyOptions,
  createGame,
  legalActions,
  projectGame,
  rankCamels,
  simulateRoll,
} from '../src/engine.ts'
import type { Action, Camel, Color, Die, GameState, Roll, Stacks } from '../src/engine.ts'

const seats = (count: number) => Array.from({ length: count }, (_, i) => ({ name: `Player ${i + 1}` }))
const newGame = (count = 3) => createGame(seats(count), 72428)
const play = (game: GameState, action: Action) => applyAction(game, game.turn, action)
const moves = (game: GameState) => legalActions(projectGame(game, game.turn))
const board = (positions: Record<number, Camel[]>): Stacks =>
  Object.assign(Object.fromEntries(Array.from({ length: 18 }, (_, i) => [i, []])), positions)
const fixedRoll = (game: GameState, die: Die) => {
  game.remainingDice = [die]
  return play(game, { type: 'roll' })
}
const preEnd = (count = 3) => {
  const game = newGame(count)
  game.stacks = board({
    1: ['purple'],
    4: ['blue'],
    5: ['green'],
    6: ['yellow'],
    14: ['black', 'white'],
    16: ['red'],
  })
  return game
}

describe('official second-edition inventory and setup', () => {
  it('sets five finish cards, four tickets per racing color, six dice, and 3 EP per seat', () => {
    const game = createGame(seats(8), 9781, 6)
    expect(game.turn).toBe(6)
    expect(game.starter).toBe(6)
    expect(game.hands.flat()).toHaveLength(40)
    expect(game.players.every((p) => p.coins === 3)).toBe(true)
    expect(new Set(game.players.map((p) => p.character)).size).toBe(8)
    expect(game.remainingDice).toEqual([...COLORS, 'grey'])
    for (const color of COLORS) {
      expect(game.tickets[color]).toEqual([5, 3, 2, 2])
      expect([1, 2, 3].some((space) => game.stacks[space].includes(color))).toBe(true)
    }
    for (const crazy of ['black', 'white'] as const)
      expect([14, 15, 16].some((space) => game.stacks[space].includes(crazy))).toBe(true)
    expect(() => createGame(seats(2), 0)).toThrow()
    expect(() => createGame(seats(9), 0)).toThrow()
    expect(() =>
      createGame([{ name: 'A', character: 1 }, { name: 'B' }, { name: 'C', character: 1 }], 0),
    ).toThrow()
  })
  it('deals the same setup and rolls from a serialized seed, preserving inputs', () => {
    const first = newGame()
    const saved = JSON.stringify(first)
    const rolled = play(first, { type: 'roll' })
    expect(rolled).toEqual(play(JSON.parse(saved), { type: 'roll' }))
    expect(JSON.stringify(first)).toBe(saved)
    expect(first.rolls).toHaveLength(0)
    expect(rolled.rolls).toHaveLength(1)
    expect(rolled.players[0].coins).toBe(3)
    expect(rolled.players[0].pyramidTickets).toBe(1)
    expect(play(JSON.parse(JSON.stringify(rolled)), { type: 'roll' })).toEqual(
      play(rolled, { type: 'roll' }),
    )
  })
  it('keeps committed card colors, other hands and random state out of opponent views', () => {
    const game = play(newGame(), { type: 'finish', pile: 'loser', color: 'red' })
    const me = projectGame(game, 0)
    const other = projectGame(game, 1)
    expect(me.hand).not.toContain('red')
    expect(me.ownFinishBets).toEqual([{ pile: 'loser', color: 'red' }])
    expect(other.hand).toEqual(COLORS)
    expect(other.ownFinishBets).toEqual([])
    expect(other.events.at(-1)?.text).not.toMatch(/red/i)
    expect(other.finishOwners.loser).toEqual([0])
    for (const field of ['bets', 'hands', 'rng', 'settlement']) expect(other).not.toHaveProperty(field)
    expect(legalActions(me)).toEqual([])
    expect(projectGame(game, -1).hand).toEqual([])
    expect(() => applyAction(game, 0, { type: 'roll' })).toThrow()
    me.players[0].coins = 50
    expect(game.players[0].coins).toBe(3)
  })
})

describe('moving and ranking camel stacks', () => {
  it('preserves order above the moving camel and lands on top, including a crazy camel', () => {
    const start = board({ 3: ['purple', 'red', 'white', 'blue'], 5: ['black', 'green', 'yellow'] })
    const moved = simulateRoll(start, [], 'red', 2)
    expect(moved.stacks[3]).toEqual(['purple'])
    expect(moved.stacks[5]).toEqual(['black', 'green', 'yellow', 'red', 'white', 'blue'])
    expect(rankCamels(moved.stacks)).toEqual(['blue', 'red', 'yellow', 'green', 'purple'])
    expect(start[3]).toHaveLength(4)
  })
  it('applies the grey-faced color, single carrier rule and directly stacked exception', () => {
    const noCarrier = board({ 8: ['black'], 11: ['red', 'white'] })
    expect(simulateRoll(noCarrier, [], 'grey', 2, 'white').to).toBe(9)
    const loneCarrier = board({ 8: ['black', 'red'], 11: ['white'] })
    expect(simulateRoll(loneCarrier, [], 'grey', 1, 'white').unit).toEqual(['black', 'red'])
    const stacked = board({ 8: ['black', 'white', 'red'] })
    expect(simulateRoll(stacked, [], 'grey', 1, 'black').unit).toEqual(['white', 'red'])
    const separated = board({ 8: ['black', 'red', 'white', 'blue'] })
    expect(simulateRoll(separated, [], 'grey', 1, 'black').unit).toEqual([
      'black',
      'red',
      'white',
      'blue',
    ])
  })
  it('booing reverses travel and places even a returning unit below the stack that carried it', () => {
    const start = board({ 4: ['blue', 'red', 'green'] })
    const result = simulateRoll(start, [{ owner: 0, side: 'boo', space: 5 }], 'red', 1)
    expect(result.stacks[4]).toEqual(['red', 'green', 'blue'])
    const reverse = board({ 6: ['black', 'red'], 14: ['white'], 5: ['green'] })
    expect(
      simulateRoll(reverse, [{ owner: 0, side: 'boo', space: 4 }], 'grey', 2, 'white').stacks[5],
    ).toEqual(['black', 'red', 'green'])
    expect(simulateRoll(reverse, [{ owner: 0, side: 'cheer', space: 4 }], 'grey', 2, 'black').to).toBe(
      3,
    )
    expect(
      simulateRoll(
        board({ 4: ['red'], 7: ['blue'] }),
        [{ owner: 0, side: 'cheer', space: 6 }],
        'red',
        2,
      ).stacks[7],
    ).toEqual(['blue', 'red'])
  })
  it('allows legal tile movement and excludes space 1, occupied spaces, the current space and neighbors of other tiles', () => {
    const game = newGame()
    game.stacks = board({ 3: [...COLORS], 14: ['black', 'white'] })
    game.tiles = [
      { owner: 0, space: 5, side: 'cheer' },
      { owner: 1, space: 10, side: 'boo' },
    ]
    const spaces = moves(game)
      .filter((a) => a.type === 'tile')
      .map((a) => a.space)
    for (const forbidden of [1, 3, 5, 9, 10, 11, 14]) expect(spaces).not.toContain(forbidden)
    expect(spaces).toContain(6)
    expect(spaces).toContain(16)
    expect(play(game, { type: 'tile', space: 6, side: 'boo' }).tiles).toHaveLength(2)
  })
})

describe('legs, partnerships, and final settlement', () => {
  it('uses five distinct dice and restores all supplies before the next clockwise player starts', () => {
    let game = newGame()
    const originalStarter = game.turn
    game.tiles = [{ owner: 0, side: 'cheer', space: 9 }]
    for (let i = 0; i < 5; i++) game = play(game, { type: 'roll' })
    const dice = game.events.flatMap((event) => (event.roll ? [event.roll.die] : []))
    expect(new Set(dice).size).toBe(5)
    expect(game.leg).toBe(2)
    expect(game.starter).toBe((originalStarter + 5) % 3)
    expect(game.remainingDice).toHaveLength(6)
    expect(game.tiles).toEqual([])
    expect(game.receipts).toHaveLength(3)
    expect(game.players.every((p) => p.pyramidTickets === 0)).toBe(true)
  })
  it('retires a spent finish card from both piles and consumes each leg ticket in order', () => {
    let game = play(newGame(), { type: 'finish', color: 'red', pile: 'winner' })
    game = play(game, { type: 'ticket', color: 'red' })
    game = play(game, { type: 'ticket', color: 'red' })
    expect(moves(game).filter((a) => a.type === 'finish' && a.color === 'red')).toEqual([])
    game = play(game, { type: 'ticket', color: 'red' })
    game = play(game, { type: 'ticket', color: 'red' })
    expect(game.tickets.red).toEqual([])
    expect(() => play(game, { type: 'ticket', color: 'red' })).toThrow()
    expect(game.players[1].tickets.map((t) => t.value)).toEqual([5, 2])
  })
  it('makes partnerships available only at six seats and copies independently, including a pyramid or decline', () => {
    expect(moves(newGame(5)).some((a) => a.type === 'partner')).toBe(false)
    let game = play(preEnd(6), { type: 'partner', partner: 1 })
    expect(game.players[1].partner).toBe(0)
    expect(moves(game).some((a) => a.type === 'partner')).toBe(false)
    game = play(game, { type: 'ticket', color: 'purple' })
    game.players[0].pyramidTickets = 1
    game = fixedRoll(game, 'red')
    expect(game.phase).toBe('partnership')
    expect(game.turn).toBe(0)
    expect(copyOptions(game)[0].value).toBe(-1)
    game = play(game, { type: 'copy', ticket: null })
    expect(copyOptions(game)[0]).toMatchObject({ value: 1, label: 'pyramid ticket' })
    game = play(game, { type: 'copy', ticket: 0 })
    expect(game.phase).toBe('finished')
    expect(game.players.slice(0, 3).map((p) => p.coins)).toEqual([4, 3, 4])
    expect(game.winners).toEqual([0, 2])
  })
  it('scores leg tickets as one net sum, then resolves winner and loser cards in placement order', () => {
    let game = preEnd(8)
    game.players[0].coins = 0
    game.players[0].tickets = [
      { color: 'blue', value: 5 },
      { color: 'red', value: 2 },
      { color: 'yellow', value: 3 },
    ]
    game.bets.winner = [
      { seat: 3, color: 'green' },
      ...Array.from({ length: 6 }, (_, seat) => ({ seat, color: 'red' as Color })),
    ]
    game.bets.loser = [
      { seat: 5, color: 'purple' },
      { seat: 1, color: 'green' },
      { seat: 3, color: 'purple' },
    ]
    game = fixedRoll(game, 'red')
    expect(game.receipts[0].lines.map((l) => l.value)).toEqual([-1, 2, 1, 1])
    expect(game.receipts[0].balance).toBe(3)
    expect(game.finishResults.map((b) => b.value)).toEqual([-1, 8, 5, 3, 2, 1, 1, 8, -1, 5])
    expect(game.receipts).toHaveLength(8)
    expect(moves(game)).toEqual([])
  })
  it('never goes into debt and an incorrect early bet cannot reduce a later correct payout', () => {
    let game = preEnd()
    game.players[1].coins = 0
    game.players[1].tickets = [{ color: 'blue', value: 3 }]
    game.bets.winner = [
      { seat: 1, color: 'green' },
      { seat: 1, color: 'red' },
    ]
    game = fixedRoll(game, 'red')
    expect(game.receipts[1].balance).toBe(0)
    expect(game.finishResults.map((r) => r.change)).toEqual([0, 8])
    expect(game.events.find((e) => e.kind === 'reveal')?.text).toContain('0 EP, no coins to pay')
    expect(game.players[1].coins).toBe(8)
  })
  it('immediately ends on a backward crossing and ranks carried racers at the rear', () => {
    let game = newGame()
    game.stacks = board({
      1: ['black', 'yellow', 'purple'],
      6: ['red', 'blue', 'green'],
      14: ['white'],
    })
    game.rolls = Array.from({ length: 4 }, () => ({ die: 'blue', value: 1 }) as Roll)
    game = fixedRoll(game, 'grey')
    expect(game.phase).toBe('finished')
    expect(rankCamels(game.stacks)).toEqual(['green', 'blue', 'red', 'purple', 'yellow'])
    expect(game.receipts).toHaveLength(3)
    expect(game.leg).toBe(1)
  })
  it('a tile pays immediately every time and stays on its space', () => {
    let game = newGame()
    const start = board({
      3: ['red'],
      9: ['green', 'blue', 'purple', 'yellow'],
      14: ['black', 'white'],
    })
    game.stacks = start
    game.remainingDice = ['red']
    const value = play(game, { type: 'roll' }).rolls[0].value
    game.tiles = [{ owner: 1, space: 3 + value, side: 'boo' }]
    game = play(game, { type: 'roll' })
    expect(game.players[1].coins).toBe(4)
    expect(game.tiles).toHaveLength(1)
    game.stacks = start
    game.rng = newGame().rng
    game = fixedRoll(game, 'red')
    expect(game.players[1].coins).toBe(5)
  })
})
