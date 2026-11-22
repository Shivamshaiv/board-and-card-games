import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium } from 'playwright-core'
import { startHost } from '../server/index.mjs'
import { openStorage } from '../server/storage.mjs'
import { makeFixture, stack } from './browser-fixtures.mjs'

const directory = await mkdtemp(join(tmpdir(), 'camel-track-map-'))
let browser, host
try {
  const fixtures = []
  for (const code of ['MAPAAA', 'MAPBBB', 'MAPCCC']) {
    fixtures.push(await makeFixture(directory, code))
    const storage = await openStorage(directory)
    const room = storage.rooms.get(code)
    room.game.tiles = [
      { owner: 1, space: 8, side: 'cheer' },
      { owner: 2, space: 10, side: 'boo' },
    ]
    await storage.save(room)
  }
  host = await startHost({ host: '127.0.0.1', port: 0, directory })
  const base = 'http://127.0.0.1:' + host.port
  browser = await chromium.launch(
    process.env.QA_CHROME ? { executablePath: process.env.QA_CHROME } : { channel: 'chrome' },
  )
  for (const [i, width] of [1440, 390, 320].entries()) {
    const { code, tokens } = fixtures[i]
    const page = await browser.newPage({
      viewport: { width, height: width === 1440 ? 900 : 844 },
      hasTouch: i > 0,
      reducedMotion: 'reduce',
    })
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.addInitScript(
      (seat) => {
        localStorage.setItem('cu.seat.' + seat.code, JSON.stringify(seat))
        localStorage.setItem('cu.reduced', 'true')
      },
      { code, seatId: 0, token: tokens[0] },
    )
    const snapshot = async () =>
      (
        await fetch(base + '/api/rooms/' + code, { headers: { authorization: 'Bearer ' + tokens[0] } })
      ).json()
    await page.goto(base + '/?room=' + code)
    const map = page.getByRole('dialog', { name: 'Track map', exact: true })
    const mapButton = page.getByRole('button', { name: 'Track map', exact: true })
    const cell = (n) => map.locator('[data-space="' + n + '"]')
    await page.locator('.cu-three-surface canvas').waitFor()
    await page.locator('.course-camera-tools .cu-camera-trigger').first().waitFor()
    await mapButton.click()
    assert.match(await cell(8).getAttribute('aria-label'), /Guest 1's cheer tile/)
    assert.doesNotMatch(await cell(8).getAttribute('aria-label'), /empty/)
    const dimensions = await map.locator('.track-map-cell').evaluateAll((nodes) =>
      nodes.map((node) => {
        const r = node.getBoundingClientRect()
        return {
          n: Number(node.dataset.space),
          x: r.x,
          y: r.y,
          w: r.width,
          h: r.height,
          hit: node.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)),
        }
      }),
    )
    assert.equal(dimensions.length, 16)
    for (const a of dimensions) {
      assert.ok(
        a.hit && a.w >= 44 && a.h >= 44 && a.x >= 0 && a.x + a.w <= width + 1,
        JSON.stringify(a),
      )
      for (const b of dimensions.filter((b) => b.n !== a.n))
        assert.ok(
          a.x + a.w <= b.x + 0.1 ||
            b.x + b.w <= a.x + 0.1 ||
            a.y + a.h <= b.y + 0.1 ||
            b.y + b.h <= a.y + 0.1,
        )
      await cell(a.n).click()
      assert.equal(await cell(a.n).getAttribute('aria-pressed'), 'true')
    }
    await cell(7).click()
    const order = await map
      .locator('.track-map-detail li .emblem')
      .evaluateAll((items) => items.map((item) => item.getAttribute('aria-label').toLowerCase()))
    assert.deepEqual(order, [...stack].reverse())
    assert.equal((await snapshot()).revision, 10)
    await page.keyboard.press('Escape')
    assert.equal(await mapButton.evaluate((el) => el === document.activeElement), true)
    await page.getByText('Other moves', { exact: true }).click()
    await page.getByRole('button', { name: 'Place spectator', exact: true }).click()
    await page.getByRole('button', { name: 'Boo −1', exact: true }).click()
    await page.getByRole('button', { name: 'Choose on map', exact: true }).click()
    await cell(9).click()
    await map.getByText(/at least one track space between/).waitFor()
    assert.equal(await map.getByRole('button', { name: /Place boo on/ }).count(), 0)
    if (process.env.QA_CAPTURE && width === 390) {
      await mkdir(process.env.QA_CAPTURE, { recursive: true })
      await page.screenshot({ path: join(process.env.QA_CAPTURE, 'track-map-phone.png') })
    }
    await cell(6).click()
    assert.equal((await snapshot()).revision, 10)
    await map.getByRole('button', { name: 'Place boo on space 6', exact: true }).click()
    await page.waitForFunction(() => !document.querySelector('dialog[aria-label="Track map"]'))
    await page.waitForFunction(() =>
      document.querySelector('.turn-identity')?.textContent.includes('Guest'),
    )
    const after = await snapshot()
    assert.equal(after.revision, 11)
    assert.deepEqual(
      after.view.tiles.find((t) => t.owner === 0),
      { owner: 0, space: 6, side: 'boo' },
    )
    assert.deepEqual(errors, [])
    console.log(
      width +
        'px: all 16 map targets hit, seven camels in order, no overlap, illegal placement blocked, one confirmed move.',
    )
    await page.close()
  }
} finally {
  await browser?.close()
  await host?.close()
  await rm(directory, { recursive: true, force: true })
}
