import assert from 'node:assert/strict'
import { mkdtemp, rm, stat } from 'node:fs/promises'
import { cpus, platform, release, tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as sleep } from 'node:timers/promises'
import { chromium } from 'playwright-core'
import { startHost } from '../server/index.mjs'
import { makeFixture, stack } from './browser-fixtures.mjs'

const project = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const round = (number) => Math.round(number * 10) / 10
const percentile = (values, q) =>
  [...values].sort((a, b) => a - b)[Math.max(0, Math.ceil(q * values.length) - 1)]
const profiles = [
  { label: 'desktop', width: 1440, height: 900, dpr: 1, touch: false, fpsTarget: 60 },
  { label: 'phone emulation', width: 390, height: 844, dpr: 2, touch: true, fpsTarget: 30 },
]

function setupMeasurements() {
  // The board clears its WebGL surface once per actual redraw. Idle requestAnimationFrame
  // callbacks from the browser or the test cannot inflate the measured frame count.
  window.raceQa = { frames: [], buffers: {}, cards: [], cardDraws: 0, measuring: false }
  const rawFetch = window.fetch
  window.fetch = function (resource, options) {
    const input = window.raceQa.input
    if (!input || options?.method !== 'POST' || !String(resource).endsWith('/actions'))
      return rawFetch.call(this, resource, options)
    input.request = performance.now()
    return rawFetch.call(this, resource, options).then((response) => {
      input.response = performance.now()
      return response
    })
  }
  const drawTarget = new WeakMap()
  const bind = WebGL2RenderingContext.prototype.bindFramebuffer
  WebGL2RenderingContext.prototype.bindFramebuffer = function (target, framebuffer) {
    if (target === this.FRAMEBUFFER || target === this.DRAW_FRAMEBUFFER)
      drawTarget.set(this, framebuffer)
    return bind.call(this, target, framebuffer)
  }
  const original = WebGL2RenderingContext.prototype.clear
  WebGL2RenderingContext.prototype.clear = function (mask) {
    if (
      window.raceQa.measuring &&
      !drawTarget.get(this) &&
      mask & this.COLOR_BUFFER_BIT &&
      this.canvas.closest?.('.cu-three-surface,.tc-canvas')
    ) {
      if (this.canvas.closest('.cu-three-surface')) {
        window.raceQa.frames.push(performance.now())
        const size = this.canvas.width + '×' + this.canvas.height
        window.raceQa.buffers[size] = (window.raceQa.buffers[size] ?? 0) + 1
      } else {
        window.raceQa.cardDraws++
        if (this.canvas.closest('.tc-stage[data-transfer="roll"]'))
          window.raceQa.cards.push(performance.now())
      }
    }
    return original.call(this, mask)
  }
}

async function openFixture(page, base, fixture) {
  const credentials = { code: fixture.code, seatId: 0, token: fixture.tokens[0] }
  await page.goto(base, { waitUntil: 'domcontentloaded' })
  await page.evaluate(
    ({ c, expanded }) => {
      localStorage.setItem('cu.seat.' + c.code, JSON.stringify(c))
      localStorage.setItem('cu.recent', c.code)
      localStorage.setItem('cu.board', '3d')
      localStorage.setItem('cu.expanded-board', String(expanded))
      localStorage.setItem('cu.reduced', 'false')
    },
    { c: credentials, expanded: process.env.QA_EXPANDED === '1' },
  )
  await page.goto(base + '/?room=' + fixture.code)
  await page
    .locator('.cu-raceboard:not(.cu-flat-board) .cu-three-surface canvas')
    .waitFor({ timeout: 15_000 })
  await page.evaluate(() => document.fonts.ready)
  await page.locator('.tc-webgl .tc-canvas canvas').waitFor()
  await page.getByRole('button', { name: 'Roll pyramid' }).waitFor()
}

async function snapshot(base, fixture, seat = 0) {
  const response = await fetch(base + '/api/rooms/' + fixture.code, {
    headers: { authorization: 'Bearer ' + fixture.tokens[seat] },
  })
  assert.equal(response.status, 200)
  return response.json()
}

async function inputToFrame(page, control, touch, selector, contains = '') {
  await control.scrollIntoViewIfNeeded()
  await page.evaluate(
    ({ selector, contains }) => {
      window.raceQa.feedback = new Promise((accept, fail) => {
        document.addEventListener(
          'pointerdown',
          () => {
            const before = performance.now()
            const input = { down: before }
            window.raceQa.input = input
            const observer = new MutationObserver(() => {
              const node = document.querySelector(selector)
              if (!node || !node.textContent.toLowerCase().includes(contains.toLowerCase())) return
              observer.disconnect()
              input.dom = performance.now()
              requestAnimationFrame(() => {
                input.frame = performance.now()
                accept(input.frame - before)
              })
            })
            observer.observe(document.body, {
              subtree: true,
              childList: true,
              attributes: true,
              characterData: true,
            })
            setTimeout(() => {
              observer.disconnect()
              fail(new Error('No visible response for ' + selector))
            }, 10_000)
          },
          { capture: true, once: true },
        )
      })
    },
    { selector, contains },
  )
  if (touch) await control.tap()
  else await control.click()
  return round(await page.evaluate(() => window.raceQa.feedback))
}

async function profileInfo(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('.cu-three-surface canvas')
    const gl = canvas.getContext('webgl2')
    const info = gl.getExtension('WEBGL_debug_renderer_info')
    return {
      viewport: [innerWidth, innerHeight],
      devicePixelRatio,
      drawBuffer: [gl.drawingBufferWidth, gl.drawingBufferHeight],
      boardCssPixels: [canvas.clientWidth, canvas.clientHeight],
      cardCssPixels: [
        document.querySelector('.tc-canvas').clientWidth,
        document.querySelector('.tc-canvas').clientHeight,
      ],
      renderer: info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
      vendor: info ? gl.getParameter(info.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
    }
  })
}

async function checkPhoneControls(page, base, fixture, finishFixture) {
  const inspect = await inputToFrame(
    page,
    page.getByRole('button', { name: /^Space 7,/ }),
    true,
    '.cu-stack-inspector',
  )
  assert.deepEqual(
    (await page.locator('.cu-stack-inspector li').allInnerTexts()).map((s) =>
      s.replace(/^[^a-z]+/i, '').toLowerCase(),
    ),
    [...stack].reverse(),
  )
  await page.getByRole('button', { name: 'Close space details' }).tap()
  const ticket = await inputToFrame(
    page,
    page.getByRole('button', { name: /Take red leg ticket/ }),
    true,
    '.last-play',
    'red ticket',
  )
  assert.deepEqual((await snapshot(base, fixture)).view.players[0].tickets, [
    { color: 'red', value: 5 },
  ])
  await openFixture(page, base, finishFixture)
  await page.getByRole('button', { name: 'Finish card', exact: true }).tap()
  const selectFinishCard = await inputToFrame(
    page,
    page.getByRole('button', { name: 'Select blue finish card', exact: true }),
    true,
    '.tc-commit-button',
    'confirm blue',
  )
  await page.getByRole('button', { name: 'Overall loser', exact: true }).tap()
  const finish = await inputToFrame(
    page,
    page.getByRole('button', { name: 'Confirm Blue for overall loser' }),
    true,
    '.last-play',
    'face-down',
  )
  assert.deepEqual((await snapshot(base, finishFixture)).view.ownFinishBets, [
    { pile: 'loser', color: 'blue' },
  ])
  assert.deepEqual((await snapshot(base, finishFixture, 1)).view.ownFinishBets, [])
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
    true,
    'Horizontal overflow on phone',
  )
  return { inspect, ticket, selectFinishCard, confirmFinish: finish }
}

async function checkFlatBoard(page) {
  await page.getByRole('button', { name: 'Table menu', exact: true }).click()
  await page.getByRole('button', { name: '2D', exact: true }).click()
  await page.keyboard.press('Escape')
  await page.locator('.cu-raceboard.cu-flat-board').waitFor()
  const first = page.getByRole('button', { name: /^Space 1,/ })
  await first.focus()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Enter')
  await page.getByRole('dialog', { name: 'Inspect Space 2' }).waitFor()
  await page.keyboard.press('Escape')
  assert.match(
    await page.evaluate(() => document.activeElement.getAttribute('aria-label')),
    /^Space 2,/,
  )
  await page.getByRole('button', { name: 'Table menu', exact: true }).click()
  await page.getByRole('button', { name: '3D', exact: true }).click()
  await page.keyboard.press('Escape')
  await page.locator('.cu-raceboard:not(.cu-flat-board) .cu-three-surface canvas').waitFor()
  const lost = await page.evaluate(() => {
    const gl = document.querySelector('.cu-three-surface canvas').getContext('webgl2')
    const extension = gl.getExtension('WEBGL_lose_context')
    if (extension) extension.loseContext()
    return Boolean(extension)
  })
  if (lost) await page.locator('.cu-flat-board .cu-board-mode-status').waitFor()
  return {
    keyboardInspection: true,
    restored3D: true,
    contextLossFallback: lost ? 'passed' : 'extension unavailable',
  }
}

async function runProfile(browser, profile, base, fixtures) {
  const context = await browser.newContext({
    viewport: { width: profile.width, height: profile.height },
    deviceScaleFactor: profile.dpr,
    isMobile: profile.touch,
    hasTouch: profile.touch,
    reducedMotion: 'no-preference',
  })
  try {
    const page = await context.newPage()
    const pageErrors = []
    page.on('pageerror', (error) => pageErrors.push(error.message))
    await page.addInitScript(setupMeasurements)
    await openFixture(page, base, fixtures[0])
    const info = await profileInfo(page)
    await sleep(350)
    await page.evaluate(() => {
      window.raceQa.measuring = true
      window.raceQa.frames = []
    })
    await sleep(1600)
    const idleDraws = await page.evaluate(() => {
      window.raceQa.measuring = false
      return { board: window.raceQa.frames.length, cards: window.raceQa.cardDraws }
    })
    const frameIntervals = [],
      rollFeedback = [],
      cardIntervals = [],
      cardFramesPerRoll = [],
      rollDurations = [],
      rollInputPhases = [],
      rasterSizes = {}
    for (let i = 0; i < 3; i++) {
      if (i > 0) await openFixture(page, base, fixtures[i])
      const control = page.getByRole('button', { name: 'Roll pyramid' })
      await control.scrollIntoViewIfNeeded()
      await sleep(350)
      await page.evaluate(() => {
        window.raceQa.frames = []
        window.raceQa.buffers = {}
        window.raceQa.cards = []
        window.raceQa.cardDraws = 0
        window.raceQa.measuring = true
      })
      rollFeedback.push(await inputToFrame(page, control, profile.touch, '.last-play', 'rolled'))
      const input = await page.evaluate(() => window.raceQa.input)
      rollInputPhases.push({
        downToRequest: round(input.request - input.down),
        requestToResponse: round(input.response - input.request),
        responseToUpdate: round(input.dom - input.response),
        updateToFrame: round(input.frame - input.dom),
      })
      await page.locator('.turn-station.presenting').waitFor({ state: 'hidden', timeout: 8000 })
      await sleep(70)
      const { frames, buffers, cards } = await page.evaluate(() => {
        window.raceQa.measuring = false
        return {
          frames: window.raceQa.frames,
          buffers: window.raceQa.buffers,
          cards: window.raceQa.cards,
        }
      })
      for (const [size, count] of Object.entries(buffers))
        rasterSizes[size] = (rasterSizes[size] ?? 0) + count
      assert.ok(
        frames.length > 3,
        'Expected a WebGL animation, received ' + frames.length + ' board redraws.',
      )
      for (let f = 1; f < frames.length; f++) frameIntervals.push(frames[f] - frames[f - 1])
      rollDurations.push(round(frames.at(-1) - frames[0]))
      assert.ok(rollDurations.at(-1) > 2300, 'The racecamera never completed the expected 2.6s roll.')
      for (let f = 1; f < cards.length; f++) cardIntervals.push(cards[f] - cards[f - 1])
      cardFramesPerRoll.push(cards.length)
      assert.ok(cards.length > 2, 'The pyramid-ticket transfer never drew on the cards surface.')
      const state = await snapshot(base, fixtures[i])
      assert.equal(state.view.events.findLast((event) => event.kind === 'roll').movement.unit.length, 7)
    }
    let phoneControls
    if (profile.touch) {
      await openFixture(page, base, fixtures[3])
      const capture = await mkdtemp(join(tmpdir(), 'camel-up-native-mobile-'))
      const shot = join(capture, 'market-390.png')
      await page.screenshot({ path: shot })
      console.log('Mobile market screenshot: ' + shot)
      phoneControls = await checkPhoneControls(page, base, fixtures[3], fixtures[4])
    }
    const flatBoard = profile.touch ? undefined : await checkFlatBoard(page)
    assert.deepEqual(pageErrors, [], 'Unexpected browser errors')
    const fps = (1000 * frameIntervals.length) / frameIntervals.reduce((sum, n) => sum + n, 0)
    return {
      ...info,
      profile: profile.label,
      eightPlayerStackRolls: 3,
      idleDrawsIn1600ms: idleDraws,
      frameSamples: frameIntervals.length,
      measuredRollMs: rollDurations,
      rollInputPhasesMs: rollInputPhases,
      cardTransferFrames: cardFramesPerRoll,
      cardTransferFps: round(
        (cardIntervals.length * 1000) / cardIntervals.reduce((sum, n) => sum + n, 0),
      ),
      cardTransferP95Ms: round(percentile(cardIntervals, 0.95)),
      rollFramebufferSizes: rasterSizes,
      sustainedFps: round(fps),
      p95FrameMs: round(percentile(frameIntervals, 0.95)),
      fpsTarget: profile.fpsTarget,
      rollInputToFrameMs: rollFeedback,
      phoneInputToFrameMs: phoneControls,
      flatBoard,
    }
  } finally {
    await context.close()
  }
}

await stat(join(project, 'dist', 'index.html')).catch(() => {
  throw new Error('Build the game with npm run build before running browser QA.')
})
const directory = await mkdtemp(join(tmpdir(), 'camel-up-browser-'))
let host, browser
try {
  const fixtures = []
  for (const suffix of 'ABCDEFGH') fixtures.push(await makeFixture(directory, 'RACEA' + suffix))
  host = await startHost({ port: 0, host: '127.0.0.1', directory })
  browser = await chromium.launch({
    ...(process.env.QA_CHROME ? { executablePath: process.env.QA_CHROME } : { channel: 'chrome' }),
    headless: true,
    args: [
      '--enable-webgl',
      ...(process.env.QA_SWIFTSHADER === '1'
        ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
        : []),
    ],
  })
  const report = {
    chrome: browser.version(),
    os: platform() + ' ' + release(),
    cpu: cpus()[0]?.model,
    profiles: [],
  }
  const base = 'http://127.0.0.1:' + host.port
  report.profiles.push(await runProfile(browser, profiles[0], base, fixtures.slice(0, 3)))
  report.profiles.push(await runProfile(browser, profiles[1], base, fixtures.slice(3)))
  console.log(JSON.stringify(report, null, 2))
} finally {
  if (browser) await browser.close()
  if (host) await host.close()
  await rm(directory, { recursive: true, force: true })
}
