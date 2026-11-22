import { createHash, randomBytes } from 'node:crypto'
import { applyAction, createGame } from '../src/engine.ts'
import { openStorage } from '../server/storage.mjs'

export const stack = ['red', 'black', 'white', 'green', 'purple', 'yellow', 'blue']

// Set up a legal mid-race position that consistently moves all seven pieces on the next roll.
// Only the temporary QA host reads this save. The browser still uses the normal live API.
export async function makeFixture(directory, code) {
  const tokens = Array.from({ length: 8 }, () => randomBytes(32).toString('base64url'))
  const seats = tokens.map((token, i) => ({
    kind: 'human',
    name: i ? 'Guest ' + i : 'Host',
    tokenHash: createHash('sha256').update(token).digest('hex'),
  }))
  const game = createGame(seats, 17)
  Object.values(game.stacks).forEach((pile) => {
    pile.length = 0
  })
  game.stacks[7] = [...stack]
  game.tiles = [2, 4, 9, 11, 13, 15].map((space, owner) => ({
    space,
    owner,
    side: owner % 2 ? 'boo' : 'cheer',
  }))
  for (let seed = 1; seed < 1000; seed++) {
    game.rng = seed
    const trial = applyAction(game, 0, { type: 'roll' })
    if (trial.events.at(-1).movement?.unit.length === 7) break
    if (seed === 999) throw new Error('Could not construct a seven-camel roll.')
  }
  const storage = await openStorage(directory)
  await storage.save({
    version: 1,
    code,
    mode: 'lan',
    revision: 10,
    humanSeats: 8,
    startingSeat: 0,
    seats,
    game,
    receipts: {},
  })
  return { code, tokens }
}

export async function makeReviewFixture(directory) {
  const code = 'CAMERA',
    tokens = Array.from({ length: 2 }, () => randomBytes(32).toString('base64url'))
  const seats = [
    ...tokens.map((token, i) => ({
      kind: 'human',
      name: i ? 'Amara' : 'You',
      character: i + 4,
      tokenHash: createHash('sha256').update(token).digest('hex'),
    })),
    { kind: 'bot', name: 'Bot 1', difficulty: 'medium', character: 2 },
    { kind: 'bot', name: 'Bot 2', difficulty: 'hard', character: 7 },
  ]
  let game
  for (let seed = 1; seed <= 300; seed++) {
    game = createGame(seats, seed)
    for (let round = 0; round < 8; round++) {
      if (game.phase !== 'playing') break
      const action =
        round % 4 === 1
          ? { type: 'ticket', color: ['green', 'blue', 'red'][Math.floor(round / 4)] }
          : { type: 'roll' }
      game = applyAction(game, game.turn, action)
    }
    if (
      game.phase === 'playing' &&
      game.turn === 0 &&
      Object.values(game.stacks).filter((p) => p.length).length >= 4
    ) {
      const probe = applyAction(game, 0, { type: 'roll' })
      const move = probe.events.findLast((e) => e.kind === 'roll')
      if (
        move.movement.unit.length >= 2 &&
        move.movement.unit.length <= 3 &&
        move.roll.value >= 2 &&
        !move.movement.crossed
      )
        break
    }
  }
  const storage = await openStorage(directory)
  await storage.save({
    version: 1,
    code,
    mode: 'lan',
    revision: 14,
    humanSeats: 2,
    startingSeat: 0,
    seats,
    game,
    receipts: {},
  })
  return { code, tokens }
}
