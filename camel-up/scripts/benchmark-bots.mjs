import { performance } from 'node:perf_hooks'
import { pathToFileURL } from 'node:url'
import { applyAction, createGame, projectGame } from '../src/engine.ts'
import { chooseBotAction } from '../src/bot.ts'

const levels = ['easy', 'medium', 'hard']
// All six assignments put every tier in every seat, in both possible opponent orders.
const assignments = [
  [0, 1, 2],
  [1, 2, 0],
  [2, 0, 1],
  [0, 2, 1],
  [2, 1, 0],
  [1, 0, 2],
]
function seedFor(number) {
  let mixed = Math.imul(number ^ (number >>> 16), 0x45d9f3b)
  mixed = Math.imul(mixed ^ (mixed >>> 16), 0x45d9f3b)
  return (mixed ^ (mixed >>> 16)) >>> 0
}

export function benchmarkBots(seedCount = 12, startIndex = 0) {
  if (!Number.isInteger(seedCount) || seedCount < 1)
    throw new Error('Seed count must be a positive integer.')
  if (!Number.isInteger(startIndex) || startIndex < 0)
    throw new Error('The starting seed index must be a nonnegative integer.')
  const earnings = levels.map(() => ({ cash: 0, wins: 0, timings: [] }))
  const seedResults = []
  const games = seedCount * assignments.length
  const start = performance.now()
  let totalTurns = 0
  for (let i = 0; i < seedCount; i++) {
    const tableSeed = seedFor(i + startIndex + 748901)
    const before = earnings.map(({ cash, wins }) => ({ cash, wins }))
    for (const order of assignments) {
      let state = createGame(
        order.map((tier) => ({ name: levels[tier], difficulty: levels[tier] })),
        tableSeed,
      )
      let turns = 0
      while (state.phase !== 'finished') {
        if (++turns > 600) throw new Error(`Game exceeded 600 turns on seed ${tableSeed}.`)
        const tier = order[state.turn]
        const view = projectGame(state, state.turn)
        const before = performance.now()
        const action = chooseBotAction(
          view,
          levels[tier],
          seedFor(tableSeed ^ (turns * 67 + state.turn)),
        )
        earnings[tier].timings.push(performance.now() - before)
        state = applyAction(state, state.turn, action)
      }
      totalTurns += turns
      state.players.forEach((p, seat) => {
        earnings[order[seat]].cash += p.coins
      })
      for (const winner of state.winners) earnings[order[winner]].wins += 1 / state.winners.length
    }
    seedResults.push(
      earnings.map((result, tier) => ({
        meanEP: (result.cash - before[tier].cash) / assignments.length,
        winPoints: (100 * (result.wins - before[tier].wins)) / assignments.length,
      })),
    )
  }
  // Each seed is a block of six matched seat assignments. A close result on
  // one block or a small collection of blocks cannot establish a tier inversion.
  const comparisons = []
  if (seedCount >= 12) {
    const df = seedCount - 1,
      z = 1.959964
    const critical = z + (z ** 3 + z) / (4 * df) + (5 * z ** 5 + 16 * z ** 3 + 3 * z) / (96 * df ** 2)
    for (const high of [1, 2])
      for (const metric of ['meanEP', 'winPoints']) {
        const deltas = seedResults.map((row) => row[high][metric] - row[high - 1][metric])
        const delta = deltas.reduce((s, d) => s + d, 0) / seedCount
        const se = Math.sqrt(deltas.reduce((s, d) => s + (d - delta) ** 2, 0) / (seedCount * df))
        const lo = delta - critical * se,
          hi = delta + critical * se
        comparisons.push({
          tiers: `${levels[high]} vs ${levels[high - 1]}`,
          metric,
          delta: +delta.toFixed(2),
          low: +lo.toFixed(2),
          high: +hi.toFixed(2),
          status: lo > 0 ? 'higher' : hi < 0 ? 'lower' : 'inconclusive',
        })
      }
  }
  return {
    games,
    seeds: seedCount,
    comparisons,
    turns: totalTurns,
    seconds: +(0.001 * (performance.now() - start)).toFixed(2),
    results: Object.fromEntries(
      earnings.map(({ cash, wins, timings }, index) => {
        timings.sort((a, b) => a - b)
        return [
          levels[index],
          {
            meanEP: +(cash / games).toFixed(2),
            winPercent: +((100 * wins) / games).toFixed(1),
            decisions: timings.length,
            p95ms: +timings[Math.ceil(timings.length * 0.95) - 1].toFixed(2),
          },
        ]
      }),
    ),
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const summary = benchmarkBots(
    process.argv[2] === undefined ? 12 : Number(process.argv[2]),
    Number(process.argv[3] ?? 0),
  )
  console.log(
    `${summary.games} games · ${summary.seeds} race seeds · all six seat assignments · ${summary.turns} decisions · ${summary.seconds}s`,
  )
  console.table(summary.results)
  if (summary.comparisons.length) {
    console.log(
      'Paired differences across race seeds; approximate 95% intervals (winPoints are percentage points)',
    )
    console.table(summary.comparisons)
    if (summary.comparisons.some((c) => c.status === 'lower')) process.exitCode = 1
  }
}
