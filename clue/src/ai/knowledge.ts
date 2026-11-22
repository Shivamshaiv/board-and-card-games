import {
  CASE_FILE_OWNER,
  type AiDifficulty,
  type AiKnowledge,
  type AiRevealGiven,
  type AiAccusationTriple,
  type CardCategory,
  type CardId,
  type OwnershipClause,
  type PlayerId,
  type PossibleOwner,
  type SanitizedAiObservation,
} from './types'

interface MutableKnowledge {
  version: 1
  playerId: PlayerId
  gameSeed: string
  revision: number
  cardCategories: Record<CardId, CardCategory>
  playerHandSizes: Record<PlayerId, number>
  possibleOwners: Record<CardId, PossibleOwner[]>
  clauses: OwnershipClause[]
  incorrectAccusations: AiAccusationTriple[]
  revealsGiven: AiRevealGiven[]
  suggestionsSeen: string[]
  ownRoomSuggestionCounts: Record<CardId, number>
  contradictions: string[]
}

const categoryOrder: readonly CardCategory[] = ['suspect', 'weapon', 'room']

function ownerCompare(left: PossibleOwner, right: PossibleOwner): number {
  if (left === CASE_FILE_OWNER) return right === CASE_FILE_OWNER ? 0 : 1
  if (right === CASE_FILE_OWNER) return -1
  return left.localeCompare(right)
}

function uniqueOwners(owners: readonly PossibleOwner[]): PossibleOwner[] {
  return [...new Set(owners)].sort(ownerCompare)
}

function tripleKey(triple: AiAccusationTriple): string {
  return `${triple.suspectId}|${triple.weaponId}|${triple.roomId}`
}

function revealKey(reveal: AiRevealGiven): string {
  return `${reveal.toPlayerId}|${reveal.cardId}`
}

function clauseKey(clause: OwnershipClause): string {
  return `${clause.ownerId}|${[...clause.oneOf].sort().join('|')}`
}

function addContradiction(knowledge: MutableKnowledge, message: string): void {
  if (!knowledge.contradictions.includes(message)) knowledge.contradictions.push(message)
}

function setDomain(
  knowledge: MutableKnowledge,
  cardId: CardId,
  owners: readonly PossibleOwner[],
): boolean {
  const next = uniqueOwners(owners)
  const previous = knowledge.possibleOwners[cardId] ?? []
  if (next.length === 0) addContradiction(knowledge, `Card ${cardId} has no possible owner`)
  if (previous.length === next.length && previous.every((owner, index) => owner === next[index])) {
    return false
  }
  knowledge.possibleOwners[cardId] = next
  return true
}

function forceOwner(knowledge: MutableKnowledge, cardId: CardId, ownerId: PossibleOwner): boolean {
  const domain = knowledge.possibleOwners[cardId]
  if (!domain?.includes(ownerId)) {
    addContradiction(knowledge, `Card ${cardId} cannot be owned by ${ownerId}`)
    return setDomain(knowledge, cardId, [])
  }
  return setDomain(knowledge, cardId, [ownerId])
}

function removeOwner(knowledge: MutableKnowledge, cardId: CardId, ownerId: PossibleOwner): boolean {
  const domain = knowledge.possibleOwners[cardId]
  return domain ? setDomain(knowledge, cardId, domain.filter((owner) => owner !== ownerId)) : false
}

function cloneKnowledge(source: AiKnowledge): MutableKnowledge {
  return {
    version: 1,
    playerId: source.playerId,
    gameSeed: source.gameSeed,
    revision: source.revision,
    cardCategories: { ...source.cardCategories },
    playerHandSizes: { ...source.playerHandSizes },
    possibleOwners: Object.fromEntries(
      Object.entries(source.possibleOwners).map(([cardId, owners]) => [cardId, [...owners]]),
    ),
    clauses: source.clauses.map((clause) => ({ ...clause, oneOf: [...clause.oneOf] })),
    incorrectAccusations: source.incorrectAccusations.map((triple) => ({ ...triple })),
    revealsGiven: source.revealsGiven.map((reveal) => ({ ...reveal })),
    suggestionsSeen: [...source.suggestionsSeen],
    ownRoomSuggestionCounts: { ...(source.ownRoomSuggestionCounts ?? {}) },
    contradictions: [...source.contradictions],
  }
}

function canReuseKnowledge(
  previous: AiKnowledge | undefined,
  observation: SanitizedAiObservation,
): previous is AiKnowledge {
  if (
    !previous ||
    previous.playerId !== observation.playerId ||
    previous.gameSeed !== observation.seed ||
    previous.revision > observation.revision
  ) {
    return false
  }
  const previousCards = Object.keys(previous.cardCategories).sort()
  const nextCards = observation.cards.map((card) => card.id)
  return (
    previousCards.length === nextCards.length &&
    previousCards.every((cardId, index) => cardId === nextCards[index])
  )
}

function freshKnowledge(observation: SanitizedAiObservation): MutableKnowledge {
  const ownCards = new Set(observation.ownHand)
  const playerIds = observation.players.map((player) => player.id)
  const knowledge: MutableKnowledge = {
    version: 1,
    playerId: observation.playerId,
    gameSeed: observation.seed,
    revision: observation.revision,
    cardCategories: Object.fromEntries(observation.cards.map((card) => [card.id, card.category])),
    playerHandSizes: Object.fromEntries(
      observation.players.map((player) => [player.id, player.handSize]),
    ),
    possibleOwners: {},
    clauses: [],
    incorrectAccusations: [],
    revealsGiven: [],
    suggestionsSeen: [],
    ownRoomSuggestionCounts: {},
    contradictions: [],
  }

  for (const card of observation.cards) {
    knowledge.possibleOwners[card.id] = ownCards.has(card.id)
      ? [observation.playerId]
      : [...playerIds.filter((playerId) => playerId !== observation.playerId), CASE_FILE_OWNER]
  }

  const expectedHandSize = knowledge.playerHandSizes[observation.playerId]
  if (expectedHandSize !== ownCards.size) {
    addContradiction(
      knowledge,
      `Own hand has ${ownCards.size} cards but public hand size is ${expectedHandSize}`,
    )
  }
  return knowledge
}

function applyDirectObservations(
  knowledge: MutableKnowledge,
  observation: SanitizedAiObservation,
): void {
  knowledge.revision = Math.max(knowledge.revision, observation.revision)
  knowledge.playerHandSizes = Object.fromEntries(
    observation.players.map((player) => [player.id, player.handSize]),
  )

  const validOwners = new Set<PossibleOwner>([
    ...observation.players.map((player) => player.id),
    CASE_FILE_OWNER,
  ])
  const ownHand = new Set(observation.ownHand)

  for (const card of observation.cards) {
    const prior = knowledge.possibleOwners[card.id] ?? []
    setDomain(
      knowledge,
      card.id,
      prior.filter((owner) => validOwners.has(owner)),
    )
    if (ownHand.has(card.id)) forceOwner(knowledge, card.id, observation.playerId)
    else removeOwner(knowledge, card.id, observation.playerId)
  }

  for (const reveal of observation.privateReveals ?? []) {
    forceOwner(knowledge, reveal.cardId, reveal.ownerId)
  }

  const seenSuggestions = new Set(knowledge.suggestionsSeen)
  const knownClauses = new Set(knowledge.clauses.map(clauseKey))

  for (const suggestion of observation.suggestions ?? []) {
    const firstSeen = !seenSuggestions.has(suggestion.id)
    for (const playerId of suggestion.unableToDisprove) {
      for (const cardId of suggestion.cardIds) removeOwner(knowledge, cardId, playerId)
    }

    if (suggestion.disproverId) {
      if (suggestion.revealedCardId) {
        forceOwner(knowledge, suggestion.revealedCardId, suggestion.disproverId)
      } else {
        const clause: OwnershipClause = {
          id: suggestion.id,
          ownerId: suggestion.disproverId,
          oneOf: [...suggestion.cardIds],
        }
        const key = clauseKey(clause)
        if (!knownClauses.has(key)) {
          knowledge.clauses.push(clause)
          knownClauses.add(key)
        }
      }
    }
    if (firstSeen && suggestion.suggesterId === observation.playerId) {
      const roomCardId = suggestion.cardIds[2]
      knowledge.ownRoomSuggestionCounts[roomCardId] =
        (knowledge.ownRoomSuggestionCounts[roomCardId] ?? 0) + 1
    }
    seenSuggestions.add(suggestion.id)
  }

  knowledge.suggestionsSeen = [...seenSuggestions].sort((a, b) => a.localeCompare(b))
  knowledge.clauses.sort((a, b) => a.id.localeCompare(b.id) || clauseKey(a).localeCompare(clauseKey(b)))

  const accusationMap = new Map(
    knowledge.incorrectAccusations.map((triple) => [tripleKey(triple), triple]),
  )
  for (const triple of observation.incorrectAccusations ?? []) {
    accusationMap.set(tripleKey(triple), { ...triple })
  }
  knowledge.incorrectAccusations = [...accusationMap.values()].sort((a, b) =>
    tripleKey(a).localeCompare(tripleKey(b)),
  )

  const revealMap = new Map(knowledge.revealsGiven.map((reveal) => [revealKey(reveal), reveal]))
  for (const reveal of observation.revealsGiven ?? []) {
    revealMap.set(revealKey(reveal), { ...reveal })
  }
  knowledge.revealsGiven = [...revealMap.values()].sort((a, b) =>
    revealKey(a).localeCompare(revealKey(b)),
  )
}

function propagateCaseFileCategories(knowledge: MutableKnowledge): boolean {
  let changed = false
  for (const category of categoryOrder) {
    const cards = Object.keys(knowledge.cardCategories).filter(
      (cardId) => knowledge.cardCategories[cardId] === category,
    )
    const fixed = cards.filter(
      (cardId) =>
        knowledge.possibleOwners[cardId]?.length === 1 &&
        knowledge.possibleOwners[cardId][0] === CASE_FILE_OWNER,
    )
    const candidates = cards.filter((cardId) =>
      knowledge.possibleOwners[cardId]?.includes(CASE_FILE_OWNER),
    )

    if (fixed.length > 1) addContradiction(knowledge, `Multiple ${category} cards are in the case file`)
    if (candidates.length === 0) addContradiction(knowledge, `No ${category} can be in the case file`)

    if (fixed.length === 1) {
      for (const cardId of cards) {
        if (cardId !== fixed[0]) changed = removeOwner(knowledge, cardId, CASE_FILE_OWNER) || changed
      }
    } else if (candidates.length === 1) {
      changed = forceOwner(knowledge, candidates[0], CASE_FILE_OWNER) || changed
    }
  }
  return changed
}

function propagateHandCapacities(knowledge: MutableKnowledge): boolean {
  let changed = false
  for (const [playerId, handSize] of Object.entries(knowledge.playerHandSizes)) {
    const cards = Object.keys(knowledge.possibleOwners)
    const fixed = cards.filter((cardId) => {
      const domain = knowledge.possibleOwners[cardId]
      return domain.length === 1 && domain[0] === playerId
    })
    const candidates = cards.filter((cardId) =>
      knowledge.possibleOwners[cardId].includes(playerId),
    )

    if (fixed.length > handSize) {
      addContradiction(knowledge, `${playerId} is assigned more than ${handSize} cards`)
    }
    if (candidates.length < handSize) {
      addContradiction(knowledge, `${playerId} cannot fill a hand of ${handSize}`)
    }

    if (fixed.length === handSize) {
      for (const cardId of candidates) {
        if (!fixed.includes(cardId)) changed = removeOwner(knowledge, cardId, playerId) || changed
      }
    } else if (candidates.length === handSize) {
      for (const cardId of candidates) changed = forceOwner(knowledge, cardId, playerId) || changed
    }
  }
  return changed
}

function propagateClauses(knowledge: MutableKnowledge): boolean {
  let changed = false
  for (const clause of knowledge.clauses) {
    const isSatisfied = clause.oneOf.some((cardId) => {
      const domain = knowledge.possibleOwners[cardId]
      return domain?.length === 1 && domain[0] === clause.ownerId
    })
    if (isSatisfied) continue

    const candidates = clause.oneOf.filter((cardId) =>
      knowledge.possibleOwners[cardId]?.includes(clause.ownerId),
    )
    if (candidates.length === 0) {
      addContradiction(knowledge, `Clause ${clause.id} cannot be satisfied by ${clause.ownerId}`)
    } else if (candidates.length === 1) {
      changed = forceOwner(knowledge, candidates[0], clause.ownerId) || changed
    }
  }
  return changed
}

function propagate(knowledge: MutableKnowledge, difficulty: AiDifficulty): void {
  const advanced = difficulty !== 'easy'
  for (let iteration = 0; iteration < 128; iteration += 1) {
    let changed = propagateCaseFileCategories(knowledge)
    if (advanced) {
      changed = propagateHandCapacities(knowledge) || changed
      changed = propagateClauses(knowledge) || changed
    }
    if (!changed) return
  }
  addContradiction(knowledge, 'Constraint propagation did not converge')
}

function freezeResult(knowledge: MutableKnowledge): AiKnowledge {
  knowledge.contradictions.sort((a, b) => a.localeCompare(b))
  return knowledge
}

/** Updates one player's private model without accepting any authoritative state. */
export function updateAiKnowledge(
  previous: AiKnowledge | undefined,
  observation: SanitizedAiObservation,
  difficulty: AiDifficulty = observation.difficulty,
): AiKnowledge {
  const knowledge = canReuseKnowledge(previous, observation)
    ? cloneKnowledge(previous)
    : freshKnowledge(observation)
  applyDirectObservations(knowledge, observation)
  propagate(knowledge, difficulty)
  return freezeResult(knowledge)
}

export function candidateOwners(knowledge: AiKnowledge, cardId: CardId): readonly PossibleOwner[] {
  return knowledge.possibleOwners[cardId] ?? []
}

export function isKnownOwner(
  knowledge: AiKnowledge,
  cardId: CardId,
  ownerId: PossibleOwner,
): boolean {
  const owners = candidateOwners(knowledge, cardId)
  return owners.length === 1 && owners[0] === ownerId
}
