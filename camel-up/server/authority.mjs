import { createHash, randomBytes, randomInt } from 'node:crypto'
import { Worker } from 'node:worker_threads'
import { applyAction, createGame, legalActions, projectGame } from '../src/engine.ts'
import { openStorage } from './storage.mjs'
import { recordTurn, playbackFor } from './playback.mjs'
import { ROLL_PRESENTATION_MS } from '../src/board/roll-motion.ts'

const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const difficulties = new Set(['easy', 'medium', 'hard'])
const characters = Array.from({ length: 8 }, (_, i) => i)
const tokenDigest = (token) => createHash('sha256').update(token).digest('hex')
const independentSeed = () => randomBytes(4).readUInt32BE()

export function reject(status, message) {
  throw Object.assign(new Error(message), { status })
}

function playerName(value) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 32) {
    reject(400, 'Use a player name between 1 and 32 characters.')
  }
  return value.trim()
}

function configuration(mode, input) {
  const { bots, humanSeats, startingSeat = 0 } = input
  if (!Array.isArray(bots) || !bots.every((difficulty) => difficulties.has(difficulty))) {
    reject(400, 'Choose Easy, Medium, or Hard for each bot.')
  }
  const total = humanSeats + bots.length
  if (
    !Number.isInteger(humanSeats) ||
    humanSeats < 1 ||
    total < 3 ||
    total > 8 ||
    (mode === 'solo' && humanSeats !== 1)
  ) {
    reject(400, 'Choose 3–8 seats in total, including one human for solo play.')
  }
  if (!Number.isInteger(startingSeat) || startingSeat < 0 || startingSeat >= total) {
    reject(400, 'Choose a starting player at this table.')
  }
  return { bots: [...bots], humanSeats, startingSeat }
}

function configureSeats(humans, config) {
  if (humans.slice(config.humanSeats).some((seat) => seat.tokenHash)) {
    reject(409, 'An occupied seat must stay at the table.')
  }
  const seats = Array.from(
    { length: config.humanSeats },
    (_, i) => humans[i] ?? { kind: 'human', name: null, tokenHash: null },
  )
  for (const [i, difficulty] of config.bots.entries()) {
    seats.push({ kind: 'bot', name: 'Bot ' + (i + 1), difficulty })
  }
  return seats
}

function assignedCharacters(room) {
  if (room.game) return room.game.players.map((player) => player.character)
  // Claimed human portraits always take precedence over the provisional lobby portraits.
  const result = room.seats.map((seat) => (seat.tokenHash ? seat.character : undefined))
  const remaining = characters.filter((c) => !result.includes(c))
  return result.map((character) => character ?? remaining.shift())
}

function availableCharacters(room) {
  if (room.mode !== 'lan' || room.game || !room.seats.some((s) => s.kind === 'human' && !s.tokenHash))
    return []
  const assigned = assignedCharacters(room)
  const reserved = room.seats.flatMap((seat, index) => (seat.tokenHash ? [assigned[index]] : []))
  return characters.filter((c) => !reserved.includes(c))
}

function chooseCharacter(wanted, available) {
  if (wanted === undefined) return available[0]
  if (!characters.includes(wanted)) reject(400, 'Choose one of the eight characters.')
  if (!available.includes(wanted))
    reject(409, 'Another player has claimed this character. Pick an available portrait.')
  return wanted
}

function newCode(rooms) {
  let code
  do {
    code = Array.from({ length: 6 }, () => alphabet[randomInt(alphabet.length)]).join('')
  } while (rooms.has(code))
  return code
}

function roomStatus(room) {
  if (!room.game) return 'lobby'
  return room.game.phase === 'finished' ? 'finished' : 'playing'
}

export async function createAuthority({ directory, joinUrls, botDelay }) {
  const storage = await openStorage(directory)
  const lastSeen = new Map()
  const runningBots = new Map()
  let closed = false
  let queue = Promise.resolve()

  // Every accepted turn is saved and published as one operation.
  function serialize(work) {
    const result = queue.then(work)
    queue = result.catch(() => {})
    return result
  }
  function get(code) {
    return storage.rooms.get(code) ?? reject(404, 'This room was not found on this host.')
  }
  function see(code, seatId) {
    lastSeen.set(code + ':' + seatId, Date.now())
  }
  function connected(room, seat, id) {
    return seat.kind === 'bot' || Date.now() - (lastSeen.get(room.code + ':' + id) ?? 0) < 12_000
  }
  function authenticate(room, token) {
    if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) reject(401, 'A seat token is required.')
    const hash = tokenDigest(token)
    const index = room.seats.findIndex((seat) => seat.tokenHash === hash)
    if (index < 0) reject(403, 'This seat token does not belong to this room.')
    see(room.code, index)
    return index
  }
  function snapshot(room, seatId, after = null) {
    const portraits = assignedCharacters(room)
    return {
      code: room.code,
      mode: room.mode,
      status: roomStatus(room),
      revision: room.revision,
      host: seatId === 0,
      seatId,
      humanSeats: room.humanSeats,
      startingSeat: room.startingSeat,
      joinUrls: room.mode === 'lan' ? joinUrls(room.code) : [],
      seats: room.seats.map((seat, id) => ({
        id,
        name: seat.name,
        kind: seat.kind,
        difficulty: seat.difficulty,
        character: portraits[id],
        connected: connected(room, seat, id),
      })),
      view: room.game ? projectGame(room.game, seatId) : null,
      ...(room.game && { playback: playbackFor(room, seatId, after) }),
    }
  }
  async function commit(room) {
    room.revision++
    await storage.save(room)
    scheduleBot(room)
  }
  function scheduleBot(room) {
    if (closed || roomStatus(room) !== 'playing' || runningBots.has(room.code)) return
    const id = room.game.turn
    if (room.seats[id].kind !== 'bot') return
    const entry = { timer: null, worker: null }
    runningBots.set(room.code, entry)
    entry.timer = setTimeout(
      () => {
        entry.timer = null
        const view = projectGame(room.game, id)
        const worker = new Worker(new URL('./bot-worker.mjs', import.meta.url), {
          workerData: { view, difficulty: room.seats[id].difficulty, seed: independentSeed() },
        })
        entry.worker = worker
        let settled = false
        function done(proposed) {
          if (settled || closed) return
          settled = true
          clearTimeout(entry.timer)
          void worker.terminate()
          void serialize(async () => {
            runningBots.delete(room.code)
            const current = get(room.code)
            if (current.revision !== room.revision) return scheduleBot(current)
            const next = { ...current }
            let chosen = proposed
            try {
              next.game = applyAction(current.game, id, proposed)
            } catch {
              const legal = legalActions(view)
              const backup = legal.find((action) => action.type === 'roll') ?? legal[0]
              next.game = applyAction(current.game, id, backup)
              chosen = backup
            }
            recordTurn(current, next, id, chosen)
            await commit(next)
          }).catch((error) => {
            console.error('Could not save bot turn', error.message)
            if (!closed) scheduleBot(get(room.code))
          })
        }
        worker.once('message', done)
        worker.once('error', () => done(null))
        worker.once('exit', () => done(null))
        entry.timer = setTimeout(() => done(null), 12_000)
      },
      botDelay ??
        (room.timeline?.frames.at(-1)?.action.type === 'roll' ? ROLL_PRESENTATION_MS + 100 : 1150),
    )
    entry.timer.unref()
  }
  for (const room of storage.rooms.values()) scheduleBot(room)

  return {
    get,
    characters(code) {
      return { available: availableCharacters(get(code)) }
    },
    read(code, token, previousTag, after = null) {
      const room = get(code)
      const id = authenticate(room, token)
      const presence = room.seats.map((seat, index) => Number(connected(room, seat, index))).join('')
      const tag = '"' + [code, room.revision, id, presence].join('-') + '"'
      return { tag, value: tag === previousTag ? null : snapshot(room, id, after) }
    },
    create(input) {
      return serialize(async () => {
        const { mode } = input
        if (mode !== 'solo' && mode !== 'lan') reject(400, 'Choose Solo or LAN.')
        const config = configuration(mode, input)
        const code = newCode(storage.rooms)
        const token = randomBytes(32).toString('base64url')
        const host = {
          kind: 'human',
          name: playerName(input.name),
          tokenHash: tokenDigest(token),
          character: chooseCharacter(input.character, characters),
        }
        const room = {
          version: 1,
          code,
          mode,
          revision: 0,
          humanSeats: config.humanSeats,
          startingSeat: config.startingSeat,
          seats: configureSeats([host], config),
          game: null,
          receipts: {},
        }
        await commit(room)
        see(code, 0)
        return { code, token, seatId: 0 }
      })
    },
    join(code, input) {
      return serialize(async () => {
        const current = get(code)
        const room = { ...current, seats: [...current.seats] }
        if (room.mode !== 'lan') reject(409, 'This room is closed to new players.')
        if (
          input.joinKey !== undefined &&
          (typeof input.joinKey !== 'string' || !/^[a-f\d]{32}$/i.test(input.joinKey))
        ) {
          reject(400, 'Invalid join recovery key.')
        }
        // The browser retains the random key before posting. A lost response can be retried
        // without losing the seat or storing a reusable credential in the host save.
        const token = input.joinKey
          ? createHash('sha256')
              .update('camel-up/join/' + code + '/' + input.joinKey)
              .digest('base64url')
          : randomBytes(32).toString('base64url')
        const hash = tokenDigest(token)
        const previous = room.seats.findIndex((seat) => seat.tokenHash === hash)
        if (previous !== -1) {
          see(code, previous)
          return { code, token, seatId: previous }
        }
        if (room.game) reject(409, 'This room is closed to new players.')
        const seatId = room.seats.findIndex((seat) => seat.kind === 'human' && !seat.tokenHash)
        if (seatId < 0) reject(409, 'All human seats are taken.')
        room.seats[seatId] = {
          kind: 'human',
          name: playerName(input.name),
          tokenHash: hash,
          character: chooseCharacter(input.character, availableCharacters(room)),
        }
        await commit(room)
        see(code, seatId)
        return { code, token, seatId }
      })
    },
    change(code, token, operation, input) {
      return serialize(async () => {
        const current = get(code)
        const id = authenticate(current, token)
        const next = { ...current }
        if (operation !== 'actions' && id !== 0) reject(403, 'Only the host can change this table.')
        switch (operation) {
          case 'config': {
            if (current.game) reject(409, 'The race has already started.')
            const config = configuration(current.mode, input)
            next.seats = configureSeats(
              current.seats.filter((seat) => seat.kind === 'human'),
              config,
            )
            next.humanSeats = config.humanSeats
            next.startingSeat = config.startingSeat
            break
          }
          case 'start': {
            if (current.game) return snapshot(current, id)
            if (current.seats.some((seat) => !seat.name))
              reject(409, 'Wait for all human seats to join.')
            const portraits = assignedCharacters(current)
            next.game = createGame(
              current.seats.map(({ name, difficulty }, index) => ({
                name,
                character: portraits[index],
                ...(difficulty ? { difficulty } : {}),
              })),
              independentSeed(),
              current.startingSeat,
            )
            break
          }
          case 'actions': {
            const { requestId, revision, action } = input
            if (
              typeof requestId !== 'string' ||
              !/^[\w-]{1,128}$/.test(requestId) ||
              !Number.isSafeInteger(revision) ||
              !action ||
              typeof action !== 'object'
            ) {
              reject(400, 'A move requires an action, table revision, and request ID.')
            }
            const key = id + ':' + requestId
            const fingerprint = tokenDigest(JSON.stringify([revision, action]))
            if (Object.hasOwn(current.receipts, key)) {
              if (current.receipts[key] !== fingerprint)
                reject(409, 'Request ID was already used for a different move.')
              return snapshot(current, id, revision)
            }
            if (current.revision !== revision)
              reject(409, 'The table changed. Refresh the turn and try again.')
            if (roomStatus(current) !== 'playing' || current.game.turn !== id)
              reject(409, 'It is not your turn.')
            try {
              next.game = applyAction(current.game, id, action)
            } catch {
              reject(422, 'This move is unavailable.')
            }
            next.receipts = { ...current.receipts, [key]: fingerprint }
            recordTurn(current, next, id, action)
            break
          }
          default:
            reject(404, 'Unknown operation.')
        }
        await commit(next)
        return snapshot(next, id, operation === 'actions' ? input.revision : null)
      })
    },
    async close() {
      closed = true
      for (const bot of runningBots.values()) {
        clearTimeout(bot.timer)
        if (bot.worker) await bot.worker.terminate()
      }
      await queue
    },
  }
}
