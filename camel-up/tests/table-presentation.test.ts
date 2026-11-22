import { describe, it, expect } from 'vitest'
import { applyAction, createGame, projectGame } from '../src/engine'
import { visibleTable } from '../src/table-presentation'

describe('what is visible as a roll finishes', () => {
  it('keeps the fifth drawn die and held tickets on the board until the next leg is presented', () => {
    let state = createGame([{ name: 'Maya' }, { name: 'Alex' }, { name: 'Rafi' }], 31)
    state = applyAction(state, state.turn, { type: 'ticket', color: 'red' })
    for (let i = 0; i < 4; i++) state = applyAction(state, state.turn, { type: 'roll' })
    const actor = state.turn,
      before = projectGame(state, 0)
    const after = projectGame(applyAction(state, actor, { type: 'roll' }), 0)
    const frame = {
      actor,
      action: { type: 'roll' as const },
      events: after.events.slice(before.events.length),
    }
    expect(after.leg).toBe(before.leg + 1)
    const shot = visibleTable(after, before, frame)
    expect(shot.leg).toBe(before.leg)
    expect(shot.rolls).toHaveLength(5)
    expect(shot.remainingDice).toHaveLength(1)
    expect(shot.stacks).toEqual(after.stacks)
    expect(shot.players[0].tickets).toEqual(before.players[0].tickets)
    expect(shot.players[actor].pyramidTickets).toBe(before.players[actor].pyramidTickets + 1)
    expect(shot.receipts).toEqual(before.receipts)
    expect(shot.events.at(-1)?.kind).toBe('roll')
    expect(visibleTable(after, before, null)).toBe(after)
  })
})
