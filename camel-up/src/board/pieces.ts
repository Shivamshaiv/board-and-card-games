import * as T from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'

import { FINISH_COLORS, MARKS, trackPoint } from './layout'

import { Parts, brass, brassLight, carvedCamel } from './carving'
import { pyramid, palm, finishArch } from './landmarks'

export function camelGeometry(color: string) {
  const stains: Record<string, string> = {
    red: '#c34539',
    blue: '#397daf',
    green: '#32855f',
    yellow: '#edb646',
    purple: '#9156a2',
    white: '#f4e7ce',
    black: '#414346',
  }
  return carvedCamel(stains[color] ?? '#ab7953', color)
}

export { finishCarvedPaint } from './pawn-finish'

export const PYRAMID = { x: -0.45, z: 0.05 }
export const PYRAMID_ANGLE = 0.26
export const DIE_DOCK = { x: 0.63, z: 0.78 }

export function sceneryGeometry() {
  const p = new Parts()
  pyramid(p, PYRAMID.x, PYRAMID.z, PYRAMID_ANGLE)
  palm(p, -2.88, 0.3, 0.8, 0.24)
  palm(p, -3.45, 0.48, 0.57, 1.51)
  palm(p, 3.85, -0.04, 0.7, 0.83)
  const f = trackPoint(0)
  finishArch(p, f.x, f.z)
  return p.finish()
}

export function shutterGeometry() {
  const p = new Parts(['#734a36', '#a87543', '#bd8a51'])
  p.box(0.431, 0.34, 0.038, '#734a36', 0, 0, 0)
  for (let i = 0; i < 5; i++)
    p.box(0.41, 0.052, 0.024, i % 2 ? '#a87543' : '#bd8a51', 0, -0.132 + i * 0.065, 0.022)
  for (const dx of [-0.163, 0.163]) {
    p.box(0.028, 0.315, 0.014, brass, dx, 0, 0.04)
    for (const y of [-0.115, 0, 0.115]) p.oval(dx, y, 0.05, 0.011, 0.011, 0.006, brassLight, 0, 7)
  }
  p.box(0.182, 0.071, 0.02, '#28534a', 0, 0.018, 0.044)
  p.oval(0, 0.018, 0.058, 0.025, 0.025, 0.008, brassLight, 0, 10)
  return p.finish()
}
function dieFace(value: number, color: string, crazy?: string) {
  const canvas = document.createElement('canvas')
  canvas.width = 96
  canvas.height = 96
  const ctx = canvas.getContext('2d')!
  const enamel = ctx.createLinearGradient(0, 0, 96, 96)
  const tone = new T.Color(FINISH_COLORS[color] || '#89918a')
  enamel.addColorStop(0, '#' + tone.clone().lerp(new T.Color('#fff0c2'), 0.21).getHexString())
  enamel.addColorStop(0.48, '#' + tone.getHexString())
  enamel.addColorStop(1, '#' + tone.multiplyScalar(0.69).getHexString())
  ctx.fillStyle = enamel
  ctx.fillRect(0, 0, 96, 96)
  for (const [inset, style, width] of [
    [6, 'rgba(255,232,177,.76)', 1.6],
    [9, 'rgba(41,40,34,.24)', 1],
  ] as const) {
    ctx.beginPath()
    ctx.roundRect(inset, inset, 96 - 2 * inset, 96 - 2 * inset, 8)
    ctx.strokeStyle = style
    ctx.lineWidth = width
    ctx.stroke()
  }
  const ink =
    color === 'grey' && crazy === 'black' ? '#222228' : color === 'yellow' ? '#4d3d29' : '#fff0d2'
  // The physical dice use large numerals. On grey, the numeral's ink chooses the camel.
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = 'bold 73px Arial, sans-serif'
  ctx.lineJoin = 'round'
  ctx.lineWidth = 3
  ctx.strokeStyle = ink === '#fff0d2' ? '#43382b' : '#f3e4c7'
  ctx.strokeText(String(value), 48, 50)
  ctx.fillStyle = ink
  ctx.fillText(String(value), 48, 50)
  if (color !== 'grey' && MARKS[color]) {
    ctx.font = 'bold 16px system-ui'
    ctx.fillText(MARKS[color], 76, 76)
  }
  return canvas
}

export function dieAtlas(value: number, color: string, crazy?: string) {
  const atlas = document.createElement('canvas')
  atlas.width = 288
  atlas.height = 192
  const ctx = atlas.getContext('2d')!
  const faces = [
    { v: 1, c: 'black' },
    { v: 2, c: 'white' },
    { v: 3, c: 'black' },
    { v: 1, c: 'white' },
    { v: 2, c: 'black' },
    { v: 3, c: 'white' },
  ]
  const up = faces.findIndex(
    (face) => face.v === value && (color !== 'grey' || face.c === (crazy ?? 'black')),
  )
  if (up >= 0) [faces[2], faces[up]] = [faces[up], faces[2]]
  for (let i = 0; i < 6; i++)
    ctx.drawImage(dieFace(faces[i].v, color, faces[i].c), (i % 3) * 96, Math.floor(i / 3) * 96)
  return atlas
}

export function dieGeometry() {
  const geometry = new RoundedBoxGeometry(0.37, 0.37, 0.37, 2, 0.048),
    uv = geometry.getAttribute('uv')
  for (let i = 0; i < uv.count; i++) {
    const face = Math.floor(i / (uv.count / 6)),
      col = face % 3,
      row = Math.floor(face / 3)
    uv.setXY(i, (col + 0.012 + 0.976 * uv.getX(i)) / 3, (1 - row + 0.012 + 0.976 * uv.getY(i)) / 2)
  }
  return geometry
}
