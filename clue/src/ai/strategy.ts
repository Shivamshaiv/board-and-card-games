import { updateAiKnowledge } from './knowledge'
import { rngForDecision, type DeterministicAiRng } from './rng'
import { findProvableAccusation } from './solver'
import {
  CASE_FILE_OWNER,
  sanitizeAiObservation,
  type AiAccusationTriple,
  type AiDeductionDecision,
  type AiDifficulty,
  type AiKnowledge,
  type AiObservationInput,
  type CardId,
  type SanitizedAiObservation,
} from './types'

export interface AiDifficultyPolicy {
  readonly useConstraintPropagation: boolean
  readonly useDealFeasibility: boolean
  readonly randomSuggestionPercent: number
  readonly reuseKnownReveal: boolean
  readonly informationGainWeight: number
}

export const AI_DIFFICULTY_POLICIES: Readonly<Record<AiDifficulty, AiDifficultyPolicy>> = {
  easy: {
    useConstraintPropagation: false,
    useDealFeasibility: false,
    randomSuggestionPercent: 30,
    reuseKnownReveal: false,
    informationGainWeight: 0.35,
  },
  normal: {
    useConstraintPropagation: true,
    useDealFeasibility: false,
    randomSuggestionPercent: 0,
    reuseKnownReveal: true,
    informationGainWeight: 1,
  },
  hard: {
    useConstraintPropagation: true,
    useDealFeasibility: true,
    randomSuggestionPercent: 0,
    reuseKnownReveal: true,
    informationGainWeight: 1.75,
  },
}

function cardInformationScore(knowledge: AiKnowledge, cardId: CardId): number {
  const domain = knowledge.possibleOwners[cardId] ?? []
  if (domain.length === 0) return -100
  const caseFileBonus = domain.includes(CASE_FILE_OWNER) ? 4 : 0
  return caseFileBonus + Math.log2(domain.length + 1)
}

function suggestionSeen(
  observation: SanitizedAiObservation,
  suspectId: CardId,
  weaponId: CardId,
  roomId: CardId,
): boolean {
  return (observation.suggestions ?? []).some(
    (suggestion) =>
      suggestion.cardIds[0] === suspectId &&
      suggestion.cardIds[1] === weaponId &&
      suggestion.cardIds[2] === roomId,
  )
}

function hardDiscriminationScore(
  observation: SanitizedAiObservation,
  knowledge: AiKnowledge,
  cardIds: readonly CardId[],
): number {
  let score = 0
  for (const player of observation.players) {
    if (player.id === observation.playerId) continue
    const possibleMatches = cardIds.filter((cardId) =>
      knowledge.possibleOwners[cardId]?.includes(player.id),
    ).length
    if (possibleMatches === 1) score += 2.5
    else if (possibleMatches === 2) score += 1.1
    else if (possibleMatches === 3) score += 0.35
  }
  return score
}

interface ScoredSuggestion {
  suspectId: CardId
  weaponId: CardId
  roomId: CardId
  score: number
}

/** Chooses only from the engine-provided legal suggestion set. */
export function chooseLegalSuggestion(
  observation: SanitizedAiObservation,
  knowledge: AiKnowledge,
  difficulty: AiDifficulty = observation.difficulty,
  rng: DeterministicAiRng = rngForDecision(
    observation.seed,
    observation.playerId,
    observation.revision,
    'suggestion',
  ),
): Omit<Extract<AiDeductionDecision, { type: 'MAKE_SUGGESTION' }>, 'type'> | undefined {
  const legal = observation.legal.suggestion
  if (!legal || legal.suspectIds.length === 0 || legal.weaponIds.length === 0) return undefined

  const policy = AI_DIFFICULTY_POLICIES[difficulty]
  const all: ScoredSuggestion[] = []
  const ownHand = new Set(observation.ownHand)

  for (const suspectId of legal.suspectIds) {
    for (const weaponId of legal.weaponIds) {
      const cardIds = [suspectId, weaponId, legal.roomId]
      const ownCardsNamed = cardIds.filter((cardId) => ownHand.has(cardId)).length
      let score = cardIds.reduce(
        (total, cardId) => total + cardInformationScore(knowledge, cardId),
        0,
      )
      if (!suggestionSeen(observation, suspectId, weaponId, legal.roomId)) score += 2

      if (difficulty === 'hard') {
        score += hardDiscriminationScore(observation, knowledge, cardIds)
        // One known anchor can isolate which of the other cards caused a response.
        if (ownCardsNamed === 1) score += 1.25
        else if (ownCardsNamed > 1) score -= 2
      } else if (difficulty === 'normal' && ownCardsNamed > 1) {
        score -= 1
      }

      all.push({ suspectId, weaponId, roomId: legal.roomId, score: score * policy.informationGainWeight })
    }
  }

  all.sort(
    (left, right) =>
      right.score - left.score ||
      left.suspectId.localeCompare(right.suspectId) ||
      left.weaponId.localeCompare(right.weaponId),
  )

  if (difficulty === 'easy' && rng.integer(100) < policy.randomSuggestionPercent) {
    const random = rng.pick(all)
    return random
      ? { suspectId: random.suspectId, weaponId: random.weaponId, roomId: random.roomId }
      : undefined
  }

  const bestScore = all[0]?.score
  if (bestScore === undefined) return undefined
  const tied = all.filter((candidate) => Math.abs(candidate.score - bestScore) < 1e-9)
  const selected = rng.pick(tied) ?? tied[0]
  return {
    suspectId: selected.suspectId,
    weaponId: selected.weaponId,
    roomId: selected.roomId,
  }
}

/** Chooses exactly one card from the authoritative legal reveal choices. */
export function chooseLegalReveal(
  observation: SanitizedAiObservation,
  knowledge: AiKnowledge,
  difficulty: AiDifficulty = observation.difficulty,
  rng: DeterministicAiRng = rngForDecision(
    observation.seed,
    observation.playerId,
    observation.revision,
    'reveal',
  ),
): CardId | undefined {
  const ownHand = new Set(observation.ownHand)
  const legal = [...new Set(observation.legal.revealCardIds ?? [])]
    .filter((cardId) => ownHand.has(cardId))
    .sort((a, b) => a.localeCompare(b))
  if (legal.length === 0) return undefined
  if (difficulty === 'easy') return rng.pick(legal)

  const recipient = observation.pendingSuggesterId
  const scored = legal.map((cardId) => {
    const shownToRecipient = knowledge.revealsGiven.filter(
      (reveal) => reveal.cardId === cardId && reveal.toPlayerId === recipient,
    ).length
    const shownToAnyone = knowledge.revealsGiven.filter((reveal) => reveal.cardId === cardId).length
    return {
      cardId,
      score: shownToRecipient * 1_000 + (difficulty === 'hard' ? shownToAnyone * 10 : 0),
    }
  })
  scored.sort((left, right) => right.score - left.score || left.cardId.localeCompare(right.cardId))
  return scored[0]?.cardId
}

function accusationIsLegal(
  observation: SanitizedAiObservation,
  accusation: AiAccusationTriple,
): boolean {
  const legal = observation.legal.accusation
  return Boolean(
    legal?.suspectIds.includes(accusation.suspectId) &&
      legal.weaponIds.includes(accusation.weaponId) &&
      legal.roomIds.includes(accusation.roomId),
  )
}

/** Accuses only when the private model proves one legal solution. */
export function chooseLegalAccusation(
  observation: SanitizedAiObservation,
  knowledge: AiKnowledge,
  difficulty: AiDifficulty = observation.difficulty,
): AiAccusationTriple | undefined {
  if (!observation.legal.accusation || knowledge.contradictions.length > 0) return undefined
  const accusation = findProvableAccusation(knowledge, difficulty)
  return accusation && accusationIsLegal(observation, accusation) ? accusation : undefined
}

export interface AiDeductionResult {
  readonly observation: SanitizedAiObservation
  readonly knowledge: AiKnowledge
  readonly decision?: AiDeductionDecision
}

/**
 * Integration entrypoint. Forced reveals take precedence, followed by a proven
 * accusation and then a legal suggestion. Movement remains the game core's job.
 */
export function decideDeductionAction(
  input: AiObservationInput,
  previousKnowledge?: AiKnowledge,
): AiDeductionResult {
  const observation = sanitizeAiObservation(input)
  const knowledge = updateAiKnowledge(previousKnowledge, observation)

  const revealed = chooseLegalReveal(observation, knowledge)
  if (revealed) {
    return { observation, knowledge, decision: { type: 'REVEAL_CARD', cardId: revealed } }
  }

  const accusation = chooseLegalAccusation(observation, knowledge)
  if (accusation) {
    return { observation, knowledge, decision: { type: 'MAKE_ACCUSATION', ...accusation } }
  }

  const suggestion = chooseLegalSuggestion(observation, knowledge)
  if (suggestion) {
    return { observation, knowledge, decision: { type: 'MAKE_SUGGESTION', ...suggestion } }
  }

  return { observation, knowledge }
}

