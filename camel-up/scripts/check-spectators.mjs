import assert from 'node:assert/strict'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, dirname, basename } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { chromium } from 'playwright-core'
import { build } from 'vite'
import { createGame, legalActions } from '../src/engine.ts'
import { startHost } from '../server/index.mjs'
import { openStorage } from '../server/storage.mjs'
import { makeFixture } from './browser-fixtures.mjs'

// Replay ordinary player actions against the production bundle and an isolated, deterministic game.
const temporary = await mkdtemp(join(tmpdir(), 'camel-spectators-')),
  code = 'SPECTR'
const tokens = Array.from({ length: 3 }, () => randomBytes(32).toString('base64url'))
const seats = ['Alex', 'Maya', 'Rafi'].map((name, i) => ({
  name,
  kind: 'human',
  character: i,
  tokenHash: createHash('sha256').update(tokens[i]).digest('hex'),
}))
const directory = join(temporary, 'rooms'),
  storage = await openStorage(directory)
await storage.save({
  version: 1,
  code,
  mode: 'lan',
  revision: 1,
  humanSeats: 3,
  startingSeat: 0,
  seats,
  game: createGame(seats, 17),
  receipts: {},
})
const tower = await makeFixture(directory, 'TOWERS')
let host, browser
try {
  const staticDir = join(temporary, 'dist')
  await build({ logLevel: 'error', build: { outDir: staticDir, emptyOutDir: true } })
  host = await startHost({ host: '127.0.0.1', port: 0, directory, staticDir })
  const base = 'http://127.0.0.1:' + host.port,
    roomUrl = base + '/api/rooms/' + code
  browser = await chromium.launch({
    headless: true,
    ...(process.env.QA_CHROME ? { executablePath: process.env.QA_CHROME } : { channel: 'chrome' }),
  })
  const pages = [],
    submissions = []
  for (let seat = 0; seat < 3; seat++) {
    const page = await browser.newPage({
      viewport: seat === 1 ? { width: 390, height: 844 } : { width: 1280, height: 720 },
      hasTouch: seat === 1,
      reducedMotion: 'reduce',
    })
    await page.addInitScript(
      ({ code, token, seat }) => {
        localStorage.setItem('cu.seat.' + code, JSON.stringify({ code, token, seatId: seat }))
        localStorage.setItem('cu.reduced', 'true')
        localStorage.setItem('cu.board', seat === 0 ? '2d' : '3d')
      },
      { code, token: tokens[seat], seat },
    )
    page.on('request', (r) => {
      if (r.method() === 'POST' && r.url() === roomUrl + '/actions')
        submissions.push(r.postDataJSON().action)
    })
    await page.goto(base + '/?room=' + code, { waitUntil: 'domcontentloaded' })
    await page.locator('.race-room').waitFor()
    pages.push(page)
  }
  async function snapshot(seat = 0) {
    const response = await fetch(roomUrl, { headers: { Authorization: 'Bearer ' + tokens[seat] } })
    assert.equal(response.status, 200)
    return response.json()
  }
  async function tap(seat, target) {
    if (seat === 1) await target.tap()
    else await target.click()
  }
  async function ready(seat) {
    const p = pages[seat]
    await p.bringToFront()
    await p.getByRole('button', { name: 'Roll pyramid', exact: true }).waitFor()
    return p
  }
  async function placement(seat, side) {
    const p = await ready(seat),
      summary = p.locator('.other-actions summary')
    if (!(await summary.evaluate((el) => el.parentElement.open))) await tap(seat, summary)
    await tap(seat, p.locator('.other-actions button').filter({ hasText: /spectator/i }))
    await tap(
      seat,
      p.getByRole('button', { name: side === 'boo' ? 'Boo −1' : 'Cheer +1', exact: true }),
    )
    await p.locator('.cu-space-legal').first().waitFor()
    const expected = legalActions((await snapshot(seat)).view)
      .filter((a) => a.type === 'tile' && a.side === side)
      .map((a) => a.space)
    const rendered = await p
      .locator('.cu-space-legal')
      .evaluateAll((btns) =>
        btns.map((b) => Number(b.getAttribute('aria-label').match(/^Space (\d+)/)[1])),
      )
    assert.deepEqual(rendered, expected)
    assert.equal(await p.locator('.cu-placement-ring').count(), expected.length)
    assert.equal(
      await p
        .locator('.cu-space-legal')
        .filter({ hasText: /^[+−-]1?$/ })
        .count(),
      0,
    )
  }
  async function touchNumber(seat, space) {
    const page = pages[seat]
    // Use the live physical number target. Playwright waits for its actual painted location
    // to settle after opening/closing the docked inspector, just as for the visible controls.
    await tap(seat, page.locator('.cu-mobile-number').nth(space - 1))
  }
  async function block(seat, space, reason) {
    const before = await snapshot(seat),
      count = submissions.length,
      page = pages[seat]
    await touchNumber(seat, space)
    const details = page.getByRole('dialog', { name: 'Inspect Space ' + space })
    await details.waitFor()
    assert.match(await details.locator('.cu-placement-reason').innerText(), reason)
    await tap(seat, details.getByRole('button', { name: 'Close space details' }))
    for (const side of ['cheer', 'boo']) {
      const response = await fetch(roomUrl + '/actions', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + tokens[seat], 'Content-Type': 'application/json' },
        body: JSON.stringify({
          revision: before.revision,
          requestId: randomUUID(),
          action: { type: 'tile', space, side },
        }),
      })
      assert.equal(response.status, 422)
    }
    const after = await snapshot(seat)
    assert.equal(submissions.length, count)
    assert.equal(after.revision, before.revision)
    assert.deepEqual(after.view, before.view)
  }
  async function commit(seat, space, side) {
    const before = await snapshot(seat)
    const done = pages[seat].waitForResponse(
      (r) => r.request().method() === 'POST' && r.url() === roomUrl + '/actions',
    )
    await touchNumber(seat, space)
    assert((await done).ok())
    const after = await snapshot(seat)
    assert.equal(after.revision, before.revision + 1)
    assert.deepEqual(
      after.view.tiles.filter((t) => t.owner === seat),
      [{ owner: seat, space, side }],
    )
    for (const a of after.view.tiles)
      for (const b of after.view.tiles) if (a.owner !== b.owner) assert(Math.abs(a.space - b.space) > 1)
  }
  await placement(0, 'cheer')
  await block(0, 1, /space 1/i)
  await commit(0, 8, 'cheer')
  await placement(1, 'boo')
  await block(1, 7, /tile is on space 8/i)
  await block(1, 8, /already occupies/i)
  await block(1, 9, /tile is on space 8/i)
  await commit(1, 10, 'boo')
  await placement(2, 'cheer')
  await block(2, 9, /between spectator tiles/i)
  await commit(2, 12, 'cheer')
  await placement(0, 'boo')
  await block(0, 8, /different space/i)
  await block(0, 9, /tile is on space 10/i)
  await commit(0, 7, 'boo')
  await placement(1, 'cheer')
  await block(1, 10, /different space/i)
  await block(1, 11, /tile is on space 12/i)
  await commit(1, 9, 'cheer')
  assert.equal(submissions.length, 5)
  const occupancy = (await snapshot()).view.tiles
  assert(!occupancy.some((t) => t.space === 8 || t.space === 10))
  let rolls = 0,
    numbers = 0
  while (rolls < 130) {
    const row = await snapshot()
    if (row.view.phase === 'finished') break
    const seat = row.view.turn,
      p = await ready(seat)
    if (seat === 0) {
      const faces = await p.locator('.cu-flat-die').evaluateAll((dice) =>
        dice.map((d) => ({
          die: d.dataset.die,
          value: Number(d.dataset.value),
          numeral: d.textContent,
          ink: d.dataset.ink,
          onTrack: !!document
            .elementFromPoint(
              d.getBoundingClientRect().x + d.clientWidth / 2,
              d.getBoundingClientRect().y + d.clientHeight / 2,
            )
            ?.closest('.cu-space-hit'),
        })),
      )
      assert.deepEqual(
        faces,
        row.view.rolls.map((r) => ({
          die: r.die,
          value: r.value,
          numeral: String(r.value),
          ink: r.die === 'grey' ? r.greyColor : r.die === 'yellow' ? 'black' : 'white',
          onTrack: false,
        })),
      )
    }
    if (seat !== 0) {
      // Projected hulls can cross neighboring numbers in the low trackside camera.
      const menu = p.getByRole('button', { name: 'Camera', exact: true })
      await tap(seat, menu)
      await tap(
        seat,
        p.getByRole('button', {
          name: ['Trackside', 'Overhead', 'Grandstand'][Math.floor(rolls / 3) % 3],
          exact: true,
        }),
      )
      await p
        .locator('.race-viewport')
        .evaluate((el) => el.scrollIntoView({ block: 'start', behavior: 'instant' }))
      await delay(90)
      const wrong = await p.locator('.cu-raceboard').evaluate((board) => {
        const failure = []
        const boardRect = board.getBoundingClientRect()
        for (const mark of board.querySelectorAll('.cu-mobile-number')) {
          const x = boardRect.x + (boardRect.width * parseFloat(mark.style.left)) / 100
          const y = boardRect.y + (boardRect.height * parseFloat(mark.style.top)) / 100
          const hit = document.elementFromPoint(x, y)
          const target = hit?.closest('label')?.control ?? hit?.closest('button')
          if (target !== mark.control) failure.push({ n: Number(mark.textContent), x, y })
        }
        return failure
      })
      for (const point of wrong) {
        if (seat === 1) await p.touchscreen.tap(point.x, point.y)
        else await p.mouse.click(point.x, point.y)
        const inspector = p.getByRole('dialog', { name: 'Inspect Space ' + point.n })
        await inspector.waitFor()
        await tap(seat, inspector.getByRole('button', { name: 'Close space details' }))
      }
      numbers += 16
    }
    const result = p.waitForResponse(
      (r) => r.request().method() === 'POST' && r.url() === roomUrl + '/actions',
    )
    await tap(seat, p.getByRole('button', { name: 'Roll pyramid', exact: true }))
    assert((await result).ok())
    rolls++
  }
  const final = await snapshot()
  assert.equal(final.view.phase, 'finished')
  assert(final.view.winners.length)
  const narrow = await browser.newPage({
    viewport: { width: 320, height: 568 },
    hasTouch: true,
    reducedMotion: 'reduce',
  })
  await narrow.addInitScript(
    ({ code, token }) => {
      localStorage.setItem('cu.seat.' + code, JSON.stringify({ code, token, seatId: 0 }))
      localStorage.setItem('cu.board', '3d')
    },
    { code: tower.code, token: tower.tokens[0] },
  )
  await narrow.goto(base + '/?room=' + tower.code, { waitUntil: 'domcontentloaded' })
  await narrow.locator('.cu-stack-count').tap()
  const inspector = narrow.getByRole('dialog', { name: 'Inspect Space 7' })
  assert.equal(await inspector.locator('li').count(), 7)
  const [boardBox, inspectorBox] = await Promise.all([
    narrow.locator('.race-viewport').boundingBox(),
    inspector.boundingBox(),
  ])
  assert(
    boardBox.y + boardBox.height <= inspectorBox.y + 2,
    'The inspector must leave the full track visible.',
  )
  await inspector.getByRole('button', { name: 'Close space details' }).tap()
  await narrow.waitForFunction(() =>
    document.activeElement?.getAttribute('aria-label')?.startsWith('Space 7,'),
  )
  await narrow.close()
  console.log(
    `Verified both spectator faces, occupied/adjacent spaces, relocations, authority rejections and ${numbers} projected numbers through ${rolls} rolls and ${final.view.leg} legs.`,
  )
} finally {
  await browser?.close()
  await host?.close()
  if (
    dirname(resolve(temporary)) === resolve(tmpdir()) &&
    basename(temporary).startsWith('camel-spectators-')
  )
    await rm(temporary, { recursive: true, force: true })
}
