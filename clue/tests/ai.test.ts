import { describe, expect, it } from 'vitest'
import {
  AI_DIFFICULTY_POLICIES,
  CASE_FILE_OWNER,
  chooseLegalAccusation,
  chooseLegalReveal,
  chooseLegalSuggestion,
  createAiTurnClient,
  createAiTurnWorkerInput,
  decideGameViewAction,
  decideDeductionAction,
  observationFromGameView,
  sanitizeAiObservation,
  toGameDeductionCommand,
  updateAiKnowledge,
  type AiWorkerLike,
  type AiObservationInput,
} from '../src/ai/index'
import {
  ROOMS,
  SUSPECTS,
  WEAPONS,
  createGameSession,
  type AuthoritativeGameState,
} from '../src/game/index'
import { AutosaveController, createLocalSaveRepository } from '../src/persistence/index'
import { restoreSavedGameSession, snapshotGameSession } from '../src/persistence/index'

const cards = [
  { id: 's1', category: 'suspect' as const },
  { id: 's2', category: 'suspect' as const },
  { id: 'w1', category: 'weapon' as const },
  { id: 'w2', category: 'weapon' as const },
  { id: 'r1', category: 'room' as const },
  { id: 'r2', category: 'room' as const },
]

function baseObservation(overrides: Partial<AiObservationInput> = {}): AiObservationInput {
  return {
    playerId: 'ai',
    difficulty: 'hard',
    seed: 'deterministic-test',
    revision: 7,
    cards,
    players: [
      { id: 'ai', handSize: 1 },
      { id: 'a', handSize: 1 },
      { id: 'b', handSize: 1 },
    ],
    ownHand: ['s1'],
    privateReveals: [],
    revealsGiven: [],
    suggestions: [],
    incorrectAccusations: [],
    legal: {},
    ...overrides,
  }
}

describe('sanitized AI observations', () => {
  it('selects allowed fields and drops hidden state supplied by a larger adapter object', () => {
    const unsafe = {
      ...baseObservation({
        suggestions: [
          {
            id: 'private-to-someone-else',
            suggesterId: 'a',
            cardIds: ['s2', 'w1', 'r1'],
            unableToDisprove: [],
            disproverId: 'b',
            revealedCardId: 'w1',
          },
        ],
      }),
      solution: { suspectId: 's2', weaponId: 'w2', roomId: 'r2' },
      opponentHands: { a: ['r1'] },
    }
    const observation = sanitizeAiObservation(unsafe)

    expect('solution' in observation).toBe(false)
    expect('opponentHands' in observation).toBe(false)
    expect(JSON.stringify(observation)).not.toContain('opponentHands')
    expect(observation.suggestions?.[0].revealedCardId).toBeUndefined()
  })

  it('adapts only a redacted GameSession view and visible event stream', () => {
    const session = createGameSession({
      seed: 'view-boundary',
      startingPlayerId: 'ai',
      players: [
        { id: 'ai', name: 'AI', suspectId: SUSPECTS[0].suspectId, kind: 'ai' },
        { id: 'human', name: 'Human', suspectId: SUSPECTS[1].suspectId, kind: 'human' },
        { id: 'ai-2', name: 'AI 2', suspectId: SUSPECTS[2].suspectId, kind: 'ai' },
      ],
    })

    const input = observationFromGameView(
      session.viewFor('ai'),
      session.eventsFor('ai'),
      'hard',
    )
    const observation = sanitizeAiObservation(input)

    expect(observation.cards).toHaveLength(21)
    expect(observation.ownHand).toEqual(session.viewFor('ai').ownHand.sort())
    expect('caseFile' in observation).toBe(false)
    expect(observation.players.every((player) => !('hand' in player))).toBe(true)
    expect(
      decideGameViewAction(session.viewFor('ai'), session.eventsFor('ai'), 'hard').command,
    ).toEqual({ type: 'ROLL_DICE', playerId: 'ai' })
  })

  it('produces identical reasoning when accidental hidden solutions differ', () => {
    const visible = baseObservation({
      difficulty: 'hard',
      legal: {
        suggestion: { suspectIds: ['s1', 's2'], weaponIds: ['w1', 'w2'], roomId: 'r1' },
      },
    })
    const firstUnsafe = {
      ...visible,
      solution: { suspectId: 's1', weaponId: 'w1', roomId: 'r1' },
      opponentHands: { a: ['s2'], b: ['w2'] },
    }
    const secondUnsafe = {
      ...visible,
      solution: { suspectId: 's2', weaponId: 'w2', roomId: 'r2' },
      opponentHands: { a: ['w2'], b: ['s2'] },
    }
    const first = decideDeductionAction(firstUnsafe)
    const second = decideDeductionAction(secondUnsafe)

    expect(second.observation).toEqual(first.observation)
    expect(second.knowledge).toEqual(first.knowledge)
    expect(second.decision).toEqual(first.decision)
  })
})

describe('AI Web Worker boundary', () => {
  function workerFixture() {
    const session = createGameSession({
      seed: 'worker-boundary',
      startingPlayerId: 'ai',
      players: [
        { id: 'ai', name: 'AI', suspectId: SUSPECTS[0].suspectId, kind: 'ai' },
        { id: 'human', name: 'Human', suspectId: SUSPECTS[1].suspectId, kind: 'human' },
        { id: 'ai-2', name: 'AI 2', suspectId: SUSPECTS[2].suspectId, kind: 'ai' },
      ],
    })
    return {
      session,
      input: {
        view: session.viewFor('ai'),
        visibleEvents: session.eventsFor('ai'),
        difficulty: 'hard' as const,
      },
    }
  }

  it('strips accidental case-file data before crossing the worker boundary', () => {
    const { session, input } = workerFixture()
    const caseFile = session.exportState().caseFile
    const safe = createAiTurnWorkerInput({
      ...input,
      view: { ...input.view, caseFile },
      visibleEvents: [
        ...input.visibleEvents,
        {
          sequence: 999,
          type: 'GAME_ENDED',
          payload: {
            outcome: 'won',
            caseFile,
            seed: session.exportState().seed,
            rngState: session.exportState().rngState,
          },
        },
      ],
    })

    expect(safe.view.caseFile).toBeUndefined()
    expect(safe.visibleEvents.at(-1)?.payload.caseFile).toBeUndefined()
    expect(safe.visibleEvents.at(-1)?.payload.seed).toBeUndefined()
    expect(safe.visibleEvents.at(-1)?.payload.rngState).toBeUndefined()
  })

  it('uses the identical deterministic local path when Worker is unavailable', async () => {
    const { input } = workerFixture()
    const client = createAiTurnClient({ workerFactory: () => null })
    await expect(client.decide(input)).resolves.toEqual(
      decideGameViewAction(input.view, input.visibleEvents, input.difficulty),
    )
    client.dispose()
  })

  it('falls back safely if worker posting fails', async () => {
    let terminated = false
    let failures = 0
    const failingWorker: AiWorkerLike = {
      postMessage() {
        throw new Error('worker unavailable')
      },
      terminate() {
        terminated = true
      },
      addEventListener() {},
      removeEventListener() {},
    }
    const { input } = workerFixture()
    const expected = decideGameViewAction(input.view, input.visibleEvents, input.difficulty)
    const client = createAiTurnClient({
      workerFactory: () => failingWorker,
      onWorkerFailure: () => {
        failures += 1
      },
    })

    await expect(client.decide(input)).resolves.toEqual(expected)
    expect(terminated).toBe(true)
    expect(failures).toBe(1)
    client.dispose()
  })

  it('honors cancellation while using the deterministic local fallback', async () => {
    const { input } = workerFixture()
    const controller = new AbortController()
    const client = createAiTurnClient({ workerFactory: () => null })

    const pending = client.decide(input, { signal: controller.signal })
    controller.abort()

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    client.dispose()
  })
})

describe('private deduction constraints', () => {
  it('records failed-responder exclusions', () => {
    const observation = sanitizeAiObservation(
      baseObservation({
        suggestions: [
          {
            id: 'suggestion-1',
            suggesterId: 'ai',
            cardIds: ['s2', 'w1', 'r1'],
            unableToDisprove: ['a'],
          },
        ],
      }),
    )
    const knowledge = updateAiKnowledge(undefined, observation)

    expect(knowledge.possibleOwners.s2).not.toContain('a')
    expect(knowledge.possibleOwners.w1).not.toContain('a')
    expect(knowledge.possibleOwners.r1).not.toContain('a')
  })

  it('propagates a responder clause, exact hand sizes, and category constraints', () => {
    const observation = sanitizeAiObservation(
      baseObservation({
        privateReveals: [{ cardId: 'r1', ownerId: 'a' }],
        suggestions: [
          {
            id: 'suggestion-2',
            suggesterId: 'ai',
            cardIds: ['s2', 'w1', 'r1'],
            unableToDisprove: [],
            disproverId: 'b',
          },
        ],
        legal: {
          accusation: {
            suspectIds: ['s1', 's2'],
            weaponIds: ['w1', 'w2'],
            roomIds: ['r1', 'r2'],
          },
        },
      }),
    )
    const knowledge = updateAiKnowledge(undefined, observation)

    expect(knowledge.contradictions).toEqual([])
    expect(knowledge.possibleOwners.w1).toEqual(['b'])
    expect(knowledge.possibleOwners.s2).toEqual([CASE_FILE_OWNER])
    expect(knowledge.possibleOwners.w2).toEqual([CASE_FILE_OWNER])
    expect(knowledge.possibleOwners.r2).toEqual([CASE_FILE_OWNER])
    expect(chooseLegalAccusation(observation, knowledge)).toEqual({
      suspectId: 's2',
      weaponId: 'w2',
      roomId: 'r2',
    })
  })
})

describe('legal deterministic policies', () => {
  it('makes the same legal suggestion from the same observation', () => {
    const observation = sanitizeAiObservation(
      baseObservation({
        difficulty: 'normal',
        legal: {
          suggestion: { suspectIds: ['s1', 's2'], weaponIds: ['w1', 'w2'], roomId: 'r1' },
        },
      }),
    )
    const knowledge = updateAiKnowledge(undefined, observation)

    const first = chooseLegalSuggestion(observation, knowledge)
    const second = chooseLegalSuggestion(observation, knowledge)
    expect(second).toEqual(first)
    expect(observation.legal.suggestion?.suspectIds).toContain(first?.suspectId)
    expect(observation.legal.suggestion?.weaponIds).toContain(first?.weaponId)
    expect(first?.roomId).toBe('r1')
  })

  it('reuses a card already shown to the same suggester on stronger difficulties', () => {
    const observation = sanitizeAiObservation(
      baseObservation({
        difficulty: 'hard',
        players: [
          { id: 'ai', handSize: 2 },
          { id: 'a', handSize: 1 },
          { id: 'b', handSize: 0 },
        ],
        ownHand: ['s1', 'w1'],
        pendingSuggesterId: 'a',
        revealsGiven: [{ cardId: 's1', toPlayerId: 'a' }],
        legal: { revealCardIds: ['s1', 'w1'] },
      }),
    )
    const knowledge = updateAiKnowledge(undefined, observation)

    expect(chooseLegalReveal(observation, knowledge)).toBe('s1')
  })

  it('exposes three distinct difficulty policies and returns only legal deduction actions', () => {
    expect(AI_DIFFICULTY_POLICIES.easy).not.toEqual(AI_DIFFICULTY_POLICIES.normal)
    expect(AI_DIFFICULTY_POLICIES.normal).not.toEqual(AI_DIFFICULTY_POLICIES.hard)

    const result = decideDeductionAction(
      baseObservation({
        difficulty: 'easy',
        legal: {
          suggestion: { suspectIds: ['s2'], weaponIds: ['w2'], roomId: 'r2' },
        },
      }),
    )
    expect(result.decision).toEqual({
      type: 'MAKE_SUGGESTION',
      suspectId: 's2',
      weaponId: 'w2',
      roomId: 'r2',
    })
    expect(
      toGameDeductionCommand('ai', {
        type: 'MAKE_SUGGESTION',
        suspectId: SUSPECTS[0].id,
        weaponId: WEAPONS[0].id,
        roomId: ROOMS[0].id,
      }),
    ).toEqual({
      type: 'MAKE_SUGGESTION',
      playerId: 'ai',
      suspectId: SUSPECTS[0].suspectId,
      weaponId: WEAPONS[0].weaponId,
    })
  })

  it('produces legal commands across a multi-AI game without authoritative access', () => {
    const playerIds = ['ai-1', 'ai-2', 'ai-3']
    const run = () => {
      const session = createGameSession({
        seed: 'ai-loop',
        players: [
          { id: 'ai-1', name: 'AI 1', suspectId: SUSPECTS[0].suspectId, kind: 'ai' },
          { id: 'ai-2', name: 'AI 2', suspectId: SUSPECTS[1].suspectId, kind: 'ai' },
          { id: 'ai-3', name: 'AI 3', suspectId: SUSPECTS[2].suspectId, kind: 'ai' },
        ],
      })
      const knowledge = new Map<string, ReturnType<typeof updateAiKnowledge>>()
      const transcript: unknown[] = []

      for (let dispatched = 0; dispatched < 120; dispatched += 1) {
        const views = playerIds.map((playerId) => session.viewFor(playerId))
        if (views[0].status !== 'playing') break
        const actor =
          views.find((view) => view.legalActions.includes('CHOOSE_REVEAL')) ??
          views.find((view) => view.viewerId === view.activePlayerId)
        expect(actor).toBeDefined()
        const result = decideGameViewAction(
          actor!,
          session.eventsFor(actor!.viewerId),
          'hard',
          knowledge.get(actor!.viewerId),
        )
        knowledge.set(actor!.viewerId, result.knowledge)
        expect(result.command).toBeDefined()
        expect(actor!.legalActions).toContain(result.command!.type)
        transcript.push(result.command)
        expect(() => session.dispatch(result.command!)).not.toThrow()
      }
      return transcript
    }

    const first = run()
    expect(first.length).toBeGreaterThan(20)
    expect(run()).toEqual(first)
  })
})

describe('local persistence fallback', () => {
  it('autosaves only the latest versioned game/notebook/settings snapshot', async () => {
    const repository = createLocalSaveRepository<
      { turn: number },
      { marks: string[] },
      { animationSpeed: string }
    >({ now: () => new Date('2026-08-19T12:00:00.000Z') })
    await repository.clear()
    const autosave = new AutosaveController(repository, { delayMs: 60_000 })

    autosave.schedule({
      revision: 1,
      game: { turn: 1 },
      notebook: { marks: ['s1'] },
      settings: { animationSpeed: 'normal' },
    })
    autosave.schedule({
      revision: 2,
      game: { turn: 2 },
      notebook: { marks: ['s1', 'w2'] },
      settings: { animationSpeed: 'fast' },
    })
    await autosave.flush()

    const saved = await repository.load()
    expect(saved).toMatchObject({
      schemaVersion: 1,
      slot: 'active',
      revision: 2,
      savedAt: '2026-08-19T12:00:00.000Z',
      game: { turn: 2 },
      notebook: { marks: ['s1', 'w2'] },
      settings: { animationSpeed: 'fast' },
    })
    expect(repository.backend).toBe('memory')
    await repository.clear()
  })

  it('round-trips the privileged game snapshot without exposing it to AI input', async () => {
    const session = createGameSession({
      seed: 'resume-test',
      players: [
        { id: 'ai', name: 'AI', suspectId: SUSPECTS[0].suspectId, kind: 'ai' },
        { id: 'human', name: 'Human', suspectId: SUSPECTS[1].suspectId, kind: 'human' },
        { id: 'ai-2', name: 'AI 2', suspectId: SUSPECTS[2].suspectId, kind: 'ai' },
      ],
    })
    const repository = createLocalSaveRepository<
      AuthoritativeGameState,
      { marks: string[] },
      { quality: string }
    >()
    await repository.clear()
    await repository.save(
      snapshotGameSession(session, { marks: [SUSPECTS[0].id] }, { quality: 'high' }),
    )

    const loaded = await repository.load()
    const restored = restoreSavedGameSession(loaded)
    expect(restored?.viewFor('ai')).toEqual(session.viewFor('ai'))
    expect(restored?.viewFor('ai').caseFile).toBeUndefined()
    await repository.clear()
  })
})
