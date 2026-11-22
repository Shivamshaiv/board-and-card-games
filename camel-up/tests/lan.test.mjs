import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { test } from 'node:test'
import { createServer } from 'node:http'
import { isRunningHost, startHost } from '../server/index.mjs'
import { legalActions } from '../src/engine.ts'
import { HISTORY_LIMIT } from '../server/playback.mjs'
import { replaceSnapshot } from '../server/storage.mjs'
import { finishPresentation, liveState, receivePlayback } from '../src/playback-state.ts'

async function table(t) {
  const directory = await mkdtemp(join(tmpdir(), 'camel-up-host-'))
  let host = await startHost({ port: 0, host: '127.0.0.1', directory, botDelay: 5 })
  t.after(async () => {
    await host.close()
    await rm(directory, { recursive: true, force: true })
  })
  return {
    directory,
    async restart() {
      const oldPort = host.port
      await host.close()
      host = await startHost({ port: oldPort, host: '127.0.0.1', directory, botDelay: 5 })
    },
    async call(path, token, body, headers = {}) {
      const response = await fetch('http://127.0.0.1:' + host.port + '/api/' + path, {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          ...(token && { authorization: 'Bearer ' + token }),
          'Content-Type': 'application/json',
          ...headers,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
      const result = response.headers.get('content-type')?.includes('application/json')
        ? await response.json()
        : await response.text()
      return { status: response.status, result, tag: response.headers.get('etag') }
    },
  }
}

test('Windows sharing retries preserve the identical atomic replacement and surface unrelated failures', async () => {
  const attempts = []
  await replaceSnapshot(
    'pending.tmp',
    'room.json',
    async (...paths) => {
      attempts.push(paths)
      if (attempts.length < 3) throw Object.assign(new Error('Brief read lock'), { code: 'EPERM' })
    },
    'win32',
  )
  assert.deepEqual(
    attempts,
    Array.from({ length: 3 }, () => ['pending.tmp', 'room.json']),
  )
  let calls = 0
  const unrelated = Object.assign(new Error('Destination is full'), { code: 'ENOSPC' })
  await assert.rejects(
    replaceSnapshot(
      'pending.tmp',
      'room.json',
      async () => {
        calls++
        throw unrelated
      },
      'win32',
    ),
    (e) => e === unrelated,
  )
  assert.equal(calls, 1)
  calls = 0
  await assert.rejects(
    replaceSnapshot(
      'pending.tmp',
      'room.json',
      async () => {
        calls++
        throw Object.assign(new Error('Persistent lock'), { code: 'EBUSY' })
      },
      'win32',
    ),
    /Persistent lock/,
  )
  assert.equal(calls, 7)
})

test('missed turns replay once, in order, with the correct private state for each tab, across a host restart', async (t) => {
  const api = await table(t)
  const host = (
    await api.call('rooms', null, { mode: 'lan', humanSeats: 3, bots: [], name: 'Host' })
  ).result
  const room = 'rooms/' + host.code,
    tokens = [host.token]
  for (const name of ['Maya', 'Leo'])
    tokens.push((await api.call(room + '/join', null, { name })).result.token)
  const initial = (await api.call(room + '/start', host.token, {})).result
  const guestStart = (await api.call(room, tokens[1])).result
  const snapshots = [initial],
    guestSnapshots = [guestStart]
  for (const action of [
    { type: 'finish', pile: 'loser', color: 'purple' },
    { type: 'ticket', color: 'blue' },
    { type: 'roll' },
  ]) {
    const current = snapshots.at(-1)
    const input = { action, revision: current.revision, requestId: 'show-' + current.revision }
    const own = (await api.call(room + '/actions', tokens[current.view.turn], input)).result
    assert.equal(own.playback.frames.length, 1)
    assert.equal(
      (await api.call(room + '/actions', tokens[current.view.turn], input)).result.revision,
      own.revision,
    )
    snapshots.push((await api.call(room, tokens[0])).result)
    guestSnapshots.push((await api.call(room, tokens[1])).result)
  }
  await api.restart()
  const from = room + '?after=' + initial.revision
  const hostBack = (await api.call(from, tokens[0])).result,
    guestBack = (await api.call(from, tokens[1])).result
  for (const packet of [hostBack, guestBack]) {
    const frames = [
      packet.view,
      packet.playback.base.state.board,
      ...packet.playback.frames.map((f) => f.state.board),
    ]
    for (const frame of frames)
      frame.players.forEach((p, index) => {
        if (index === packet.seatId) assert.equal(typeof p.coins, 'number')
        else {
          assert.equal(p.coins, null)
          assert.ok(Array.isArray(p.coinStacks))
        }
      })
  }
  assert.deepEqual(
    hostBack.playback.frames.map((f) => f.actor),
    [0, 1, 2],
  )
  assert.deepEqual(
    hostBack.playback.frames.map((f) => f.action.type),
    ['finish', 'ticket', 'roll'],
  )
  assert.equal(hostBack.playback.frames[0].action.color, 'purple')
  assert.equal(guestBack.playback.frames[0].action.color, undefined)
  assert.deepEqual(guestBack.playback.frames[0].state.board.ownFinishBets, [])
  assert.equal(hostBack.playback.frames[1].action.value, 5)
  assert.ok(guestBack.playback.frames[2].events[0].movement)
  for (const { packet, history } of [
    { packet: hostBack, history: snapshots },
    { packet: guestBack, history: guestSnapshots },
  ]) {
    let state = receivePlayback(liveState(null), packet)
    assert.deepEqual(state.before, history[0].view)
    // Duplicate POST/poll delivery and a slower second tab do not consume anyone else's cursor.
    state = receivePlayback(state, packet)
    assert.equal(state.queue.length, 2)
    for (let i = 1; i < history.length; i++) {
      assert.equal(state.frame.revision, history[i].revision)
      assert.deepEqual(state.room.view, history[i].view)
      assert.deepEqual(state.before, history[i - 1].view)
      const finished = state.frame.revision
      state = finishPresentation(state, finished)
      assert.equal(finishPresentation(state, finished), state)
    }
    assert.equal(state.frame, null)
    assert.equal(state.before, null)
    assert.equal(receivePlayback(state, packet).frame, null)
  }
  const caughtUp = (await api.call(room + '?after=' + hostBack.revision, host.token)).result
  assert.deepEqual(caughtUp.playback.frames, [])
  const hidden = receivePlayback(liveState(guestStart), guestBack, true)
  assert.equal(hidden.frame, null)
  assert.equal(hidden.room.revision, guestBack.revision)
  let current = hostBack
  for (let i = 0; i < HISTORY_LIMIT + 2; i++) {
    const seat = current.view.turn,
      view = (await api.call(room, tokens[seat])).result.view
    const action = legalActions(view).find((a) => a.type === 'tile')
    current = (
      await api.call(room + '/actions', tokens[seat], {
        action,
        requestId: 'cycle-' + i,
        revision: current.revision,
      })
    ).result
  }
  const stale = (await api.call(from, tokens[1])).result
  assert.equal(stale.playback.reset, true)
  assert.deepEqual(stale.playback.frames, [])
  const disk = JSON.parse(await readFile(join(api.directory, host.code + '.json'), 'utf8'))
  assert.equal(disk.timeline.frames.length, HISTORY_LIMIT)
  for (const entry of disk.timeline.frames) {
    for (const key of ['rng', 'hands', 'bets', 'settlement', 'events', 'receipts', 'finishResults'])
      assert.equal(Object.hasOwn(entry.state.board, key), false)
  }
})

test('lobby reserves seats, permits host configuration and reconnects, and protects private finish bets', async (t) => {
  const api = await table(t)
  assert.equal((await api.call('info')).result.canHost, true)
  const input = { mode: 'lan', humanSeats: 2, bots: ['easy'], name: 'Sam', character: 6 }
  assert.equal((await api.call('rooms', null, { ...input, humanSeats: 1 })).status, 400)
  assert.equal(
    (await api.call('rooms', null, input, { origin: 'https://unrelated.example' })).status,
    403,
  )
  const { result: host, status } = await api.call('rooms', null, input)
  assert.equal(status, 201)
  const room = 'rooms/' + host.code
  const publicChoice = (await api.call(room + '/characters')).result
  assert.deepEqual(publicChoice, { available: [0, 1, 2, 3, 4, 5, 7] })
  assert.equal((await api.call(room + '/join', null, { name: 'Maya', character: 6 })).status, 409)
  assert.equal((await api.call(room + '/start', host.token, {})).status, 409)
  assert.equal((await api.call(room, null)).status, 401)
  const joinRequest = { name: 'Maya', character: 1, joinKey: '39a85a91a923ef3063853f2a2f318852' }
  const second = (await api.call(room + '/join', null, joinRequest)).result
  assert.equal(second.seatId, 1)
  assert.equal(
    (await api.call(room + '/config', second.token, { bots: ['easy'], humanSeats: 2 })).status,
    403,
  )
  assert.equal(
    (await api.call(room + '/config', host.token, { bots: ['medium', 'hard'], humanSeats: 1 }))
      .status,
    409,
  )
  assert.equal(
    (await api.call(room + '/config', host.token, { bots: [], humanSeats: 3, startingSeat: 1 }))
      .status,
    200,
  )
  const third = (await api.call(room + '/join', null, { name: 'Taylor', character: 7 })).result
  assert.equal((await api.call(room + '/join', null, { name: 'Fourth' })).status, 409)
  const lastPoll = await api.call(room, third.token)
  const lobby = lastPoll.result
  assert.equal(lobby.host, false)
  assert.deepEqual(
    lobby.seats.map((s) => s.character),
    [6, 1, 7],
  )
  assert.equal(
    (await api.call(room, third.token, undefined, { 'if-none-match': lastPoll.tag })).status,
    304,
  )
  assert.equal(
    lobby.seats.every((s) => s.connected && !Object.hasOwn(s, 'tokenHash')),
    true,
  )
  if (lobby.joinUrls.length) {
    assert.match(lobby.joinUrls[0], /\/\?room=[A-Z2-9]{6}$/)
    const qr = await api.call(room + '/qr.svg')
    assert.equal(qr.status, 200)
    assert.match(qr.result, /<svg /)
  }
  const started = (await api.call(room + '/start', host.token, {})).result
  assert.equal(started.view.turn, 1)
  assert.deepEqual(
    started.view.players.map((p) => p.character),
    [6, 1, 7],
  )
  assert.deepEqual((await api.call(room + '/characters')).result, { available: [] })
  assert.equal((await api.call(room + '/join', null, { name: 'Late' })).status, 409)
  const action = {
    action: { type: 'finish', pile: 'winner', color: 'red' },
    requestId: 'test-bet',
    revision: started.revision,
  }
  assert.equal((await api.call(room + '/actions', host.token, action)).status, 409)
  const [first, repeated] = await Promise.all([
    api.call(room + '/actions', second.token, action),
    api.call(room + '/actions', second.token, action),
  ])
  assert.equal(first.status, 200)
  assert.equal(repeated.result.revision, first.result.revision)
  assert.deepEqual(first.result.view.ownFinishBets, [{ pile: 'winner', color: 'red' }])
  const remote = (await api.call(room, third.token)).result
  assert.deepEqual(remote.view.ownFinishBets, [])
  assert.equal(remote.view.finishCounts.winner, 1)
  assert.equal(remote.view.players[1].handCount, 4)
  for (const key of ['rng', 'hands', 'bets', 'settlement'])
    assert.equal(Object.hasOwn(remote.view, key), false)
  assert.equal(
    (await api.call(room + '/actions', third.token, { ...action, requestId: 'old-view' })).status,
    409,
  )
  const illegal = {
    action: { type: 'partner', partner: 0 },
    revision: remote.revision,
    requestId: 'no-partner',
  }
  assert.equal((await api.call(room + '/actions', third.token, illegal)).status, 422)
  const file = await readFile(join(api.directory, host.code + '.json'), 'utf8')
  assert.equal(file.includes(host.token), false)
  await api.restart()
  assert.deepEqual((await api.call(room + '/join', null, joinRequest)).result, second)
  const resumed = (await api.call(room, second.token)).result
  assert.equal(resumed.revision, first.result.revision)
  assert.deepEqual(resumed.view, first.result.view)
  assert.equal(
    (await api.call(room + '/actions', second.token, action)).result.revision,
    first.result.revision,
  )
})

test('the desktop launcher recognises its own local host and ignores unrelated services on the chosen port', async (t) => {
  const api = await table(t)
  const { port } = (await api.call('info')).result
  assert.equal(await isRunningHost(port), true)
  const unrelated = createServer((_req, res) => {
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ canHost: true, port: unrelated.address().port }))
  })
  await new Promise((done) => unrelated.listen(0, '127.0.0.1', done))
  t.after(() => new Promise((done) => unrelated.close(done)))
  assert.equal(await isRunningHost(unrelated.address().port), false)
})

test('private-network address accepts guest joins and reserves table creation for the host computer', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'camel-up-interface-'))
  const host = await startHost({ port: 0, directory })
  t.after(async () => {
    await host.close()
    await rm(directory, { recursive: true, force: true })
  })
  if (!host.addresses.length) return t.skip('No non-loopback IPv4 interface is available.')
  const api = async (base, path, body, token) => {
    const response = await fetch(base + '/api/' + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token && { authorization: 'Bearer ' + token }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(4000),
    })
    return { status: response.status, result: await response.json() }
  }
  const local = 'http://127.0.0.1:' + host.port
  const lan = host.addresses[0]
  assert.equal((await api(lan, 'info')).result.canHost, false)
  const config = { mode: 'lan', humanSeats: 2, bots: ['easy'], name: 'Host' }
  assert.equal((await api(lan, 'rooms', config)).status, 403)
  const room = (await api(local, 'rooms', config)).result
  const guest = (await api(lan, 'rooms/' + room.code + '/join', { name: 'Guest' })).result
  assert.equal(guest.seatId, 1)
  const view = (await api(lan, 'rooms/' + room.code, undefined, guest.token)).result
  assert.equal(view.seats[0].name, 'Host')
  assert.equal(view.seats[1].name, 'Guest')
  assert.ok(view.joinUrls.includes(lan + '/?room=' + room.code))
})

for (const [label, humanSeats, bots] of [
  ['eight human seats', 8, []],
  ['mixed human and bot seats', 2, ['easy']],
  [
    'eight seats with two humans and six bots',
    2,
    ['easy', 'medium', 'hard', 'easy', 'medium', 'hard'],
  ],
  ['solo with two bots', 1, ['easy', 'medium']],
]) {
  test(
    label + ' can play a full game with private client views',
    { timeout: 90_000 },
    async (t) => {
      const api = await table(t)
      const human = (
        await api.call('rooms', null, {
          mode: humanSeats === 1 ? 'solo' : 'lan',
          name: 'Host',
          humanSeats,
          bots,
        })
      ).result
      const room = 'rooms/' + human.code
      const tokens = [human.token]
      for (let i = 1; i < humanSeats; i++) {
        tokens.push(
          (await api.call(room + '/join', null, { name: 'Player ' + (i + 1) })).result.token,
        )
      }
      let state = (await api.call(room + '/start', human.token, {})).result
      const startRevision = state.revision
      let roundTrips = 0
      while (state.status !== 'finished' && ++roundTrips < 3000) {
        const seat = state.view.turn
        if (seat >= humanSeats) {
          await delay(25)
          state = (await api.call(room, human.token)).result
          continue
        }
        if (state.seatId !== seat) state = (await api.call(room, tokens[seat])).result
        assert.equal(state.view.seat, seat)
        const action =
          state.view.phase === 'partnership' ? { type: 'copy', ticket: null } : { type: 'roll' }
        const move = await api.call(room + '/actions', tokens[seat], {
          action,
          revision: state.revision,
          requestId: 'turn-' + state.revision,
        })
        assert.equal(move.status, 200, JSON.stringify(move.result))
        state = move.result
      }
      assert.equal(state.status, 'finished')
      assert.ok(state.view.winners.length > 0)
      // Polling can skip a fast bot. Count actual accepted moves in the finished event log.
      const moveKinds = new Set(['roll', 'ticket', 'finish', 'tile', 'partner'])
      const botTurns = new Set(
        state.view.events
          .filter((e) => e.seat >= humanSeats && moveKinds.has(e.kind))
          .map((e) => e.seat),
      )
      assert.equal(botTurns.size, bots.length)
      const recentCount = Math.min(6, state.revision - startRevision)
      const recent = (
        await api.call(room + '?after=' + (state.revision - recentCount), human.token)
      ).result
      assert.equal(recent.playback.frames.length, recentCount)
      let replay = receivePlayback(liveState(null), recent)
      while (replay.frame) {
        const showing = replay.room.view
        for (const [who, p] of showing.players.entries()) {
          if (who === showing.seat || showing.phase === 'finished')
            assert.equal(typeof p.coins, 'number')
          else assert.equal(p.coins, null)
        }
        for (const r of showing.receipts) {
          if (r.seat === showing.seat || showing.phase === 'finished')
            assert.equal(typeof r.balance, 'number')
          else assert.equal(r.balance, null)
        }
        replay = finishPresentation(replay, replay.frame.revision)
      }
      assert.ok(recent.playback.frames.at(-1).events.some((event) => event.kind === 'end'))
      if (bots.length)
        assert.ok(recent.playback.frames.some((frame) => state.seats[frame.actor].kind === 'bot'))
      for (const token of tokens) {
        const result = (await api.call(room, token)).result
        assert.deepEqual(result.view.players, state.view.players)
        assert.deepEqual(result.view.winners, state.view.winners)
      }
    },
  )
}
