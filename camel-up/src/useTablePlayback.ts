import { useCallback, useEffect, useLayoutEffect, useState } from 'react'
import { rememberPresented, resyncOnNextPoll, type Room } from './connection'
import { finishPresentation, liveState, receivePlayback } from './playback-state'
import { ROLL_PRESENTATION_MS } from './board/roll-motion'

export function useTablePlayback(latest: Room | null, reducedMotion = false, flatBoard = false) {
  const [state, setState] = useState(() => receivePlayback(liveState(null), latest, document.hidden))
  useLayoutEffect(() => {
    setState((old) => receivePlayback(old, latest, document.hidden))
  }, [latest])
  useEffect(() => {
    if (!state.frame) return
    const revision = state.frame.revision
    const duration = reducedMotion
      ? 200
      : state.frame.action.type === 'roll' && !flatBoard
        ? ROLL_PRESENTATION_MS
        : 1000
    const timer = setTimeout(() => setState((old) => finishPresentation(old, revision)), duration)
    return () => clearTimeout(timer)
  }, [state.frame?.revision, state.latest?.code, state.latest?.seatId, reducedMotion, flatBoard])
  const jumpToLive = useCallback(() => setState((old) => liveState(old.latest)), [])
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) jumpToLive()
      else if (latest) resyncOnNextPoll(latest)
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [jumpToLive, latest?.code, latest?.seatId])
  const { room, frame, lastFrame, before } = state
  useLayoutEffect(() => {
    if (room?.view) rememberPresented(room, room.revision)
  }, [room?.code, room?.seatId, room?.revision])
  return {
    room,
    frame,
    lastFrame,
    before,
    blocked: !!frame || !!(room && latest && room.revision < latest.revision),
    pending: state.queue.length + (frame ? 1 : 0),
    jumpToLive,
  }
}
