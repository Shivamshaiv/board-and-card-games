// A repeatable figured veneer and felt weave are available while the photographic wood loads.
function noise(x: number, y: number) {
  const sample = (i: number, j: number) => {
    const v = Math.sin(i * 127.1 + j * 311.7) * 43758.5453
    return v - Math.floor(v)
  }
  const x0 = Math.floor(x),
    y0 = Math.floor(y)
  const tx = x - x0,
    ty = y - y0
  const a = tx * tx * (3 - 2 * tx),
    b = ty * ty * (3 - 2 * ty)
  return (
    (sample(x0, y0) * (1 - a) + sample(x0 + 1, y0) * a) * (1 - b) +
    (sample(x0, y0 + 1) * (1 - a) + sample(x0 + 1, y0 + 1) * a) * b
  )
}

function createFinish(felt: boolean) {
  const c = document.createElement('canvas')
  c.width = felt ? 256 : 768
  c.height = felt ? 256 : 384
  const ctx = c.getContext('2d')!,
    data = ctx.createImageData(c.width, c.height)
  for (let y = 0; y < c.height; y++)
    for (let x = 0; x < c.width; x++) {
      const i = (y * c.width + x) * 4,
        u = x / c.width,
        v = y / c.height
      if (felt) {
        const nap = noise(u * 24, v * 24) * 10 + noise(x * 0.72, y * 0.44) * 12
        const weave = (x % 3 === 0 ? 5 : 0) + (y % 3 === 0 ? 3 : 0)
        data.data[i] = 20 + nap * 0.38 + weave
        data.data[i + 1] = 47 + nap * 0.57 + weave
        data.data[i + 2] = 41 + nap * 0.47 + weave
      } else {
        const curl = noise(u * 4.5, v * 5) * 0.075 + Math.sin(u * 8 + v * 12) * 0.012
        const grain = v + curl,
          fiber = noise(u * 7, grain * 135) * 0.65 + noise(u * 36, grain * 280) * 0.35
        const cathedral = 0.5 + 0.5 * Math.sin(2 * Math.PI * (grain * 17 + noise(u * 1.8, v * 5) * 2.6))
        const light = 26 + fiber * 35 + Math.pow(cathedral, 2) * 22 + noise(u * 3, v * 4) * 15
        data.data[i] = light * 1.38
        data.data[i + 1] = light * 0.76
        data.data[i + 2] = light * 0.47
      }
      data.data[i + 3] = 255
    }
  ctx.putImageData(data, 0, 0)
  return c
}

let wood: HTMLCanvasElement | undefined, felt: HTMLCanvasElement | undefined
let image: Promise<HTMLImageElement | undefined> | undefined
export const fallbackWood = () => (wood ??= createFinish(false))
export const wovenFelt = () => (felt ??= createFinish(true))
export function walnutImage() {
  return (image ??= new Promise((resolve) => {
    const im = new Image()
    im.onload = () => resolve(im)
    im.onerror = () => resolve(undefined)
    im.src = '/art/walnut.webp'
  }))
}
