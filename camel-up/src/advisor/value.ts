import {
  COLORS,
  type Action,
  type Color,
  type GameView,
  type Pile,
  type PlayerView,
} from '../engine.ts'
import { mixSeed, randomSource, type LegEnd } from './chance.ts'

export const payout = (place: number) => [8, 5, 3, 2][place] ?? 1
const piles: readonly Pile[] = ['winner', 'loser']
type Bet = { seat: number; color: Color }
export type Belief = Record<Pile, Bet[]>
export interface Ledger {
  winner: number[]
  loser: number[]
  next: Record<Pile, number>
  target: Record<Pile, Color>
}
export function modelPriorCards(v: GameView, seed: number): Belief {
  const rand = randomSource(mixSeed(seed ^ 0xc8be2297)),
    bags = new Map<number, Color[]>()
  const out: Belief = { winner: [], loser: [] }
  for (const pile of piles) {
    const self = v.ownFinishBets.filter((b) => b.pile === pile)
    let ownIndex = 0
    for (const seat of v.finishOwners[pile]) {
      if (seat === v.seat) {
        out[pile].push({ seat, color: self[ownIndex++].color })
        continue
      }
      let bag = bags.get(seat)
      if (!bag) {
        bag = [...COLORS]
        bags.set(seat, bag)
      }
      const i = Math.floor(rand() * bag.length),
        color = bag[i]
      bag[i] = bag[bag.length - 1]
      bag.pop()
      out[pile].push({ seat, color })
    }
  }
  return out
}
export function finishLedger(bets: Belief, seat: number, order: Color[]): Ledger {
  const target = { winner: order[0], loser: order[4] }
  const ledger: Ledger = { winner: [], loser: [], next: { winner: 8, loser: 8 }, target }
  for (const pile of piles) {
    let hits = 0
    for (const b of bets[pile]) {
      const delta = b.color === target[pile] ? payout(hits++) : -1
      if (b.seat === seat) ledger[pile].push(delta)
    }
    ledger.next[pile] = payout(hits)
  }
  return ledger
}
function priorOpponentCounts(v: GameView, pile: Pile) {
  const counts = new Map<number, number>()
  for (const seat of v.finishOwners[pile])
    if (seat !== v.seat) counts.set(seat, (counts.get(seat) ?? 0) + 1)
  return [...counts.values()]
}
export function rewardRange(v: GameView, pile: Pile): [number, number] {
  const counts = priorOpponentCounts(v, pile)
  const must = counts.filter((n) => n === 5).length
  return [payout(counts.length), payout(must)]
}
/** Expected prize conditional on a correct new card, using public backs only.
 * k cards from one opponent contain the proposed color with probability k/5.
 * Those k cards can consume at most one place in the payout sequence. */
export function expectedCorrectFinishReward(v: GameView, pile: Pile) {
  let mass = [1]
  for (const count of priorOpponentCounts(v, pile)) {
    const match = count / COLORS.length
    const next = Array<number>(mass.length + 1).fill(0)
    mass.forEach((p, i) => {
      next[i] += p * (1 - match)
      next[i + 1] += p * match
    })
    mass = next
  }
  return mass.reduce((mean, p, i) => mean + p * payout(i), 0)
}

/** Offline perfect-recall benchmark assumption. Use the untrimmed public
 * transaction history, independent of any opponent's undisclosed purse. */
export function publicTransactionBalances(
  view: Pick<GameView, 'players' | 'events' | 'receipts' | 'finishResults'>,
) {
  const coins = view.players.map(() => 3)
  for (const event of view.events) {
    if (event.kind === 'roll' && event.movement?.tile) coins[event.movement.tile.owner]++
  }
  for (const receipt of view.receipts) coins[receipt.seat] += receipt.change
  for (const card of view.finishResults) coins[card.seat] += card.change
  return coins
}
const legValue = (color: Color, value: number, order: Color[]) =>
  order[0] === color ? value : order[1] === color ? 1 : -1
function bestCopy(p: PlayerView, order: Color[]) {
  let best = p.pyramidTickets ? 1 : 0
  for (const t of p.tickets) best = Math.max(best, legValue(t.color, t.value, order))
  return best
}
export function legWallet(v: GameView, end: LegEnd, a?: Action) {
  const me = v.players[v.seat],
    order = end.order
  if (typeof me?.coins !== 'number') throw new Error('Only a seated player can value their own purse.')
  let cash = me.coins + end.hits + me.pyramidTickets
  for (const t of me.tickets) cash += legValue(t.color, t.value, order)
  if (a?.type === 'ticket') cash += legValue(a.color, v.tickets[a.color][0], order)
  if (a?.type === 'roll') cash++
  const partner = a?.type === 'partner' ? a.partner : me.partner
  if (partner !== null) {
    const other = v.players[partner]
    if (v.phase !== 'partnership') cash += bestCopy(other, order)
    else if (a?.type === 'copy' && a.ticket !== null) {
      const t = other.tickets[a.ticket]
      cash += t ? legValue(t.color, t.value, order) : 1
    }
  }
  return Math.max(0, cash)
}
export function finalWallet(cash: number, ledger: Ledger, a?: Action) {
  for (const pile of piles) {
    for (const n of ledger[pile]) cash = Math.max(0, cash + n)
    if (a?.type === 'finish' && a.pile === pile) {
      cash = Math.max(0, cash + (a.color === ledger.target[pile] ? ledger.next[pile] : -1))
    }
  }
  return cash
}
