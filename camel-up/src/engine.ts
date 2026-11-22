/** Camel Up, second edition. Spaces 0 and 17 represent a crossing in either direction. */
export const COLORS = ['red', 'blue', 'green', 'yellow', 'purple'] as const
export type Color = (typeof COLORS)[number]
export type Crazy = 'black' | 'white'
export type Camel = Color | Crazy
export type Die = Color | 'grey'
export type Difficulty = 'easy' | 'medium' | 'hard'
export type Side = 'cheer' | 'boo'
export type Pile = 'winner' | 'loser'
export type Stacks = Record<number, Camel[]>
export interface Seat {
  name: string
  difficulty?: Difficulty
  character?: number
}
export interface Tile {
  owner: number
  space: number
  side: Side
}
export interface Ticket {
  color: Color
  value: number
}
export interface Roll {
  die: Die
  value: number
  greyColor?: Crazy
}
export type Action =
  | { type: 'roll' }
  | { type: 'ticket'; color: Color }
  | { type: 'tile'; space: number; side: Side }
  | { type: 'finish'; pile: Pile; color: Color }
  | { type: 'partner'; partner: number }
  | { type: 'copy'; ticket: number | null }

export interface CoinStack {
  denomination: 1 | 5
  stacked: boolean
}
export interface PlayerView<Cash extends number | null = number | null> extends Seat {
  character: number
  coins: Cash
  coinStacks?: CoinStack[]
  tickets: Ticket[]
  pyramidTickets: number
  partner: number | null
  handCount: number
}
export interface Movement {
  stacks: Stacks
  moved: Camel
  unit: Camel[]
  from: number
  landing: number
  to: number
  tile?: Tile
  crossed: boolean
}
export interface GameEvent {
  id: number
  kind: Action['type'] | 'start' | 'leg' | 'scoring' | 'reveal' | 'end'
  text: string
  seat?: number
  roll?: Roll
  movement?: Omit<Movement, 'stacks'>
}
export interface ReceiptLine {
  label: string
  value: number
}
export interface LegReceipt<Cash extends number | null = number | null> {
  leg: number
  seat: number
  lines: ReceiptLine[]
  change: number
  balance: Cash
}
export interface FinishBet {
  seat: number
  color: Color
}
export interface FinishResult extends FinishBet {
  pile: Pile
  value: number
  change: number
  balance: number
}

interface Table<Cash extends number | null = number | null> {
  phase: 'playing' | 'partnership' | 'finished'
  turn: number
  leg: number
  starter: number
  stacks: Stacks
  tiles: Tile[]
  tickets: Record<Color, number[]>
  remainingDice: Die[]
  rolls: Roll[]
  players: PlayerView<Cash>[]
  events: GameEvent[]
  receipts: LegReceipt<Cash>[]
  finishResults: FinishResult[]
  winners: number[]
}
interface Settlement {
  final: boolean
  next: number
  pending: number[]
  copies: Record<number, number | null>
}
export interface GameState extends Table<number> {
  version: 1
  rng: number
  hands: Color[][]
  bets: Record<Pile, FinishBet[]>
  settlement: Settlement | null
}
export interface GameView extends Table {
  seat: number
  hand: Color[]
  finishCounts: Record<Pile, number>
  finishOwners: Record<Pile, number[]>
  ownFinishBets: { pile: Pile; color: Color }[]
}
const DICE: Die[] = [...COLORS, 'grey']
const isRacer = (camel: Camel): camel is Color => camel !== 'black' && camel !== 'white'
const capSpace = (space: number) => Math.max(0, Math.min(17, space))
const freshTickets = (): Record<Color, number[]> => ({
  red: [5, 3, 2, 2],
  blue: [5, 3, 2, 2],
  green: [5, 3, 2, 2],
  yellow: [5, 3, 2, 2],
  purple: [5, 3, 2, 2],
})

/** Xorshift with serializable state and rejection sampling on its nonzero output range. */
function draw(game: { rng: number }, limit: number): number {
  const bound = 0xffffffff - (0xffffffff % limit)
  let n: number
  do {
    let x = game.rng
    x ^= x << 13
    x ^= x >>> 17
    x ^= x << 5
    game.rng = x >>> 0
    n = game.rng - 1
  } while (n >= bound)
  return n % limit
}
function shuffled<T>(game: { rng: number }, values: readonly T[]): T[] {
  const result = [...values]
  for (let i = result.length - 1; i > 0; i--) {
    const j = draw(game, i + 1)
    const item = result[i]
    result[i] = result[j]
    result[j] = item
  }
  return result
}
function record(
  game: GameState,
  kind: GameEvent['kind'],
  text: string,
  extra: Partial<GameEvent> = {},
) {
  game.events.push({ id: game.events.length + 1, kind, text, ...extra })
}

export function createGame(seats: Seat[], seed: number, firstSeat = 0): GameState {
  if (!Array.isArray(seats) || seats.length < 3 || seats.length > 8)
    throw new Error('Choose 3 to 8 players.')
  if (!Number.isInteger(firstSeat) || !seats[firstSeat])
    throw new Error('Choose a starting player at this table.')
  if (!Number.isFinite(seed)) throw new Error('A numeric seed is required.')
  const chosen = seats.flatMap((s) => (s.character === undefined ? [] : [s.character]))
  if (
    chosen.some((c) => !Number.isInteger(c) || c < 0 || c > 7) ||
    new Set(chosen).size !== chosen.length
  ) {
    throw new Error('Each character may occupy one seat.')
  }
  const available = Array.from({ length: 8 }, (_, i) => i).filter((c) => !chosen.includes(c))
  const players = seats.map((s): PlayerView<number> => {
    if (typeof s.name !== 'string' || !s.name.trim()) throw new Error('Each player needs a name.')
    return {
      name: s.name.trim(),
      ...(s.difficulty ? { difficulty: s.difficulty } : {}),
      character: s.character ?? available.shift()!,
      coins: 3,
      tickets: [],
      pyramidTickets: 0,
      partner: null,
      handCount: 5,
    }
  })
  const game: GameState = {
    version: 1,
    phase: 'playing',
    turn: firstSeat,
    starter: firstSeat,
    leg: 1,
    rng: seed >>> 0 || 0x6d2b79f5,
    stacks: Object.fromEntries(Array.from({ length: 18 }, (_, i) => [i, []])),
    tiles: [],
    tickets: freshTickets(),
    remainingDice: [...DICE],
    rolls: [],
    players,
    hands: seats.map(() => [...COLORS]),
    bets: { winner: [], loser: [] },
    events: [],
    receipts: [],
    finishResults: [],
    winners: [],
    settlement: null,
  }
  for (const camel of shuffled(game, COLORS)) game.stacks[1 + draw(game, 3)].push(camel)
  for (const camel of shuffled<Crazy>(game, ['black', 'white']))
    game.stacks[16 - draw(game, 3)].push(camel)
  record(game, 'start', `${players[firstSeat].name} opens the first leg.`, { seat: firstSeat })
  return game
}

/** The physical table exposes the denomination on top of each pile, not its exact height. */
export function visibleCoinStacks(coins: number): CoinStack[] {
  const stacks: CoinStack[] = []
  for (const denomination of [5, 1] as const) {
    const n = denomination === 5 ? Math.floor(coins / 5) : coins % 5
    if (n) stacks.push({ denomination, stacked: n > 1 })
  }
  return stacks
}
export function seatPlayers(
  players: PlayerView<number>[],
  seat: number,
  phase: GameView['phase'],
): PlayerView[] {
  return players.map((p, i) =>
    i === seat || phase === 'finished'
      ? p
      : { ...p, coins: null, coinStacks: visibleCoinStacks(p.coins) },
  )
}
export function seatReceipts(
  receipts: LegReceipt[],
  seat: number,
  phase: GameView['phase'],
): LegReceipt[] {
  return receipts.map((r) =>
    r.seat === seat || phase === 'finished' ? r : { ...r, balance: null },
  )
}

function returnedLegPieces(players: PlayerView<number>[]) {
  return {
    tiles: [] as Tile[],
    tickets: freshTickets(),
    remainingDice: [...DICE],
    rolls: [] as Roll[],
    players: players.map((p) => ({ ...p, partner: null, tickets: [], pyramidTickets: 0 })),
  }
}

/** Older completed v1 saves retained the final leg's physical pieces. Their immutable
 * receipts already contain those payouts, so the display can return supplies without rescoring. */
export function visibleLegPieces(
  table: Pick<Table<number>, 'phase' | 'players' | 'tiles' | 'tickets' | 'remainingDice' | 'rolls'>,
  seat: number,
) {
  const pieces = table.phase === 'finished' ? returnedLegPieces(table.players) : table
  return {
    tiles: pieces.tiles,
    tickets: pieces.tickets,
    remainingDice: pieces.remainingDice,
    rolls: pieces.rolls,
    players: seatPlayers(pieces.players, seat, table.phase),
  }
}

/** Only this explicit projection crosses a LAN boundary. A negative seat is a public spectator. */
export function projectGame(game: GameState, seat: number): GameView {
  const { phase, turn, leg, starter, stacks, events, receipts, finishResults, winners } = game
  return structuredClone({
    phase,
    turn,
    leg,
    starter,
    stacks,
    ...visibleLegPieces(game, seat),
    events,
    receipts: seatReceipts(receipts, seat, phase),
    finishResults,
    winners,
    seat,
    hand: game.hands[seat] ?? [],
    finishCounts: { winner: game.bets.winner.length, loser: game.bets.loser.length },
    finishOwners: {
      winner: game.bets.winner.map((b) => b.seat),
      loser: game.bets.loser.map((b) => b.seat),
    },
    ownFinishBets: (['winner', 'loser'] as const).flatMap((pile) =>
      game.bets[pile].filter((b) => b.seat === seat).map((b) => ({ pile, color: b.color })),
    ),
  })
}

export function rankCamels(stacks: Stacks): Color[] {
  const order: Color[] = []
  for (let space = 17; space >= 0; space--) {
    const stack = stacks[space] ?? []
    for (let i = stack.length - 1; i >= 0; i--) if (isRacer(stack[i])) order.push(stack[i] as Color)
  }
  return order
}
function locate(stacks: Stacks, camel: Camel): [number, number] {
  for (const [space, stack] of Object.entries(stacks)) {
    const height = stack.indexOf(camel)
    if (height >= 0) return [Number(space), height]
  }
  throw new Error(`Missing ${camel} camel.`)
}
function crazyToMove(stacks: Stacks, face: Crazy): Crazy {
  const [bs, bh] = locate(stacks, 'black')
  const [ws, wh] = locate(stacks, 'white')
  if (bs === ws && Math.abs(bh - wh) === 1) return bh > wh ? 'black' : 'white'
  const blackCarries = stacks[bs].slice(bh + 1).some(isRacer)
  const whiteCarries = stacks[ws].slice(wh + 1).some(isRacer)
  return blackCarries === whiteCarries ? face : blackCarries ? 'black' : 'white'
}
/** Pure chance branch shared by game play and the AI. No hidden state or entropy is required. */
export function simulateRoll(
  stacks: Stacks,
  tiles: Tile[],
  die: Die,
  value: number,
  greyColor: Crazy = 'black',
): Movement {
  if (!Number.isInteger(value) || value < 1 || value > 3)
    throw new Error('A die moves one to three spaces.')
  const moved = die === 'grey' ? crazyToMove(stacks, greyColor) : die
  const [from, height] = locate(stacks, moved)
  const direction = isRacer(moved) ? 1 : -1
  const landing = capSpace(from + direction * value)
  const tile = tiles.find((t) => t.space === landing)
  const to = capSpace(landing + (tile ? (tile.side === 'cheer' ? direction : -direction) : 0))
  const unit = stacks[from].slice(height)
  const next = { ...stacks, [from]: stacks[from].slice(0, height) }
  const destination = next[to] ?? []
  next[to] = tile?.side === 'boo' ? [...unit, ...destination] : [...destination, ...unit]
  return {
    stacks: next,
    moved,
    unit,
    from,
    landing,
    to,
    ...(tile ? { tile } : {}),
    crossed: to === 0 || to === 17,
  }
}

function ticketValue(ticket: Ticket, ranking: Color[]): number {
  if (ticket.color === ranking[0]) return ticket.value
  return ticket.color === ranking[1] ? 1 : -1
}
function ticketLines(player: PlayerView, ranking: Color[]): ReceiptLine[] {
  return [
    ...player.tickets.map((t) => ({
      label: `${t.color} ticket (${t.value})`,
      value: ticketValue(t, ranking),
    })),
    ...Array.from({ length: player.pyramidTickets }, () => ({ label: 'pyramid ticket', value: 1 })),
  ]
}
export function copyOptions(
  game: Pick<Table, 'stacks' | 'players' | 'turn'>,
  seat = game.turn,
): (ReceiptLine & { ticket: number })[] {
  const partner = game.players[seat]?.partner
  if (partner == null) return []
  return ticketLines(game.players[partner], rankCamels(game.stacks)).map((line, ticket) => ({
    ...line,
    ticket,
  }))
}
/** Return the same placement restriction used by the table, hints, bots and authority. */
export function spectatorPlacementBlock(
  game: Pick<GameView, 'stacks' | 'tiles'>,
  seat: number,
  space: number,
): string | null {
  if (!Number.isInteger(space) || space < 1 || space > 16) return 'Choose a numbered track space.'
  if (space === 1) return 'Space 1 must stay clear of spectator tiles.'
  const existing = game.tiles.find((tile) => tile.space === space)
  if (existing)
    return existing.owner === seat
      ? 'Your tile is already here. Move it to a different space to change its position or face.'
      : 'Another spectator tile already occupies this space.'
  if (game.stacks[space]?.length) return 'A spectator tile needs a space without camels.'
  // The owner lifts their tile before relocating it, so its former neighbors can become legal.
  const neighbors = game.tiles.filter(
    (tile) => tile.owner !== seat && Math.abs(tile.space - space) === 1,
  )
  if (neighbors.length === 2)
    return `Tiles are on spaces ${space - 1} and ${space + 1}. Leave at least one track space between spectator tiles.`
  const neighbor = neighbors[0]
  if (neighbor)
    return `A tile is on space ${neighbor.space}. Leave at least one track space between spectator tiles.`
  return null
}
export function legalActions(view: GameView, seat = view.seat): Action[] {
  if (seat !== view.seat || seat !== view.turn || !view.players[seat] || view.phase === 'finished')
    return []
  if (view.phase === 'partnership')
    return [
      ...copyOptions(view).map(({ ticket }): Action => ({ type: 'copy', ticket })),
      { type: 'copy', ticket: null },
    ]
  const actions: Action[] = [{ type: 'roll' }]
  for (const color of COLORS)
    if (view.tickets[color].length) actions.push({ type: 'ticket', color })
  for (let space = 2; space <= 16; space++) {
    if (spectatorPlacementBlock(view, seat, space)) continue
    actions.push({ type: 'tile', space, side: 'cheer' }, { type: 'tile', space, side: 'boo' })
  }
  for (const color of view.hand)
    actions.push(
      { type: 'finish', pile: 'winner', color },
      { type: 'finish', pile: 'loser', color },
    )
  if (view.players.length >= 6 && view.players[seat].partner === null) {
    view.players.forEach((player, partner) => {
      if (partner !== seat && player.partner === null) actions.push({ type: 'partner', partner })
    })
  }
  return actions
}
function sameAction(a: Action, b: Action) {
  if (!b || a.type !== b.type) return false
  return Object.entries(a).every(
    ([key, value]) => (b as unknown as Record<string, unknown>)[key] === value,
  )
}
function settleLeg(game: GameState) {
  const settlement = game.settlement!
  const ranking = rankCamels(game.stacks)
  game.players.forEach((player, seat) => {
    const lines = ticketLines(player, ranking)
    const choice = settlement.copies[seat]
    if (choice != null) {
      const copy = copyOptions(game, seat)[choice]
      lines.push({ label: `Partner’s ${copy.label}`, value: copy.value })
    }
    const balance = Math.max(0, player.coins + lines.reduce((sum, line) => sum + line.value, 0))
    game.receipts.push({ leg: game.leg, seat, lines, change: balance - player.coins, balance })
    player.coins = balance
  })
  record(game, 'scoring', `Leg ${game.leg} scored. ${ranking[0]} led, followed by ${ranking[1]}.`)
  game.settlement = null
  Object.assign(game, returnedLegPieces(game.players))
  if (settlement.final) {
    for (const pile of ['winner', 'loser'] as const) {
      const target = pile === 'winner' ? ranking[0] : ranking[ranking.length - 1]
      const payouts = [8, 5, 3, 2]
      let correct = 0
      for (const bet of game.bets[pile]) {
        const value = bet.color === target ? (payouts[correct++] ?? 1) : -1
        const player = game.players[bet.seat]
        const balance = Math.max(0, player.coins + value)
        const change = balance - player.coins
        game.finishResults.push({ ...bet, pile, value, change, balance })
        player.coins = balance
        const payment =
          value < 0 && change === 0
            ? '0 EP, no coins to pay'
            : `${change > 0 ? '+' : ''}${change} EP`
        record(game, 'reveal', `${player.name} backed ${bet.color} for ${pile} (${payment}).`, {
          seat: bet.seat,
        })
      }
    }
    const most = Math.max(...game.players.map((p) => p.coins))
    game.winners = game.players.flatMap((player, i) => (player.coins === most ? [i] : []))
    game.phase = 'finished'
    record(
      game,
      'end',
      `${game.winners.map((i) => game.players[i].name).join(' and ')} ${game.winners.length > 1 ? 'share victory' : 'wins'} with ${most} EP.`,
    )
    return
  }
  game.leg++
  game.phase = 'playing'
  game.turn = settlement.next
  game.starter = game.turn
  record(game, 'leg', `${game.players[game.turn].name} opens leg ${game.leg}.`, { seat: game.turn })
}
function beginSettlement(game: GameState, next: number, final: boolean) {
  const pending: number[] = []
  for (let offset = 0; offset < game.players.length; offset++) {
    const seat = (next + offset) % game.players.length
    if (copyOptions(game, seat).length) pending.push(seat)
  }
  game.settlement = { next, final, pending, copies: {} }
  if (pending.length) {
    game.phase = 'partnership'
    game.turn = pending[0]
  } else settleLeg(game)
}

/** The only authority for turn changes and scoring. Rejects invalid commands before mutation. */
export function applyAction(state: GameState, seat: number, action: Action): GameState {
  if (!Number.isInteger(seat) || seat !== state.turn || !state.players[seat])
    throw new Error('It is another player’s turn.')
  if (!legalActions(projectGame(state, seat)).some((allowed) => sameAction(allowed, action))) {
    const issue =
      state.phase === 'playing' && action?.type === 'tile'
        ? spectatorPlacementBlock(state, seat, action.space)
        : null
    throw new Error(issue ?? 'That action is unavailable.')
  }
  const game = structuredClone(state)
  const player = game.players[seat]
  const next = (seat + 1) % game.players.length
  switch (action.type) {
    case 'roll': {
      const die = game.remainingDice.splice(draw(game, game.remainingDice.length), 1)[0]
      const value = draw(game, 3) + 1
      const roll: Roll = { die, value }
      if (die === 'grey') roll.greyColor = draw(game, 2) ? 'white' : 'black'
      const { stacks, ...movement } = simulateRoll(
        game.stacks,
        game.tiles,
        die,
        value,
        roll.greyColor,
      )
      game.stacks = stacks
      player.pyramidTickets++
      game.rolls.push(roll)
      if (movement.tile) game.players[movement.tile.owner].coins++
      const tile = movement.tile
      const note = tile
        ? ` ${game.players[tile.owner].name} earned 1 EP for ${tile.side === 'cheer' ? 'cheering' : 'booing'}.`
        : ''
      record(
        game,
        'roll',
        `${player.name} rolled ${die} ${value}${roll.greyColor ? ' (' + roll.greyColor + ' face)' : ''}. ${movement.moved} moved from ${movement.from} to ${movement.to}.${note}`,
        { seat, roll, movement },
      )
      if (movement.crossed || game.rolls.length === 5) {
        beginSettlement(game, next, movement.crossed)
        return game
      }
      break
    }
    case 'ticket': {
      const value = game.tickets[action.color].shift()!
      player.tickets.push({ color: action.color, value })
      record(game, 'ticket', `${player.name} took the ${value} EP ${action.color} ticket.`, {
        seat,
      })
      break
    }
    case 'tile': {
      const previous = game.tiles.find((t) => t.owner === seat)
      game.tiles = [
        ...game.tiles.filter((t) => t.owner !== seat),
        { owner: seat, space: action.space, side: action.side },
      ]
      record(
        game,
        'tile',
        previous
          ? `${player.name} moved their spectator from space ${previous.space} to ${action.space}, ${action.side} side up.`
          : `${player.name} placed a ${action.side} tile on space ${action.space}.`,
        {
          seat,
        },
      )
      break
    }
    case 'finish':
      game.bets[action.pile].push({ seat, color: action.color })
      game.hands[seat] = game.hands[seat].filter((color) => color !== action.color)
      player.handCount--
      record(game, 'finish', `${player.name} placed a face-down ${action.pile} bet.`, { seat })
      break
    case 'partner':
      player.partner = action.partner
      game.players[action.partner].partner = seat
      record(
        game,
        'partner',
        `${player.name} partnered with ${game.players[action.partner].name} for this leg.`,
        { seat },
      )
      break
    case 'copy': {
      const settlement = game.settlement!
      settlement.copies[seat] = action.ticket
      settlement.pending.shift()
      if (settlement.pending.length) game.turn = settlement.pending[0]
      else settleLeg(game)
      return game
    }
  }
  game.turn = next
  return game
}
