import { afterEach, describe, expect, it, vi } from 'vitest'
import { applyAction, createGame, projectGame } from '../src/engine'
import { advisorInput } from '../src/advisor/input'
import { startAnalysis } from '../src/advisor/worker-client'
import type { AdvisorResult } from '../src/advisor/analysis'
import type { AdvisorReply } from '../src/advisor/protocol'

const game = createGame(
  ['Sam', 'Maya', 'Leo'].map((name) => ({ name })),
  21,
)
const view = projectGame(game, 0)
const request = { key: 'TABLEA/4/0/0/playing', view }
const result: AdvisorResult = {
  racers: [],
  actions: [],
  leg: { method: 'exact', samples: 1 },
  race: { method: 'exact', samples: 1 },
  pairedSamples: 0,
  seed: 4,
  assumptions: [],
}

function fake() {
  return {
    onmessage: null as Worker['onmessage'],
    onmessageerror: null as Worker['onmessageerror'],
    onerror: null as Worker['onerror'],
    terminate: vi.fn(),
    postMessage: vi.fn(),
  }
}
function respond(handler: Worker['onmessage'], data: AdvisorReply) {
  handler?.call({} as Worker, { data } as MessageEvent)
}
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('advisor inputs', () => {
  it('retains only the active player’s private cards and balance', () => {
    let state = applyAction(game, 0, { type: 'finish', color: 'red', pile: 'winner' })
    state = applyAction(state, 1, { type: 'finish', color: 'blue', pile: 'loser' })
    state = applyAction(state, 2, { type: 'ticket', color: 'yellow' })
    const own = projectGame(state, 0)
    Object.assign(own, {
      rng: 'private-dice-seed',
      hands: [['private-card']],
      irrelevant: 'hidden',
    })
    Object.assign(own.players[1], { auth: 'guest-token' })
    const input = advisorInput(own)
    expect(input.ownFinishBets).toEqual([{ pile: 'winner', color: 'red' }])
    expect(input.hand).not.toContain('red')
    expect(input.finishOwners).toEqual({ winner: [0], loser: [1] })
    expect(input.players.map((p) => p.coins)).toEqual([3, null, null])
    expect(input.events).toEqual([])
    expect(JSON.stringify(input)).not.toMatch(/private-card|private-dice-seed|guest-token/)
    const observing = advisorInput(projectGame(state, 1))
    expect(observing.seat).toBe(-1)
    expect(observing.hand).toEqual([])
    expect(observing.ownFinishBets).toEqual([])
    expect(observing.players.every((p) => p.coins === null)).toBe(true)
    expect(own.players[1].coins).toBeNull()
  })
})
describe('analysis worker lifetime', () => {
  it('ignores stale keys and releases its worker immediately on the matching result', () => {
    const job = fake(),
      done = vi.fn(),
      fail = vi.fn()
    const stop = startAnalysis(request, done, fail, () => job)
    expect(job.postMessage).toHaveBeenCalledWith(request)
    respond(job.onmessage, { key: 'older', type: 'result', result })
    expect(done).not.toHaveBeenCalled()
    const queued = job.onmessage
    respond(queued, { key: request.key, type: 'result', result })
    respond(queued, { key: request.key, type: 'result', result })
    stop()
    expect(done).toHaveBeenCalledTimes(1)
    expect(done).toHaveBeenCalledWith(result)
    expect(job.terminate).toHaveBeenCalledTimes(1)
    expect(fail).not.toHaveBeenCalled()
  })
  it('cancels pending work and ignores messages queued before a close or revision change', () => {
    vi.useFakeTimers()
    const job = fake(),
      done = vi.fn(),
      fail = vi.fn()
    const stop = startAnalysis(request, done, fail, () => job),
      queued = job.onmessage
    stop()
    respond(queued, { key: request.key, type: 'result', result })
    vi.advanceTimersByTime(90_000)
    expect(job.terminate).toHaveBeenCalledOnce()
    expect(done).not.toHaveBeenCalled()
    expect(fail).not.toHaveBeenCalled()
  })
  it('reports unavailable workers, startup failures, decoding failures and timeouts', () => {
    vi.stubGlobal('Worker', undefined)
    const fail = vi.fn(),
      done = vi.fn()
    startAnalysis(request, done, fail)
    expect(fail).toHaveBeenLastCalledWith(expect.objectContaining({ retryable: false }))
    startAnalysis(request, done, fail, () => {
      throw Error('blocked')
    })
    expect(fail).toHaveBeenLastCalledWith(expect.objectContaining({ retryable: true }))
    const broken = fake()
    startAnalysis(request, done, fail, () => broken)
    broken.onmessageerror?.call({} as Worker, {} as MessageEvent)
    expect(broken.terminate).toHaveBeenCalledOnce()
    vi.useFakeTimers()
    const slow = fake()
    startAnalysis(request, done, fail, () => slow)
    vi.advanceTimersByTime(60_000)
    expect(slow.terminate).toHaveBeenCalledOnce()
    expect(fail).toHaveBeenCalledTimes(4)
    expect(done).not.toHaveBeenCalled()
  })
})
