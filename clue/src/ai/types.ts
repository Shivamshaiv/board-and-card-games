export type PlayerId = string
export type CardId = string

export type CardCategory = 'suspect' | 'weapon' | 'room'
export type AiDifficulty = 'easy' | 'normal' | 'hard'

export const CASE_FILE_OWNER = '$case-file' as const
export type PossibleOwner = PlayerId | typeof CASE_FILE_OWNER

export interface AiCardDefinition {
  readonly id: CardId
  readonly category: CardCategory
}

export interface AiPlayerSummary {
  readonly id: PlayerId
  readonly handSize: number
  readonly eliminated?: boolean
}

/** A public suggestion, plus a reveal only when this AI legitimately saw it. */
export interface AiSuggestionObservation {
  readonly id: string
  readonly suggesterId: PlayerId
  readonly cardIds: readonly [CardId, CardId, CardId]
  readonly unableToDisprove: readonly PlayerId[]
  readonly disproverId?: PlayerId
  readonly revealedCardId?: CardId
}

export interface AiPrivateReveal {
  readonly cardId: CardId
  readonly ownerId: PlayerId
}

export interface AiRevealGiven {
  readonly cardId: CardId
  readonly toPlayerId: PlayerId
}

export interface AiAccusationTriple {
  readonly suspectId: CardId
  readonly weaponId: CardId
  readonly roomId: CardId
}

export interface AiLegalOptions {
  /** Present only while a suggestion can legally be made. */
  readonly suggestion?: {
    readonly suspectIds: readonly CardId[]
    readonly weaponIds: readonly CardId[]
    readonly roomId: CardId
  }
  /** Present only while this player must choose a card to reveal. */
  readonly revealCardIds?: readonly CardId[]
  /** Present only while a final accusation is legal. */
  readonly accusation?: {
    readonly suspectIds: readonly CardId[]
    readonly weaponIds: readonly CardId[]
    readonly roomIds: readonly CardId[]
  }
}

/**
 * Adapter input. Extra properties are deliberately ignored by
 * `sanitizeAiObservation`, so callers may safely adapt from a larger view.
 */
export interface AiObservationInput {
  readonly playerId: PlayerId
  readonly difficulty: AiDifficulty
  readonly seed: string
  readonly revision: number
  readonly cards: readonly AiCardDefinition[]
  readonly players: readonly AiPlayerSummary[]
  readonly ownHand: readonly CardId[]
  readonly privateReveals?: readonly AiPrivateReveal[]
  readonly revealsGiven?: readonly AiRevealGiven[]
  readonly suggestions?: readonly AiSuggestionObservation[]
  readonly incorrectAccusations?: readonly AiAccusationTriple[]
  readonly pendingSuggesterId?: PlayerId
  readonly legal: AiLegalOptions
}

declare const sanitizedObservationBrand: unique symbol

/** The only observation accepted by inference and strategy functions. */
export type SanitizedAiObservation = Readonly<AiObservationInput> & {
  readonly [sanitizedObservationBrand]: true
}

export type AiObservation = SanitizedAiObservation

export interface OwnershipClause {
  readonly id: string
  readonly ownerId: PlayerId
  readonly oneOf: readonly CardId[]
}

export interface AiKnowledge {
  readonly version: 1
  readonly playerId: PlayerId
  readonly gameSeed: string
  readonly revision: number
  readonly cardCategories: Readonly<Record<CardId, CardCategory>>
  readonly playerHandSizes: Readonly<Record<PlayerId, number>>
  readonly possibleOwners: Readonly<Record<CardId, readonly PossibleOwner[]>>
  readonly clauses: readonly OwnershipClause[]
  readonly incorrectAccusations: readonly AiAccusationTriple[]
  readonly revealsGiven: readonly AiRevealGiven[]
  readonly suggestionsSeen: readonly string[]
  /** Number of suggestions this AI has personally made naming each room. */
  readonly ownRoomSuggestionCounts: Readonly<Record<CardId, number>>
  readonly contradictions: readonly string[]
}

export type AiDeductionDecision =
  | {
      readonly type: 'MAKE_SUGGESTION'
      readonly suspectId: CardId
      readonly weaponId: CardId
      readonly roomId: CardId
    }
  | { readonly type: 'REVEAL_CARD'; readonly cardId: CardId }
  | ({ readonly type: 'MAKE_ACCUSATION' } & AiAccusationTriple)

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b))
}

function requireIdentifier(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${label} must be a non-empty string`)
  }
}

/**
 * Copies only the information an AI is allowed to know. The hidden solution,
 * opponent hands, and unscoped private events have no destination field here.
 */
export function sanitizeAiObservation(input: AiObservationInput): SanitizedAiObservation {
  requireIdentifier(input.playerId, 'playerId')
  requireIdentifier(input.seed, 'seed')

  if (input.difficulty !== 'easy' && input.difficulty !== 'normal' && input.difficulty !== 'hard') {
    throw new TypeError('difficulty must be easy, normal, or hard')
  }

  if (!Number.isSafeInteger(input.revision) || input.revision < 0) {
    throw new TypeError('revision must be a non-negative safe integer')
  }

  const cards = input.cards
    .map((card) => {
      requireIdentifier(card.id, 'card.id')
      if (card.category !== 'suspect' && card.category !== 'weapon' && card.category !== 'room') {
        throw new TypeError(`Unknown card category for ${card.id}`)
      }
      return { id: card.id, category: card.category }
    })
    .sort((a, b) => a.id.localeCompare(b.id))

  if (new Set(cards.map((card) => card.id)).size !== cards.length) {
    throw new TypeError('Card identifiers must be unique')
  }

  const cardIds = new Set(cards.map((card) => card.id))
  const players = input.players.map((player) => {
    requireIdentifier(player.id, 'player.id')
    if (!Number.isSafeInteger(player.handSize) || player.handSize < 0) {
      throw new TypeError(`Invalid hand size for ${player.id}`)
    }
    return { id: player.id, handSize: player.handSize, eliminated: Boolean(player.eliminated) }
  })

  if (new Set(players.map((player) => player.id)).size !== players.length) {
    throw new TypeError('Player identifiers must be unique')
  }

  const playerIds = new Set(players.map((player) => player.id))

  if (!players.some((player) => player.id === input.playerId)) {
    throw new TypeError('The observing player must be present in players')
  }

  const ensureKnownCards = (values: readonly CardId[], label: string): CardId[] => {
    const result = uniqueSorted(values)
    for (const id of result) {
      if (!cardIds.has(id)) throw new TypeError(`${label} contains unknown card ${id}`)
    }
    return result
  }

  const ownHand = ensureKnownCards(input.ownHand, 'ownHand')
  const privateReveals = (input.privateReveals ?? [])
    .map((reveal) => {
      if (!cardIds.has(reveal.cardId)) throw new TypeError(`Unknown revealed card ${reveal.cardId}`)
      requireIdentifier(reveal.ownerId, 'private reveal owner')
      if (!playerIds.has(reveal.ownerId)) throw new TypeError(`Unknown reveal owner ${reveal.ownerId}`)
      return { cardId: reveal.cardId, ownerId: reveal.ownerId }
    })
    .sort((a, b) => a.cardId.localeCompare(b.cardId) || a.ownerId.localeCompare(b.ownerId))

  const revealsGiven = (input.revealsGiven ?? [])
    .map((reveal) => {
      if (!cardIds.has(reveal.cardId)) throw new TypeError(`Unknown given card ${reveal.cardId}`)
      requireIdentifier(reveal.toPlayerId, 'reveal recipient')
      if (!playerIds.has(reveal.toPlayerId)) {
        throw new TypeError(`Unknown reveal recipient ${reveal.toPlayerId}`)
      }
      return { cardId: reveal.cardId, toPlayerId: reveal.toPlayerId }
    })
    .sort((a, b) => a.toPlayerId.localeCompare(b.toPlayerId) || a.cardId.localeCompare(b.cardId))

  const suggestions = (input.suggestions ?? [])
    .map((suggestion) => {
      const [suspectId, weaponId, roomId] = suggestion.cardIds
      ensureKnownCards([suspectId, weaponId, roomId], `suggestion ${suggestion.id}`)
      requireIdentifier(suggestion.id, 'suggestion.id')
      requireIdentifier(suggestion.suggesterId, 'suggestion.suggesterId')
      if (!playerIds.has(suggestion.suggesterId)) {
        throw new TypeError(`Unknown suggester ${suggestion.suggesterId}`)
      }
      for (const playerId of suggestion.unableToDisprove) {
        if (!playerIds.has(playerId)) throw new TypeError(`Unknown failed responder ${playerId}`)
      }
      if (suggestion.disproverId && !playerIds.has(suggestion.disproverId)) {
        throw new TypeError(`Unknown disprover ${suggestion.disproverId}`)
      }
      if (suggestion.revealedCardId && !cardIds.has(suggestion.revealedCardId)) {
        throw new TypeError(`Suggestion ${suggestion.id} contains an unknown reveal`)
      }
      return {
        id: suggestion.id,
        suggesterId: suggestion.suggesterId,
        cardIds: [suspectId, weaponId, roomId] as const,
        unableToDisprove: uniqueSorted(suggestion.unableToDisprove),
        ...(suggestion.disproverId ? { disproverId: suggestion.disproverId } : {}),
        // A disproval card is private to the suggester. Drop it defensively if
        // a broad event adapter accidentally includes it for another AI.
        ...(suggestion.revealedCardId && suggestion.suggesterId === input.playerId
          ? { revealedCardId: suggestion.revealedCardId }
          : {}),
      }
    })
    .sort((a, b) => a.id.localeCompare(b.id))

  const incorrectAccusations = (input.incorrectAccusations ?? [])
    .map((triple) => {
      ensureKnownCards(
        [triple.suspectId, triple.weaponId, triple.roomId],
        'incorrect accusation',
      )
      return { ...triple }
    })
    .sort((a, b) =>
      `${a.suspectId}|${a.weaponId}|${a.roomId}`.localeCompare(
        `${b.suspectId}|${b.weaponId}|${b.roomId}`,
      ),
    )

  const legal: AiLegalOptions = {
    ...(input.legal.suggestion
      ? {
          suggestion: {
            suspectIds: ensureKnownCards(input.legal.suggestion.suspectIds, 'legal suspects'),
            weaponIds: ensureKnownCards(input.legal.suggestion.weaponIds, 'legal weapons'),
            roomId: input.legal.suggestion.roomId,
          },
        }
      : {}),
    ...(input.legal.revealCardIds
      ? { revealCardIds: ensureKnownCards(input.legal.revealCardIds, 'legal reveals') }
      : {}),
    ...(input.legal.accusation
      ? {
          accusation: {
            suspectIds: ensureKnownCards(input.legal.accusation.suspectIds, 'accusation suspects'),
            weaponIds: ensureKnownCards(input.legal.accusation.weaponIds, 'accusation weapons'),
            roomIds: ensureKnownCards(input.legal.accusation.roomIds, 'accusation rooms'),
          },
        }
      : {}),
  }

  if (legal.suggestion && !cardIds.has(legal.suggestion.roomId)) {
    throw new TypeError(`Unknown suggestion room ${legal.suggestion.roomId}`)
  }

  const categories = new Map(cards.map((card) => [card.id, card.category]))
  if (
    legal.suggestion &&
    (categories.get(legal.suggestion.roomId) !== 'room' ||
      legal.suggestion.suspectIds.some((id) => categories.get(id) !== 'suspect') ||
      legal.suggestion.weaponIds.some((id) => categories.get(id) !== 'weapon'))
  ) {
    throw new TypeError('Legal suggestion choices do not match their card categories')
  }
  if (
    legal.accusation &&
    (legal.accusation.suspectIds.some((id) => categories.get(id) !== 'suspect') ||
      legal.accusation.weaponIds.some((id) => categories.get(id) !== 'weapon') ||
      legal.accusation.roomIds.some((id) => categories.get(id) !== 'room'))
  ) {
    throw new TypeError('Legal accusation choices do not match their card categories')
  }

  return {
    playerId: input.playerId,
    difficulty: input.difficulty,
    seed: input.seed,
    revision: input.revision,
    cards,
    players,
    ownHand,
    privateReveals,
    revealsGiven,
    suggestions,
    incorrectAccusations,
    ...(input.pendingSuggesterId ? { pendingSuggesterId: input.pendingSuggesterId } : {}),
    legal,
  } as unknown as SanitizedAiObservation
}
