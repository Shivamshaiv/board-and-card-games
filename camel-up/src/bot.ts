import { COLORS, copyOptions, legalActions, rankCamels, simulateRoll } from './engine.ts'
import type { Action, Color, Die, Difficulty, GameView, Stacks, Tile } from './engine.ts'
import {
  expectedCorrectFinishReward,
  finalWallet,
  finishLedger,
  legWallet,
  modelPriorCards,
} from './advisor/value.ts'

/** Private simulation stream. Decisions never consume or inspect the table's dice stream. */
function randomSource(seed: number) {
  let x = seed >>> 0 || 1
  return () => {
    x ^= x << 13
    x ^= x >>> 17
    x ^= x << 5
    return (x >>> 0) / 4294967296
  }
}
type Random = ReturnType<typeof randomSource>
const allDice: Die[] = [...COLORS, 'grey']
function trialLeg(start: Stacks, dice: readonly Die[], tiles: Tile[], random: Random, maxDraws = 5) {
  let stacks = start
  const bag = [...dice]
  const landings: number[] = []
  let crossed = false
  while (bag.length > 1 && landings.length < maxDraws && !crossed) {
    const [die] = bag.splice(Math.floor(random() * bag.length), 1)
    const movement = simulateRoll(
      stacks,
      tiles,
      die,
      1 + Math.floor(random() * 3),
      random() < 0.5 ? 'white' : 'black',
    )
    stacks = movement.stacks
    landings.push(movement.landing)
    crossed = movement.crossed
  }
  return { stacks, landings, crossed }
}
function counts() {
  return { red: 0, blue: 0, green: 0, purple: 0, yellow: 0 }
}
const ticketIncome = (color: Color, value: number, order: Color[]) =>
  color === order[0] ? value : color === order[1] ? 1 : -1

function finishTrial(leg: ReturnType<typeof trialLeg>, random: Random) {
  // A trial must reach the actual finish. Expired spectator tiles stay off future legs.
  while (!leg.crossed) leg = trialLeg(leg.stacks, allDice, [], random)
  return rankCamels(leg.stacks)
}

// Once four dice are out, each possible die and face can be scored exactly.
function finalDrawTicketValue(view: GameView) {
  const first = counts()
  const second = counts()
  let weight = 0
  for (const die of view.remainingDice) {
    for (let value = 1; value <= 3; value++) {
      const faces = die === 'grey' ? (['black', 'white'] as const) : (['black'] as const)
      const faceWeight = die === 'grey' ? 1 : 2
      for (const face of faces) {
        const movement = simulateRoll(view.stacks, view.tiles, die, value, face)
        const [leader, runnerUp] = rankCamels(movement.stacks)
        first[leader] += faceWeight
        second[runnerUp] += faceWeight
        weight += faceWeight
      }
    }
  }
  return (color: Color, value: number) => ((value + 1) * first[color] + 2 * second[color]) / weight - 1
}

export function chooseBotAction(view: GameView, difficulty: Difficulty, seed: number): Action {
  const actions = legalActions(view)
  if (!actions.length) throw new Error('This seat has no action.')
  if (view.phase === 'partnership') {
    const best = copyOptions(view).sort((a, b) => b.value - a.value)[0]
    return { type: 'copy', ticket: best?.value > 0 ? best.ticket : null }
  }
  const random = randomSource(seed)
  const standing = rankCamels(view.stacks)
  const own = view.players[view.seat]
  if (difficulty === 'easy') {
    const pick = random()
    const leader = standing[Math.floor(random() * 2)]
    let choices = actions.filter((a) => a.type === 'ticket' && a.color === leader)
    if (pick < 0.42) return { type: 'roll' }
    if (pick >= 0.77)
      choices = actions.filter(
        (a) => a.type === 'finish' && a.color === (a.pile === 'winner' ? standing[0] : standing[4]),
      )
    if (pick >= 0.88)
      choices = actions.filter(
        (a) =>
          a.type === 'partner' || (a.type === 'tile' && !view.tiles.some((t) => t.owner === view.seat)),
      )
    return choices[Math.floor(random() * choices.length)] ?? { type: 'roll' }
  }
  const hard = difficulty === 'hard'
  // Medium forecasts the next two pyramid turns. Hard resolves the whole leg and race.
  const n = hard ? 110 : 26
  const horizon = hard ? 5 : 2
  const first = counts(),
    second = counts()
  const tilesHit = new Map<number, number>()
  const seeds = Array.from({ length: n }, () => Math.floor(random() * 4294967296))
  const alternatives = actions.filter((a) => a.type !== 'tile')
  const hardEV = new Map<Action, number>()
  const baselines: number[] = []
  let sharedReward = 0
  const existingTile = view.tiles.find((t) => t.owner === view.seat)
  // Relative competition uses publicly held ticket faces, never other players' private balances.
  const rivals = (ranking: Color[]) =>
    view.players.reduce(
      (sum, p, i) =>
        i === view.seat
          ? sum
          : sum + p.tickets.reduce((x, t) => x + ticketIncome(t.color, t.value, ranking), 0),
      0,
    ) /
    (view.players.length - 1)
  for (const sample of seeds) {
    const sim = randomSource(sample)
    const leg = trialLeg(view.stacks, view.remainingDice, view.tiles, sim, horizon)
    const ranking = rankCamels(leg.stacks)
    first[ranking[0]]++
    second[ranking[1]]++
    for (const space of leg.landings) tilesHit.set(space, (tilesHit.get(space) ?? 0) + 1)
    if (hard) {
      const end = {
        order: ranking,
        hits: leg.landings.filter((s) => s === existingTile?.space).length,
        crossed: leg.crossed,
      }
      const ledger = finishLedger(modelPriorCards(view, sample), view.seat, finishTrial(leg, sim))
      const wallet = finalWallet(legWallet(view, end), ledger)
      for (const a of alternatives) {
        const gain = finalWallet(legWallet(view, end, a), ledger, a) - wallet
        hardEV.set(a, (hardEV.get(a) ?? 0) + gain / n)
      }
      baselines.push(wallet - rivals(ranking))
      if (view.players.length >= 6 && own.partner === null)
        sharedReward +=
          Math.max(
            own.pyramidTickets ? 1 : 0,
            ...own.tickets.map((t) => ticketIncome(t.color, t.value, ranking)),
          ) / n
    }
  }
  const expected =
    hard && view.remainingDice.length === 2
      ? finalDrawTicketValue(view)
      : (color: Color, value: number) => ((value + 1) * first[color] + 2 * second[color]) / n - 1
  let best: Action = actions.find((a) => a.type === 'roll')!
  let score = hard ? hardEV.get(best)! : 1
  const consider = (action: Action, benefit: number) => {
    if (benefit > score) {
      score = benefit
      best = action
    }
  }
  const candidates = actions
    .filter((a): a is Extract<Action, { type: 'tile' }> => a.type === 'tile' && (!existingTile || hard))
    .sort((a, b) => (tilesHit.get(b.space) ?? 0) - (tilesHit.get(a.space) ?? 0))
    .slice(0, 6)
  for (const a of candidates) {
    if (!hard) {
      consider(a, (tilesHit.get(a.space) ?? 0) / n)
      continue
    }
    const tiles = [
      ...view.tiles.filter((tile) => tile.owner !== view.seat),
      { owner: view.seat, space: a.space, side: a.side },
    ]
    let value = 0
    // Earlier finish bets can change value when this tile shifts the final race order.
    const paired = view.ownFinishBets.length ? Math.min(32, seeds.length) : seeds.length
    for (let i = 0; i < paired; i++) {
      const sample = seeds[i],
        sim = randomSource(sample)
      const trial = trialLeg(view.stacks, view.remainingDice, tiles, sim)
      const ranking = rankCamels(trial.stacks)
      const end = {
        order: ranking,
        hits: trial.landings.filter((s) => s === a.space).length,
        crossed: trial.crossed,
      }
      let wallet = legWallet(view, end)
      if (view.ownFinishBets.length)
        wallet = finalWallet(
          wallet,
          finishLedger(modelPriorCards(view, sample), view.seat, finishTrial(trial, sim)),
        )
      value += wallet - rivals(ranking) - baselines[i]
    }
    consider(a, value / paired)
  }
  const leaderSpace = Object.entries(view.stacks).find(([, stack]) => stack.includes(standing[0]))![0]
  const progress = Math.min(1, Number(leaderSpace) / 16)
  const correctAward = {
    winner: expectedCorrectFinishReward(view, 'winner'),
    loser: expectedCorrectFinishReward(view, 'loser'),
  }
  for (const a of actions) {
    if (a.type === 'ticket') {
      const value = view.tickets[a.color][0]
      const lowerTicket = view.tickets[a.color][1] ?? 0
      const competition = hard
        ? ((value - lowerTicket) * (first[a.color] / n)) / (view.players.length - 1)
        : 0
      const exactPrinted =
        view.remainingDice.length === 2 &&
        !view.ownFinishBets.length &&
        (own.coins ?? 0) > own.tickets.length
      const gain = hard && !exactPrinted ? hardEV.get(a)! : expected(a.color, value)
      consider(a, gain + competition + random() * 0.06)
    } else if (a.type === 'partner') {
      const other = view.players[a.partner]
      const theirs = hard
        ? hardEV.get(a)!
        : Math.max(
            other.pyramidTickets ? 1 : 0,
            ...other.tickets.map((t) => expected(t.color, t.value)),
          )
      consider(a, theirs - (hard ? sharedReward / (view.players.length - 1) : 0))
    } else if (a.type === 'finish') {
      const pity = a.pile === 'winner' ? standing[0] : standing[4]
      const probability = a.color === pity ? progress * progress * 0.75 : 0.03
      const gain = hard ? hardEV.get(a)! : probability * (correctAward[a.pile] + 1) - 1
      consider(a, gain - (1 - progress) * 0.6)
    }
  }
  return best
}
