import { COLORS, copyOptions, legalActions, type Action, type Color, type GameView } from '../engine.ts'
import { crossed, createChanceModel, exactLegPlacings, mixSeed, publicSeed } from './chance.ts'
import { finalWallet, finishLedger, legWallet, modelPriorCards, rewardRange } from './value.ts'

export interface RacerOdds {
  color: Color
  legFirst: number
  legSecond: number
  raceFirst: number
  raceLast: number
  ticketValue: number | null
  ticketEV: number | null
}
export interface ActionEstimate {
  action: Action
  label: string
  reason: string
  ev: number
  method: 'exact' | 'sampled'
  samples: number
  standardError: number
  finishRewardRange?: [number, number]
  tileIncome?: {
    proposed: number
    existing: number
    landings: { count: number; probability: number }[]
  }
}
export interface AdvisorResult {
  racers: RacerOdds[]
  actions: ActionEstimate[]
  leg: { method: 'exact' | 'sampled'; samples: number }
  race: { method: 'exact' | 'sampled'; samples: number }
  pairedSamples: number
  legPairs?: { first: Color; second: Color; probability: number }[]
  seed: number
  assumptions: string[]
}
export interface AdvisorOptions {
  seed?: number
  raceSamples?: number
  pairedSamples?: number
  /** Headless policy benchmarks can skip the extra work for early-leg display odds. */
  exactLegOdds?: boolean
}

const colorName = (c: string) => c[0].toUpperCase() + c.slice(1)
const percent = (p: number) => `${(p * 100).toFixed(1).replace(/\.0$/, '')}%`
const counts = (): Record<Color, number> => ({ red: 0, yellow: 0, green: 0, blue: 0, purple: 0 })
const newMoment = () => ({ n: 0, mean: 0, m2: 0 })
type Moment = ReturnType<typeof newMoment>
function observe(m: Moment, delta: number) {
  m.n++
  const error = delta - m.mean
  m.mean += error / m.n
  m.m2 += error * (delta - m.mean)
}
function budget(value: number | undefined, otherwise: number) {
  if (value === undefined) return otherwise
  if (!Number.isInteger(value) || value < 2 || value > 65536)
    throw new RangeError('Choose a sample count from 2 to 65,536.')
  return value
}
interface Candidate {
  action: Action
  moment: Moment
  exact: boolean
  exactEV: number
  branches: number
  scenario?: ReturnType<typeof createChanceModel>
  knownFinishAward?: number
  hits: number
  landingMass?: number[]
}
function describe(v: GameView, estimate: Candidate, racers: RacerOdds[], baseHits: number) {
  const a = estimate.action
  switch (a.type) {
    case 'roll':
      return {
        label: 'Roll the pyramid',
        reason:
          'Collect a 1 EP pyramid ticket and reveal the next die. The gain accounts for the zero-coin floor at settlement.',
      }
    case 'ticket': {
      const r = racers.find((c) => c.color === a.color)!
      return {
        label: `Take ${colorName(a.color)} · ${r.ticketValue} EP`,
        reason: `${colorName(a.color)} has a ${percent(r.legFirst)} chance to lead this leg and ${percent(r.legSecond)} to place second. Second pays 1 EP. Other places cost 1 EP.`,
      }
    }
    case 'tile': {
      const diff = estimate.hits - baseHits
      return {
        label: `${a.side === 'cheer' ? 'Cheer' : 'Boo'} on space ${a.space}`,
        reason: `This tile earns an estimated ${estimate.hits.toFixed(2)} EP from landings this leg (${diff >= 0 ? '+' : ''}${diff.toFixed(2)} versus leaving your tile alone). The total also includes changes to your existing bets.`,
      }
    }
    case 'finish': {
      const r = racers.find((c) => c.color === a.color)!,
        p = a.pile === 'winner' ? r.raceFirst : r.raceLast,
        range = rewardRange(v, a.pile)
      const prize =
        range[0] === range[1]
          ? `${range[0]} EP`
          : `${range[0]}–${range[1]} EP depending on earlier face-down cards`
      return {
        label: `Back ${colorName(a.color)} for overall ${a.pile}`,
        reason: `The estimated chance is ${percent(p)}. A correct prediction pays ${prize}. This spends your ${a.color} finish card.`,
        finishRewardRange: range,
      }
    }
    case 'partner': {
      const p = v.players[a.partner],
        n = p.tickets.length + p.pyramidTickets
      return {
        label: `Partner with ${p.name}`,
        reason: `${p.name} currently holds ${n} ${n === 1 ? 'ticket' : 'tickets'}. At leg end you can copy their highest positive payout or decline. Their copy leaves your own tickets intact.`,
      }
    }
    case 'copy': {
      const option = a.ticket === null ? null : copyOptions(v).find((item) => item.ticket === a.ticket)
      return option
        ? {
            label: `Copy ${option.label}`,
            reason: `That ticket pays ${option.value > 0 ? '+' : ''}${option.value} EP in the settled leg. Your partner keeps the original.`,
          }
        : {
            label: 'Decline the copy',
            reason: 'Keep your own ticket rewards and add no partner payout.',
          }
    }
  }
}

export function analyzeGame(view: GameView, options: AdvisorOptions = {}): AdvisorResult {
  const n = budget(options.raceSamples, 4096),
    pairs = Math.min(n, budget(options.pairedSamples, 256))
  const seed = (options.seed ?? publicSeed(view)) >>> 0
  const first = counts(),
    second = counts(),
    winner = counts(),
    last = counts(),
    earlyWinner = counts(),
    earlyLast = counts()
  const exactLeg = view.phase === 'finished' || crossed(view.stacks) || view.remainingDice.length <= 4
  // The move ranking retains its existing EV estimator. The extra solver serves placings only.
  const openingLeg = !exactLeg && options.exactLegOdds !== false ? exactLegPlacings(view) : null
  const exactPlacings = exactLeg || openingLeg !== null
  const legal = legalActions(view)
  const baselineModel = createChanceModel(view)
  const noOwnedFinish = view.ownFinishBets.length === 0
  const candidates: Candidate[] = legal.map((action) => {
    const range =
      action.type === 'finish' && exactLeg && noOwnedFinish ? rewardRange(view, action.pile) : null
    return {
      action,
      moment: newMoment(),
      exact: exactLeg && noOwnedFinish && action.type !== 'finish',
      exactEV: 0,
      branches: 0,
      hits: 0,
      ...(range && range[0] === range[1] ? { knownFinishAward: range[0] } : {}),
      ...(action.type === 'tile'
        ? {
            landingMass: [0, 0, 0, 0, 0, 0],
            scenario: createChanceModel(view, action),
          }
        : {}),
    }
  })
  let branches = 0,
    allCrossed = true,
    baseExact = 0,
    baseHits = 0
  const legPairs = candidates.some((c) => c.action.type === 'partner')
    ? COLORS.map(() => [0, 0, 0, 0, 0])
    : null
  const recordPair = (order: Color[], probability: number) => {
    if (legPairs) legPairs[COLORS.indexOf(order[0])][COLORS.indexOf(order[1])] += probability
  }
  if (openingLeg) {
    for (const pair of openingLeg.pairs) {
      first[pair.first] += pair.probability
      second[pair.second] += pair.probability
      if (legPairs) legPairs[COLORS.indexOf(pair.first)][COLORS.indexOf(pair.second)] = pair.probability
    }
  }
  if (exactLeg) {
    branches = baselineModel.enumerateLeg((leg, prob) => {
      first[leg.order[0]] += prob
      second[leg.order[1]] += prob
      recordPair(leg.order, prob)
      baseHits += prob * leg.hits
      if (leg.crossed) {
        earlyWinner[leg.order[0]] += prob
        earlyLast[leg.order[4]] += prob
      } else allCrossed = false
      if (!candidates.length) return
      const wallet = legWallet(view, leg)
      baseExact += prob * wallet
      for (const candidate of candidates) {
        if (candidate.exact && !candidate.scenario)
          candidate.exactEV += prob * (legWallet(view, leg, candidate.action) - wallet)
        if (
          leg.crossed &&
          candidate.knownFinishAward !== undefined &&
          candidate.action.type === 'finish'
        ) {
          const a = candidate.action,
            hit = a.color === leg.order[a.pile === 'winner' ? 0 : 4]
          candidate.exactEV += prob * (hit ? candidate.knownFinishAward : -Math.min(1, wallet))
        }
      }
    })
    for (const candidate of candidates) {
      if (allCrossed && candidate.knownFinishAward !== undefined) candidate.exact = true
      if (!candidate.exact) continue
      candidate.branches = branches
      if (candidate.scenario) {
        let value = 0
        candidate.branches = candidate.scenario.enumerateLeg((end, p) => {
          value += p * legWallet(view, end)
          candidate.hits += p * end.hits
          candidate.landingMass![end.hits] += p
        })
        candidate.exactEV = value - baseExact
      }
    }
  }
  const exactRace = exactLeg && allCrossed
  const sampled = candidates.filter((c) => !c.exact),
    anyTrials = !exactRace || sampled.length > 0
  let basePairedHits = 0
  for (let sample = 0; anyTrials && sample < n; sample++) {
    const stream = mixSeed(seed + Math.imul(sample + 1, 0x9e3779b1))
    const race = baselineModel.sampleRace(stream)
    if (!exactPlacings) {
      first[race.leg.order[0]]++
      second[race.leg.order[1]]++
      recordPair(race.leg.order, 1 / n)
    }
    if (!exactRace) {
      winner[race.order[0]]++
      last[race.order[4]]++
    }
    if (sample < pairs) basePairedHits += race.leg.hits / pairs
    if (!sampled.length) continue
    const hypotheses = modelPriorCards(view, stream),
      ledger = finishLedger(hypotheses, view.seat, race.order)
    const baseline = finalWallet(legWallet(view, race.leg), ledger)
    for (const candidate of sampled) {
      const action = candidate.action
      if (candidate.scenario) {
        if (sample >= pairs) continue
        // Without an existing finish wager this player's future balance is fixed
        // at leg settlement. The rest of an alternative race cannot change its EV.
        if (noOwnedFinish) {
          const alt = candidate.scenario.sampleLeg(stream)
          candidate.hits += alt.hits / pairs
          candidate.landingMass![alt.hits] += 1 / pairs
          observe(candidate.moment, legWallet(view, alt) - baseline)
          continue
        }
        const alt = candidate.scenario.sampleRace(stream)
        const value = finalWallet(
          legWallet(view, alt.leg),
          finishLedger(hypotheses, view.seat, alt.order),
        )
        candidate.hits += alt.leg.hits / pairs
        candidate.landingMass![alt.leg.hits] += 1 / pairs
        observe(candidate.moment, value - baseline)
      } else {
        const value = finalWallet(legWallet(view, race.leg, action), ledger, action)
        observe(candidate.moment, value - baseline)
      }
    }
  }
  const clamp = (p: number) => Math.max(0, Math.min(1, p))
  const racers = COLORS.map((color): RacerOdds => {
    const legFirst = clamp(first[color] / (exactPlacings ? 1 : n)),
      legSecond = clamp(second[color] / (exactPlacings ? 1 : n))
    const ticketValue = view.phase === 'playing' ? (view.tickets[color][0] ?? null) : null
    return {
      color,
      legFirst,
      legSecond,
      raceFirst: clamp(exactRace ? earlyWinner[color] : winner[color] / n),
      raceLast: clamp(exactRace ? earlyLast[color] : last[color] / n),
      ticketValue,
      ticketEV: ticketValue === null ? null : legFirst * (ticketValue + 1) + 2 * legSecond - 1,
    }
  })
  const actions = candidates
    .map(
      (c): ActionEstimate => ({
        action: c.action,
        ...describe(view, c, racers, c.exact ? baseHits : basePairedHits),
        ...(c.landingMass
          ? {
              tileIncome: {
                proposed: c.hits,
                existing: c.exact ? baseHits : basePairedHits,
                landings: c.landingMass.flatMap((probability, count) =>
                  probability > 0 ? [{ count, probability }] : [],
                ),
              },
            }
          : {}),
        ev: c.exact ? c.exactEV : c.moment.mean,
        method: c.exact ? 'exact' : 'sampled',
        samples: c.exact ? c.branches : c.moment.n,
        standardError: c.exact
          ? 0
          : Math.sqrt(Math.max(0, c.moment.m2) / (c.moment.n * (c.moment.n - 1))),
      }),
    )
    .sort((a, b) => b.ev - a.ev)
  return {
    racers,
    actions,
    seed,
    pairedSamples: pairs,
    ...(legPairs
      ? {
          legPairs: legPairs.flatMap((row, a) =>
            row.flatMap((probability, b) =>
              probability > 0 ? [{ first: COLORS[a], second: COLORS[b], probability }] : [],
            ),
          ),
        }
      : {}),
    leg: {
      method: exactPlacings ? 'exact' : 'sampled',
      samples: openingLeg?.sequences ?? (exactLeg ? branches : n),
    },
    race: { method: exactRace ? 'exact' : 'sampled', samples: exactRace ? branches : n },
    assumptions: [
      'For each possible finish, we score your existing tickets and finish bets. Losses stop when your purse is empty. A ticket’s printed payout can therefore differ from its effect on your balance.',
      'We roll the remaining dice by the game rules. After the move being tested, bets stay fixed and spectator tiles stay in place until the leg ends. Later legs use fresh dice and empty spectator spaces. Rolling now adds one pyramid ticket.',
      'Each opponent starts with one finish card of each color. For hidden bets we sample colors from that hand, using each color at most once. Earlier correct cards can reduce the prize available to you.',
      'We compare spectator spaces using the same dice in each trial. A sampling margin measures variation between trials. Other players’ later choices can change your gain and your chance of winning the table.',
    ],
  }
}
