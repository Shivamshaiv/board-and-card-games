import { expect, it } from 'vitest'
import { currentLegDice, dieInk, rollSocket } from '../src/board/layout'

it('keeps all revealed faces in different central sockets, with grey pips independent of the camel moved', () => {
  const rolled = [
    { die: 'red', value: 2 },
    { die: 'grey', value: 3, greyColor: 'white' },
    { die: 'yellow', value: 1 },
  ]
  const last = { id: 7, color: 'yellow', value: 1 }
  expect(currentLegDice(rolled, last)).toEqual(rolled)
  expect(rolled.map(dieInk)).toEqual(['white', 'white', 'black'])
  expect(dieInk({ die: 'grey', value: 2, greyColor: 'black' })).toBe('black')
  const sockets = Array.from({ length: 5 }, (_, i) => rollSocket(i))
  expect(new Set(sockets.map((s) => s.x)).size).toBe(5)
  expect(sockets.every((s) => Math.abs(s.x) < 3 && Math.abs(s.z) < 1)).toBe(true)
})
it('clears an explicitly empty new leg while preserving the legacy last-face-only input', () => {
  const history = { id: 14, color: 'grey', value: 3, camel: 'black' }
  expect(currentLegDice([], history)).toEqual([])
  expect(currentLegDice(undefined, history)).toEqual([{ die: 'grey', value: 3, greyColor: 'black' }])
})
