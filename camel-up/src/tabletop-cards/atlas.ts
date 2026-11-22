import * as T from 'three'
import { BACK, CARD_COLORS, FACE, PAPER_EDGE, PYRAMID_CARD, TICKET } from './model'
import { FINISH_COLORS, MARKS } from '../board/layout'

const tile = 192,
  grid = 6
export function createCardAtlas(redraw: () => void) {
  const c = document.createElement('canvas')
  c.width = c.height = tile * grid
  const ctx = c.getContext('2d')!
  const texture = new T.CanvasTexture(c)
  texture.colorSpace = T.SRGBColorSpace
  texture.anisotropy = 4
  texture.generateMipmaps = true
  let active = true
  const art = new Map<string, HTMLImageElement>()
  const font = (n: number, f = 'Georgia') => `bold ${n}px ${f}`
  function compose(id: number, draw: () => void) {
    ctx.save()
    ctx.translate((id % grid) * tile, Math.floor(id / grid) * tile)
    ctx.beginPath()
    ctx.rect(0, 0, tile, tile)
    ctx.clip()
    draw()
    ctx.restore()
  }
  function text(s: string, x: number, y: number, size: number, color: string, family = 'Georgia') {
    ctx.font = font(size, family)
    ctx.fillStyle = color
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(s, x, y)
  }
  function rect(x: number, y: number, w: number, h: number, color: string) {
    ctx.fillStyle = color
    ctx.fillRect(x, y, w, h)
  }
  function frame(x: number, y: number, w: number, h: number, color: string, l = 1) {
    ctx.strokeStyle = color
    ctx.lineWidth = l
    ctx.strokeRect(x, y, w, h)
  }
  function base() {
    rect(0, 0, tile, tile, '#e8d8ae')
    frame(4, 4, 184, 184, '#805e35', 2)
    frame(8, 8, 176, 176, '#b69254', 1)
  }
  function paint() {
    for (const color of CARD_COLORS) {
      const im = art.get(color),
        ink = FINISH_COLORS[color]
      for (const value of [0, 5, 3, 2]) {
        compose(value ? TICKET(color, value) : FACE(color), () => {
          base()
          rect(11, 10, 170, 171, '#473d32')
          if (im) ctx.drawImage(im, 12, 11, 168, 168)
          const tone = ctx.createLinearGradient(0, 134, 0, 177)
          tone.addColorStop(0, '#11232300')
          tone.addColorStop(1, '#112323ad')
          ctx.fillStyle = tone
          ctx.fillRect(12, 103, 168, 75)
          if (value) {
            rect(131, 11, 49, 65, '#f6e5bd')
            frame(133, 13, 44, 60, '#a6814d', 1.4)
            text(String(value), 155, 37, 36, '#382b20')
            text('EP', 155, 59, 14, '#765532', 'sans-serif')
          }
          rect(12, 151, 168, 28, '#233e36')
          rect(13, 152, 166, 2, '#daa951')
          text(color.toUpperCase(), 98, 167, 15, '#fff2d4', 'sans-serif')
          ctx.fillStyle = ink
          ctx.beginPath()
          ctx.arc(32, 31, 15, 0, Math.PI * 2)
          ctx.fill()
          ctx.strokeStyle = '#efd7a0'
          ctx.lineWidth = 2
          ctx.stroke()
          text(MARKS[color], 32, 31, 17, color === 'yellow' ? '#4a3b29' : '#fff2d0')
        })
      }
    }
    compose(PYRAMID_CARD, () => {
      base()
      const im = art.get('pyramid')
      if (im) ctx.drawImage(im, 12, 12, 168, 157)
      rect(12, 147, 168, 31, '#21473f')
      text('1 EP', 95, 165, 24, '#ffe2a9')
    })
    for (let ch = 0; ch < 8; ch++) {
      compose(BACK(ch), () => {
        rect(0, 0, tile, tile, '#e9d7a9')
        rect(5, 5, 182, 182, '#25493e')
        ctx.strokeStyle = '#678161'
        ctx.lineWidth = 1.3
        for (let j = -tile; j < tile * 2; j += 13) {
          ctx.beginPath()
          ctx.moveTo(j, 5)
          ctx.lineTo(j + tile, 187)
          ctx.stroke()
          ctx.beginPath()
          ctx.moveTo(j, 5)
          ctx.lineTo(j - tile, 187)
          ctx.stroke()
        }
        frame(10, 10, 172, 172, '#dec48b', 3)
        frame(14, 14, 164, 164, '#c1985b')
        ctx.save()
        ctx.beginPath()
        ctx.ellipse(96, 96, 50, 63, 0, 0, Math.PI * 2)
        ctx.clip()
        const image = art.get('portrait-' + ch)
        if (image) ctx.drawImage(image, 42, 37, 108, 121)
        ctx.restore()
        ctx.beginPath()
        ctx.ellipse(96, 96, 51, 64, 0, 0, Math.PI * 2)
        ctx.strokeStyle = '#e6c985'
        ctx.lineWidth = 4
        ctx.stroke()
        for (const y of [23, 169]) text('◆', 96, y, 13, '#edcf88')
      })
    }
    compose(PAPER_EDGE, () => {
      rect(0, 0, tile, tile, '#c6ad7f')
      for (let y = 0; y < tile; y += 13) {
        rect(0, y, tile, 5, '#ead8b0')
        rect(0, y + 6, tile, 2, '#91754b')
      }
    })
    texture.needsUpdate = true
  }
  paint()
  const keys = [...CARD_COLORS, 'pyramid', ...Array.from({ length: 8 }, (_, i) => 'portrait-' + i)]
  Promise.all(
    keys.map(
      (key) =>
        new Promise<void>((resolve) => {
          const im = new Image()
          im.onload = () => {
            if (active) art.set(key, im)
            resolve()
          }
          im.onerror = () => resolve()
          im.src = key.startsWith('portrait-') ? `/art/${key}.webp` : `/art/card-${key}.webp`
        }),
    ),
  ).then(() => {
    if (active) {
      paint()
      redraw()
    }
  })
  return {
    texture,
    dispose() {
      active = false
      texture.dispose()
    },
  }
}
