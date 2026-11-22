import { seatReceipts, type GameView } from './engine.ts'
import type { PositionWire, Room, TurnFrame } from './connection'

export interface PlaybackState {
  latest: Room | null
  room: Room | null
  frame: TurnFrame | null
  lastFrame: TurnFrame | null
  before: GameView | null
  queue: TurnFrame[]
}

export function liveState(room: Room | null): PlaybackState {
  const lastFrame =
    room?.view && room.playback?.last ? { ...room.playback.last, view: room.view } : null
  return { latest: room, room, frame: null, lastFrame, before: null, queue: [] }
}

function expand(state: PositionWire, latest: GameView): GameView {
  return {
    ...state.board,
    events: latest.events.slice(0, state.eventEnd),
    receipts: seatReceipts(
      latest.receipts.slice(0, state.receiptEnd),
      state.board.seat,
      state.board.phase,
    ),
    finishResults: latest.finishResults.slice(0, state.resultEnd),
  }
}
function atPosition(latest: Room, revision: number, view: GameView): Room {
  return {
    ...latest,
    revision,
    view,
    status: view.phase === 'finished' ? 'finished' : 'playing',
    playback: undefined,
  }
}
function begin(state: PlaybackState): PlaybackState {
  const [frame, ...queue] = state.queue
  if (!frame || !state.latest) return liveState(state.latest)
  return {
    ...state,
    room: atPosition(state.latest, frame.revision, frame.view),
    before: state.room?.view ?? null,
    frame,
    lastFrame: frame,
    queue,
  }
}
export function finishPresentation(state: PlaybackState, revision: number): PlaybackState {
  if (state.frame?.revision !== revision) return state
  return begin(state)
}

/** Merge GET or POST delivery by room revision, independently for each browser tab. */
export function receivePlayback(
  current: PlaybackState,
  latest: Room | null,
  hidden = false,
): PlaybackState {
  if (!latest || !latest.view || hidden || latest.playback?.reset) return liveState(latest)
  const same = current.latest?.code === latest.code && current.latest?.seatId === latest.seatId
  if (same && latest.revision < current.latest!.revision) return current
  const payload = latest.playback
  if (!payload) return liveState(latest)
  let state = current
  if (!same || !state.room?.view) {
    if (!payload.base || !payload.frames.length) return liveState(latest)
    const anchor = atPosition(
      latest,
      payload.base.revision,
      expand(payload.base.state, latest.view),
    )
    state = { ...liveState(anchor), latest }
  }
  const cursor = state.queue.at(-1)?.revision ?? state.room!.revision
  const fresh = payload.frames.filter((f) => f.revision > cursor)
  if (
    latest.revision > cursor &&
    (fresh[0]?.revision !== cursor + 1 || fresh.at(-1)?.revision !== latest.revision)
  )
    return liveState(latest)
  let expected = cursor + 1
  const frames: TurnFrame[] = []
  for (const { state: position, ...summary } of fresh) {
    if (summary.revision !== expected++) return liveState(latest)
    frames.push({ ...summary, view: expand(position, latest.view) })
  }
  // The UI offers an immediate return to live for a backlog. Long interruptions instead
  // restore the current table in one step and keep the complete public race log accessible.
  if (state.queue.length + frames.length > 24) return liveState(latest)
  if (!frames.length && !state.frame) return liveState(latest)
  const updated: PlaybackState = {
    ...state,
    latest,
    room: state.room ? { ...state.room, seats: latest.seats } : null,
    queue: frames.length ? [...state.queue, ...frames] : state.queue,
  }
  return updated.frame ? updated : begin(updated)
}
