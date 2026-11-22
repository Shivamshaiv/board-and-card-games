import { expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { applyAction, createGame, projectGame, visibleCoinStacks } from '../src/engine'
import { Scoring } from '../src/Scoring'

it('explains waived losses in the leg receipt and the revealed finish card', () => {
  const view = projectGame(
    createGame(
      ['Sam', 'Maya', 'Leo'].map((name) => ({ name })),
      5,
    ),
    0,
  )
  view.phase = 'finished'
  view.winners = [1, 2]
  view.receipts = [
    {
      leg: 1,
      seat: 0,
      lines: [
        { label: 'Red ticket', value: -1 },
        { label: 'Blue ticket', value: -1 },
        { label: 'Purple ticket', value: -1 },
      ],
      change: -1,
      balance: 0,
    },
  ]
  view.finishResults = [
    { seat: 0, pile: 'winner', color: 'blue', value: -1, change: 0, balance: 0 },
  ]
  const ui = renderToStaticMarkup(
    createElement(Scoring, { game: view, reveal: 1, setReveal: () => {} }),
  )
  expect(ui).toContain('The purse covered 1 of the 3 EP loss.')
  expect(ui).toContain('The bank waived the remaining 2 EP.')
  expect(ui).toContain('No coins to pay')
})

it('keeps paid amounts and stack appearances public while reporting exact balances only to their owners', () => {
  let game = createGame(
    ['Sam', 'Maya', 'Leo'].map((name) => ({ name })),
    13,
  )
  game.players[0].coins = 15
  game.players[1].coins = 20
  expect(visibleCoinStacks(15)).toEqual(visibleCoinStacks(20))
  game.players[1].pyramidTickets = 1
  game.rolls = [
    { die: 'yellow', value: 2 },
    { die: 'red', value: 1 },
    { die: 'grey', greyColor: 'black', value: 2 },
    { die: 'purple', value: 3 },
  ]
  game.remainingDice = ['blue', 'green']
  game = applyAction(game, 0, { type: 'roll' })
  expect(game.phase).toBe('playing')
  expect(game.leg).toBe(2)
  for (const viewer of [-1, 0, 1, 2]) {
    const view = projectGame(game, viewer)
    for (const [seat, p] of view.players.entries()) {
      expect(p.coins).toBe(seat === viewer ? game.players[seat].coins : null)
      if (seat !== viewer) expect(p.coinStacks).toEqual(visibleCoinStacks(game.players[seat].coins))
      const receipt = view.receipts.find((r) => r.seat === seat)!
      expect(receipt.balance).toBe(seat === viewer ? game.players[seat].coins : null)
      expect(receipt.lines).toEqual(game.receipts[seat].lines)
      expect(receipt.change).toBe(game.receipts[seat].change)
    }
    const ui = renderToStaticMarkup(
      createElement(Scoring, { game: view, reveal: 0, setReveal: () => {} }),
    )
    expect((ui.match(/Balance after this leg/g) || []).length).toBe(viewer < 0 ? 0 : 1)
  }
})

it('returns all final-leg components after capturing receipts and also presents unmodified older completed v1 saves correctly', () => {
  let game = createGame(
    Array.from({ length: 6 }, (_, i) => ({ name: 'Player ' + i })),
    27,
  )
  for (const stack of Object.values(game.stacks)) stack.length = 0
  game.stacks[16] = ['green']
  game.stacks[12] = ['yellow', 'red']
  game.stacks[5] = ['blue']
  game.stacks[3] = ['purple']
  game.stacks[14] = ['black', 'white']
  game.remainingDice = ['green']
  game.players[0].tickets = [{ color: 'green', value: 5 }]
  game.players[1].pyramidTickets = 1
  game.players[0].partner = 1
  game.players[1].partner = 0
  game.tiles = [{ owner: 2, space: 10, side: 'cheer' }]
  game = applyAction(game, 0, { type: 'roll' })
  while (game.phase === 'partnership')
    game = applyAction(game, game.turn, { type: 'copy', ticket: null })
  expect(game.phase).toBe('finished')
  expect(game.leg).toBe(1)
  expect(game.receipts[0].lines.map((l) => l.value)).toEqual([5, 1])
  expect(game.receipts[0].change).toBe(6)
  expect(game.receipts[1].change).toBe(1)
  expect(game.tiles).toEqual([])
  expect(game.rolls).toEqual([])
  expect(game.remainingDice).toHaveLength(6)
  expect(Object.values(game.tickets).every((stack) => stack.join(',') === '5,3,2,2')).toBe(true)
  expect(
    game.players.every((p) => p.partner === null && !p.tickets.length && !p.pyramidTickets),
  ).toBe(true)
  const current = projectGame(game, 2)
  expect(current.players.map((p) => p.coins)).toEqual(game.players.map((p) => p.coins))
  const legacy = structuredClone(game)
  legacy.players[0].partner = 1
  legacy.players[0].tickets = [{ color: 'green', value: 5 }]
  legacy.players[0].pyramidTickets = 1
  legacy.tickets.green.shift()
  legacy.rolls = [{ die: 'green', value: 1 }]
  legacy.remainingDice = ['grey']
  legacy.tiles = [{ owner: 2, space: 10, side: 'cheer' }]
  expect(projectGame(legacy, 2)).toEqual(current)
  expect(legacy.players[0].tickets).toHaveLength(1)
})
