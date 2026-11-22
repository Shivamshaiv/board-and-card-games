import assert from 'node:assert/strict'
import { createHash, randomBytes } from 'node:crypto'
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { build } from 'vite'
import { chromium } from 'playwright-core'
import { createGame, legalActions } from '../src/engine.ts'
import { startHost } from '../server/index.mjs'
import { openStorage } from '../server/storage.mjs'

const colors = ['red', 'yellow', 'green', 'blue', 'purple']
const temp = await mkdtemp(join(tmpdir(), 'camel-pick-check-')),
  directory = join(temp, 'saves')
let host, browser

// Inspect a single rendered card-shelf frame. Read the actual uploaded instance transforms
// and face-atlas cells, then project their top-face centers into CSS pixels. No game debug
// entry point, persistent draw hook, or frame-rate benchmark is needed in the shipping UI.
function installProbe() {
  const probe = (window.cardAudit = { enabled: false, cards: [], draws: 0 })
  const proto = WebGL2RenderingContext.prototype
  const clear = proto.clear
  proto.clear = function (mask) {
    if (probe.enabled && this.canvas.closest('.tc-canvas') && mask & this.COLOR_BUFFER_BIT)
      probe.cards = []
    return clear.call(this, mask)
  }
  const mult = (m, v) => [0, 1, 2, 3].map((row) => v.reduce((s, n, c) => s + n * m[c * 4 + row], 0))
  function record(gl, count) {
    if (!probe.enabled || !gl.canvas.closest('.tc-canvas') || !count) return
    const program = gl.getParameter(gl.CURRENT_PROGRAM),
      il = gl.getAttribLocation(program, 'instanceMatrix'),
      fl = gl.getAttribLocation(program, 'cardTiles')
    if (il < 0 || fl < 0) return
    const pv = gl.getUniform(program, gl.getUniformLocation(program, 'projectionMatrix')),
      mv = gl.getUniform(program, gl.getUniformLocation(program, 'modelViewMatrix'))
    const original = gl.getParameter(gl.ARRAY_BUFFER_BINDING)
    function values(loc, size) {
      gl.bindBuffer(gl.ARRAY_BUFFER, gl.getVertexAttrib(loc, gl.VERTEX_ATTRIB_ARRAY_BUFFER_BINDING))
      const bytes = gl.getBufferParameter(gl.ARRAY_BUFFER, gl.BUFFER_SIZE),
        all = new Float32Array(bytes / 4)
      gl.getBufferSubData(gl.ARRAY_BUFFER, 0, all)
      return {
        all,
        offset: gl.getVertexAttribOffset(loc, gl.VERTEX_ATTRIB_ARRAY_POINTER) / 4,
        stride: gl.getVertexAttrib(loc, gl.VERTEX_ATTRIB_ARRAY_STRIDE) / 4 || size,
      }
    }
    const matrices = values(il, 16),
      faces = values(fl, 2)
    gl.bindBuffer(gl.ARRAY_BUFFER, original)
    for (let i = 0; i < count; i++) {
      const at = matrices.offset + matrices.stride * i,
        m = matrices.all.subarray(at, at + 16)
      const projected = mult(pv, mult(mv, mult(m, [0, 0, 0.5, 1])))
      probe.cards.push({
        face: faces.all[faces.offset + faces.stride * i],
        x: (projected[0] / projected[3] + 1) / 2,
        y: (1 - projected[1] / projected[3]) / 2,
        z: projected[2] / projected[3],
      })
    }
    probe.draws++
  }
  for (const name of ['drawArraysInstanced', 'drawElementsInstanced']) {
    const draw = proto[name]
    proto[name] = function (...args) {
      record(this, args.at(-1))
      return draw.apply(this, args)
    }
  }
}
async function seed(code) {
  const tokens = Array.from({ length: 3 }, () => randomBytes(32).toString('base64url'))
  const seats = tokens.map((t, i) => ({
    kind: 'human',
    name: ['Host', 'Maya', 'Lee'][i],
    character: i,
    tokenHash: createHash('sha256').update(t).digest('hex'),
  }))
  const game = createGame(seats, 17)
  game.leg = 2
  game.receipts = seats.map((_, seat) => ({
    leg: 1,
    seat,
    lines:
      seat === 0
        ? [
            { label: 'pyramid ticket', value: 1 },
            { label: 'blue ticket (5)', value: -1 },
          ]
        : [],
    change: 0,
    balance: 3,
  }))
  for (const [i, color] of colors.entries())
    for (let n = 0; n < i % 4; n++)
      game.players[1 + (n % 2)].tickets.push({ color, value: game.tickets[color].shift() })
  for (const [seat, pile, color] of [
    [1, 'winner', 'red'],
    [2, 'loser', 'purple'],
  ]) {
    game.bets[pile].push({ seat, color })
    game.hands[seat] = game.hands[seat].filter((c) => c !== color)
    game.players[seat].handCount--
  }
  const store = await openStorage(directory)
  await store.save({
    version: 1,
    code,
    mode: 'lan',
    revision: 8,
    humanSeats: 3,
    startingSeat: 0,
    seats,
    game,
    receipts: {},
  })
  return { code, tokens }
}
async function profile(fixture, viewport, mode, base) {
  const mobile = viewport.width < 600
  const ctx = await browser.newContext({
    viewport,
    hasTouch: mobile,
    isMobile: mobile,
    deviceScaleFactor: 1,
    reducedMotion: 'no-preference',
  })
  const page = await ctx.newPage(),
    errors = []
  page.setDefaultTimeout(9000)
  page.on('pageerror', (e) => errors.push(e.message))
  await page.addInitScript(
    ({ fixture, mode }) => {
      localStorage.setItem(
        'cu.seat.' + fixture.code,
        JSON.stringify({ code: fixture.code, seatId: 0, token: fixture.tokens[0] }),
      )
      localStorage.setItem('cu.board', mode)
      localStorage.setItem('cu.reduced', 'false')
    },
    { fixture, mode },
  )
  await page.addInitScript(installProbe)
  async function api(seat = 0, action) {
    const response = await fetch(base + '/api/rooms/' + fixture.code + (action ? '/actions' : ''), {
      headers: {
        authorization: 'Bearer ' + fixture.tokens[seat],
        'content-type': 'application/json',
      },
      method: action ? 'POST' : 'GET',
      body: action ? JSON.stringify(action) : undefined,
    })
    assert.ok(response.ok, 'Host returned ' + response.status)
    return response.json()
  }
  const get = (name) => page.getByRole('button', { name, exact: true })
  const shelf = page.locator('.tc-stage')
  async function redraw() {
    if (mode !== '3d') return
    await page.evaluate(() => {
      window.cardAudit.enabled = true
      window.cardAudit.draws = 0
    })
    await page.setViewportSize({ ...viewport, width: viewport.width + 1 })
    await page.waitForTimeout(80)
    await page.evaluate(() => (window.cardAudit.draws = 0))
    await page.setViewportSize(viewport)
    await page.waitForFunction(() => window.cardAudit.draws > 0)
    await page.evaluate(() => (window.cardAudit.enabled = false))
  }
  async function geometry() {
    return shelf.evaluate((stage) => {
      const canvas = stage.querySelector('.tc-canvas canvas')?.getBoundingClientRect()
      const rect = (e) => {
        const r = e.getBoundingClientRect()
        return {
          x: r.x,
          y: r.y,
          w: r.width,
          h: r.height,
          cx: r.x + r.width / 2,
          cy: r.y + r.height / 2,
        }
      }
      const actual = window.cardAudit.cards.map((s) => ({
        ...s,
        cx: canvas ? canvas.x + s.x * canvas.width : 0,
        cy: canvas ? canvas.y + s.y * canvas.height : 0,
      }))
      return [...stage.querySelectorAll('[data-card-slot]')].map((el) => {
        const logical = rect(el),
          button = el.closest('button'),
          bounds = button ? rect(button) : logical,
          art = el.querySelector('.tc-flat-card img')
        const hit = (x, y) =>
          !!button && document.elementFromPoint(x, y)?.closest('button') === button
        const layers = actual
          .filter(
            (c) =>
              Math.abs(c.cx - logical.cx) < logical.w / 2 &&
              Math.abs(c.cy - logical.cy) < logical.h / 2,
          )
          .sort((a, b) => a.z - b.z)
        const item = stage.classList.contains('tc-webgl') ? layers[0] : art ? rect(art) : undefined
        const visible =
          el.checkVisibility({ visibilityProperty: true }) &&
          el.clientWidth > 0 &&
          el.clientHeight > 0
        return {
          slot: el.dataset.cardSlot,
          visible,
          logical,
          bounds,
          face: item?.face,
          art: item ? { x: item.cx, y: item.cy } : null,
          src: art?.getAttribute('src'),
          label: button?.getAttribute('aria-label'),
          text: button?.innerText,
          artHit: item ? hit(item.cx, item.cy) : false,
          centerHit: hit(bounds.cx, bounds.cy),
        }
      })
    })
  }
  function assertRow(data, panel, game) {
    const distances = []
    for (const [i, c] of colors.entries()) {
      const r = data.find((x) => x.slot === panel + '-' + c)
      assert.ok(
        r.visible && r.art && r.centerHit && r.artHit,
        'Hiding or obstructing ' + panel + ' ' + c + ': ' + JSON.stringify(r),
      )
      assert.equal(r.src, '/art/card-' + c + '.webp')
      const distance = Math.hypot(r.logical.cx - r.art.x, r.logical.cy - r.art.y)
      distances.push(distance)
      assert.ok(
        distance < 0.35 * Math.min(r.logical.w, r.logical.h),
        'Art is offset from slot: ' + JSON.stringify(r),
      )
      if (panel === 'market') {
        const stock = game.tickets[c],
          value = stock[0],
          face = 5 + 3 * i + (value === 5 ? 0 : value === 3 ? 1 : 2)
        if (mode === '3d') assert.equal(r.face, face, 'Wrong rendered ticket face for ' + c)
        assert.ok(
          r.label.includes(c + ' leg ticket') &&
            r.label.includes('pays ' + value) &&
            r.label.includes(stock.length + ' left'),
        )
        assert.ok(r.text.toLowerCase().includes(c) && r.text.includes(String(value)))
      } else {
        if (mode === '3d') assert.equal(r.face, i, 'Wrong rendered finish card for ' + c)
        assert.equal(r.label, 'Select ' + c + ' finish card')
      }
    }
    return Math.max(...distances)
  }
  async function positionShelf() {
    await shelf.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }))
    await page.evaluate(
      () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
    )
  }
  try {
    await page.goto(base + '/?room=' + fixture.code)
    await get('Roll pyramid').waitFor()
    if (mode === '3d') await page.locator('.tc-stage.tc-webgl canvas').waitFor()
    await shelf.evaluate((el) =>
      Promise.all([...el.querySelectorAll('img')].map((image) => image.decode())),
    )
    await get('Table menu').click()
    await get('Scoring sheet').click()
    const score = page.getByRole('dialog', { name: 'Scoring sheet' })
    const contrast = await score.locator('.receipt[open]').evaluate((container) => {
      const rgb = (s) => s.match(/[\d.]+/g).map(Number)
      const lum = (c) =>
        c
          .slice(0, 3)
          .map((n) => {
            const s = n / 255
            return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
          })
          .reduce((n, x, i) => n + x * [0.2126, 0.7152, 0.0722][i], 0)
      return [...container.querySelectorAll('div>span')].map((el) => {
        const ink = getComputedStyle(el).color
        let bg = 'rgb(255,255,255)'
        for (let n = el; n; n = n.parentElement) {
          const s = getComputedStyle(n).backgroundColor,
            v = rgb(s)
          if (v.length === 3 || v[3] >= 0.999) {
            bg = s
            break
          }
        }
        const [low, high] = [lum(rgb(ink)), lum(rgb(bg))].sort((a, b) => a - b)
        return { text: el.textContent, ink, bg, ratio: +((high + 0.05) / (low + 0.05)).toFixed(2) }
      })
    })
    console.log('Receipt contrast ' + JSON.stringify(contrast))
    assert.ok(
      contrast.some((r) => r.text === '+1') &&
        contrast.some((r) => r.text === '-1') &&
        contrast.every((r) => r.ratio >= 4.5),
      'Low contrast on the expanded ticket receipt.',
    )
    await score.getByRole('button', { name: 'Close', exact: true }).click()
    const initial = await api()
    const b = get('Take a ticket')
    await b.click()
    await positionShelf()
    await redraw()
    const market = await geometry(),
      ticketOffset = assertRow(market, 'market', initial.view)
    const pyramid = market.find((s) => s.slot === 'pyramid-bank')
    function checkPublicPiles(data) {
      const tickets = data.find((s) => s.slot === 'pyramid-bank')
      assert.ok(tickets.visible && tickets.art, 'The pyramid-ticket reserve must be visible.')
      if (mode === '3d') assert.equal(tickets.face, 28)
      for (const [i, pile] of ['winner', 'loser'].entries()) {
        const record = data.find((s) => s.slot === 'pile-' + pile)
        assert.ok(record.visible && record.art, 'Expected the public ' + pile + ' pile.')
        if (mode === '3d')
          assert.equal(record.face, 21 + i, 'Public finish piles must show their owner backs.')
      }
    }
    checkPublicPiles(market)
    if (process.env.QA_CARD_DIR) {
      await mkdir(process.env.QA_CARD_DIR, { recursive: true })
      await shelf.screenshot({
        path: join(process.env.QA_CARD_DIR, [mode, viewport.width, 'market.png'].join('-')),
      })
    }
    await page.locator('.other-actions summary').click()
    await get('Play a finish card').click()
    await positionShelf()
    await redraw()
    const hand = await geometry(),
      handOffset = assertRow(hand, 'hand', initial.view)
    checkPublicPiles(hand)
    const piles = hand.filter((s) => s.slot === 'pile-winner' || s.slot === 'pile-loser')
    if (process.env.QA_CARD_DIR) {
      await mkdir(process.env.QA_CARD_DIR, { recursive: true })
      await shelf.screenshot({
        path: join(process.env.QA_CARD_DIR, [mode, viewport.width, 'hand.png'].join('-')),
      })
    }
    for (const c of colors) {
      const el = page.locator('[data-card-slot="hand-' + c + '"]')
      await el.scrollIntoViewIfNeeded()
      const r = (await geometry()).find((s) => s.slot === 'hand-' + c)
      const point = r.art
      if (mobile) await page.touchscreen.tap(point.x, point.y)
      else await page.mouse.click(point.x, point.y)
      await get('Overall winner').click()
      await get('Confirm ' + c[0].toUpperCase() + c.slice(1) + ' for overall winner').waitFor()
      await get('Overall loser').click()
      await get('Confirm ' + c[0].toUpperCase() + c.slice(1) + ' for overall loser').waitFor()
      await get('Cancel').click()
      const unchanged = await api()
      assert.equal(unchanged.revision, initial.revision)
      assert.deepEqual(unchanged.view, initial.view)
    }
    for (const c of colors) {
      await get('Take a ticket').click()
      await positionShelf()
      await redraw()
      const r = (await geometry()).find((s) => s.slot === 'market-' + c)
      assert.ok(r.artHit)
      const before = await api()
      const point = r.art
      if (mobile) await page.touchscreen.tap(point.x, point.y)
      else await page.mouse.click(point.x, point.y)
      await page.waitForFunction(
        (s) =>
          document
            .querySelector('.last-play')
            ?.textContent.toLowerCase()
            .includes(s + ' ticket'),
        c,
      )
      let after = await api()
      assert.deepEqual(after.view.players[0].tickets.at(-1), {
        color: c,
        value: before.view.tickets[c][0],
      })
      for (const s of [1, 2]) {
        const their = await api(s),
          a = legalActions(their.view).find((a) => a.type === 'tile')
        after = await api(s, {
          action: a,
          requestId: 'return-' + after.revision,
          revision: after.revision,
        })
      }
    }
    assert.deepEqual(errors, [])
    return {
      mode,
      width: viewport.width,
      marketMaxOffset: +ticketOffset.toFixed(2),
      finishMaxOffset: +handOffset.toFixed(2),
      pyramid: {
        visible: pyramid.visible,
        shape: !!pyramid.art,
        width: pyramid.logical.w,
        height: pyramid.logical.h,
      },
      piles: piles.map((p) => ({ id: p.slot, visible: p.visible, shape: !!p.art, face: p.face })),
    }
  } finally {
    await ctx.close()
  }
}
try {
  const fixtures = []
  for (const suffix of ['A', 'B', 'C', 'D']) fixtures.push(await seed('CARDS' + suffix))
  const staticDir = join(temp, 'dist')
  await build({ logLevel: 'error', build: { outDir: staticDir, emptyOutDir: true } })
  host = await startHost({ host: '127.0.0.1', port: 0, directory, staticDir })
  browser = await chromium.launch({
    ...(process.env.QA_CHROME ? { executablePath: process.env.QA_CHROME } : { channel: 'chrome' }),
    headless: true,
  })
  let i = 0
  for (const viewport of [
    { width: 1366, height: 768 },
    { width: 390, height: 844 },
  ])
    for (const mode of ['3d', '2d']) {
      console.log(
        JSON.stringify(
          await profile(fixtures[i++], viewport, mode, 'http://127.0.0.1:' + host.port),
        ),
      )
    }
} finally {
  if (browser) await browser.close()
  if (host) await host.close()
  await rm(temp, { recursive: true, force: true })
}
