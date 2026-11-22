import { decideGameViewAction, type GameViewAiResult } from './game-adapter'
import {
  createAiTurnWorkerInput,
  isAiTurnWorkerResponse,
  type AiTurnWorkerInput,
  type AiTurnWorkerRequest,
} from './worker-protocol'

export interface AiWorkerLike {
  postMessage(message: AiTurnWorkerRequest): void
  terminate(): void
  addEventListener(type: 'message', listener: (event: MessageEvent<unknown>) => void): void
  addEventListener(type: 'error' | 'messageerror', listener: (event: Event) => void): void
  removeEventListener(type: 'message', listener: (event: MessageEvent<unknown>) => void): void
  removeEventListener(type: 'error' | 'messageerror', listener: (event: Event) => void): void
}

export interface AiTurnClientOptions {
  readonly timeoutMs?: number
  readonly workerFactory?: () => AiWorkerLike | null
  readonly onWorkerFailure?: (error: unknown) => void
}

export interface AiTurnRequestOptions {
  readonly signal?: AbortSignal
}

interface PendingRequest {
  readonly input: AiTurnWorkerInput
  readonly resolve: (result: GameViewAiResult) => void
  readonly reject: (error: unknown) => void
  readonly signal?: AbortSignal
  readonly abortListener?: () => void
  readonly timer?: ReturnType<typeof setTimeout>
}

function abortError(message = 'AI turn was cancelled'): Error {
  if (typeof DOMException !== 'undefined') return new DOMException(message, 'AbortError')
  const error = new Error(message)
  error.name = 'AbortError'
  return error
}

function defaultWorkerFactory(): AiWorkerLike | null {
  if (typeof Worker === 'undefined') return null
  return new Worker(new URL('./ai-turn.worker.ts', import.meta.url), {
    type: 'module',
    name: 'mansion-ai-turns',
  }) as unknown as AiWorkerLike
}

/** Persistent typed worker client with deterministic in-thread fallback. */
export class AiTurnClient {
  private readonly timeoutMs: number
  private readonly workerFactory: () => AiWorkerLike | null
  private readonly onWorkerFailure: (error: unknown) => void
  private readonly pending = new Map<number, PendingRequest>()
  private worker?: AiWorkerLike
  private workerDisabled = false
  private disposed = false
  private nextRequestId = 1

  constructor(options: AiTurnClientOptions = {}) {
    this.timeoutMs = Math.max(0, options.timeoutMs ?? 10_000)
    this.workerFactory = options.workerFactory ?? defaultWorkerFactory
    this.onWorkerFailure = options.onWorkerFailure ?? (() => undefined)
  }

  private readonly onMessage = (event: MessageEvent<unknown>): void => {
    if (!isAiTurnWorkerResponse(event.data)) return
    const response = event.data
    const pending = this.takePending(response.requestId)
    if (!pending) return

    if (response.type === 'AI_TURN_RESULT') pending.resolve(response.result)
    else this.resolveLocally(pending, new Error(response.message))
  }

  private readonly onWorkerError = (event: Event): void => {
    this.disableWorker(event)
  }

  private ensureWorker(): AiWorkerLike | null {
    if (this.workerDisabled || this.disposed) return null
    if (this.worker) return this.worker
    try {
      const worker = this.workerFactory()
      if (!worker) {
        this.workerDisabled = true
        return null
      }
      worker.addEventListener('message', this.onMessage)
      worker.addEventListener('error', this.onWorkerError)
      worker.addEventListener('messageerror', this.onWorkerError)
      this.worker = worker
      return worker
    } catch (error) {
      this.workerDisabled = true
      this.onWorkerFailure(error)
      return null
    }
  }

  private takePending(requestId: number): PendingRequest | undefined {
    const pending = this.pending.get(requestId)
    if (!pending) return undefined
    this.pending.delete(requestId)
    if (pending.timer) clearTimeout(pending.timer)
    if (pending.signal && pending.abortListener) {
      pending.signal.removeEventListener('abort', pending.abortListener)
    }
    return pending
  }

  private resolveLocally(pending: PendingRequest, workerError?: unknown): void {
    if (workerError) this.onWorkerFailure(workerError)
    if (pending.signal?.aborted) {
      pending.reject(abortError())
      return
    }
    try {
      pending.resolve(
        decideGameViewAction(
          pending.input.view,
          pending.input.visibleEvents,
          pending.input.difficulty,
          pending.input.previousKnowledge,
        ),
      )
    } catch (error) {
      pending.reject(error)
    }
  }

  private disableWorker(error: unknown): void {
    if (!this.workerDisabled) this.onWorkerFailure(error)
    this.workerDisabled = true
    if (this.worker) {
      this.worker.removeEventListener('message', this.onMessage)
      this.worker.removeEventListener('error', this.onWorkerError)
      this.worker.removeEventListener('messageerror', this.onWorkerError)
      this.worker.terminate()
      this.worker = undefined
    }
    for (const requestId of [...this.pending.keys()]) {
      const pending = this.takePending(requestId)
      if (pending) this.resolveLocally(pending)
    }
  }

  decide(
    input: AiTurnWorkerInput,
    options: AiTurnRequestOptions = {},
  ): Promise<GameViewAiResult> {
    if (this.disposed) return Promise.reject(abortError('AI turn client is disposed'))
    const safeInput = createAiTurnWorkerInput(input)
    if (options.signal?.aborted) return Promise.reject(abortError())

    const worker = this.ensureWorker()
    if (!worker) {
      return Promise.resolve().then(() => {
        if (options.signal?.aborted) throw abortError()
        return decideGameViewAction(
          safeInput.view,
          safeInput.visibleEvents,
          safeInput.difficulty,
          safeInput.previousKnowledge,
        )
      })
    }

    const requestId = this.nextRequestId
    this.nextRequestId += 1
    return new Promise<GameViewAiResult>((resolve, reject) => {
      const abortListener = options.signal
        ? () => {
            const pending = this.takePending(requestId)
            if (pending) pending.reject(abortError())
          }
        : undefined
      const timer =
        this.timeoutMs > 0
          ? setTimeout(() => this.disableWorker(new Error('AI worker timed out')), this.timeoutMs)
          : undefined
      const pending: PendingRequest = {
        input: safeInput,
        resolve,
        reject,
        ...(options.signal ? { signal: options.signal } : {}),
        ...(abortListener ? { abortListener } : {}),
        ...(timer ? { timer } : {}),
      }
      this.pending.set(requestId, pending)
      if (options.signal && abortListener) {
        options.signal.addEventListener('abort', abortListener, { once: true })
      }

      try {
        worker.postMessage({ type: 'DECIDE_AI_TURN', requestId, input: safeInput })
      } catch (error) {
        this.disableWorker(error)
      }
    })
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    if (this.worker) {
      this.worker.removeEventListener('message', this.onMessage)
      this.worker.removeEventListener('error', this.onWorkerError)
      this.worker.removeEventListener('messageerror', this.onWorkerError)
      this.worker.terminate()
      this.worker = undefined
    }
    for (const requestId of [...this.pending.keys()]) {
      const pending = this.takePending(requestId)
      pending?.reject(abortError('AI turn client is disposed'))
    }
  }
}

export function createAiTurnClient(options: AiTurnClientOptions = {}): AiTurnClient {
  return new AiTurnClient(options)
}
