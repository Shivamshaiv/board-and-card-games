import type { Color, GameEvent, GameView, Pile } from '../engine'

export const CARD_COLORS: Color[] = ['red', 'yellow', 'green', 'blue', 'purple']
export const FACE = (c: Color) => CARD_COLORS.indexOf(c)
export const TICKET = (c: Color, value: number) =>
  5 + FACE(c) * 3 + (value === 5 ? 0 : value === 3 ? 1 : 2)
export const BACK = (character: number) => 20 + character
export const PYRAMID_CARD = 28,
  PAPER_EDGE = 29
export function artForFace(index: number) {
  if (index === PYRAMID_CARD) return '/art/card-pyramid.webp'
  if (index >= 20) return `/art/portrait-${index - 20}.webp`
  return `/art/card-${CARD_COLORS[index < 5 ? index : Math.floor((index - 5) / 3)]}.webp`
}
const ticketEvent = (e: GameEvent) =>
  e.kind === 'ticket'
    ? /took the ([235]) EP (red|yellow|green|blue|purple) ticket\.$/.exec(e.text)
    : null
export type Slot =
  | `market-${Color}`
  | `hand-${Color}`
  | `pile-${Pile}`
  | 'my-bench'
  | 'other-bench'
  | 'pyramid-bank'
export interface SlotCards {
  slot: Slot
  front: number
  back: number
  count: number
  shape: 'ticket' | 'card'
  faceDown?: boolean
  layers?: number[]
}
export interface Transfer {
  id: number
  kind: 'ticket' | 'finish' | 'roll'
  from: Slot
  to: Slot
  front: number
  back: number
  seat: number
  faceDown: boolean
  shape: 'ticket' | 'card'
}
export function publicCardLayout(g: GameView): SlotCards[] {
  const owner = BACK(g.players[g.seat].character)
  const slots: SlotCards[] = []
  for (const color of CARD_COLORS) {
    const stock = g.tickets[color]
    slots.push({
      slot: `market-${color}`,
      front: TICKET(color, stock[0] ?? 2),
      back: PYRAMID_CARD,
      count: stock.length,
      shape: 'ticket',
      layers: [...stock].reverse().map((v) => TICKET(color, v)),
    })
    slots.push({
      slot: `hand-${color}`,
      front: FACE(color),
      back: owner,
      count: g.hand.includes(color) ? 1 : 0,
      shape: 'card',
    })
  }
  for (const pile of ['winner', 'loser'] as const) {
    const owners = g.finishOwners[pile]
    const top = owners.at(-1)
    const back = top === undefined ? owner : BACK(g.players[top].character)
    // The digital scoring drawer handles the final, chronological reveal. This shelf
    // only needs the publicly visible surface of either betting pile during play.
    slots.push({
      slot: `pile-${pile}`,
      front: back,
      back,
      count: owners.length,
      shape: 'card',
      faceDown: true,
      layers: owners.slice(-5).map((seat) => BACK(g.players[seat].character)),
    })
  }
  const player = g.players[g.seat],
    count = player.tickets.length + player.pyramidTickets
  const acquired: number[] = []
  for (let i = g.events.length - 1; i >= 0 && acquired.length < Math.min(5, count); i--) {
    const e = g.events[i]
    if (e.kind === 'leg' || e.kind === 'start') break
    if (e.seat !== g.seat) continue
    const t = ticketEvent(e)
    if (e.kind === 'roll') acquired.unshift(PYRAMID_CARD)
    else if (t) acquired.unshift(TICKET(t[2] as Color, +t[1]))
  }
  const last = player.tickets.at(-1)
  slots.push({
    slot: 'my-bench',
    front: acquired.at(-1) ?? (last ? TICKET(last.color, last.value) : PYRAMID_CARD),
    back: owner,
    count,
    shape: 'ticket',
    layers: acquired.length === Math.min(5, count) ? acquired : undefined,
  })
  slots.push({
    slot: 'pyramid-bank',
    front: PYRAMID_CARD,
    back: PYRAMID_CARD,
    count: Math.max(0, 5 - g.rolls.length),
    shape: 'ticket',
  })
  return slots
}
const finishPile = (event: GameEvent): Pile | null =>
  event.kind === 'finish'
    ? /winner bet\.$/.test(event.text)
      ? 'winner'
      : /loser bet\.$/.test(event.text)
        ? 'loser'
        : null
    : null

/** Construct an animation from the authenticated player's projection, including when polling skips turns. */
export function publicTransfer(g: GameView, id: number): Transfer | null {
  const event = g.events.find((e) => e.id === id)
  if (!event || event.seat === undefined) return null
  const seat = event.seat,
    own = seat === g.seat,
    back = BACK(g.players[seat].character),
    to = own ? 'my-bench' : 'other-bench'
  if (event.kind === 'roll')
    return {
      id,
      kind: 'roll',
      seat,
      back,
      front: PYRAMID_CARD,
      from: 'pyramid-bank',
      to,
      faceDown: false,
      shape: 'ticket',
    }
  if (event.kind === 'ticket') {
    const m = ticketEvent(event)
    if (m) {
      const color = m[2] as Color
      return {
        id,
        kind: 'ticket',
        seat,
        back,
        front: TICKET(color, +m[1]),
        from: `market-${color}`,
        to,
        faceDown: false,
        shape: 'ticket',
      }
    }
  }
  const pile = finishPile(event)
  if (!pile) return null
  if (!own)
    return {
      id,
      kind: 'finish',
      seat,
      front: back,
      back,
      from: 'other-bench',
      to: `pile-${pile}`,
      faceDown: true,
      shape: 'card',
    }
  const position = g.events.filter((e) => e.id < id && e.seat === seat && finishPile(e) === pile).length
  const bet = g.ownFinishBets.filter((b) => b.pile === pile)[position]
  if (!bet) return null
  return {
    id,
    kind: 'finish',
    seat,
    front: FACE(bet.color),
    back,
    from: `hand-${bet.color}`,
    to: `pile-${pile}`,
    faceDown: false,
    shape: 'card',
  }
}
