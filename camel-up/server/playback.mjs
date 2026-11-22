import { COLORS, copyOptions, visibleLegPieces } from '../src/engine.ts'

export const HISTORY_LIMIT = 24

// Historical positions never contain a rules seed, hidden bets, hands or duplicate event logs.
// The current engine transcript supplies the append-only portions of a historical view.
function position(game) {
  const {
    phase,
    turn,
    leg,
    starter,
    stacks,
    tiles,
    tickets,
    remainingDice,
    rolls,
    players,
    winners,
  } = game
  return {
    board: {
      phase,
      turn,
      leg,
      starter,
      stacks,
      tiles,
      tickets,
      remainingDice,
      rolls,
      players,
      winners,
      finishCounts: { winner: game.bets.winner.length, loser: game.bets.loser.length },
    },
    eventEnd: game.events.length,
    receiptEnd: game.receipts.length,
    resultEnd: game.finishResults.length,
  }
}

function publicAction(game, action) {
  switch (action.type) {
    case 'roll':
      return { type: 'roll' }
    case 'ticket':
      return { type: 'ticket', color: action.color, value: game.tickets[action.color][0] }
    case 'tile':
      return { type: 'tile', space: action.space, side: action.side }
    case 'finish':
      return { type: 'finish', pile: action.pile }
    case 'partner':
      return { type: 'partner', partner: action.partner }
    case 'copy': {
      const choice = copyOptions(game, game.turn).find((c) => c.ticket === action.ticket)
      return {
        type: 'copy',
        ticket: action.ticket,
        ...(choice && { label: choice.label, value: choice.value }),
      }
    }
  }
}

export function recordTurn(previous, next, actor, action) {
  const prior = previous.timeline
  const timeline = prior
    ? { ...prior, frames: [...prior.frames] }
    : { baseRevision: previous.revision, base: position(previous.game), frames: [] }
  timeline.frames.push({
    revision: previous.revision + 1,
    at: Date.now(),
    actor,
    leg: previous.game.leg,
    action: publicAction(previous.game, action),
    eventStart: previous.game.events.length,
    state: position(next.game),
  })
  if (timeline.frames.length > HISTORY_LIMIT) {
    const oldest = timeline.frames.shift()
    timeline.baseRevision = oldest.revision
    timeline.base = oldest.state
  }
  next.timeline = timeline
}

function privatePosition(game, state, seat) {
  const { board, eventEnd, receiptEnd, resultEnd } = state
  const winner = game.bets.winner.slice(0, board.finishCounts.winner),
    loser = game.bets.loser.slice(0, board.finishCounts.loser)
  const ownFinishBets = [
    ...winner.filter((b) => b.seat === seat).map((b) => ({ pile: 'winner', color: b.color })),
    ...loser.filter((b) => b.seat === seat).map((b) => ({ pile: 'loser', color: b.color })),
  ]
  return {
    board: {
      ...board,
      ...visibleLegPieces(board, seat),
      seat,
      ownFinishBets,
      hand: COLORS.filter((c) => !ownFinishBets.some((b) => c === b.color)),
      finishOwners: { winner: winner.map((b) => b.seat), loser: loser.map((b) => b.seat) },
    },
    eventEnd,
    receiptEnd,
    resultEnd,
  }
}

function summarize(game, frame, seat) {
  let action = frame.action
  const events = game.events.slice(frame.eventStart, frame.state.eventEnd)
  const name = game.players[frame.actor].name
  let text = events.find((e) => e.kind === action.type && e.seat === frame.actor)?.text
  if (action.type === 'finish' && frame.actor === seat) {
    const chosen = game.bets[action.pile][frame.state.board.finishCounts[action.pile] - 1]
    action = { ...action, color: chosen.color }
  }
  if (action.type === 'copy') {
    if (frame.actor !== seat && frame.state.board.phase === 'partnership') {
      action = { type: 'copy' }
      text = name + ' recorded a partnership choice.'
    } else
      text =
        action.ticket === null
          ? name + ' declined to copy a ticket.'
          : name + ' copied ' + action.label + '.'
  }
  return {
    revision: frame.revision,
    at: frame.at,
    actor: frame.actor,
    leg: frame.leg,
    action,
    text: text ?? name + ' completed a turn.',
    events,
  }
}

export function playbackFor(room, seat, after) {
  const t = room.timeline
  if (!t?.frames.length)
    return { reset: after !== null && after !== room.revision, base: null, frames: [], last: null }
  const last = summarize(room.game, t.frames.at(-1), seat)
  if (after === null || after === room.revision)
    return { reset: false, base: null, frames: [], last }
  if (!Number.isSafeInteger(after) || after < t.baseRevision || after > room.revision)
    return { reset: true, base: null, frames: [], last }
  const start =
    after === t.baseRevision ? t.base : t.frames.find((f) => f.revision === after)?.state
  if (!start) return { reset: true, base: null, frames: [], last }
  const frames = t.frames
    .filter((f) => f.revision > after)
    .map((f) => ({
      ...summarize(room.game, f, seat),
      state: privatePosition(room.game, f.state, seat),
    }))
  return {
    reset: false,
    base: { revision: after, state: privatePosition(room.game, start, seat) },
    frames,
    last,
  }
}
