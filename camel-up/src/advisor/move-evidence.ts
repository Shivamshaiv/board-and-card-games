import { copyOptions, type Action, type Color, type GameView, type PlayerView } from '../engine'
import type { ActionEstimate, AdvisorResult } from './analysis'

export interface MoveOutcome {
  label: string
  probability: number
  /** Printed award or face-value payout; negative penalties are limited by the available cash. */
  payout: [number, number]
  tone: 'positive' | 'negative' | 'neutral'
}
export interface MoveEvidence {
  kind: Action['type']
  title: string
  why: string
  instruction: string
  outcomeHeading: string
  outcomes: MoveOutcome[]
  outcomeMethod: 'exact' | 'sampled'
  outcomeSamples: number
  facts: { label: string; value: string }[]
  ev: number
  evNote: string
  art: { src: string; alt: string } | null
}
export interface MoveComparison {
  kind: 'tie' | 'close' | 'higher' | 'lower'
  /** Signed advantage of the first argument over the second. */
  gap: number
  text: string
}

const number = new Intl.NumberFormat('en', { maximumFractionDigits: 2 })
const percentage = new Intl.NumberFormat('en', { style: 'percent', maximumFractionDigits: 1 })
const name = (s: string) => s[0].toUpperCase() + s.slice(1)
const clamp = (p: number) => Math.max(0, Math.min(1, p))
const amount = (n: number) => `${n > 0.0049 ? '+' : ''}${number.format(Math.abs(n) < 0.005 ? 0 : n)} EP`
const count = (n: number, singular: string) => `${n} ${singular}${n === 1 ? '' : 's'}`
const card = (c: Color | 'pyramid') => ({
  src: `/art/card-${c}.webp`,
  alt: c === 'pyramid' ? 'Dice pyramid' : `${name(c)} racing camel`,
})
const portrait = (p: PlayerView) => ({ src: `/art/portrait-${p.character}.webp`, alt: p.name })
const single = (label: string, probability: number, low: number, high = low): MoveOutcome => ({
  label,
  probability: clamp(probability),
  payout: [low, high],
  tone: low > 0 ? 'positive' : high < 0 ? 'negative' : 'neutral',
})
const floorNote =
  'Move value measures extra coins in your final purse. You can only pay losses with coins you have.'

export function compareMoves(a: ActionEstimate, b: ActionEstimate): MoveComparison {
  const gap = a.ev - b.ev
  const sampled = a.method === 'sampled' || b.method === 'sampled'
  if (!sampled && Math.abs(gap) < 1e-9)
    return { kind: 'tie', gap, text: 'Both moves have the same expected value in this model.' }
  // Trials are shared. The sum of standard errors bounds the standard error of
  // the difference without making an unsupported independence assumption.
  const error =
    (a.method === 'sampled' ? a.standardError : 0) + (b.method === 'sampled' ? b.standardError : 0)
  if (sampled && Math.abs(gap) <= Math.max(1e-9, 1.96 * error))
    return {
      kind: 'close',
      gap,
      text: 'The estimates are close enough that another simulation could change their order.',
    }
  const size = Math.abs(gap) < 0.005 ? 'under 0.01 EP' : `${number.format(Math.abs(gap))} EP`
  const direction = gap > 0 ? 'more' : 'less'
  return {
    kind: gap > 0 ? 'higher' : 'lower',
    gap,
    text: `This move averages ${size} ${direction} than the comparison move.`,
  }
}

function partnerOutcomes(player: PlayerView, result: AdvisorResult): MoveOutcome[] {
  const mass = new Map<number, number>()
  for (const { first, second, probability } of result.legPairs ?? []) {
    let best = player.pyramidTickets ? 1 : 0
    for (const t of player.tickets)
      best = Math.max(best, t.color === first ? t.value : t.color === second ? 1 : -1)
    mass.set(best, (mass.get(best) ?? 0) + probability)
  }
  return [...mass]
    .sort(([a], [b]) => b - a)
    .map(([value, p]) => single(value ? `Copy a ${value} EP payout` : 'Decline the copy', p, value))
}

export function moveEvidence(
  game: GameView,
  result: AdvisorResult,
  estimate: ActionEstimate,
): MoveEvidence {
  const a = estimate.action
  const base = {
    kind: a.type,
    ev: estimate.ev,
    evNote: floorNote,
    outcomeMethod: 'exact' as const,
    outcomeSamples: 1,
  }
  switch (a.type) {
    case 'ticket': {
      const r = result.racers.find((row) => row.color === a.color)!
      const face = game.tickets[a.color][0]
      const topTwo = clamp(r.legFirst + r.legSecond)
      const perHundred =
        topTwo > 0 && topTwo < 0.01
          ? 'fewer than 1'
          : topTwo < 1 && topTwo > 0.99
            ? 'over 99'
            : 'about ' + Math.round(topTwo * 100)
      const thirdOrLower = clamp(1 - r.legFirst - r.legSecond)
      const printed = r.legFirst * face + r.legSecond - thirdOrLower
      return {
        ...base,
        title: `Take ${name(a.color)}’s ${face}‑coin leg ticket`,
        why:
          result.leg.method === 'exact'
            ? `${name(a.color)} has a ${percentage.format(topTwo)} chance to finish first or second. Both places pay.`
            : topTwo === 0
              ? `${name(a.color)} finished outside the two paying places in every simulated leg.`
              : topTwo === 1
                ? `${name(a.color)} finished first or second in every simulated leg. Both places pay.`
                : `This ticket pays in ${perHundred} out of 100 simulated legs, when ${name(a.color)} finishes first or second.`,
        instruction: `Choose ${name(a.color)} in Leg tickets.`,
        art: card(a.color),
        outcomeHeading: 'At leg scoring',
        outcomeMethod: result.leg.method,
        outcomeSamples: result.leg.samples,
        outcomes: [
          single('First place', r.legFirst, face),
          single('Second place', r.legSecond, 1),
          single('Third to fifth', thirdOrLower, -1),
        ],
        facts:
          amount(printed) === amount(estimate.ev)
            ? []
            : [{ label: 'Average printed return', value: amount(printed) }],
      }
    }
    case 'finish': {
      const r = result.racers.find((row) => row.color === a.color)!
      const winning = a.pile === 'winner',
        probability = winning ? r.raceFirst : r.raceLast
      const range = estimate.finishRewardRange
      if (!range) throw new Error('A finish estimate must include its public reward bounds.')
      const already = game.finishOwners[a.pile].length
      const prize =
        range[0] === range[1]
          ? `${range[0]} EP`
          : `${range[0]}–${range[1]} EP, depending on earlier hidden cards`
      return {
        ...base,
        title: `Bet on ${name(a.color)} to ${winning ? 'win the race' : 'finish last'}`,
        why: `${name(a.color)} has a ${percentage.format(probability)} chance to ${winning ? 'win' : 'finish last'}. A correct card pays ${prize}.`,
        instruction: `Select your ${a.color} finish card, choose Overall ${a.pile}, then confirm.`,
        art: card(a.color),
        outcomeHeading: 'At the end of the race',
        outcomeMethod: result.race.method,
        outcomeSamples: result.race.samples,
        outcomes: [
          single(winning ? 'Wins the race' : 'Finishes last', probability, ...range),
          single(
            winning ? 'Finishes second to fifth' : 'Finishes first to fourth',
            1 - probability,
            -1,
          ),
        ],
        facts: [{ label: `Already in the ${a.pile} pile`, value: count(already, 'card') }],
        evNote:
          'The move value includes earlier finish cards and the zero-coin floor. Playing this color spends it for the race.',
      }
    }
    case 'roll': {
      const draws = game.remainingDice.length - 1
      return {
        ...base,
        title: 'Roll the pyramid',
        why: `Taking the pyramid earns a ticket worth 1 EP at leg scoring. ${draws === 1 ? 'This is the final draw of the leg.' : 'The revealed die then moves a camel.'}`,
        instruction: 'Choose Roll pyramid at your player station.',
        art: card('pyramid'),
        outcomeHeading: 'What you collect',
        outcomes: [single('Pyramid ticket', 1, 1)],
        facts: [
          { label: 'Dice still inside', value: String(game.remainingDice.length) },
          { label: 'Maximum draws remaining this leg', value: String(draws) },
        ],
      }
    }
    case 'tile': {
      const income = estimate.tileIncome
      if (!income) throw new Error('A tile estimate must include its modeled landing income.')
      const moved = game.tiles.find((t) => t.owner === game.seat)
      const side = a.side === 'cheer' ? 'cheer' : 'boo'
      const direct = income.proposed - income.existing
      const pocket = estimate.ev - direct
      const visits = number.format(income.proposed)
      const otherPayouts =
        Math.abs(pocket) >= 0.1 && Math.abs(pocket) > Math.abs(direct)
          ? ` The new stack positions also ${pocket > 0 ? 'raise' : 'lower'} your other payouts by about ${number.format(Math.abs(pocket))} EP on average.`
          : ''
      return {
        ...base,
        title: `${moved ? 'Move' : 'Place'} your ${side} tile on space ${a.space}`,
        why:
          `This space averages ${visits} ${visits === '1' ? 'landing' : 'landings'} this leg. Each pays you 1 EP.` +
          otherPayouts,
        instruction: `Choose Spectator, select ${name(side)}, then choose space ${a.space} on the track.`,
        art: game.players[game.seat] ? portrait(game.players[game.seat]) : null,
        outcomeHeading: 'Income from landings',
        outcomeMethod: estimate.method,
        outcomeSamples: estimate.samples,
        outcomes: income.landings.map(({ count: visits, probability }) =>
          single(visits ? count(visits, 'landing') : 'No landings', probability, visits),
        ),
        facts: [
          ...(moved
            ? [
                { label: `Expected income on space ${moved.space}`, value: amount(income.existing) },
                { label: 'Change in landing income', value: amount(direct) },
              ]
            : []),
          ...(Math.abs(pocket) >= 0.005
            ? [{ label: 'Effect on other payouts', value: amount(pocket) }]
            : []),
        ],
        evNote:
          'The move value adds the change in landing income to the effect on your other bets and settlement payments.',
      }
    }
    case 'partner': {
      const p = game.players[a.partner]
      const total = p.tickets.length + p.pyramidTickets
      return {
        ...base,
        title: `Partner with ${p.name}`,
        why: total
          ? `${p.name} holds ${count(total, 'ticket')}. At leg scoring you can copy the best positive payout or decline if all lose money.`
          : `${p.name} has no tickets to copy yet. This forecast keeps their current holdings fixed.`,
        instruction: `Choose Partner at your station and select ${p.name}.`,
        art: portrait(p),
        outcomeHeading: 'Best available copy at leg scoring',
        outcomeMethod: result.leg.method,
        outcomeSamples: result.leg.samples,
        outcomes: partnerOutcomes(p, result),
        facts: [
          { label: 'Their leg tickets', value: String(p.tickets.length) },
          { label: 'Their pyramid tickets', value: String(p.pyramidTickets) },
        ],
        evNote:
          'You keep all your own tickets. The estimate values one copy from the tickets your partner already holds.',
      }
    }
    case 'copy': {
      const partnerId = game.players[game.seat].partner
      if (partnerId === null) throw new Error('Copying a ticket requires an active partnership.')
      const partner = game.players[partnerId]
      if (a.ticket === null)
        return {
          ...base,
          title: 'Decline the partner payout',
          why: 'Declining adds no reward or penalty to your own leg tickets.',
          instruction: 'Choose Decline copy at your station.',
          art: portrait(partner),
          outcomeHeading: 'At this settlement',
          outcomes: [single('No copy', 1, 0)],
          facts: [],
        }
      const t = partner.tickets[a.ticket]
      const value = copyOptions(game)[a.ticket].value
      const reward = !t ? 'a pyramid ticket' : `${name(t.color)}’s ${t.value} EP leg ticket`
      return {
        ...base,
        title: `Copy ${reward}`,
        why: !t
          ? `${partner.name}’s pyramid ticket pays 1 EP at this settlement.`
          : `${name(t.color)} finished ${value === t.value ? 'first' : value === 1 ? 'second' : 'outside the top two'} this leg. This copy is worth ${amount(value)}.`,
        instruction: `Choose the ${t ? t.color + ' ticket (' + t.value + ')' : 'pyramid ticket'} in your partner ticket choices.`,
        art: t ? card(t.color) : card('pyramid'),
        outcomeHeading: 'At this settlement',
        outcomes: [single('Copy payout', 1, value)],
        facts: [{ label: 'Ticket owner', value: partner.name }],
      }
    }
  }
}
