import {
  CARD_BY_ID,
  CARDS,
  MANSION_BOARD,
  ROOM_IDS,
  SUSPECT_IDS,
  WEAPON_IDS,
  roomAtTile,
  roomCardId,
  suspectCardId,
  weaponCardId,
  type GameCommand,
  type PlayerGameView,
  type VisibleGameEvent,
} from '../game'
import { decideDeductionAction } from './strategy'
import { rngForDecision } from './rng'
import type {
  AiAccusationTriple,
  AiDeductionDecision,
  AiDifficulty,
  AiKnowledge,
  AiObservationInput,
  AiSuggestionObservation,
  CardId,
  PlayerId,
  SanitizedAiObservation,
} from './types'
import { CASE_FILE_OWNER } from './types'

/** Structural mirror of the deduction commands accepted by the game session. */
export type GameDeductionCommand = Extract<
  GameCommand,
  { type: 'MAKE_SUGGESTION' | 'CHOOSE_REVEAL' | 'MAKE_ACCUSATION' }
>

interface CoreSuggestionShape {
  suggestorId: string
  suspectId: string
  weaponId: string
  roomId: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function coreSuggestion(value: unknown): CoreSuggestionShape | undefined {
  if (!isRecord(value)) return undefined
  const { suggestorId, suspectId, weaponId, roomId } = value
  return typeof suggestorId === 'string' &&
    typeof suspectId === 'string' &&
    typeof weaponId === 'string' &&
    typeof roomId === 'string'
    ? { suggestorId, suspectId, weaponId, roomId }
    : undefined
}

function suggestionCards(suggestion: CoreSuggestionShape): readonly [CardId, CardId, CardId] {
  return [
    suspectCardId(suggestion.suspectId),
    weaponCardId(suggestion.weaponId),
    roomCardId(suggestion.roomId),
  ]
}

function suggestionSignature(suggestion: CoreSuggestionShape): string {
  return `${suggestion.suggestorId}|${suggestion.suspectId}|${suggestion.weaponId}|${suggestion.roomId}`
}

interface MutableSuggestionObservation {
  id: string
  signature: string
  suggesterId: string
  cardIds: readonly [CardId, CardId, CardId]
  unableToDisprove: string[]
  disproverId?: string
  revealedCardId?: CardId
}

function visibleSuggestionHistory(events: readonly VisibleGameEvent[]): {
  suggestions: AiSuggestionObservation[]
  revealsGiven: { cardId: CardId; toPlayerId: PlayerId }[]
  incorrectAccusations: AiAccusationTriple[]
} {
  const suggestions: MutableSuggestionObservation[] = []
  const revealsGiven: { cardId: CardId; toPlayerId: PlayerId }[] = []
  const pendingAccusations = new Map<PlayerId, AiAccusationTriple>()
  const incorrectAccusations: AiAccusationTriple[] = []
  let current: MutableSuggestionObservation | undefined

  const ensureSuggestion = (
    suggestion: CoreSuggestionShape,
    sequence: number,
  ): MutableSuggestionObservation => {
    const signature = suggestionSignature(suggestion)
    if (current?.signature === signature) return current
    current = {
      id: `suggestion-${sequence}`,
      signature,
      suggesterId: suggestion.suggestorId,
      cardIds: suggestionCards(suggestion),
      unableToDisprove: [],
    }
    suggestions.push(current)
    return current
  }

  for (const event of [...events].sort((a, b) => a.sequence - b.sequence)) {
    if (event.type === 'SUGGESTION_MADE') {
      const suggestion = coreSuggestion(event.payload.suggestion)
      if (suggestion) {
        current = undefined
        ensureSuggestion(suggestion, event.sequence)
      }
      continue
    }

    if (
      event.type === 'PLAYER_PASSED' ||
      event.type === 'SUGGESTION_DISPROVED' ||
      event.type === 'NO_ONE_DISPROVED' ||
      event.type === 'CARD_REVEALED'
    ) {
      const suggestion = coreSuggestion(event.payload.suggestion)
      if (!suggestion) continue
      const observed = ensureSuggestion(suggestion, event.sequence)
      if (event.type === 'PLAYER_PASSED' && typeof event.payload.playerId === 'string') {
        if (!observed.unableToDisprove.includes(event.payload.playerId)) {
          observed.unableToDisprove.push(event.payload.playerId)
        }
      } else if (
        event.type === 'SUGGESTION_DISPROVED' &&
        typeof event.payload.responderId === 'string'
      ) {
        observed.disproverId = event.payload.responderId
      } else if (event.type === 'CARD_REVEALED') {
        if (typeof event.payload.cardId === 'string') observed.revealedCardId = event.payload.cardId
        if (
          typeof event.payload.cardId === 'string' &&
          typeof event.payload.recipientId === 'string' &&
          typeof event.payload.responderId === 'string'
        ) {
          revealsGiven.push({
            cardId: event.payload.cardId,
            toPlayerId: event.payload.recipientId,
          })
        }
      }
      continue
    }

    if (event.type === 'ACCUSATION_MADE') {
      if (typeof event.payload.playerId !== 'string' || !isRecord(event.payload.accusation)) continue
      const accusation = event.payload.accusation
      if (
        typeof accusation.suspectId === 'string' &&
        typeof accusation.weaponId === 'string' &&
        typeof accusation.roomId === 'string'
      ) {
        pendingAccusations.set(event.payload.playerId, {
          suspectId: suspectCardId(accusation.suspectId),
          weaponId: weaponCardId(accusation.weaponId),
          roomId: roomCardId(accusation.roomId),
        })
      }
    } else if (event.type === 'PLAYER_ELIMINATED' && typeof event.payload.playerId === 'string') {
      const accusation = pendingAccusations.get(event.payload.playerId)
      if (accusation) incorrectAccusations.push(accusation)
    }
  }

  return {
    suggestions: suggestions.map((suggestion) => ({
      id: suggestion.id,
      suggesterId: suggestion.suggesterId,
      cardIds: suggestion.cardIds,
      unableToDisprove: [...suggestion.unableToDisprove].sort((a, b) => a.localeCompare(b)),
      ...(suggestion.disproverId ? { disproverId: suggestion.disproverId } : {}),
      ...(suggestion.revealedCardId ? { revealedCardId: suggestion.revealedCardId } : {}),
    })),
    revealsGiven,
    incorrectAccusations,
  }
}

/**
 * Builds AI input from the redacted player view and that same player's visible
 * event stream. Never pass `GameSession.exportState()` to this function.
 */
export function observationFromGameView(
  view: PlayerGameView,
  visibleEvents: readonly VisibleGameEvent[],
  difficulty: AiDifficulty,
): AiObservationInput {
  const history = visibleSuggestionHistory(visibleEvents)
  const viewer = view.players.find((player) => player.id === view.viewerId)
  const viewerLocation = viewer ? view.suspectLocations[viewer.suspectId] : null
  const currentRoomId = roomAtTile(viewerLocation)

  return {
    playerId: view.viewerId,
    difficulty,
    seed: view.seed,
    revision: view.revision,
    cards: CARDS.map((card) => ({ id: card.id, category: card.kind })),
    players: view.players.map((player) => ({
      id: player.id,
      handSize: player.handSize,
      eliminated: player.eliminated,
    })),
    ownHand: view.ownHand,
    privateReveals: view.privateReveals.map((reveal) => ({
      cardId: reveal.cardId,
      ownerId: reveal.fromPlayerId,
    })),
    revealsGiven: history.revealsGiven.filter((reveal) =>
      visibleEvents.some(
        (event) =>
          event.type === 'CARD_REVEALED' &&
          event.payload.cardId === reveal.cardId &&
          event.payload.responderId === view.viewerId &&
          event.payload.recipientId === reveal.toPlayerId,
      ),
    ),
    suggestions: history.suggestions,
    incorrectAccusations: history.incorrectAccusations,
    ...(view.pendingSuggestion && view.revealChoices.length > 0
      ? { pendingSuggesterId: view.pendingSuggestion.suggestorId }
      : {}),
    legal: {
      ...(view.legalActions.includes('MAKE_SUGGESTION') && currentRoomId
        ? {
            suggestion: {
              suspectIds: SUSPECT_IDS.map(suspectCardId),
              weaponIds: WEAPON_IDS.map(weaponCardId),
              roomId: roomCardId(currentRoomId),
            },
          }
        : {}),
      ...(view.legalActions.includes('CHOOSE_REVEAL')
        ? { revealCardIds: view.revealChoices }
        : {}),
      ...(view.legalActions.includes('MAKE_ACCUSATION')
        ? {
            accusation: {
              suspectIds: SUSPECT_IDS.map(suspectCardId),
              weaponIds: WEAPON_IDS.map(weaponCardId),
              roomIds: ROOM_IDS.map(roomCardId),
            },
          }
        : {}),
    },
  }
}

export interface GameViewAiResult {
  readonly knowledge: AiKnowledge
  readonly command?: GameCommand
}

function fallbackGameCommand(
  view: PlayerGameView,
  knowledge: AiKnowledge,
  difficulty: AiDifficulty,
): GameCommand | undefined {
  const legal = new Set(view.legalActions)
  const rng = rngForDecision(view.seed, view.viewerId, view.revision, 'game-action')

  if (legal.has('USE_SECRET_PASSAGE')) {
    const viewer = view.players.find((player) => player.id === view.viewerId)
    const currentRoomId = viewer
      ? roomAtTile(view.suspectLocations[viewer.suspectId])
      : undefined
    const passageRoomId = currentRoomId
      ? MANSION_BOARD.secretPassages[currentRoomId]
      : undefined
    const passageCardId = passageRoomId ? roomCardId(passageRoomId) : undefined
    const unresolvedRooms = ROOM_IDS.map(roomCardId).filter((cardId) =>
      knowledge.possibleOwners[cardId]?.includes(CASE_FILE_OWNER),
    )
    const leastExplored = Math.min(
      ...unresolvedRooms.map((cardId) => knowledge.ownRoomSuggestionCounts[cardId] ?? 0),
    )
    const passageIsUseful = Boolean(
      passageCardId &&
        unresolvedRooms.includes(passageCardId) &&
        (knowledge.ownRoomSuggestionCounts[passageCardId] ?? 0) <= leastExplored,
    )

    // Passage loops can strand an investigator between two rooms forever.
    // Take one only when it advances the least-explored part of the room model.
    if (
      passageIsUseful &&
      (difficulty !== 'easy' || !legal.has('ROLL_DICE') || rng.integer(2) === 0)
    ) {
      return { type: 'USE_SECRET_PASSAGE', playerId: view.viewerId }
    }
  }

  if (legal.has('ROLL_DICE')) return { type: 'ROLL_DICE', playerId: view.viewerId }

  if (legal.has('MOVE_PLAYER') && view.reachableDestinations.length > 0) {
    const destinations = [...view.reachableDestinations].sort((a, b) =>
      a.tileId.localeCompare(b.tileId),
    )
    const scored = destinations
      .map((destination) => {
        const roomId = roomAtTile(destination.tileId)
        const roomCard = roomId ? roomCardId(roomId) : undefined
        const domain = roomCard ? knowledge.possibleOwners[roomCard] ?? [] : []
        const visits = roomCard
          ? knowledge.ownRoomSuggestionCounts[roomCard] ?? 0
          : 0
        const score =
          (roomCard ? 100 : 0) +
          (domain.includes(CASE_FILE_OWNER) ? 50 : 0) +
          domain.length * 2 +
          destination.cost / 100 -
          visits * 25
        return { destination, score }
      })
      .sort(
        (left, right) =>
          right.score - left.score ||
          left.destination.tileId.localeCompare(right.destination.tileId),
      )
    // Easy still explores purposefully most turns, but keeps visible seeded
    // variation. Purely random walking made some valid games last thousands
    // of commands without discovering all rooms.
    const selected =
      difficulty === 'easy' && rng.integer(100) < 25
        ? rng.pick(destinations)
        : scored[0]?.destination
    if (selected) {
      return {
        type: 'MOVE_PLAYER',
        playerId: view.viewerId,
        destinationId: selected.tileId,
      }
    }
  }

  if (legal.has('DECLINE_SUGGESTION')) {
    return { type: 'DECLINE_SUGGESTION', playerId: view.viewerId }
  }
  if (legal.has('END_TURN')) return { type: 'END_TURN', playerId: view.viewerId }
  return undefined
}

function shouldTravelFromStartingRoom(
  view: PlayerGameView,
  observation: SanitizedAiObservation,
  knowledge: AiKnowledge,
): boolean {
  if (
    view.phase !== 'awaiting-action' ||
    !view.legalActions.includes('ROLL_DICE') ||
    !observation.legal.suggestion
  ) {
    return false
  }

  const currentRoomCard = observation.legal.suggestion.roomId
  const unresolvedRooms = ROOM_IDS.map(roomCardId).filter((cardId) =>
    knowledge.possibleOwners[cardId]?.includes(CASE_FILE_OWNER),
  )
  if (unresolvedRooms.length <= 1) return false

  const currentCount = knowledge.ownRoomSuggestionCounts[currentRoomCard] ?? 0
  const leastExplored = Math.min(
    ...unresolvedRooms.map((cardId) => knowledge.ownRoomSuggestionCounts[cardId] ?? 0),
  )
  return currentCount > leastExplored
}

/** One-call integration helper for a session's sanitized player projection. */
export function decideGameViewAction(
  view: PlayerGameView,
  visibleEvents: readonly VisibleGameEvent[],
  difficulty: AiDifficulty,
  previousKnowledge?: AiKnowledge,
): GameViewAiResult {
  const result = decideDeductionAction(
    observationFromGameView(view, visibleEvents, difficulty),
    previousKnowledge,
  )
  const decision =
    result.decision?.type === 'MAKE_SUGGESTION' &&
    shouldTravelFromStartingRoom(view, result.observation, result.knowledge)
      ? undefined
      : result.decision
  const command = decision
    ? toGameDeductionCommand(view.viewerId, decision)
    : fallbackGameCommand(view, result.knowledge, difficulty)
  return command ? { knowledge: result.knowledge, command } : { knowledge: result.knowledge }
}

/**
 * Converts a private AI decision to the core command vocabulary. The room on a
 * suggestion is intentionally omitted because the engine derives it from the
 * player's authoritative location.
 */
export function toGameDeductionCommand(
  playerId: PlayerId,
  decision: AiDeductionDecision,
): GameDeductionCommand {
  switch (decision.type) {
    case 'MAKE_SUGGESTION': {
      const suspect = CARD_BY_ID[decision.suspectId]
      const weapon = CARD_BY_ID[decision.weaponId]
      if (suspect?.kind !== 'suspect' || weapon?.kind !== 'weapon') {
        throw new TypeError('AI suggestion contains invalid card categories')
      }
      return {
        type: 'MAKE_SUGGESTION',
        playerId,
        suspectId: suspect.suspectId,
        weaponId: weapon.weaponId,
      }
    }
    case 'REVEAL_CARD':
      return { type: 'CHOOSE_REVEAL', playerId, cardId: decision.cardId }
    case 'MAKE_ACCUSATION': {
      const suspect = CARD_BY_ID[decision.suspectId]
      const weapon = CARD_BY_ID[decision.weaponId]
      const room = CARD_BY_ID[decision.roomId]
      if (suspect?.kind !== 'suspect' || weapon?.kind !== 'weapon' || room?.kind !== 'room') {
        throw new TypeError('AI accusation contains invalid card categories')
      }
      return {
        type: 'MAKE_ACCUSATION',
        playerId,
        suspectId: suspect.suspectId,
        weaponId: weapon.weaponId,
        roomId: room.roomId,
      }
    }
  }
}
