import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { applyAction, createGame, projectGame } from '../src/engine.ts'
import type { GameState } from '../src/engine.ts'
import { PlayerTray } from '../src/PlayerTray.tsx'

const piles = (game: GameState) =>
  renderToStaticMarkup(createElement(PlayerTray, { game: projectGame(game, 2) })).split(
    'tray-section tray-table',
  )[1]

it('shows only character backs during play, then turns the finish piles over in chronological scoring order', () => {
  let game = createGame([{ name: 'Mara' }, { name: 'Ari' }, { name: 'Zee' }], 7158)
  game = applyAction(game, 0, { type: 'finish', pile: 'winner', color: 'red' })
  game = applyAction(game, 1, { type: 'finish', pile: 'winner', color: 'green' })
  game = applyAction(game, 2, { type: 'finish', pile: 'loser', color: 'purple' })
  const before = piles(game)
  expect(before).toContain('2 face down')
  expect(before).not.toMatch(/card-(?:red|green|purple)\.webp/)
  game.stacks = { 2: ['purple'], 7: ['blue', 'yellow', 'green'], 12: ['white', 'black'], 16: ['red'] }
  game.remainingDice = ['red']
  game = applyAction(game, 0, { type: 'roll' })
  const after = piles(game)
  expect(after).toContain('2 revealed')
  expect(after).toContain('/art/card-red.webp')
  expect(after).toContain('/art/card-green.webp')
  expect(after).toContain('/art/card-purple.webp')
  expect(after).not.toContain('face down')
  expect(after.indexOf('Red · +8 EP')).toBeLessThan(after.indexOf('Green · -1 EP'))
  expect(after).toContain('Purple · +8 EP')
})
