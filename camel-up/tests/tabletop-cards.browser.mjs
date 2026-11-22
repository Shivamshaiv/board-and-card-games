import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { build } from 'vite'
import { chromium } from 'playwright-core'

const entry = `
import React,{useState} from 'react'
import {createRoot} from 'react-dom/client'
import {TabletopCards} from '/src/tabletop-cards/TabletopCards.tsx'
import {createGame,applyAction,projectGame} from '/src/engine.ts'
import '/src/style.css'
function Demo(){
 const [game,setGame]=useState(()=>createGame([{name:'Amara',character:6},{name:'Patel',character:4},{name:'Nora',character:5}],4581))
 const [view,setView]=useState('3d'),[reduce,setReduce]=useState(false)
 const [active,setActive]=useState(undefined)
 window.present=(id)=>setActive(id);window.setFlat=()=>setView('2d');window.setReduce=()=>setReduce(true)
 window.turn=()=>setGame(previous=>applyAction(previous,previous.turn,{type:'roll'}))
 window.opponentCard=()=>setGame(previous=>applyAction(previous,previous.turn,{type:'finish',color:'purple',pile:'winner'}))
 window.current=projectGame(game,0)
 return React.createElement(TabletopCards,{game:window.current,canAct:game.turn===0,onAction:action=>setGame(s=>applyAction(s,0,action)),view,reducedMotion:reduce,activeEventId:active})
}
createRoot(document.getElementById('demo')).render(React.createElement(Demo))
`
const bundle = await build({
  configFile: false,
  logLevel: 'error',
  publicDir: false,
  build: { write: false, cssCodeSplit: false, rollupOptions: { input: 'virtual:betting-entry' } },
  plugins: [
    {
      name: 'card-table-qa',
      resolveId(id) {
        if (id === 'virtual:betting-entry') return '\0betting-entry.js'
      },
      load(id) {
        if (id === '\0betting-entry.js') return entry
      },
    },
  ],
})
const files = new Map(bundle.output.map((file) => ['/' + file.fileName, file]))
const js = bundle.output.find((f) => f.type === 'chunk' && f.isEntry).fileName
const css = bundle.output.find((f) => f.fileName.endsWith('.css')).fileName
const chrome =
  process.env.CHROME_PATH ||
  [chromium.executablePath(), 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync)
const browser = await chromium.launch({
  executablePath: chrome,
  headless: true,
  args: ['--enable-unsafe-swiftshader'],
})
const issues = []
try {
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } })
  await page.addInitScript(() => {
    window.cardDraws = 0
    const prototype = WebGL2RenderingContext.prototype,
      original = prototype.drawArraysInstanced
    prototype.drawArraysInstanced = function (...args) {
      window.cardDraws++
      return original.apply(this, args)
    }
    const p = (window.cardPerf = {
      start: 0,
      frames: [],
      sets: 0,
      compiles: 0,
      uploads: 0,
      allocations: 0,
    })
    addEventListener(
      'click',
      (event) => {
        if (!p.start && event.target.closest('.tc-market-card')) p.start = performance.now()
      },
      true,
    )
    for (const [method, key] of [
      ['compileShader', 'compiles'],
      ['texImage2D', 'uploads'],
      ['texSubImage2D', 'uploads'],
      ['bufferData', 'allocations'],
      ['clear', 'frames'],
    ]) {
      const original = prototype[method]
      prototype[method] = function (...args) {
        if (p.start && this.canvas.closest('.tc-canvas')) {
          if (key === 'frames' && this.canvas.closest('[data-transfer]'))
            p.frames.push(performance.now())
          else if (key !== 'frames') p[key]++
        }
        return original.apply(this, args)
      }
    }
    for (const property of ['width', 'height']) {
      const d = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, property)
      Object.defineProperty(HTMLCanvasElement.prototype, property, {
        ...d,
        set(value) {
          if (p.start && this.closest('.tc-canvas')) p.sets++
          return d.set.call(this, value)
        },
      })
    }
  })
  page.on('pageerror', (e) => {
    issues.push(e.message)
    console.error(e.stack)
  })
  page.on('console', (m) => {
    if (m.type() === 'error') {
      console.error(m.text())
      if (/WebGL|shader|GLSL/i.test(m.text())) issues.push(m.text())
    }
  })
  await page.route('http://card-table.test/**', async (route) => {
    const path = new URL(route.request().url()).pathname,
      file = files.get(path)
    if (path === '/')
      return route.fulfill({
        contentType: 'text/html',
        body:
          '<meta name="viewport" content="width=device-width,initial-scale=1"/><link rel="stylesheet" href="/' +
          css +
          '"/><main id="demo"></main><script type="module" src="/' +
          js +
          '"></script>',
      })
    if (file)
      return route.fulfill({
        contentType:
          file.type === 'chunk'
            ? 'text/javascript'
            : path.endsWith('.css')
              ? 'text/css'
              : 'application/octet-stream',
        body: file.type === 'chunk' ? file.code : file.source,
      })
    if (/^\/art\/[\w-]+\.webp$/.test(path))
      return route.fulfill({ contentType: 'image/webp', body: await readFile('public' + path) })
    return route.fulfill({ status: 204, body: '' })
  })
  await page.goto('http://card-table.test/')
  try {
    await page.waitForSelector('.tc-webgl', { timeout: 15000 })
  } catch (e) {
    console.error((await page.locator('body').innerText()).slice(0, 500))
    throw e
  }
  await page.waitForFunction(() =>
    Array.from(document.querySelectorAll('.tc-flat-card img')).every(
      (i) => i.complete && i.naturalWidth,
    ),
  )
  assert.ok((await page.locator('.tc-stage').boundingBox()).height <= 185)
  const screenshot = await page
    .locator('.tc-shelf')
    .screenshot({ path: join(tmpdir(), 'camel-up-card-shelf.png') })
  if (process.argv.includes('--preview')) console.log('CARDPREVIEW ' + screenshot.toString('base64'))
  await page.waitForTimeout(130)
  const idle = await page.evaluate(() => window.cardDraws)
  await page.waitForTimeout(300)
  assert.equal(await page.evaluate(() => window.cardDraws), idle)
  assert.ok(idle > 0, 'The card renderer should have submitted real instanced draws.')
  await page.getByRole('button', { name: /Take red leg ticket, pays 5 coins/ }).click()
  await page.waitForFunction(() => window.current.players[0].tickets.length === 1)
  await page.waitForSelector('[data-transfer="ticket"]')
  await page.waitForFunction(() => !document.querySelector('[data-transfer]'))
  const perf = await page.evaluate(() => {
    const p = window.cardPerf,
      gaps = p.frames
        .slice(1)
        .map((n, i) => n - p.frames[i])
        .sort((a, b) => a - b)
    return {
      firstMs: Math.round(p.frames[0] - p.start),
      frames: p.frames.length,
      p95ms: +(gaps[Math.ceil(gaps.length * 0.95) - 1] ?? 0).toFixed(1),
      canvasAssignments: p.sets,
      shaderCompiles: p.compiles,
      textureUploads: p.uploads,
      gpuBufferAllocations: p.allocations,
    }
  })
  console.log('First verified transfer', JSON.stringify(perf))
  assert.equal(
    perf.canvasAssignments,
    0,
    'A transfer at unchanged dimensions must preserve the GPU drawing buffer.',
  )
  assert.equal(perf.shaderCompiles, 0, 'The first card uses the program already visible on the table.')
  assert.equal(
    perf.gpuBufferAllocations,
    0,
    'The flight uses an existing slot in the deck instance buffer.',
  )
  await page.evaluate(() => window.opponentCard())
  await page.waitForFunction(() => window.current.turn === 2)
  await page.evaluate(() => window.turn())
  await page.waitForFunction(() => window.current.turn === 0)
  await page.getByRole('button', { name: 'Finish card', exact: true }).click()
  await page.getByRole('button', { name: 'Select yellow finish card' }).click()
  await page.getByRole('button', { name: 'Overall loser', exact: true }).click()
  await page.getByRole('button', { name: 'Confirm Yellow for overall loser' }).click()
  await page.waitForFunction(() =>
    window.current.ownFinishBets.some((b) => b.pile === 'loser' && b.color === 'yellow'),
  )
  await page.getByRole('button', { name: 'Your tickets, 1 held' }).click()
  assert.ok(await page.getByText('Red leg ticket', { exact: true }).isVisible())
  assert.ok(await page.getByText('Yellow for loser', { exact: true }).isVisible())
  await page.getByRole('button', { name: 'Close', exact: true }).click()
  await page.evaluate(() => window.present(null))
  await page.waitForFunction(() => !document.querySelector('[data-transfer]'))
  await page.evaluate(() => window.turn())
  await page.waitForFunction(() => window.current.turn === 2)
  assert.equal(
    await page.locator('[data-transfer]').count(),
    0,
    'Restores must not animate historical turns.',
  )
  await page.evaluate(() => window.present(window.current.events.at(-1).id))
  await page.waitForSelector('[data-transfer="roll"]')
  for (const width of [768, 390, 320]) {
    await page.setViewportSize({ width, height: 800 })
    await page.waitForTimeout(70)
    const overflow = await page.locator('.tc-shelf').evaluate((e) => e.scrollWidth - e.clientWidth)
    assert.ok(overflow <= 1, `Horizontal overflow at ${width}px`)
    if (width < 761) {
      await page.getByRole('button', { name: 'Leg tickets', exact: true }).click()
      assert.ok(
        await page.getByRole('button', { name: /Take red leg ticket, pays 3 coins/ }).isVisible(),
      )
      await page.getByRole('button', { name: 'Finish card', exact: true }).click()
      assert.ok(await page.getByRole('button', { name: 'Select blue finish card' }).isVisible())
    }
  }
  await page.evaluate(() => window.setFlat())
  await page.waitForSelector('.tc-flat')
  await page.evaluate(() => window.setReduce())
  assert.equal(await page.locator('.tc-stage canvas').count(), 0)
  assert.deepEqual(issues, [])
  console.log(
    'Rendered cards, live transfers, secret commitments, holdings, mobile tabs, and 2D/reduced controls passed.',
  )
  console.log(join(tmpdir(), 'camel-up-card-shelf.png'))
} finally {
  await browser.close()
}
