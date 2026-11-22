import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { GameView } from '../engine'
import type { AdvisorResult } from './analysis'
import { advisorInput } from './input'
import { startAnalysis } from './worker-client'

type Computation =
  | { status: 'working' }
  | { status: 'ready'; result: AdvisorResult }
  | { status: 'failed'; message: string; retryable: boolean }
type ViewState = Computation | { status: 'paused' | 'hidden' | 'finished' }

function onVisibility(callback: () => void) {
  document.addEventListener('visibilitychange', callback)
  return () => document.removeEventListener('visibilitychange', callback)
}
const isVisible = () => !document.hidden
// A closed drawer can reopen on the same immutable seat projection. Let the
// table's own lifetime govern the cache, without persisting anyone's private hand.
const completed = new WeakMap<GameView, { key: string; result: AdvisorResult }>()

export function useAdvisor(
  game: GameView,
  roomCode: string,
  revision: number,
  waiting: boolean,
): { state: ViewState; retry: () => void } {
  const visible = useSyncExternalStore(onVisibility, isVisible, () => false)
  const [attempt, retry] = useState(0)
  const key = [roomCode, revision, game.seat, game.turn, game.phase].join('/')
  const [answer, setAnswer] = useState<{ key: string; state: Computation } | null>(null)
  const latest = useRef(game)
  latest.current = game
  const cache = useRef(completed.get(game))
  const enabled = visible && !waiting && game.phase !== 'finished'
  useEffect(() => {
    if (!enabled || cache.current?.key === key) return
    setAnswer({ key, state: { status: 'working' } })
    const source = latest.current
    const stop = startAnalysis(
      { key, view: advisorInput(source) },
      (result) => {
        cache.current = { key, result }
        completed.set(source, cache.current)
        setAnswer({ key, state: { status: 'ready', result } })
      },
      (failure) => setAnswer({ key, state: { status: 'failed', ...failure } }),
    )
    const cancelIfHidden = () => {
      if (document.hidden) stop()
    }
    document.addEventListener('visibilitychange', cancelIfHidden)
    return () => {
      document.removeEventListener('visibilitychange', cancelIfHidden)
      stop()
    }
  }, [key, enabled, attempt])
  // Filter synchronously during render. A late callback from another seat or revision
  // cannot flash an obsolete recommendation while React runs the effect cleanup.
  const state: ViewState = waiting
    ? { status: 'paused' }
    : game.phase === 'finished'
      ? { status: 'finished' }
      : !visible
        ? { status: 'hidden' }
        : cache.current?.key === key
          ? { status: 'ready', result: cache.current.result }
          : answer?.key === key
            ? answer.state
            : { status: 'working' }
  return { state, retry: () => retry((a) => a + 1) }
}
