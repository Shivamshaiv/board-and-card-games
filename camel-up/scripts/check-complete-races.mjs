import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { build } from 'vite'
import { chromium } from 'playwright-core'
import { startHost } from '../server/index.mjs'

// Human moves go through real controls. The API is read only and independently
// verifies each receipt, resulting turn and final winner.
const temporary = await mkdtemp(join(tmpdir(), 'camel-complete-races-'))
let host, browser
const button = (p, name) => p.getByRole('button', { name, exact: true })
async function client(base, width) {
  const ctx = await browser.newContext({
    viewport: { width, height: width < 600 ? 844 : 850 },
    reducedMotion: 'reduce',
    hasTouch: width < 600,
    isMobile: width < 600,
  })
  await ctx.addInitScript(() => {
    localStorage.setItem('cu.board', '2d')
    localStorage.setItem('cu.reduced', 'true')
  })
  const page = await ctx.newPage(),
    errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.setDefaultTimeout(12000)
  await page.goto(base)
  return { ctx, page, errors }
}
async function read(page) {
  return page.evaluate(async () => {
    const code = new URLSearchParams(location.search).get('room')
    const cred = JSON.parse(localStorage.getItem('cu.seat.' + code))
    const response = await fetch('/api/rooms/' + code, {
      headers: { authorization: 'Bearer ' + cred.token },
    })
    if (!response.ok) throw Error('Snapshot ' + response.status)
    return response.json()
  })
}
async function showScore(page) {
  await button(page, 'Table menu').click()
  await button(page.getByRole('dialog', { name: 'Table menu' }), 'Scoring sheet').click()
  const score = page.getByRole('dialog', { name: 'Scoring sheet' })
  await score.waitFor()
  return score
}
async function finishBet(page, c, pile) {
  await page.locator('.other-actions summary').click()
  await button(page, 'Play a finish card').click()
  await button(page, 'Select ' + c + ' finish card').click()
  await button(page, 'Overall ' + pile).click()
  await button(page, 'Confirm ' + c[0].toUpperCase() + c.slice(1) + ' for overall ' + pile).click()
}
async function complete(base, mode) {
  const owner = await client(base, mode === 'solo' ? 1366 : 390),
    clients = [owner],
    p = owner.page
  await button(p, mode === 'solo' ? 'Play Solo' : 'Host LAN Game').click()
  await p.getByLabel('Your name').fill(mode === 'solo' ? 'Solo tester' : 'LAN host')
  await button(p, 'Fewer bots').click()
  if (mode === 'solo') await button(p, 'Easy').click()
  await button(p, mode === 'solo' ? 'Start solo race' : 'Open LAN lobby').click()
  if (mode === 'lan') {
    await p.getByRole('heading', { name: 'Gather at the table' }).waitFor()
    const code = await p.locator('.room-code').innerText(),
      guest = await client(base, 1280)
    clients.push(guest)
    await guest.page.goto(base + '/?room=' + code)
    await guest.page.getByLabel('Your name').fill('LAN guest')
    await button(guest.page, 'Take a seat').click()
    await button(p, 'Start race').click()
  }
  await button(p, 'Roll pyramid').waitFor()
  const count = clients.map(() => 0),
    actions = { finish: 0, ticket: 0, tile: 0, roll: 0 },
    seenLegs = new Set()
  let room = await read(p),
    reviewed = false
  const beginning = room.revision
  await button(p, 'Hints').click()
  const hints = p.getByRole('dialog', { name: 'Race advisor' })
  await hints.getByRole('region', { name: 'Recommended move' }).waitFor({ timeout: 45000 })
  await hints.getByRole('tab', { name: 'Odds', exact: true }).click()
  await hints.getByRole('table', { name: /Finishing chances/ }).waitFor()
  await button(hints, 'Close race advisor').click()
  assert.equal((await read(p)).revision, beginning)
  const expires = Date.now() + 180_000
  while (room.status !== 'finished') {
    assert.ok(Date.now() < expires, mode + ' race timed out at leg ' + room.view.leg)
    const seat = room.view.turn
    if (!clients[seat]) {
      await delay(85)
      room = await read(p)
      continue
    }
    const page = clients[seat].page
    await page.locator('.turn-station.my-turn').waitFor({ timeout: 15000 })
    const own = await read(page)
    assert.equal(own.seatId, seat)
    assert.equal(own.view.turn, seat)
    assert.ok(
      own.view.players.every((other, i) =>
        i === seat ? typeof other.coins === 'number' : other.coins === null,
      ),
    )
    const n = count[seat]++
    if (!reviewed && own.view.receipts.length) {
      const score = await showScore(page)
      assert.equal(await score.getByText('Balance after this leg', { exact: true }).count(), 1)
      for (const receipt of own.view.receipts) {
        if (receipt.seat !== seat) assert.equal(receipt.balance, null)
      }
      await button(score, 'Close').click()
      reviewed = true
    }
    const previous = room.revision
    if (n === 0 || (mode === 'solo' && n === 3)) {
      await finishBet(
        page,
        seat === 0 && n === 0 ? 'red' : 'blue',
        seat === 0 && n === 0 ? 'winner' : 'loser',
      )
      actions.finish++
    } else if (n === 1) {
      await button(page, 'Take a ticket').click()
      await page.locator('button.tc-market-card:enabled').first().click()
      actions.ticket++
    } else if (n === 2) {
      await page.locator('.other-actions summary').click()
      await button(page, 'Place spectator').click()
      await page.locator('button.cu-space-legal').first().click()
      actions.tile++
    } else {
      await button(page, 'Roll pyramid').click()
      actions.roll++
    }
    for (let k = 0; k < 100; k++) {
      room = await read(p)
      if (room.revision > previous) break
      await delay(30)
    }
    assert.ok(room.revision > previous, 'A clicked action did not commit.')
    seenLegs.add(room.view.leg)
  }
  assert.ok(reviewed && actions.finish >= 2 && actions.ticket >= 1 && actions.tile >= 1)
  const every = await Promise.all(
    clients.map(async (c) => {
      const page = c.page
      await button(page, 'Final scoring').click({ timeout: 20000 })
      const score = page.getByRole('dialog', { name: 'Scoring sheet' })
      await score.waitFor()
      assert.equal(await score.locator('.winner').count(), 0)
      await button(score, 'Reveal next card').click()
      assert.equal(await score.locator('.finish-result').count(), 1)
      await button(score, 'Close').click()
      await page.reload()
      await button(page, 'Final scoring').click()
      assert.equal(
        await score.locator('.finish-result').count(),
        1,
        'Previously revealed cards should remain revealed after reload.',
      )
      if (await button(score, 'Reveal all').count()) await button(score, 'Reveal all').click()
      assert.ok(
        await score.locator('.winner').evaluate((w) => w === document.activeElement),
        'Final reveal should focus the winning result.',
      )
      const result = await read(page)
      assert.equal(await score.locator('.finish-result').count(), result.view.finishResults.length)
      assert.equal(
        await score.locator('.winner strong').innerText(),
        result.view.winners.map((i) => result.view.players[i].name).join(' & '),
      )
      assert.ok(
        result.view.players.every(
          (v) =>
            typeof v.coins === 'number' &&
            v.tickets.length === 0 &&
            v.pyramidTickets === 0 &&
            v.partner === null,
        ),
      )
      assert.deepEqual(c.errors, [])
      return result.view.players.map((v) => v.coins)
    }),
  )
  assert.deepEqual(every.at(-1), every[0])
  assert.equal(new Set(room.view.receipts.map((r) => r.leg)).size, room.view.leg)
  console.log(
    JSON.stringify({
      mode,
      humanActions: actions,
      legs: room.view.leg,
      finishCards: room.view.finishResults.length,
      totals: every[0],
    }),
  )
  for (const c of clients) await c.ctx.close()
}
try {
  const staticDir = join(temporary, 'dist')
  await build({ logLevel: 'error', build: { outDir: staticDir, emptyOutDir: true } })
  host = await startHost({
    host: '127.0.0.1',
    port: 0,
    directory: join(temporary, 'saves'),
    staticDir,
    botDelay: 160,
  })
  browser = await chromium.launch({
    ...(process.env.QA_CHROME ? { executablePath: process.env.QA_CHROME } : { channel: 'chrome' }),
    headless: true,
    args: ['--disable-webgl'],
  })
  await Promise.all([
    complete('http://127.0.0.1:' + host.port, 'solo'),
    complete('http://127.0.0.1:' + host.port, 'lan'),
  ])
} finally {
  if (browser) await browser.close()
  if (host) await host.close()
  await rm(temporary, { recursive: true, force: true })
}
