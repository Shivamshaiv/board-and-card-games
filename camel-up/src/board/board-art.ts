import { BOARD_DEPTH, BOARD_WIDTH, NUMBERS, spaceLap, trackPoint } from './layout'
import { fallbackWood, walnutImage } from './finishes'

const TERRACOTTA = '#be7855'
const BRASS = '#ddbb73'
const INK = '#263f3c'
const sample = (i: number) => (Math.sin(i * 78.233 + 5.371) * 43758.5453) % 1

function ring(ctx: CanvasRenderingContext2D, start: number, stop: number, out: number, inside: number) {
  const count = Math.max(8, Math.ceil(Math.abs(stop - start) * 180))
  ctx.beginPath()
  for (let i = 0; i <= count; i++) {
    const p = trackPoint(start + ((stop - start) * i) / count, out)
    if (i === 0) ctx.moveTo(p.x, p.z)
    else ctx.lineTo(p.x, p.z)
  }
  for (let i = count; i >= 0; i--) {
    const p = trackPoint(start + ((stop - start) * i) / count, inside)
    ctx.lineTo(p.x, p.z)
  }
  ctx.closePath()
}

function stadium(ctx: CanvasRenderingContext2D, offset: number) {
  ctx.beginPath()
  for (let i = 0; i <= 180; i++) {
    const p = trackPoint(i / 180, offset)
    if (i === 0) ctx.moveTo(p.x, p.z)
    else ctx.lineTo(p.x, p.z)
  }
  ctx.closePath()
}

function line(
  ctx: CanvasRenderingContext2D,
  x: number,
  z: number,
  xx: number,
  zz: number,
  color: string,
  width: number,
) {
  ctx.strokeStyle = color
  ctx.lineWidth = width
  ctx.beginPath()
  ctx.moveTo(x, z)
  ctx.lineTo(xx, zz)
  ctx.stroke()
}

function paintInfield(ctx: CanvasRenderingContext2D, art?: HTMLImageElement) {
  ctx.save()
  stadium(ctx, -0.9)
  ctx.clip()
  const earth = ctx.createLinearGradient(-4, -2, 3, 2)
  earth.addColorStop(0, '#a79c78')
  earth.addColorStop(0.55, '#cbbea1')
  earth.addColorStop(1, '#afa180')
  ctx.fillStyle = earth
  ctx.fillRect(-7, -3.7, 14, 7.4)
  if (art?.naturalWidth) {
    // Crop consistently regardless of the aspect ratio of the generated illustration.
    const w = 12.3,
      h = 4.05,
      scale = Math.max(w / art.naturalWidth, h / art.naturalHeight)
    // Restrained printing ink keeps this illustrated inlay behind the three-dimensional pieces.
    ctx.globalAlpha = 0.7
    ctx.filter = 'saturate(45%) contrast(82%)'
    ctx.drawImage(
      art,
      (-art.naturalWidth * scale) / 2,
      (-art.naturalHeight * scale) / 2,
      art.naturalWidth * scale,
      art.naturalHeight * scale,
    )
  } else {
    // Contour engraving remains as the instant-loading illustrated board.
    for (let j = 0; j < 25; j++) {
      ctx.beginPath()
      for (let k = 0; k <= 90; k++) {
        const x = -7 + k * 0.16
        const y =
          -3.3 + j * 0.24 + 0.23 * Math.sin(x * 1.5 + j * 0.13) + 0.23 * Math.cos(x * 0.75 + j * 0.2)
        if (!k) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.strokeStyle = j % 4 === 0 ? '#b7955b' : '#dab67f'
      ctx.lineWidth = j % 4 === 0 ? 0.014 : 0.009
      ctx.stroke()
    }
    ctx.fillStyle = '#87b0a5'
    ctx.beginPath()
    ctx.ellipse(3.3, 0.35, 1.05, 0.23, -0.2, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

export function createBoardArt(art?: HTMLImageElement, veneer?: HTMLImageElement): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = 2048
  canvas.height = Math.round((canvas.width * BOARD_DEPTH) / BOARD_WIDTH)
  const ctx = canvas.getContext('2d')!
  ctx.scale(canvas.width / BOARD_WIDTH, canvas.height / BOARD_DEPTH)
  ctx.translate(BOARD_WIDTH / 2, BOARD_DEPTH / 2)
  const w = BOARD_WIDTH,
    h = BOARD_DEPTH
  ctx.beginPath()
  ctx.roundRect(-w / 2 + 0.02, -h / 2 + 0.02, w - 0.04, h - 0.04, 0.27)
  ctx.clip()
  const wood = ctx.createLinearGradient(-7, 4, 7, -4)
  wood.addColorStop(0, '#8a5137')
  wood.addColorStop(0.4, '#a9613c')
  wood.addColorStop(0.72, '#81472f')
  wood.addColorStop(1, '#af7450')
  ctx.fillStyle = wood
  ctx.fillRect(-w / 2, -h / 2, w, h)
  ctx.drawImage(veneer ?? fallbackWood(), -w / 2, -h / 2, w, h)
  const varnish = ctx.createLinearGradient(-6, -4, 6, 4)
  varnish.addColorStop(0, 'rgba(126,62,25,.14)')
  varnish.addColorStop(0.45, 'rgba(170,112,54,.11)')
  varnish.addColorStop(1, 'rgba(42,25,20,.35)')
  ctx.fillStyle = varnish
  ctx.fillRect(-w / 2, -h / 2, w, h)
  for (let i = 0; i < 160; i++) {
    const y = -h / 2 + (i * h) / 160
    ctx.beginPath()
    for (let k = 0; k <= 40; k++) {
      const x = -8 + k * 0.4
      const z = y + Math.sin(x * 0.8 + i * 0.8) * 0.012 + Math.sin(x * 2 + i) * 0.014
      if (k === 0) ctx.moveTo(x, z)
      else ctx.lineTo(x, z)
    }
    ctx.strokeStyle = i % 3 ? 'rgba(53,29,19,.035)' : 'rgba(252,203,139,.042)'
    ctx.lineWidth = 0.005 + Math.abs(sample(i)) * 0.01
    ctx.stroke()
  }
  for (const [inset, color, width] of [
    [0.17, BRASS, 0.021],
    [0.24, '#643c2b', 0.015],
  ] as const) {
    ctx.beginPath()
    ctx.roundRect(-w / 2 + inset, -h / 2 + inset, w - 2 * inset, h - 2 * inset, 0.17)
    ctx.strokeStyle = color
    ctx.lineWidth = width
    ctx.stroke()
  }
  // Brass pins and engraved corners frame a dark green racecourse.
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const x = sx * (w / 2 - 0.41),
        z = sz * (h / 2 - 0.41)
      ctx.fillStyle = BRASS
      ctx.beginPath()
      ctx.arc(x, z, 0.07, 0, Math.PI * 2)
      ctx.fill()
      line(ctx, x - 0.035, z + 0.018, x + 0.035, z - 0.018, '#755039', 0.015)
      ctx.save()
      ctx.translate(x, z)
      ctx.scale(-sx, -sz)
      // Fan marquetry in the four triangular spandrels.
      for (let j = 0; j < 9; j++) {
        const a = 0.1 + j * 0.17,
          len = 0.48 + 0.51 * Math.sin((j / 8) * Math.PI)
        ctx.beginPath()
        ctx.moveTo(0.13, 0.13)
        ctx.quadraticCurveTo(
          0.13 + len * 0.52 * Math.cos(a - 0.15),
          0.13 + len * 0.52 * Math.sin(a - 0.15),
          0.13 + len * Math.cos(a),
          0.13 + len * Math.sin(a),
        )
        ctx.quadraticCurveTo(
          0.13 + len * 0.52 * Math.cos(a + 0.12),
          0.13 + len * 0.52 * Math.sin(a + 0.12),
          0.13,
          0.13,
        )
        ctx.fillStyle = j % 2 ? '#927342' : '#b38c50'
        ctx.fill()
      }
      ctx.restore()
    }
  stadium(ctx, 1.03)
  ctx.fillStyle = INK
  ctx.fill()
  stadium(ctx, 0.985)
  ctx.strokeStyle = BRASS
  ctx.lineWidth = 0.025
  ctx.stroke()
  for (let i = 0; i < 196; i++) {
    ring(ctx, (i + 0.08) / 196, (i + 0.88) / 196, 0.939, 0.847)
    ctx.fillStyle = ['#53786a', '#b79559', '#314f46', '#927d52'][i % 4]
    ctx.fill()
  }
  for (const n of NUMBERS) {
    const a = (n - 1) / 16 + 0.0009,
      b = n / 16 - 0.0009
    ring(ctx, a, b, 0.81, -0.73)
    ctx.fillStyle = n % 2 ? '#ba864c' : '#a57445'
    ctx.fill()
    ctx.save()
    ctx.clip()
    const centerPoint = trackPoint(spaceLap(n))
    const texture = veneer ?? fallbackWood()
    ctx.save()
    ctx.translate(centerPoint.x, centerPoint.z)
    ctx.rotate(Math.atan2(-centerPoint.nx, centerPoint.nz))
    // Marquetry strips rotate with the bend. Adjacent wedges are cut from different sections of the veneer.
    const tx = texture.width * (0.06 + ((n * 0.132) % 0.43)),
      ty = texture.height * (0.08 + ((n * 0.073) % 0.46))
    ctx.globalAlpha = 0.57
    ctx.drawImage(texture, tx, ty, texture.width * 0.43, texture.height * 0.37, -2.05, -1.55, 4.1, 3.1)
    ctx.restore()
    ctx.fillStyle = n % 2 ? 'rgba(176,148,103,.44)' : 'rgba(150,123,86,.44)'
    ctx.fillRect(centerPoint.x - 2, centerPoint.z - 2, 4, 4)
    const patina = ctx.createRadialGradient(
      centerPoint.x - 0.24,
      centerPoint.z - 0.28,
      0.04,
      centerPoint.x,
      centerPoint.z,
      1.52,
    )
    patina.addColorStop(0, 'rgba(216,163,91,.08)')
    patina.addColorStop(0.66, 'rgba(115,73,37,.09)')
    patina.addColorStop(1, 'rgba(53,35,25,.28)')
    ctx.fillStyle = patina
    ctx.fillRect(centerPoint.x - 2, centerPoint.z - 2, 4, 4)
    for (let j = 0; j < 95; j++) {
      const x = centerPoint.x + sample(j * 131 + n) * 1.53,
        z = centerPoint.z + sample(j * 53 + n * 11) * 1.45
      ctx.fillStyle = j % 3 ? 'rgba(137,94,43,.18)' : 'rgba(255,245,213,.5)'
      ctx.beginPath()
      ctx.ellipse(x, z, 0.004 + Math.abs(sample(j + n)) * 0.01, 0.006, -0.3, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
    ring(ctx, a, b, 0.793, 0.755)
    ctx.fillStyle = '#c29c58'
    ctx.fill()
    ring(ctx, a + 0.0016, b - 0.0016, -0.49, -0.51)
    ctx.fillStyle = '#c6a260'
    ctx.fill()
    for (let k = 0; k < 5; k++) {
      const point = trackPoint(a + ((b - a) * (k + 0.5)) / 5, -0.57)
      ctx.save()
      ctx.translate(point.x, point.z)
      ctx.rotate(Math.PI * 0.25)
      ctx.fillStyle = '#d6b46f'
      ctx.fillRect(-0.026, -0.026, 0.052, 0.052)
      ctx.restore()
    }
    ring(ctx, a, b, -0.61, -0.7)
    ctx.fillStyle = n % 2 ? TERRACOTTA : '#ac6849'
    ctx.fill()
    const center = trackPoint(spaceLap(n), -0.51)
    ctx.fillStyle = '#94794d'
    ctx.beginPath()
    ctx.arc(center.x, center.z, 0.026, 0, Math.PI * 2)
    ctx.fill()
  }
  stadium(ctx, -0.815)
  ctx.strokeStyle = BRASS
  ctx.lineWidth = 0.035
  ctx.stroke()
  paintInfield(ctx, art)
  stadium(ctx, -0.943)
  ctx.strokeStyle = 'rgba(126,86,38,.7)'
  ctx.lineWidth = 0.032
  ctx.stroke()
  const finish = trackPoint(0)
  for (let row = 0; row < 9; row++)
    for (let col = 0; col < 2; col++) {
      ctx.fillStyle = (row + col) % 2 ? INK : '#f7e7c1'
      ctx.fillRect(finish.x + (col - 1) * 0.087, finish.z - 0.73 + row * 0.172, 0.089, 0.175)
    }
  // Place the finish title on the near apron, within the gilded border.
  ctx.fillStyle = '#382b24'
  ctx.beginPath()
  ctx.roundRect(finish.x - 0.74, 3.97, 1.48, 0.37, 0.07)
  ctx.fill()
  ctx.strokeStyle = BRASS
  ctx.lineWidth = 0.02
  ctx.stroke()
  ctx.font = 'bold .21px Georgia'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#f4daa5'
  ctx.fillText('F I N I S H', finish.x, 4.16)
  return canvas
}

let loadedArt: HTMLImageElement | undefined
/** Shared ink for the flat and three-dimensional enamel plaques. */
export function paintNumberPlate(ctx: CanvasRenderingContext2D, n: number, x: number, y: number) {
  const w = n < 10 ? 0.45 : 0.65
  ctx.beginPath()
  ctx.roundRect(x - w / 2, y - 0.205, w, 0.41, 0.092)
  ctx.fillStyle = '#263e38'
  ctx.fill()
  ctx.lineWidth = 0.018
  ctx.strokeStyle = '#c6ad77'
  ctx.stroke()
  ctx.font = 'bold .332px Georgia'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#fff0cd'
  ctx.fillText(String(n), x, y)
}
let artPromise: Promise<HTMLImageElement | undefined> | undefined
let baseArt: HTMLCanvasElement | undefined
let completeArt: HTMLCanvasElement | undefined
export const defaultBoardArt = () => (baseArt ??= createBoardArt())
export async function illustratedBoardArt() {
  artPromise ??= new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      loadedArt = img
      resolve(img)
    }
    img.onerror = () => resolve(undefined)
    img.src = '/art/nile-inlay.webp'
  })
  const [, veneer] = await Promise.all([artPromise, walnutImage()])
  if (!loadedArt && !veneer) return defaultBoardArt()
  return (completeArt ??= createBoardArt(loadedArt, veneer))
}
