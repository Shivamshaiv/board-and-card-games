import assert from 'node:assert/strict'
import { availableParallelism } from 'node:os'
import { performance } from 'node:perf_hooks'
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads'
import { analyzeGame } from '../src/advisor/analysis.ts'
import { mixSeed, randomSource } from '../src/advisor/chance.ts'
import {
  expectedCorrectFinishReward,
  modelPriorCards,
  publicTransactionBalances,
} from '../src/advisor/value.ts'
import { chooseBotAction } from '../src/bot.ts'
import {
  applyAction,
  COLORS,
  copyOptions,
  createGame,
  legalActions,
  projectGame,
  rankCamels,
  simulateRoll,
} from '../src/engine.ts'

const sizes = [3, 4, 6, 8]
const opposition = ['easy', 'medium', 'hard']
const trials = 60
const promotionThreshold = 0.01
const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length
const roll = { type: 'roll' }
const actionKey = JSON.stringify
const payout = (order, color, face) => (order[0] === color ? face : order[1] === color ? 1 : -1)

function advance(game, action) {
  const next = applyAction(game, game.turn, action)
  // The game rules do not read these logs. Keep long rollouts small while using the real engine.
  return { ...next, events: [], receipts: [], finishResults: [] }
}

function nextRoll(view) {
  const branches = []
  for (const die of view.remainingDice) {
    const faces = die === 'grey' ? ['black', 'white'] : ['black']
    for (let number = 1; number <= 3; number++) {
      for (const face of faces) {
        const move = simulateRoll(view.stacks, view.tiles, die, number, face)
        branches.push({
          order: rankCamels(move.stacks),
          landing: move.landing,
          finish: move.crossed,
          weight: 1 / (view.remainingDice.length * 3 * faces.length),
        })
      }
    }
  }
  return branches
}

// Continuation policies are intentionally cheaper than the evaluated hint engine. Each
// makes decisions from its own view. The three styles vary roll, ticket and finish timing.
function continuation(view, style, rng) {
  if (view.phase === 'partnership') {
    const best = copyOptions(view).sort((a, b) => b.value - a.value)[0]
    return { type: 'copy', ticket: best?.value > 0 ? best.ticket : null }
  }
  if (style === 2 && rng() < 0.24) return roll
  const actions = legalActions(view)
  const branches = nextRoll(view)
  const leader = rankCamels(view.stacks)[0]
  const progress = Number(Object.keys(view.stacks).find((space) => view.stacks[space].includes(leader)))
  const uncertainty = Math.min(0.7, 0.16 * (view.remainingDice.length - 2))
  const me = view.players[view.seat]
  const existing = view.tiles.find((tile) => tile.owner === view.seat)
  const landings = new Map()
  const win = Object.fromEntries(COLORS.map((color) => [color, 0]))
  const last = { ...win }
  const tickets = { ...win }
  for (const branch of branches) {
    win[branch.order[0]] += branch.weight
    last[branch.order[4]] += branch.weight
    landings.set(branch.landing, (landings.get(branch.landing) ?? 0) + branch.weight)
    for (const color of COLORS) {
      tickets[color] += branch.weight * payout(branch.order, color, view.tickets[color][0] ?? 0)
    }
  }
  let best = roll
  let bestValue = -Infinity
  for (const action of actions) {
    let value
    switch (action.type) {
      case 'roll':
        value = style === 1 ? 1.28 : 1
        break
      case 'ticket': {
        const face = view.tickets[action.color][0]
        value = (1 - uncertainty) * tickets[action.color] + uncertainty * (0.2 * face - 0.4)
        if (style === 0 && face >= 3) value += 0.2
        break
      }
      case 'tile':
        value = (landings.get(action.space) ?? 0) * (1 + uncertainty) - 0.1
        if (existing) value -= (landings.get(existing.space) ?? 0) + 0.16
        if (style === 1 && action.side === 'cheer' && me.tickets.some((t) => t.color === leader))
          value += 0.2
        break
      case 'finish': {
        const possible = (action.pile === 'winner' ? win : last)[action.color]
        const weight = Math.min(1, Math.max(0.12, (progress - 3) / 13))
        const prize = expectedCorrectFinishReward(view, action.pile)
        value = (possible * weight + 0.2 * (1 - weight)) * (prize + 1) - 1 - 0.7 * (1 - weight)
        break
      }
      case 'partner': {
        const other = view.players[action.partner]
        const copyValue = (player, order) =>
          Math.max(
            player.pyramidTickets ? 1 : 0,
            ...player.tickets.map((t) => payout(order, t.color, t.value)),
          )
        value = branches.reduce(
          (sum, b) => sum + b.weight * (copyValue(other, b.order) - 0.55 * copyValue(me, b.order)),
          0,
        )
        break
      }
    }
    value += (rng() - 0.5) * (style === 2 ? 1.25 : 0.35)
    if (value > bestValue) {
      best = action
      bestValue = value
    }
  }
  return best
}

function sampledWorld(view, seed) {
  const bets = modelPriorCards(view, mixSeed(seed ^ 0xab892f09))
  const hands = view.players.map((_, seat) =>
    COLORS.filter(
      (color) =>
        ![...bets.winner, ...bets.loser].some((bet) => bet.seat === seat && bet.color === color),
    ),
  )
  // No hidden cards or future dice from the real match are available to search.
  const paid = publicTransactionBalances(view)
  const players = view.players.map((p, seat) => ({ ...p, coins: p.coins ?? paid[seat] }))
  return { ...view, players, version: 1, rng: seed || 1, bets, hands, settlement: null }
}

function winShare(game, seat) {
  return game.winners.includes(seat) ? 1 / game.winners.length : 0
}

function rollout(view, action, seed, style) {
  const rng = randomSource(mixSeed(seed ^ 0x3154ae13))
  let game = advance(sampledWorld(view, seed), action)
  for (let turn = 0; game.phase !== 'finished'; turn++) {
    assert.ok(turn < 500, 'Continuation did not finish')
    game = advance(
      game,
      continuation(projectGame(game, game.turn), game.turn === view.seat ? 0 : style, rng),
    )
  }
  return winShare(game, view.seat)
}

function opponentAware(view, estimates) {
  const [first, second] = estimates.actions
  if (view.phase !== 'playing' || !second) return { action: first.action, searched: false }
  const finishChance = nextRoll(view).reduce((sum, b) => sum + (b.finish ? b.weight : 0), 0)
  if (finishChance < 1 / 12 && (view.leg < 2 || first.ev - second.ev > 0.35)) {
    return { action: first.action, searched: false }
  }
  const alternatives = new Map()
  for (const action of [second.action, finishChance >= 1 / 12 ? roll : null]) {
    if (action && actionKey(action) !== actionKey(first.action))
      alternatives.set(actionKey(action), action)
  }
  if (!alternatives.size) return { action: first.action, searched: false }
  const scenarios = Array.from({ length: trials }, (_, i) => ({
    seed: mixSeed(estimates.seed ^ Math.imul(i + 72, 0x9e3779b1)),
    style: i % opposition.length,
  }))
  const baseline = scenarios.map(({ seed, style }) => rollout(view, first.action, seed, style))
  let best = first.action
  let bestBound = 0.01
  for (const action of alternatives.values()) {
    const differences = scenarios.map(
      ({ seed, style }, i) => rollout(view, action, seed, style) - baseline[i],
    )
    const difference = mean(differences)
    const error = Math.sqrt(
      differences.reduce((sum, gain) => sum + (gain - difference) ** 2, 0) / (trials * (trials - 1)),
    )
    const lower = difference - 1.645 * error
    const agrees = opposition.every(
      (_, style) => mean(differences.filter((_, i) => i % 3 === style)) >= 0,
    )
    if (agrees && lower > bestBound) {
      best = action
      bestBound = lower
    }
  }
  return { action: best, searched: true }
}

function playPair({ seed, size, seat, lineup }) {
  const names = Array.from({ length: size }, (_, i) => ({ name: 'Seat ' + (i + 1) }))
  const opening = createGame(names, seed, mixSeed(seed ^ 0x139a) % size)
  const opponents = Array.from(
    { length: size },
    (_, i) => opposition[lineup === 3 ? (i + seat) % 3 : lineup],
  )
  const cached = new Map()
  const hints = (view) => {
    const key = JSON.stringify(view)
    const prior = cached.get(key)
    if (prior) return prior
    const started = performance.now()
    const result = analyzeGame(view, { exactLegOdds: false })
    const measured = { result, milliseconds: performance.now() - started }
    cached.set(key, measured)
    return measured
  }
  function play(challenger) {
    let state = structuredClone(opening)
    const visits = Array(size).fill(0)
    const timings = []
    let turn = 0,
      searched = 0,
      overrides = 0
    while (state.phase !== 'finished') {
      assert.ok(++turn < 600, 'Matched game did not finish')
      const actor = state.turn
      const view = projectGame(state, actor)
      const styleSeed = mixSeed(
        seed ^ Math.imul(actor + 1, 0x4bf39) ^ Math.imul(++visits[actor], 0x347d3),
      )
      let chosen
      if (actor !== seat) chosen = chooseBotAction(view, opponents[actor], styleSeed)
      else {
        const { result: estimate, milliseconds } = hints(view)
        const searchStarted = performance.now()
        const best = estimate.actions[0].action
        if (challenger) {
          const decision = opponentAware(view, estimate)
          chosen = decision.action
          if (decision.searched) searched++
          if (actionKey(best) !== actionKey(chosen)) overrides++
        } else chosen = best
        timings.push(milliseconds + performance.now() - searchStarted)
      }
      // The search player can remember publicly visible transfers in the real
      // match. Inner hypothetical worlds can drop logs once initialized.
      state = applyAction(state, actor, chosen)
    }
    const own = state.players[seat].coins
    return {
      win: winShare(state, seat),
      coins: own,
      margin: own - Math.max(...state.players.filter((_, i) => i !== seat).map((p) => p.coins)),
      turn,
      searched,
      overrides,
      timings,
    }
  }
  const baseline = play(false)
  const challenger = play(true)
  if (challenger.overrides === 0) {
    for (const key of ['win', 'coins', 'margin', 'turn']) assert.equal(challenger[key], baseline[key])
  }
  return { size, lineup, baseline, challenger }
}

function percentile(values, p) {
  return [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(p * values.length))]
}

function pairedInterval(rows, key) {
  const groups = sizes.map((size) => rows.filter((row) => row.size === size))
  // A one-game stratum has no resampling variation. The short smoke mode
  // must not report an artificial zero-width confidence interval or promote a policy.
  if (groups.some((group) => group.length < 2)) return null
  const rng = randomSource(0x731d4faa)
  const estimates = Array.from({ length: 10000 }, () => {
    let sum = 0
    for (const group of groups)
      for (let i = 0; i < group.length; i++) {
        const row = group[Math.floor(rng() * group.length)]
        sum += row.challenger[key] - row.baseline[key]
      }
    return sum / rows.length
  }).sort((a, b) => a - b)
  return [estimates[250], estimates[9750]]
}

if (!isMainThread) {
  for (const scenario of workerData) parentPort.postMessage(playPair(scenario))
} else {
  const perSize = Number(process.argv[2] ?? 24)
  const seedOffset = Number(process.argv[3] ?? 18001)
  const workers = Number(process.argv[4] ?? Math.min(6, availableParallelism()))
  assert.ok([perSize, seedOffset, workers].every((n) => Number.isSafeInteger(n) && n > 0))
  const scenarios = Array.from({ length: perSize }, (_, i) =>
    sizes.map((size) => ({
      size,
      seat: i % size,
      lineup: (i + Math.floor(i / size)) % 4,
      seed: mixSeed(seedOffset + Math.imul(i + 1, 8273) + size * 59),
    })),
  ).flat()
  const chunks = Array.from({ length: Math.min(workers, scenarios.length) }, () => [])
  scenarios.forEach((scenario, i) => chunks[i % chunks.length].push(scenario))
  const start = performance.now()
  const rows = []
  await Promise.all(
    chunks.map(
      (chunk) =>
        new Promise((resolve, reject) => {
          const worker = new Worker(new URL(import.meta.url), { workerData: chunk })
          worker.on('message', (row) => {
            rows.push(row)
            if (rows.length % 8 === 0)
              console.log(rows.length + '/' + scenarios.length + ' matched pairs')
          })
          worker.on('error', reject)
          worker.on('exit', (code) =>
            code === 0 ? resolve() : reject(new Error('Benchmark worker exited ' + code)),
          )
        }),
    ),
  )
  const summarize = (subset) =>
    Object.fromEntries(
      ['baseline', 'challenger'].map((arm) => [
        arm,
        Object.fromEntries(
          ['win', 'coins', 'margin'].map((metric) => [metric, mean(subset.map((r) => r[arm][metric]))]),
        ),
      ]),
    )
  const difference = pairedInterval(rows, 'win')
  console.log(
    JSON.stringify(
      {
        pairs: rows.length,
        games: rows.length * 2,
        seconds: (performance.now() - start) / 1000,
        seedOffset,
        continuationTrials: trials,
        purseModel:
          'Opponent exact purses are hidden. This offline continuation remembers the three starting coins and all public tile and scoring transfers.',
        totalTurns: rows.reduce((total, row) => total + row.baseline.turn + row.challenger.turn, 0),
        searches: rows.reduce((total, row) => total + row.challenger.searched, 0),
        overrides: rows.reduce((total, row) => total + row.challenger.overrides, 0),
        gamesWithOverrides: rows.filter((row) => row.challenger.overrides > 0).length,
        p95CurrentMs: percentile(
          rows.flatMap((row) => row.baseline.timings),
          0.95,
        ),
        p95ChallengerMs: percentile(
          rows.flatMap((row) => row.challenger.timings),
          0.95,
        ),
        overall: summarize(rows),
        bySize: Object.fromEntries(
          sizes.map((size) => [size, summarize(rows.filter((row) => row.size === size))]),
        ),
        byLineup: Object.fromEntries(
          [...opposition, 'mixed'].flatMap((lineup, i) => {
            const subset = rows.filter((row) => row.lineup === i)
            return subset.length ? [[lineup, summarize(subset)]] : []
          }),
        ),
        paired95: {
          win: difference,
          coins: pairedInterval(rows, 'coins'),
          margin: pairedInterval(rows, 'margin'),
        },
        clearsWinThreshold: difference !== null && difference[0] > promotionThreshold,
      },
      null,
      2,
    ),
  )
}
