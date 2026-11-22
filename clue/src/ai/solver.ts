import {
  CASE_FILE_OWNER,
  type AiAccusationTriple,
  type AiDifficulty,
  type AiKnowledge,
  type CardCategory,
  type CardId,
  type PlayerId,
} from './types'

type Feasibility = 'feasible' | 'infeasible' | 'unknown'

interface SearchBudget {
  remaining: number
}

function tripleKey(triple: AiAccusationTriple): string {
  return `${triple.suspectId}|${triple.weaponId}|${triple.roomId}`
}

export function caseFileCandidates(
  knowledge: AiKnowledge,
  category: CardCategory,
): readonly CardId[] {
  return Object.keys(knowledge.cardCategories)
    .filter(
      (cardId) =>
        knowledge.cardCategories[cardId] === category &&
        knowledge.possibleOwners[cardId]?.includes(CASE_FILE_OWNER),
    )
    .sort((a, b) => a.localeCompare(b))
}

export function enumerateCandidateSolutions(knowledge: AiKnowledge): readonly AiAccusationTriple[] {
  if (knowledge.contradictions.length > 0) return []
  const suspects = caseFileCandidates(knowledge, 'suspect')
  const weapons = caseFileCandidates(knowledge, 'weapon')
  const rooms = caseFileCandidates(knowledge, 'room')
  const excluded = new Set(knowledge.incorrectAccusations.map(tripleKey))
  const result: AiAccusationTriple[] = []

  for (const suspectId of suspects) {
    for (const weaponId of weapons) {
      for (const roomId of rooms) {
        const triple = { suspectId, weaponId, roomId }
        if (!excluded.has(tripleKey(triple))) result.push(triple)
      }
    }
  }
  return result
}

function tripleMatchesCategories(knowledge: AiKnowledge, triple: AiAccusationTriple): boolean {
  return (
    knowledge.cardCategories[triple.suspectId] === 'suspect' &&
    knowledge.cardCategories[triple.weaponId] === 'weapon' &&
    knowledge.cardCategories[triple.roomId] === 'room'
  )
}

/**
 * Checks whether at least one full deal satisfies a proposed case file. A
 * bounded search returns `unknown`, never a false deduction, when exhausted.
 */
export function solutionFeasibility(
  knowledge: AiKnowledge,
  triple: AiAccusationTriple,
  budget: SearchBudget = { remaining: 50_000 },
): Feasibility {
  if (!tripleMatchesCategories(knowledge, triple)) return 'infeasible'
  if (knowledge.incorrectAccusations.some((item) => tripleKey(item) === tripleKey(triple))) {
    return 'infeasible'
  }

  const caseCards = new Set([triple.suspectId, triple.weaponId, triple.roomId])
  const capacities: Record<PlayerId, number> = { ...knowledge.playerHandSizes }
  const domains = new Map<CardId, PlayerId[]>()

  for (const cardId of Object.keys(knowledge.cardCategories).sort((a, b) => a.localeCompare(b))) {
    const owners = knowledge.possibleOwners[cardId] ?? []
    if (caseCards.has(cardId)) {
      if (!owners.includes(CASE_FILE_OWNER)) return 'infeasible'
      continue
    }

    const playerOwners = owners
      .filter((owner): owner is PlayerId => owner !== CASE_FILE_OWNER && owner in capacities)
      .sort((a, b) => a.localeCompare(b))
    if (playerOwners.length === 0) return 'infeasible'
    domains.set(cardId, playerOwners)
  }

  const assignments = new Map<CardId, PlayerId>()
  const undecided: CardId[] = []
  for (const [cardId, owners] of domains) {
    if (owners.length === 1) {
      const owner = owners[0]
      assignments.set(cardId, owner)
      capacities[owner] -= 1
      if (capacities[owner] < 0) return 'infeasible'
    } else {
      undecided.push(cardId)
    }
  }

  if (Object.values(capacities).reduce((sum, count) => sum + count, 0) !== undecided.length) {
    return 'infeasible'
  }

  const clauses = knowledge.clauses.map((clause) => ({
    ownerId: clause.ownerId,
    cardIds: clause.oneOf.filter((cardId) => !caseCards.has(cardId)),
  }))

  const clauseIsSatisfied = (ownerId: PlayerId, cardIds: readonly CardId[]): boolean =>
    cardIds.some((cardId) => assignments.get(cardId) === ownerId)

  const constraintsRemainPossible = (): boolean => {
    for (const [playerId, capacity] of Object.entries(capacities)) {
      if (capacity < 0) return false
      const available = undecided.filter(
        (cardId) => !assignments.has(cardId) && domains.get(cardId)?.includes(playerId),
      ).length
      if (available < capacity) return false
    }

    for (const clause of clauses) {
      if (clauseIsSatisfied(clause.ownerId, clause.cardIds)) continue
      const available = clause.cardIds.some(
        (cardId) =>
          !assignments.has(cardId) &&
          capacities[clause.ownerId] > 0 &&
          domains.get(cardId)?.includes(clause.ownerId),
      )
      if (!available) return false
    }
    return true
  }

  if (!constraintsRemainPossible()) return 'infeasible'

  const search = (): Feasibility => {
    budget.remaining -= 1
    if (budget.remaining < 0) return 'unknown'
    if (!constraintsRemainPossible()) return 'infeasible'

    let nextCard: CardId | undefined
    let nextOwners: PlayerId[] = []
    for (const cardId of undecided) {
      if (assignments.has(cardId)) continue
      const owners = (domains.get(cardId) ?? []).filter((owner) => capacities[owner] > 0)
      if (!nextCard || owners.length < nextOwners.length || (owners.length === nextOwners.length && cardId < nextCard)) {
        nextCard = cardId
        nextOwners = owners
      }
    }

    if (!nextCard) {
      const handsFilled = Object.values(capacities).every((capacity) => capacity === 0)
      const clausesSatisfied = clauses.every((clause) =>
        clauseIsSatisfied(clause.ownerId, clause.cardIds),
      )
      return handsFilled && clausesSatisfied ? 'feasible' : 'infeasible'
    }

    if (nextOwners.length === 0) return 'infeasible'
    let sawUnknown = false
    for (const ownerId of nextOwners) {
      assignments.set(nextCard, ownerId)
      capacities[ownerId] -= 1
      const result = search()
      capacities[ownerId] += 1
      assignments.delete(nextCard)

      if (result === 'feasible') return 'feasible'
      if (result === 'unknown') sawUnknown = true
    }
    return sawUnknown ? 'unknown' : 'infeasible'
  }

  return search()
}

/** Returns an accusation only when every alternative has been disproven. */
export function findProvableAccusation(
  knowledge: AiKnowledge,
  difficulty: AiDifficulty,
  nodeBudget = 120_000,
): AiAccusationTriple | undefined {
  const candidates = enumerateCandidateSolutions(knowledge)
  if (candidates.length === 1) return candidates[0]
  if (difficulty !== 'hard' || candidates.length === 0) return undefined

  const budget: SearchBudget = { remaining: nodeBudget }
  const feasible: AiAccusationTriple[] = []
  let sawUnknown = false

  for (const candidate of candidates) {
    const result = solutionFeasibility(knowledge, candidate, budget)
    if (result === 'feasible') feasible.push(candidate)
    else if (result === 'unknown') sawUnknown = true
    if (feasible.length > 1) return undefined
  }

  return !sawUnknown && feasible.length === 1 ? feasible[0] : undefined
}

