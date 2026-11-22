import type { Action, Color, Difficulty, GameEvent, GameView, Pile } from './engine.ts'

export type Mode = 'solo' | 'lan'
export interface Setup {
  humanSeats: number
  bots: Difficulty[]
  startingSeat: number
  character?: number
}
export interface Credentials {
  code: string
  token: string
  seatId: number
}
export type PresentedAction =
  | Exclude<Action, { type: 'finish' | 'ticket' | 'copy' }>
  | { type: 'finish'; pile: Pile; color?: Color }
  | { type: 'ticket'; color: Color; value: number }
  | { type: 'copy'; ticket?: number | null; label?: string; value?: number }
export interface TurnSummary {
  revision: number
  at: number
  actor: number
  leg: number
  action: PresentedAction
  text: string
  events: GameEvent[]
}
export interface TurnFrame extends TurnSummary {
  view: GameView
}
export interface PositionWire {
  board: Omit<GameView, 'events' | 'receipts' | 'finishResults'>
  eventEnd: number
  receiptEnd: number
  resultEnd: number
}
export interface PlaybackWire {
  reset: boolean
  base: { revision: number; state: PositionWire } | null
  frames: (TurnSummary & { state: PositionWire })[]
  last: TurnSummary | null
}
export interface Room {
  code: string
  mode: Mode
  status: 'lobby' | 'playing' | 'finished'
  revision: number
  host: boolean
  seatId: number
  humanSeats: number
  startingSeat: number
  joinUrls: string[]
  seats: {
    id: number
    name: string | null
    kind: 'human' | 'bot'
    difficulty?: Difficulty
    character?: number
    connected: boolean
  }[]
  view: GameView | null
  playback?: PlaybackWire
}
export class RequestError extends Error {
  status = 0
}
async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const error = new RequestError(
      (await response.json().catch(() => ({}))).error || 'The host could not complete that request.',
    )
    error.status = response.status
    throw error
  }
  return response.json() as Promise<T>
}
function cursorKey(seat: Pick<Room, 'code' | 'seatId'>) {
  return 'cu.playback.' + seat.code + '.' + seat.seatId
}
const tabCursors = new Map<string, { revision: number; at: number }>()
const liveRefresh = new Set<string>()
export function resyncOnNextPoll(seat: Pick<Room, 'code' | 'seatId'>) {
  liveRefresh.add(cursorKey(seat))
}
export function rememberPresented(seat: Pick<Room, 'code' | 'seatId'>, revision: number) {
  const key = cursorKey(seat),
    record = { revision, at: Date.now() }
  tabCursors.set(key, record)
  try {
    sessionStorage.setItem(key, JSON.stringify(record))
  } catch {
    /* This tab still has an in-memory cursor. */
  }
}
export function presentedCursor(seat: Pick<Room, 'code' | 'seatId'>): number | null {
  const key = cursorKey(seat)
  let record = tabCursors.get(key)
  if (!record)
    try {
      record = JSON.parse(sessionStorage.getItem(key) || 'null')
    } catch {
      /* Storage is optional. */
    }
  return record &&
    Number.isSafeInteger(record.revision) &&
    record.revision >= 0 &&
    Date.now() - record.at < 120_000
    ? record.revision
    : null
}
export async function pollRoom(c: Credentials, previousTag: string | null) {
  const key = cursorKey(c)
  const resync = liveRefresh.has(key)
  const acknowledged = presentedCursor(c)
  const tagged = previousTag?.match(/^"[A-Z2-9]{6}-(\d+)-/)
  const after = resync
    ? null
    : (acknowledged ?? (tagged && !tabCursors.has(key) ? Number(tagged[1]) : null))
  const response = await fetch('/api/rooms/' + c.code + (after === null ? '' : '?after=' + after), {
    cache: 'no-store',
    headers: {
      Authorization: 'Bearer ' + c.token,
      ...(previousTag && !resync ? { 'If-None-Match': previousTag } : {}),
    },
    signal: AbortSignal.timeout(12000),
  })
  // Treat a 304 as an idle heartbeat. No room allocation, JSON parsing, or React update.
  if (response.status === 304) return { tag: previousTag, room: null }
  const room = await readJson<Room>(response)
  if (resync) liveRefresh.delete(key)
  return { tag: response.headers.get('ETag'), room }
}
export async function request<T>(
  path: string,
  credential?: Credentials | null,
  data?: unknown,
): Promise<T> {
  const response = await fetch('/api/' + path, {
    method: data === undefined ? 'GET' : 'POST',
    cache: data === undefined ? 'no-cache' : 'no-store',
    headers: {
      ...(data === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(credential ? { Authorization: 'Bearer ' + credential.token } : {}),
    },
    body: data === undefined ? undefined : JSON.stringify(data),
    signal: AbortSignal.timeout(12000),
  })
  return readJson<T>(response)
}
const memory = new Map<string, string>()
export function getSetting(key: string): string | null {
  try {
    return localStorage.getItem('cu.' + key) ?? memory.get(key) ?? null
  } catch {
    return memory.get(key) ?? null
  }
}
export function setSetting(key: string, value: string) {
  memory.set(key, value)
  try {
    localStorage.setItem('cu.' + key, value)
  } catch {
    /* In-memory seats still work in restricted browsing. */
  }
}
export function readSeat(code: string | null): Credentials | null {
  if (!code) return null
  try {
    const c = JSON.parse(getSetting('seat.' + code) || 'null')
    return c && c.code === code && typeof c.token === 'string' ? c : null
  } catch {
    return null
  }
}
export function rememberSeat(c: Credentials) {
  setSetting('seat.' + c.code, JSON.stringify(c))
  setSetting('recent', c.code)
}
export function requestId() {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (n) =>
    n.toString(16).padStart(2, '0'),
  ).join('')
}
