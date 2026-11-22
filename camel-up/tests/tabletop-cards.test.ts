import { expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createGame, projectGame, applyAction } from '../src/engine'
import { BACK, FACE, publicCardLayout, publicTransfer, TICKET } from '../src/tabletop-cards/model'
import { TabletopCards } from '../src/tabletop-cards/TabletopCards'

const start = () =>
  createGame(
    [
      { name: 'April', character: 7 },
      { name: 'Ravi', character: 1 },
      { name: 'Nora', character: 4 },
    ],
    795,
  )
it('constructs real inventories and animates the exact ticket and payout just taken', () => {
  const state = applyAction(start(), 0, { type: 'ticket', color: 'blue' }),
    mine = projectGame(state, 0),
    other = projectGame(state, 1)
  const stock = publicCardLayout(mine).find((c) => c.slot === 'market-blue')
  expect(stock).toMatchObject({ front: TICKET('blue', 3), count: 3 })
  expect(publicTransfer(mine, 2)).toMatchObject({
    from: 'market-blue',
    to: 'my-bench',
    front: TICKET('blue', 5),
  })
  expect(publicTransfer(other, 2)).toMatchObject({ to: 'other-bench', front: TICKET('blue', 5) })
})
it('gives a remote buyer and the public pile identical backs regardless of the secretly committed color', () => {
  const variants = (['red', 'purple'] as const).map((color) =>
    applyAction(start(), 0, { type: 'finish', color, pile: 'loser' }),
  )
  const rivals = variants.map((s) => projectGame(s, 1))
  expect(publicCardLayout(rivals[0])).toEqual(publicCardLayout(rivals[1]))
  expect(publicTransfer(rivals[0], 2)).toEqual(publicTransfer(rivals[1], 2))
  expect(publicTransfer(rivals[0], 2)).toMatchObject({
    from: 'other-bench',
    to: 'pile-loser',
    faceDown: true,
    front: BACK(7),
    back: BACK(7),
  })
  const mine = projectGame(variants[0], 0)
  expect(publicTransfer(mine, 2)).toMatchObject({
    from: 'hand-red',
    front: FACE('red'),
    back: BACK(7),
    faceDown: false,
  })
  expect(publicCardLayout(mine).find((c) => c.slot === 'hand-red')?.count).toBe(0)
})
it('replays two own finish bets in the same pile with the historical card for each move', () => {
  let g = applyAction(start(), 0, { type: 'finish', pile: 'winner', color: 'yellow' })
  g = applyAction(g, 1, { type: 'roll' })
  g = applyAction(g, 2, { type: 'roll' })
  g = applyAction(g, 0, { type: 'finish', pile: 'winner', color: 'green' })
  const v = projectGame(g, 0)
  expect(publicTransfer(v, 2)?.front).toBe(FACE('yellow'))
  expect(publicTransfer(v, 5)?.front).toBe(FACE('green'))
  expect(publicTransfer(v, 3)).toMatchObject({ from: 'pyramid-bank', to: 'other-bench' })
})
it('renders all five accessible ticket actions and five private card choices before WebGL loads', () => {
  const view = projectGame(start(), 0)
  const html = renderToStaticMarkup(
    createElement(TabletopCards, { game: view, canAct: true, onAction: () => {} }),
  )
  expect(html.match(/Take \w+ leg ticket, pays 5 coins for first, 4 left/g)).toHaveLength(5)
  expect(html.match(/Select \w+ finish card/g)).toHaveLength(5)
  expect(html).toContain('Your tickets, 0 held')
  expect(html).toContain('id="private-finish-hand"')
})
