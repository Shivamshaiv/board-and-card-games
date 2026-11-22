import type { PlayerGameView, VisibleGameEvent } from '../game'
import type { GameViewAiResult } from './game-adapter'
import type { AiDifficulty, AiKnowledge } from './types'

export interface AiTurnWorkerInput {
  readonly view: PlayerGameView
  readonly visibleEvents: readonly VisibleGameEvent[]
  readonly difficulty: AiDifficulty
  readonly previousKnowledge?: AiKnowledge
}

export interface AiTurnWorkerRequest {
  readonly type: 'DECIDE_AI_TURN'
  readonly requestId: number
  readonly input: AiTurnWorkerInput
}

export type AiTurnWorkerResponse =
  | {
      readonly type: 'AI_TURN_RESULT'
      readonly requestId: number
      readonly result: GameViewAiResult
    }
  | {
      readonly type: 'AI_TURN_ERROR'
      readonly requestId: number
      readonly message: string
    }

const forbiddenPayloadKeys = new Set([
  'caseFile',
  'solution',
  'hands',
  'opponentHands',
  'matchingCardIds',
  'rngState',
  'seed',
])

function cloneVisibleValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(cloneVisibleValue)
  if (!value || typeof value !== 'object') return value
  const result: Record<string, unknown> = {}
  for (const [key, nested] of Object.entries(value)) {
    if (!forbiddenPayloadKeys.has(key)) result[key] = cloneVisibleValue(nested)
  }
  return result
}

function cloneKnowledge(knowledge: AiKnowledge | undefined): AiKnowledge | undefined {
  if (!knowledge) return undefined
  return {
    version: 1,
    playerId: knowledge.playerId,
    gameSeed: knowledge.gameSeed,
    revision: knowledge.revision,
    cardCategories: { ...knowledge.cardCategories },
    playerHandSizes: { ...knowledge.playerHandSizes },
    possibleOwners: Object.fromEntries(
      Object.entries(knowledge.possibleOwners).map(([cardId, owners]) => [cardId, [...owners]]),
    ),
    clauses: knowledge.clauses.map((clause) => ({ ...clause, oneOf: [...clause.oneOf] })),
    incorrectAccusations: knowledge.incorrectAccusations.map((triple) => ({ ...triple })),
    revealsGiven: knowledge.revealsGiven.map((reveal) => ({ ...reveal })),
    suggestionsSeen: [...knowledge.suggestionsSeen],
    ownRoomSuggestionCounts: { ...(knowledge.ownRoomSuggestionCounts ?? {}) },
    contradictions: [...knowledge.contradictions],
  }
}

/**
 * Creates the only payload allowed across the worker boundary. It selects the
 * projected-view fields explicitly and strips any accidental case-file data.
 */
export function createAiTurnWorkerInput(input: AiTurnWorkerInput): AiTurnWorkerInput {
  const view = input.view
  const safeView: PlayerGameView = {
    revision: view.revision,
    seed: view.seed,
    viewerId: view.viewerId,
    status: view.status,
    ...(view.winnerId ? { winnerId: view.winnerId } : {}),
    // `caseFile` is intentionally never copied, including after game end.
    players: view.players.map((player) => ({ ...player })),
    activePlayerId: view.activePlayerId,
    turnNumber: view.turnNumber,
    phase: view.phase,
    ...(view.roll ? { roll: { dice: [...view.roll.dice] as [number, number], total: view.roll.total } } : {}),
    suspectLocations: { ...view.suspectLocations },
    weaponLocations: { ...view.weaponLocations },
    ownHand: [...view.ownHand],
    privateReveals: view.privateReveals.map((reveal) => ({
      cardId: reveal.cardId,
      fromPlayerId: reveal.fromPlayerId,
      suggestion: { ...reveal.suggestion },
    })),
    ...(view.pendingSuggestion ? { pendingSuggestion: { ...view.pendingSuggestion } } : {}),
    legalActions: [...view.legalActions],
    reachableDestinations: view.reachableDestinations.map((destination) => ({
      ...destination,
      path: [...destination.path],
    })),
    revealChoices: [...view.revealChoices],
  }

  const visibleEvents = input.visibleEvents.map((event) => ({
    sequence: event.sequence,
    type: event.type,
    payload: cloneVisibleValue(event.payload) as Record<string, unknown>,
  }))

  return {
    view: safeView,
    visibleEvents,
    difficulty: input.difficulty,
    ...(input.previousKnowledge
      ? { previousKnowledge: cloneKnowledge(input.previousKnowledge) }
      : {}),
  }
}

export function isAiTurnWorkerRequest(value: unknown): value is AiTurnWorkerRequest {
  if (!value || typeof value !== 'object') return false
  const request = value as Partial<AiTurnWorkerRequest>
  return (
    request.type === 'DECIDE_AI_TURN' &&
    Number.isSafeInteger(request.requestId) &&
    Boolean(request.input && typeof request.input === 'object')
  )
}

export function isAiTurnWorkerResponse(value: unknown): value is AiTurnWorkerResponse {
  if (!value || typeof value !== 'object') return false
  const response = value as Partial<AiTurnWorkerResponse>
  return (
    (response.type === 'AI_TURN_RESULT' || response.type === 'AI_TURN_ERROR') &&
    Number.isSafeInteger(response.requestId)
  )
}
