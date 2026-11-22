import type { GameView } from './engine'
import type { TurnSummary } from './connection'

/** A fifth roll and its payout are one authoritative commit. Keep that leg's
 * physical pieces on the table until viewers have watched the stack land. */
export function visibleTable(
  after: GameView,
  before: GameView | null,
  frame: Pick<TurnSummary, 'action' | 'actor' | 'events'> | null,
): GameView {
  if (!before || !frame || frame.action.type !== 'roll') return after
  if (after.leg === before.leg && after.phase === before.phase) return after
  const event = frame.events.find((e) => e.kind === 'roll' && e.roll && e.movement)
  if (!event?.roll || !event.movement) return after
  const roll = event.roll,
    tileOwner = event.movement.tile?.owner
  return {
    ...before,
    turn: after.turn,
    stacks: after.stacks,
    rolls: [...before.rolls, roll],
    remainingDice: before.remainingDice.filter((die) => die !== roll.die),
    players: before.players.map((player, seat) => ({
      ...player,
      pyramidTickets: player.pyramidTickets + Number(seat === frame.actor),
      coins: player.coins === null ? null : player.coins + Number(seat === tileOwner),
    })),
    events: after.events.slice(0, event.id),
  }
}
