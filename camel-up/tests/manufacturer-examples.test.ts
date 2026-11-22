import { describe, expect, it } from 'vitest'
import { applyAction, createGame, rankCamels, simulateRoll, type Camel } from '../src/engine'
import { rulePage, RULES } from '../src/rules-content'

function picturedTable(positions: Record<number, Camel[]>) {
  const game = createGame(
    Array.from({ length: 6 }, (_, i) => ({ name: 'Seat ' + (i + 1) })),
    42,
  )
  for (const pile of Object.values(game.stacks)) pile.length = 0
  Object.assign(game.stacks, positions)
  game.rng = 1
  return game
}

describe('the illustrated starting position and movements, pages 2 and 4', () => {
  it('can deal the pictured 1/1/1/3/3 opening and the two reverse-facing starters', () => {
    const { stacks } = createGame([{ name: 'A' }, { name: 'B' }, { name: 'C' }], 1938)
    expect([...stacks[1]].sort()).toEqual(['green', 'red', 'yellow'])
    expect([...stacks[3]].sort()).toEqual(['blue', 'purple'])
    expect(stacks[15]).toEqual(['black'])
    expect(stacks[16]).toEqual(['white'])
  })

  it('replays the purple two and both spectator illustrations, with bottom-first piles', () => {
    const { stacks } = picturedTable({
      9: ['purple', 'green'],
      10: ['blue'],
      11: ['yellow'],
      13: ['red'],
      15: ['black', 'white'],
    })
    expect(simulateRoll(stacks, [], 'purple', 2).stacks[11]).toEqual(['yellow', 'purple', 'green'])
    stacks[11] = []
    stacks[12] = ['red', 'yellow']
    stacks[13] = []
    expect(
      simulateRoll(stacks, [{ owner: 0, space: 11, side: 'cheer' }], 'purple', 2).stacks[12],
    ).toEqual(['red', 'yellow', 'purple', 'green'])
    expect(
      simulateRoll(stacks, [{ owner: 0, space: 11, side: 'boo' }], 'purple', 2).stacks[10],
    ).toEqual(['purple', 'green', 'blue'])
  })

  it('puts the booed black camel underneath the stack one step back along its reverse route', () => {
    const { stacks } = picturedTable({
      9: ['blue', 'black'],
      8: ['purple', 'green'],
      13: ['red', 'yellow'],
      15: ['white'],
    })
    const moved = simulateRoll(stacks, [{ owner: 0, space: 7, side: 'boo' }], 'grey', 2, 'black')
    expect(moved.stacks[8]).toEqual(['black', 'purple', 'green'])
    expect(moved.stacks[9]).toEqual(['blue'])
  })
})

describe('the printed second-edition scoring examples, page 5', () => {
  it('pays Martina 9 EP for her six tickets when green leads yellow', () => {
    const game = picturedTable({
      1: ['red'],
      5: ['purple', 'blue'],
      9: ['yellow', 'green'],
      15: ['white', 'black'],
    })
    game.players[0].tickets = [
      { color: 'green', value: 5 },
      { color: 'green', value: 2 },
      { color: 'yellow', value: 3 },
      { color: 'blue', value: 5 },
    ]
    game.players[0].pyramidTickets = 2
    game.players[1].pyramidTickets = 2
    game.turn = 2
    game.rolls = [
      { die: 'green', value: 1 },
      { die: 'yellow', value: 2 },
      { die: 'blue', value: 1 },
      { die: 'purple', value: 2 },
    ]
    game.remainingDice = ['red', 'grey']
    const next = applyAction(game, game.turn, { type: 'roll' })
    expect(rankCamels(next.stacks).slice(0, 2)).toEqual(['green', 'yellow'])
    expect(next.receipts[0].lines.map((line) => line.value)).toEqual([5, 2, 1, -1, 1, 1])
    expect(next.receipts[0].change).toBe(9)
    expect(next.players[0].coins).toBe(12)
    expect(next.leg).toBe(2)
  })

  it('settles the two illustrated decks in separate oldest-first payout orders', () => {
    let game = picturedTable({
      2: ['purple'],
      5: ['red', 'blue'],
      9: ['yellow'],
      14: ['black', 'white'],
      16: ['green'],
    })
    // Six real five-card hands. Only the card owners vary from the illustration.
    for (const color of ['blue', 'yellow', 'green', 'green'] as const)
      game = applyAction(game, game.turn, { type: 'finish', color, pile: 'winner' })
    for (const color of ['purple', 'yellow', 'blue', 'purple', 'purple'] as const) {
      if (!game.hands[game.turn].includes(color))
        game = applyAction(game, game.turn, { type: 'ticket', color: 'red' })
      game = applyAction(game, game.turn, { type: 'finish', color, pile: 'loser' })
    }
    const final = applyAction(game, game.turn, { type: 'roll' })
    expect(final.phase).toBe('finished')
    expect(final.finishResults.map((b) => b.pile)).toEqual([
      ...Array(4).fill('winner'),
      ...Array(5).fill('loser'),
    ])
    expect(final.finishResults.map((b) => b.value)).toEqual([-1, -1, 8, 5, 8, -1, -1, 5, 3])
    expect(final.receipts).toHaveLength(6)
  })
})

it('links every reference to the printed page and video chapter', () => {
  expect(rulePage(1)).toMatch(/#page=6$/)
  expect(rulePage(4)).toMatch(/#page=3$/)
  for (const rule of RULES) {
    expect(rule.pages.length).toBeGreaterThan(0)
    for (const p of rule.pages) expect(rulePage(p)).toMatch(/\.pdf#page=[1-6]$/)
    expect(rule.seconds).toBeGreaterThan(0)
  }
})
