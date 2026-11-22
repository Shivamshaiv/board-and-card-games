import { decideGameViewAction } from './game-adapter'
import {
  isAiTurnWorkerRequest,
  type AiTurnWorkerResponse,
} from './worker-protocol'

interface AiWorkerScope {
  addEventListener(
    type: 'message',
    listener: (event: MessageEvent<unknown>) => void,
  ): void
  postMessage(message: AiTurnWorkerResponse): void
}

const workerScope = self as unknown as AiWorkerScope

workerScope.addEventListener('message', (event) => {
  if (!isAiTurnWorkerRequest(event.data)) return
  const { requestId, input } = event.data
  try {
    const result = decideGameViewAction(
      input.view,
      input.visibleEvents,
      input.difficulty,
      input.previousKnowledge,
    )
    workerScope.postMessage({ type: 'AI_TURN_RESULT', requestId, result })
  } catch (error) {
    workerScope.postMessage({
      type: 'AI_TURN_ERROR',
      requestId,
      message: error instanceof Error ? error.message : 'AI worker failed',
    })
  }
})

