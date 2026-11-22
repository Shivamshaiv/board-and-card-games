import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { build } from 'vite'
import { chromium } from 'playwright-core'
import { startHost } from '../server/index.mjs'

// Deliberately delay one browser's poll while three independent seat clients act.
// This runs with the flat board and exercises the actual UI without GPU benchmarking.
const temporary = await mkdtemp(join(tmpdir(), 'camel-up-playback-'))
let host, browser
try {
  const output = join(temporary, 'dist')
  await build({ logLevel: 'error', build: { outDir: output, emptyOutDir: true } })
  host = await startHost({
    port: 0,
    host: '127.0.0.1',
    directory: join(temporary, 'saves'),
    staticDir: output,
  })
  const base = 'http://127.0.0.1:' + host.port
  async function call(path, body, token) {
    const response = await fetch(base + '/api/' + path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: 'Bearer ' + token }),
      },
      body: JSON.stringify(body),
    })
    assert.ok(response.ok, 'Host rejected ' + path + ' with ' + response.status)
    return response.json()
  }
  const owner = await call('rooms', { mode: 'lan', name: 'Sam', humanSeats: 3, bots: [] })
  const path = 'rooms/' + owner.code
  const maya = await call(path + '/join', { name: 'Maya' }),
    leo = await call(path + '/join', { name: 'Leo' })
  let current = await call(path + '/start', {}, owner.token)
  browser = await chromium.launch({
    ...(process.env.QA_CHROME ? { executablePath: process.env.QA_CHROME } : { channel: 'chrome' }),
    headless: true,
    args: ['--disable-gpu'],
  })
  const page = await browser.newPage({ viewport: { width: 1150, height: 820 } })
  await page.addInitScript((c) => {
    localStorage.setItem('cu.seat.' + c.code, JSON.stringify(c))
    localStorage.setItem('cu.board', '2d')
    localStorage.setItem('cu.reduced', 'false')
  }, leo)
  let resume,
    paused = false
  const barrier = new Promise((done) => {
    resume = done
  })
  await page.route('**/api/rooms/**', async (route) => {
    if (paused && route.request().method() === 'GET') await barrier
    await route.continue()
  })
  await page.goto(base + '/?room=' + owner.code)
  await page.locator('.turn-identity').waitFor()
  await page.evaluate(() => {
    window.presented = []
    new MutationObserver(() => {
      const station = document.querySelector('.turn-station.presenting')
      if (!station) return
      const actor = station.querySelector('.turn-identity small').textContent
      const action = station.querySelector('.turn-identity h1').textContent
      const exposedMove = document.querySelector(
        '.station-buttons button:enabled, button.roll-button:enabled, .cu-pyramid-pick:enabled, .tc-hand-card:enabled, .tc-market-card:enabled, .tc-commit-button:enabled',
      )
      const marketDisabled = document.querySelectorAll('.tc-market-card:disabled').length === 5
      const line = document.querySelector('.last-play')?.textContent ?? ''
      if (action !== window.presented.at(-1)?.action)
        window.presented.push({ actor, action, blocked: !exposedMove && marketDisabled, line })
    }).observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true,
    })
  })
  paused = true
  for (const [seat, action] of [
    [owner, { type: 'finish', pile: 'loser', color: 'purple' }],
    [maya, { type: 'ticket', color: 'blue' }],
    [leo, { type: 'roll' }],
  ]) {
    current = await call(
      path + '/actions',
      { action, revision: current.revision, requestId: 'turn-' + current.revision },
      seat.token,
    )
  }
  paused = false
  resume()
  await page.waitForFunction(
    () => window.presented.length === 3 && !document.querySelector('.turn-station.presenting'),
    {},
    { timeout: 12000 },
  )
  const shown = await page.evaluate(() => window.presented)
  assert.deepEqual(
    shown.map((f) => f.action),
    ['Playing a finish card', 'Drawing a leg ticket', 'Rolling the pyramid'],
  )
  assert.deepEqual(
    shown.map((f) => f.actor.split(' ·')[0]),
    ['Sam', 'Maya', 'Leo'],
  )
  assert.ok(shown.every((f) => f.blocked))
  assert.ok(!shown[0].line.toLowerCase().includes('purple'))
  await page.reload()
  await page.locator('.turn-identity').waitFor()
  assert.equal(await page.locator('.turn-station.presenting').count(), 0)
  console.log(
    'Passed: three missed actions appeared in order, input stayed gated, the sealed choice stayed private, and refresh resumed live.',
  )
} finally {
  if (browser) await browser.close()
  if (host) await host.close()
  await rm(temporary, { recursive: true, force: true })
}
