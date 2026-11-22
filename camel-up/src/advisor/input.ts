import { COLORS, type GameView } from '../engine'

/** Copy only the race data the advisor needs. A spectator never supplies a private hand. */
export function advisorInput(game: GameView): GameView {
  const personal = game.seat === game.turn && game.seat >= 0 && game.phase !== 'finished'
  const players = game.players.map((p, seat) => ({
    name: p.name,
    character: p.character,
    coins: personal && seat === game.seat ? p.coins : null,
    tickets: p.tickets.map(({ color, value }) => ({ color, value })),
    pyramidTickets: p.pyramidTickets,
    partner: p.partner,
    handCount: p.handCount,
  }))
  return {
    phase: game.phase,
    turn: game.turn,
    leg: game.leg,
    starter: game.starter,
    stacks: Object.fromEntries(
      Object.entries(game.stacks).map(([space, stack]) => [space, [...stack]]),
    ),
    tickets: Object.fromEntries(COLORS.map((c) => [c, [...game.tickets[c]]])) as GameView['tickets'],
    tiles: game.tiles.map(({ owner, space, side }) => ({ owner, space, side })),
    remainingDice: [...game.remainingDice],
    rolls: game.rolls.map(({ die, value, greyColor }) => ({
      die,
      value,
      ...(greyColor && { greyColor }),
    })),
    players,
    seat: personal ? game.seat : -1,
    hand: personal ? [...game.hand] : [],
    ownFinishBets: personal ? game.ownFinishBets.map(({ pile, color }) => ({ pile, color })) : [],
    finishCounts: { winner: game.finishCounts.winner, loser: game.finishCounts.loser },
    finishOwners: { winner: [...game.finishOwners.winner], loser: [...game.finishOwners.loser] },
    winners: [...game.winners],
    events: [],
    receipts: [],
    finishResults: [],
  }
}
