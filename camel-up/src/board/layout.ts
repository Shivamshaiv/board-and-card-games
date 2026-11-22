export interface BoardSpace {
  number: number
  camels: readonly string[]
  tile?: { side: 'cheer' | 'boo'; owner: string } | null
}

export interface BoardRoll {
  id: string | number
  color: string
  value: number
  camel?: string
  movement?: { unit: readonly string[]; from: number; landing: number; to: number }
}

export interface BoardDieFace {
  die: string
  value: number
  greyColor?: string
}
export function rollSocket(index: number, spacing = 0.46) {
  return { x: 0.76 + Math.min(4, index) * spacing, z: 0.84 }
}
export function currentLegDice(
  rolled: readonly BoardDieFace[] | undefined,
  last: BoardRoll | null | undefined,
): readonly BoardDieFace[] {
  return rolled ?? (last ? [{ die: last.color, value: last.value, greyColor: last.camel }] : [])
}
export function dieInk(face: BoardDieFace) {
  if (face.die === 'grey') return face.greyColor === 'white' ? 'white' : 'black'
  return face.die === 'yellow' ? 'black' : 'white'
}

export interface RaceBoardProps {
  spaces: readonly BoardSpace[]
  sourceSpaces?: readonly BoardSpace[]
  activeRollId?: number | string | null
  remainingDice?: readonly string[]
  rolledDice?: readonly BoardDieFace[]
  lastRoll?: BoardRoll | null
  selectableSpaces?: readonly number[]
  placementReasons?: Readonly<Record<number, string>>
  cameraToolbar?: HTMLElement | null
  inspectorHost?: HTMLElement | null
  selectedSpace?: number | null
  onSelectSpace?: (space: number) => void
  onPyramidRoll?: () => void
  reducedMotion?: boolean
  view?: '3d' | '2d'
  presentation?: 'table' | 'showcase'
  immersiveHud?: boolean
  on3DReady?: (ready: boolean) => void
  autoRollCamera?: boolean
  onRollAnimationEnd?: (id: string | number) => void
}

export interface TrackPoint {
  x: number
  z: number
  nx: number
  nz: number
}
export const BOARD_WIDTH = 15.6
export const BOARD_DEPTH = 9.25
export const STRAIGHT_HALF = 3.85
export const TRACK_RADIUS = 2.82
const STRAIGHT = STRAIGHT_HALF * 2
const CURVE = Math.PI * TRACK_RADIUS
const LAP = 2 * (STRAIGHT + CURVE)
const OFFSET = 0.145

export const FINISH_COLORS: Record<string, string> = {
  red: '#ce4130',
  yellow: '#f5c135',
  green: '#388b62',
  blue: '#3987c1',
  purple: '#9556a4',
  white: '#fff3d7',
  black: '#393842',
  grey: '#929495',
}
export const MARKS: Record<string, string> = {
  red: '◆',
  yellow: '☀',
  green: '▲',
  blue: '≋',
  purple: '✦',
  white: '○',
  black: '×',
  grey: '•',
}
export const NUMBERS = Array.from({ length: 16 }, (_, i) => i + 1)
export interface FigureHit {
  left: number
  top: number
  width: number
  height: number
  polygon: string
  outline: readonly { x: number; y: number }[]
  order: number
}
export interface Anchor {
  x: number
  y: number
  labelX: number
  labelY: number
  figure?: FigureHit
  tileHit?: FigureHit
  raisedNumber?: boolean
  dieSize?: number
  dieRotation?: number
}
export function hudInsets(w: number, h: number, immersive: boolean) {
  return immersive && w >= 980 && h >= 650
    ? { left: 26, right: Math.max(240, Math.min(350, w * 0.2 + 50)), top: 145, bottom: 158 }
    : { left: 0, right: 0, top: 0, bottom: 0 }
}
export const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

// The shared parameter follows the center line clockwise, with zero at the finish.
export function trackPoint(lap: number, offset = 0): TrackPoint {
  let d = ((((lap + OFFSET) % 1) + 1) % 1) * LAP
  const r = TRACK_RADIUS + offset
  if (d < STRAIGHT) return { x: STRAIGHT_HALF - d, z: r, nx: 0, nz: 1 }
  d -= STRAIGHT
  if (d < CURVE) {
    const a = Math.PI / 2 + d / TRACK_RADIUS
    return { x: -STRAIGHT_HALF + r * Math.cos(a), z: r * Math.sin(a), nx: Math.cos(a), nz: Math.sin(a) }
  }
  d -= CURVE
  if (d < STRAIGHT) return { x: -STRAIGHT_HALF + d, z: -r, nx: 0, nz: -1 }
  const a = -Math.PI / 2 + (d - STRAIGHT) / TRACK_RADIUS
  return { x: STRAIGHT_HALF + r * Math.cos(a), z: r * Math.sin(a), nx: Math.cos(a), nz: Math.sin(a) }
}

export const spaceLap = (n: number) => (n - 0.5) / 16
/** The carved muzzle points along local +X; a spectator never turns the pawn around. */
export function camelBearing(space: number, color: string) {
  const p = trackPoint(spaceLap(space))
  return Math.atan2(-p.nx, -p.nz) + (color === 'black' || color === 'white' ? Math.PI : 0)
}
export const inscription = (n: number) => trackPoint(spaceLap(n) - 0.016, 0.51)
export const PROJECTED_SPACES = [...NUMBERS, 0, 17]
export function racePosition(n: number) {
  if (n >= 1 && n <= 16) return trackPoint(spaceLap(n), -0.07)
  const beforeStart = n < 1,
    edge = trackPoint(spaceLap(beforeStart ? 1 : 16), -0.07)
  const across = trackPoint(0, 0.61),
    t = Math.min(1, Math.max(0, beforeStart ? 1 - n : n - 16))
  const finishX = across.x + (beforeStart ? 0.28 : -0.28)
  return { ...across, x: edge.x + (finishX - edge.x) * t, z: edge.z + (across.z - edge.z) * t }
}
export const numberName = (n: number) => (n === 0 || n === 17 ? 'Across the finish line' : `Space ${n}`)

export interface CamelPlace {
  number: number
  level: number
}
export function locateCamels(spaces: readonly BoardSpace[]) {
  const result = new Map<string, CamelPlace>()
  for (const space of spaces) {
    space.camels.forEach((camel, level) => result.set(camel, { number: space.number, level }))
  }
  return result
}

export function boardLabel(space: BoardSpace) {
  const stack = [...space.camels].reverse().map(capitalize)
  const description = stack.length
    ? `, ${stack.join(', ')}${stack.length > 1 ? ' from top to bottom' : ''}`
    : space.tile
      ? ''
      : ', empty'
  return (
    numberName(space.number) +
    description +
    (space.tile ? `, ${space.tile.owner}'s ${space.tile.side} tile` : '')
  )
}
