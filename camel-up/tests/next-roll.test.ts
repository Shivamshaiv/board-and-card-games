import { describe, expect, it } from 'vitest'
import { createGame, projectGame } from '../src/engine'
import { enumerateNextRoll } from '../src/advisor/next-roll'

describe('exact next-roll preview', () => {
  it('weights each colored die and grey die equally and preserves the projected table', () => {
    const view = projectGame(createGame([{ name: 'A' }, { name: 'B' }, { name: 'C' }], 1), 0)
    const original = structuredClone(view)
    const result = enumerateNextRoll(view)
    expect(result.total).toBe(36)
    expect(result.branches).toHaveLength(21)
    for (const die of view.remainingDice) {
      expect(result.branches.filter((b) => b.die === die).reduce((s, b) => s + b.weight, 0)).toBe(6)
    }
    expect(view).toEqual(original)
  })
  it('shows the actual grey carrier even when the die points to the other camel', () => {
    const g = projectGame(createGame([{ name: 'A' }, { name: 'B' }, { name: 'C' }], 6), 0)
    g.stacks = {
      1: ['red'],
      3: ['green'],
      4: ['blue'],
      6: ['purple'],
      10: ['black', 'yellow'],
      14: ['white'],
    }
    g.remainingDice = ['grey', 'blue']
    const branch = enumerateNextRoll(g).branches.find(
      (b) => b.die === 'grey' && b.value === 3 && b.ink === 'white',
    )!
    expect(branch.movement.unit).toEqual(['black', 'yellow'])
    expect(branch.movement.to).toBe(7)
    expect(branch.weight).toBe(1)
  })
})
