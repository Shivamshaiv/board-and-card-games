import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { build } from 'vite'
import { chromium } from 'playwright-core'
import { makeReviewFixture, makeFixture } from './browser-fixtures.mjs'
import { startHost } from '../server/index.mjs'

// Probe the real Web Audio output and its scheduled drum onsets without injecting
// any test API into the game. Every room, preference and browser profile is temporary.
const temp = await mkdtemp(join(tmpdir(), 'camel-mix-check-'))
let host, browser
function probeAudio() {
  const Native = window.AudioContext,
    connect = AudioNode.prototype.connect,
    start = OscillatorNode.prototype.start
  const set = AudioParam.prototype.setValueAtTime,
    pitches = new WeakMap(),
    outputs = new WeakMap(),
    ids = new WeakMap()
  const a = (window.soundTest = {
    contexts: [],
    kicks: [],
    notes: 0,
    blocks: [],
    capture: false,
    next: 1,
  })
  window.AudioContext = class extends Native {
    constructor(...args) {
      super(...args)
      a.contexts.push(this)
    }
  }
  AudioParam.prototype.setValueAtTime = function (value, t) {
    pitches.set(this, value)
    return set.call(this, value, t)
  }
  AudioNode.prototype.connect = function (...args) {
    outputs.set(this, args[0])
    if (args[0] instanceof AudioDestinationNode && !a.tap) {
      const ctx = this.context,
        tap = ctx.createScriptProcessor(1024, 1, 1),
        zero = ctx.createGain()
      zero.gain.value = 0
      a.tap = tap
      connect.call(this, tap)
      connect.call(tap, zero)
      connect.call(zero, ctx.destination)
      tap.onaudioprocess = (e) => {
        if (a.capture) a.blocks.push(new Float32Array(e.inputBuffer.getChannelData(0)))
      }
    }
    return connect.apply(this, args)
  }
  OscillatorNode.prototype.start = function (t = 0) {
    a.notes++
    if (this.type === 'sine' && pitches.get(this.frequency) === 163) {
      const bus = outputs.get(outputs.get(this))
      if (!ids.has(bus)) ids.set(bus, a.next++)
      a.kicks.push({ t, id: ids.get(bus) })
    }
    return start.call(this, t)
  }
}
async function swipe(page, x, y, dy) {
  const c = await page.context().newCDPSession(page)
  const point = (y) => ({ x, y, id: 0, radiusX: 4, radiusY: 4 })
  await c.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point(y)] })
  for (let n = 1; n <= 8; n++) {
    await c.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [point(y + (dy * n) / 8)],
    })
    await sleep(20)
  }
  await c.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await c.detach()
  await sleep(180)
}
async function audioClip(page) {
  const result = await page.evaluate(() => {
    const a = window.soundTest
    a.capture = false
    const original = a.contexts[0].sampleRate,
      rate = 24000,
      frames = new Float32Array(a.blocks.length * 1024)
    a.blocks.forEach((b, i) => frames.set(b, i * 1024))
    a.blocks = []
    const length = Math.floor((frames.length * rate) / original),
      bytes = new Uint8Array(44 + length * 2),
      v = new DataView(bytes.buffer)
    const word = (i, s) => [...s].forEach((c, j) => (bytes[i + j] = c.charCodeAt(0)))
    word(0, 'RIFF')
    v.setUint32(4, 36 + length * 2, true)
    word(8, 'WAVE')
    word(12, 'fmt ')
    v.setUint32(16, 16, true)
    v.setUint16(20, 1, true)
    v.setUint16(22, 1, true)
    v.setUint32(24, rate, true)
    v.setUint32(28, rate * 2, true)
    v.setUint16(32, 2, true)
    v.setUint16(34, 16, true)
    word(36, 'data')
    v.setUint32(40, length * 2, true)
    let energy = 0,
      peak = 0
    for (let i = 0; i < length; i++) {
      const sample = frames[Math.floor((i * original) / rate)]
      energy += sample * sample
      peak = Math.max(peak, Math.abs(sample))
      v.setInt16(44 + 2 * i, Math.round(Math.max(-1, Math.min(1, sample)) * 32767), true)
    }
    let binary = ''
    for (let i = 0; i < bytes.length; i += 8192)
      binary += String.fromCharCode(...bytes.subarray(i, i + 8192))
    return {
      data: btoa(binary),
      seconds: length / rate,
      peakDB: 20 * Math.log10(peak),
      rmsDB: 20 * Math.log10(Math.sqrt(energy / length)),
    }
  })
  const { data, ...summary } = result
  if (process.env.QA_AUDIO_DIR) {
    await mkdir(process.env.QA_AUDIO_DIR, { recursive: true })
    await writeFile(
      join(process.env.QA_AUDIO_DIR, 'race-score-and-roll.wav'),
      Buffer.from(data, 'base64'),
    )
  }
  return summary
}
async function measuredTempo(page, old) {
  await page.waitForFunction(
    (id) => {
      const k = window.soundTest.kicks,
        last = k.at(-1)?.id
      return last !== undefined && last !== id && k.filter((e) => e.id === last).length >= 4
    },
    old,
    { timeout: 10000 },
  )
  return page.evaluate(() => {
    const k = window.soundTest.kicks,
      id = k.at(-1).id,
      group = k.filter((e) => e.id === id)
    return { id, bpm: 240 / (group[3].t - group[0].t) }
  })
}
try {
  const directory = join(temp, 'saves'),
    dist = join(temp, 'dist')
  await build({ logLevel: 'error', build: { outDir: dist, emptyOutDir: true } })
  const fixture = await makeReviewFixture(directory)
  const scrollFixture = await makeFixture(directory, 'SCROLL')
  host = await startHost({ host: '127.0.0.1', port: 0, directory, staticDir: dist })
  browser = await chromium.launch({
    ...(process.env.QA_CHROME ? { executablePath: process.env.QA_CHROME } : { channel: 'chrome' }),
    headless: true,
  })
  async function seat(options, match = fixture) {
    const p = await browser.newPage(options)
    await p.addInitScript((f) => {
      localStorage.setItem(
        'cu.seat.' + f.code,
        JSON.stringify({ code: f.code, seatId: 0, token: f.tokens[0] }),
      )
    }, match)
    await p.addInitScript(probeAudio)
    await p.goto('http://127.0.0.1:' + host.port + '/?room=' + match.code)
    await p.locator('.turn-station').waitFor()
    return p
  }
  const page = await seat({ viewport: { width: 1366, height: 768 } })
  const settings = page.getByRole('button', { name: 'Sound settings', exact: true }),
    panel = page.getByRole('dialog', { name: 'Sound settings' })
  await settings.click()
  const enabled = panel.getByRole('switch', { name: 'Game audio' })
  assert.equal(await enabled.getAttribute('aria-checked'), 'false')
  assert.equal(
    await page.evaluate(() => soundTest.contexts.length),
    0,
    'A fresh game opened the sound device before opt-in.',
  )
  await page.evaluate(() => {
    soundTest.capture = true
  })
  await enabled.click()
  let measure = await measuredTempo(page, 0)
  assert.ok(Math.abs(measure.bpm - 96) < 0.05)
  const actualTempos = [measure.bpm]
  await panel.getByRole('button', { name: 'Close', exact: true }).click()
  await page.getByRole('button', { name: 'Roll pyramid', exact: true }).click()
  await sleep(3200)
  const clip = await audioClip(page)
  assert.ok(
    clip.peakDB < -0.2 && clip.rmsDB > -38,
    'No clean, audible mix captured: ' + JSON.stringify(clip),
  )
  await settings.click()
  for (const bpm of [120, 144]) {
    await panel.getByRole('radio', { name: bpm + ' BPM' }).check()
    measure = await measuredTempo(page, measure.id)
    actualTempos.push(measure.bpm)
    assert.ok(Math.abs(measure.bpm - bpm) < 0.05, 'Measured ' + measure.bpm + ' instead of ' + bpm)
  }
  const music = panel.getByRole('slider', { name: 'Music volume' }),
    fx = panel.getByRole('slider', { name: 'Effects volume' })
  await music.focus()
  await page.keyboard.press('Home')
  assert.equal(await music.inputValue(), '0')
  const silentMusic = await page.evaluate(() => soundTest.notes)
  await sleep(400)
  assert.equal(
    await page.evaluate(() => soundTest.notes),
    silentMusic,
    'Music kept scheduling at zero volume.',
  )
  await fx.focus()
  await page.keyboard.press('End')
  await page.keyboard.press('ArrowLeft')
  assert.equal(await fx.inputValue(), '99')
  await music.focus()
  await page.keyboard.press('End')
  await page.keyboard.press('ArrowLeft')
  assert.equal(await music.inputValue(), '99')
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { value: true, configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await page.waitForFunction(() => soundTest.contexts[0].state === 'suspended')
  const hidden = await page.evaluate(() => soundTest.notes)
  await sleep(350)
  assert.equal(await page.evaluate(() => soundTest.notes), hidden)
  await page.evaluate(() => {
    delete document.hidden
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await page.waitForFunction(() => soundTest.contexts[0].state === 'running' && soundTest.notes > 0)
  await page.reload()
  await page.locator('.turn-station').waitFor()
  assert.equal(
    await page.evaluate(() => soundTest.contexts.length),
    0,
    'Saved audio played before a new gesture.',
  )
  await settings.click()
  assert.equal(await enabled.getAttribute('aria-checked'), 'true')
  assert.ok(await panel.getByRole('radio', { name: '144 BPM' }).isChecked())
  assert.equal(await music.inputValue(), '99')
  assert.equal(await fx.inputValue(), '99')
  await page.waitForFunction(() => soundTest.contexts[0]?.state === 'running')
  await enabled.click()
  await page.waitForFunction(() => soundTest.contexts[0].state === 'suspended')
  const muted = await page.evaluate(() => soundTest.notes)
  await sleep(350)
  assert.equal(await page.evaluate(() => soundTest.notes), muted)
  console.log(
    'Audio verified',
    JSON.stringify({
      measuredBpm: actualTempos.map((x) => Number(x.toFixed(2))),
      recordedMix: clip,
    }),
  )

  const phone = await seat(
    { viewport: { width: 360, height: 640 }, hasTouch: true, isMobile: true },
    scrollFixture,
  )
  const hints = phone.getByRole('button', { name: 'Hints', exact: true }),
    advisor = phone.getByRole('dialog', { name: 'Race advisor' })
  await hints.tap()
  await advisor.getByRole('region', { name: 'Recommended move' }).waitFor()
  const initialY = await phone.evaluate(() => scrollY)
  const body = advisor.locator('.ra-body'),
    b = await body.boundingBox(),
    sheet = await advisor.boundingBox()
  await swipe(phone, b.x + b.width * 0.6, b.y + b.height * 0.75, -Math.min(155, b.height * 0.5))
  assert.ok((await body.evaluate((el) => el.scrollTop)) > 0, 'The sheet did not scroll.')
  await swipe(phone, 70, sheet.y * 0.84, -Math.max(40, sheet.y * 0.48))
  assert.equal(await phone.evaluate(() => scrollY), initialY, 'Backdrop swipe moved the table.')
  await advisor.getByRole('button', { name: 'Close race advisor' }).tap()
  assert.ok(await hints.evaluate((el) => el === document.activeElement))
  await phone.getByRole('button', { name: 'How to play' }).tap()
  const help = phone.getByRole('dialog', { name: 'How to play' }),
    reading = help.locator('.dialog-scroll')
  const header = await help.getByRole('button', { name: 'Close', exact: true }).boundingBox(),
    text = await reading.boundingBox()
  await swipe(phone, text.x + text.width / 2, text.y + text.height * 0.8, -text.height * 0.55)
  assert.ok((await reading.evaluate((el) => el.scrollTop)) > 0)
  assert.ok(
    Math.abs(
      (await help.getByRole('button', { name: 'Close', exact: true }).boundingBox()).y - header.y,
    ) < 1,
  )
  await help.getByRole('button', { name: 'Close', exact: true }).tap()
  await sleep(100)
  assert.equal(
    await help.count(),
    0,
    'The first tap on Close must dismiss Help even while its text is coasting.',
  )
  const holding = phone.getByRole('button', { name: /^Your tickets,/ })
  await holding.scrollIntoViewIfNeeded()
  const startY = await phone.evaluate(() => scrollY)
  await holding.tap()
  const inventory = phone.getByRole('dialog', { name: 'Your tickets' })
  await inventory.getByRole('button', { name: 'Close', exact: true }).tap()
  assert.ok(await holding.evaluate((el) => el === document.activeElement))
  assert.equal(await phone.evaluate(() => scrollY), startY)
  const people = phone.getByRole('button', { name: 'Players', exact: true })
  await people.scrollIntoViewIfNeeded()
  const peopleY = await phone.evaluate(() => scrollY)
  await people.tap()
  const ledger = phone.getByRole('dialog', { name: 'Players at the table' })
  const ledgerBody = ledger.locator('.dialog-scroll')
  const ledgerBox = await ledgerBody.boundingBox()
  await swipe(
    phone,
    ledgerBox.x + ledgerBox.width / 2,
    ledgerBox.y + ledgerBox.height * 0.8,
    -ledgerBox.height * 0.5,
  )
  assert.ok(
    (await ledgerBody.evaluate((el) => el.scrollTop)) > 0,
    'A player ledger should scroll inside its dialog.',
  )
  assert.equal(await phone.evaluate(() => scrollY), peopleY)
  await ledger.getByRole('button', { name: 'Close', exact: true }).tap()
  assert.ok(await people.evaluate((el) => el === document.activeElement))
  await phone.setViewportSize({ width: 320, height: 568 })
  await phone.evaluate(() => scrollTo(0, 0))
  await phone
    .getByRole('button', { name: 'How to play' })
    .getByText('Rules', { exact: true })
    .waitFor()
  const mast = await phone.locator('.mast').evaluate((el) => {
    const outer = el.getBoundingClientRect(),
      brand = el.querySelector('.mast-brand-title'),
      rules = el.querySelector('.mast-help-short')
    function lines(n) {
      const range = document.createRange()
      range.selectNodeContents(n)
      return new Set([...range.getClientRects()].map((r) => Math.round(r.y))).size
    }
    return {
      lines: [lines(brand), lines(rules)],
      bounds: [...el.querySelectorAll('button')].map((b) => {
        const r = b.getBoundingClientRect()
        return {
          label: b.getAttribute('aria-label'),
          w: r.width,
          h: r.height,
          inside:
            r.left >= outer.left - 1 &&
            r.right <= outer.right + 1 &&
            r.top >= outer.top - 1 &&
            r.bottom <= outer.bottom + 1,
        }
      }),
    }
  })
  assert.deepEqual(mast.lines, [1, 1])
  assert.ok(
    mast.bounds.every((b) => b.inside),
    JSON.stringify(mast),
  )
  assert.ok(
    mast.bounds
      .filter((b) => b.label === 'Sound settings' || /full.?screen/i.test(b.label))
      .every((b) => b.w >= 44 && b.h >= 44),
    JSON.stringify(mast),
  )
  console.log('320px race masthead ' + JSON.stringify(mast))
  const narrow = await seat({ viewport: { width: 790, height: 540 } }, scrollFixture)
  await narrow.getByRole('button', { name: 'Hints', exact: true }).click()
  const desktopDrawer = narrow.getByRole('dialog', { name: 'Race advisor' })
  await desktopDrawer.getByRole('region', { name: 'Recommended move' }).waitFor()
  assert.ok(!(await desktopDrawer.evaluate((el) => el.matches(':modal'))))
  const available = await narrow.evaluate(() => document.documentElement.scrollHeight - innerHeight)
  assert.ok(available > 20, 'Expected a wheel-scrollable table at this viewport.')
  await narrow.mouse.move(52, 270)
  await narrow.mouse.wheel(0, 240)
  await narrow.waitForFunction(() => scrollY > 10)
  console.log(
    JSON.stringify({
      measuredBpm: actualTempos.map((x) => Number(x.toFixed(2))),
      recordedMix: clip,
      mute: 'suspended',
      resume: 'user gesture',
      modalScroll: 'contained',
      focus: 'restored',
    }),
  )
} finally {
  if (browser) await browser.close()
  if (host) await host.close()
  await rm(temp, { recursive: true, force: true })
}
