import type { AdvisorResult } from './analysis'
import type { AdvisorRequest, AdvisorReply } from './protocol'

export interface AdvisorFailure {
  message: string
  retryable: boolean
}
type Agent = Pick<Worker, 'onmessage' | 'onerror' | 'onmessageerror' | 'terminate' | 'postMessage'>
type Factory = () => Agent

function createWorker() {
  return new Worker(new URL('./advisor.worker.ts', import.meta.url), {
    type: 'module',
    name: 'Camel Up race advisor',
  })
}

/** One worker owns one immutable position. Disposing it also invalidates already queued replies. */
export function startAnalysis(
  request: AdvisorRequest,
  onResult: (value: AdvisorResult) => void,
  onFailure: (issue: AdvisorFailure) => void,
  factory?: Factory,
) {
  let worker: Agent | null = null,
    timer: ReturnType<typeof setTimeout> | undefined,
    active = true
  function stop() {
    if (!active) return
    active = false
    clearTimeout(timer)
    if (worker) {
      worker.onmessage = null
      worker.onmessageerror = null
      worker.onerror = null
      worker.terminate()
    }
  }
  function fail(message: string, retryable = true) {
    if (!active) return
    stop()
    onFailure({ message, retryable })
  }
  if (!factory && typeof Worker === 'undefined') {
    fail('This browser cannot run the analysis worker.', false)
    return stop
  }
  try {
    worker = (factory ?? createWorker)()
    worker.onmessage = ({ data }: MessageEvent<AdvisorReply>) => {
      if (!active || data?.key !== request.key) return
      if (data.type !== 'result') {
        fail('The analysis stopped before producing a forecast.')
        return
      }
      stop()
      onResult(data.result)
    }
    worker.onerror = (event) => {
      event.preventDefault()
      fail('The analysis worker could not complete this position.')
    }
    worker.onmessageerror = () => fail('The browser could not read the analysis result.')
    timer = setTimeout(() => fail('This position took too long to analyze on this device.'), 60_000)
    worker.postMessage(request)
  } catch {
    fail('The browser could not start the analysis worker.')
  }
  return stop
}
