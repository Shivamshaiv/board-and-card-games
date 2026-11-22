import assert from 'node:assert/strict'
import { createHash, randomBytes } from 'node:crypto'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium } from 'playwright-core'
import { createGame, legalActions } from '../src/engine.ts'
import { analyzeGame } from '../src/advisor/analysis.ts'
import { startHost } from '../server/index.mjs'
import { openStorage } from '../server/storage.mjs'

// Exercise the production worker and the real LAN projection using disposable seats.
const temporary = await mkdtemp(join(tmpdir(), 'camel-hints-'))
const code = 'HINTQA'
const names = ['Alex', 'Maya', 'Rafi', 'Zoe']
const seats = names.map((_, seatId) => ({
  code,
  seatId,
  token: randomBytes(32).toString('base64url'),
}))
const owner = seats[0]
const savedSeats = names.map((name, i) => ({
  name,
  kind: 'human',
  character: i,
  tokenHash: createHash('sha256').update(seats[i].token).digest('hex'),
}))
const initial = {
  version: 1,
  code,
  mode: 'lan',
  revision: 5,
  humanSeats: 4,
  startingSeat: 0,
  seats: savedSeats,
  game: createGame(savedSeats, 17),
  receipts: {},
}
let host, browser, referenceHost
async function createFixtureHost(directory, staticDir) {
  const storage = await openStorage(directory)
  await storage.save(initial)
  return startHost({ host: '127.0.0.1', port: 0, directory, ...(staticDir && { staticDir }) })
}
function canonical(action) {
  return JSON.stringify(
    Object.fromEntries(Object.entries(action).sort(([a], [b]) => a.localeCompare(b))),
  )
}
async function browserSeat(browser, owner) {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    reducedMotion: 'reduce',
  })
  await page.addInitScript((c) => {
    localStorage.setItem('cu.seat.' + c.code, JSON.stringify(c))
    localStorage.setItem('cu.reduced', 'true')
  }, owner)
  return page
}
async function waitForTabPaint(panel, expected) {
  const state = await panel.evaluate(async (node) => {
    const frame = () => new Promise((done) => requestAnimationFrame(done))
    await document.fonts.ready
    await frame()
    const finite = node
      .getAnimations({ subtree: true })
      .filter((a) => Number.isFinite(a.effect?.getComputedTiming().endTime))
    await Promise.allSettled(finite.map((a) => a.finished))
    await frame()
    await frame()
    await frame()
    return [...node.querySelectorAll('[role=tab]')].map((tab) => ({
      name: tab.textContent.trim(),
      active: tab.getAttribute('aria-selected') === 'true',
      ink: getComputedStyle(tab).borderBottomColor,
    }))
  })
  assert.deepEqual(
    state.filter((t) => t.active).map((t) => t.name),
    [expected],
  )
  assert.notEqual(state.find((t) => t.active).ink, 'rgba(0, 0, 0, 0)')
  assert.ok(state.filter((t) => !t.active).every((t) => t.ink === 'rgba(0, 0, 0, 0)'))
}
async function capture(page, directory, prefix) {
  if (!directory) return
  await mkdir(directory, { recursive: true })
  const panel = page.getByRole('dialog', { name: 'Race advisor', exact: true })
  for (const [label, width, height] of [
    ['desktop', 1440, 900],
    ['phone', 390, 844],
  ]) {
    await page.setViewportSize({ width, height })
    await panel.getByRole('region', { name: 'Recommended move' }).waitFor({ timeout: 45000 })
    await waitForTabPaint(panel, prefix === 'before' ? 'Advice' : 'Best move')
    await page.screenshot({ path: join(directory, prefix + '-' + label + '.jpg'), quality: 90 })
    await panel.getByRole('tab', { name: 'Odds', exact: true }).click()
    await panel.getByRole('table', { name: /Finishing chances|Chance of each racing camel/i }).waitFor()
    await waitForTabPaint(panel, 'Odds')
    await page.screenshot({
      path: join(directory, prefix + '-' + label + '-odds.jpg'),
      quality: 90,
    })
    await panel
      .getByRole('tab', { name: prefix === 'before' ? 'Advice' : 'Best move', exact: true })
      .click()
  }
  await page.setViewportSize({ width: 1440, height: 900 })
}
async function openDetails(summary) {
  if (!(await summary.evaluate((node) => node.parentElement.open))) await summary.click()
}
async function checkOdds(panel, metric, result) {
  const expected = result.racers.map((r) => ({ color: r.color, p: r[metric] }))
  const table = panel.getByRole('table', { name: /Finishing chances/i })
  const rows = await table.locator('tbody tr').evaluateAll((all) =>
    all.map((row) => ({
      name: row.querySelector('th').textContent.toLowerCase(),
      chance: row.querySelector('td').textContent.match(/\d+(?:[.,]\d+)?(?=\s*%)/)?.[0],
    })),
  )
  assert.equal(rows.length, 5)
  const ranked = rows.map((row) => {
    const camel = expected.find((r) => row.name.includes(r.color))
    assert.ok(camel && row.chance, 'Each odds row needs a named camel and readable probability.')
    assert.ok(
      Math.abs(Number(row.chance.replace(',', '.')) / 100 - camel.p) <= 0.0051,
      'Displayed odds disagree with the calculation for ' + camel.color + ' / ' + metric,
    )
    return camel
  })
  assert.equal(new Set(ranked.map((r) => r.color)).size, 5)
  for (let i = 1; i < ranked.length; i++)
    assert.ok(ranked[i].p <= ranked[i - 1].p + 1e-8, 'Finishing odds are out of order.')
}
try {
  host = await createFixtureHost(join(temporary, 'live'))
  const base = 'http://127.0.0.1:' + host.port
  async function api(path, credential, body) {
    const response = await fetch(base + '/api/' + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(credential && { Authorization: 'Bearer ' + credential.token }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    assert.ok(response.ok, path + ' returned ' + response.status)
    return response.json()
  }
  const path = 'rooms/' + owner.code
  let room = await api(path, owner)
  async function roll() {
    room = await api(path + '/actions', seats[room.view.turn], {
      revision: room.revision,
      requestId: 'hint-qa-' + room.revision,
      action: { type: 'roll' },
    })
  }
  browser = await chromium.launch({
    ...(process.env.QA_CHROME ? { executablePath: process.env.QA_CHROME } : { channel: 'chrome' }),
    headless: true,
  })
  if (process.env.QA_BASELINE_DIST && process.env.QA_SCREEN_DIR) {
    referenceHost = await createFixtureHost(join(temporary, 'reference'), process.env.QA_BASELINE_DIST)
    const referencePage = await browserSeat(browser, owner)
    await referencePage.goto('http://127.0.0.1:' + referenceHost.port + '/?room=' + code)
    await referencePage.locator('.cu-raceboard:not(.cu-flat-board) .cu-three-surface canvas').waitFor()
    await referencePage.getByRole('button', { name: 'Hints', exact: true }).click()
    await capture(referencePage, process.env.QA_SCREEN_DIR, 'before')
    await referencePage.close()
  }
  const page = await browserSeat(browser, owner)
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  const buttons = (name) => page.getByRole('button', { name, exact: true })
  const tab = (name) => page.getByRole('tab', { name, exact: true })
  const dialog = page.getByRole('dialog', { name: 'Race advisor', exact: true })
  const guide = page.getByRole('region', { name: 'Recommended move' })
  await page.goto(base + '/?room=' + owner.code)
  await buttons('Roll pyramid').waitFor()
  await page
    .locator('.cu-raceboard:not(.cu-flat-board) .cu-three-surface canvas')
    .waitFor({ timeout: 20000 })
  await page.evaluate(() => document.fonts.ready)
  const course = page.locator('.race-viewport')
  const standard = await course.boundingBox()
  await buttons('Expand board').click()
  await buttons('Show full table').waitFor()
  const expanded = await course.boundingBox()
  const grid = await page.locator('.race-room').evaluate((n) => ({
    rows: getComputedStyle(n).gridTemplateRows,
    areas: getComputedStyle(n).gridTemplateAreas,
    rectangle: n.getBoundingClientRect().toJSON(),
    field: getComputedStyle(n.querySelector('.race-viewport')).gridArea,
  }))
  assert.ok(
    expanded.width * expanded.height > standard.width * standard.height,
    'Expanded view must add visible field area, measured ' +
      JSON.stringify({ standard, expanded, grid }),
  )
  await buttons('Tickets & hand').click()
  await buttons('Expand board').waitFor()
  const baseline = await api(path, owner)
  const forecast = analyzeGame(baseline.view)
  await buttons('Hints').click()
  await guide.waitFor({ timeout: 45000 })
  const actionHeading = guide.locator('h3[data-advisor-action]')
  assert.equal(
    canonical(JSON.parse(await actionHeading.getAttribute('data-advisor-action'))),
    canonical(forecast.actions[0].action),
  )
  assert.ok((await actionHeading.innerText()).trim())
  assert.ok((await guide.locator('[data-advisor-reason]').innerText()).trim().length > 10)
  assert.equal(await tab('Best move').getAttribute('aria-selected'), 'true')
  await capture(page, process.env.QA_SCREEN_DIR, 'hints')
  const otherMoves = dialog.getByRole('region', { name: 'Other moves', exact: true })
  assert.ok(
    !(await dialog
      .locator('summary')
      .filter({ hasText: 'Compare all moves' })
      .evaluate((n) => n.parentElement.open)),
    'Detailed comparisons should start collapsed.',
  )
  await openDetails(dialog.locator('summary').filter({ hasText: 'Compare all moves' }))
  assert.equal(await otherMoves.getByRole('listitem').getByRole('button').count(), 2)
  const choices = dialog.getByRole('combobox', { name: 'Legal move', exact: true })
  assert.deepEqual(
    (await choices.locator('option').evaluateAll((options) => options.map((o) => o.value)))
      .map((s) => canonical(JSON.parse(s)))
      .sort(),
    legalActions(baseline.view).map(canonical).sort(),
    'All legal moves must be available exactly once.',
  )
  assert.equal(canonical(JSON.parse(await choices.inputValue())), canonical(forecast.actions[1].action))
  const tile = forecast.actions.find((a) => a.action.type === 'tile')
  await choices.selectOption(JSON.stringify(tile.action))
  assert.equal(canonical(JSON.parse(await choices.inputValue())), canonical(tile.action))
  const detail = dialog.getByRole('region', { name: 'Selected alternative', exact: true })
  await detail.getByRole('table', { name: 'Income from landings' }).waitFor()
  assert.match(await detail.innerText(), /landing/i)
  await openDetails(detail.locator('summary').filter({ hasText: 'Calculation details' }))
  assert.ok(
    (await detail.locator('details[open] p').count()) >= 2,
    'Expected a model explanation and precision details for the chosen tile.',
  )
  await otherMoves.getByRole('listitem').getByRole('button').nth(1).click()
  assert.equal(
    canonical(JSON.parse(await choices.inputValue())),
    canonical(forecast.actions[2].action),
    'The quick comparison must select the action that was clicked.',
  )
  await openDetails(dialog.locator('summary').filter({ hasText: 'Chances and payouts' }))
  await openDetails(dialog.locator('summary').filter({ hasText: 'How we calculated this' }))
  await tab('Odds').click()
  const periods = dialog.getByRole('group', { name: 'Forecast period' })
  const place = dialog.getByRole('combobox', { name: 'Finishing place' })
  await periods.getByRole('button', { name: 'This leg' }).click()
  await place.selectOption({ label: 'First place' })
  await checkOdds(dialog, 'legFirst', forecast)
  await place.selectOption({ label: 'Second place' })
  await checkOdds(dialog, 'legSecond', forecast)
  await periods.getByRole('button', { name: 'Whole race' }).click()
  await place.selectOption({ label: 'First place' })
  await checkOdds(dialog, 'raceFirst', forecast)
  await place.selectOption({ label: 'Last place' })
  await checkOdds(dialog, 'raceLast', forecast)
  await periods.getByRole('button', { name: 'This leg' }).click()
  await openDetails(dialog.locator('summary').filter({ hasText: 'Leg-ticket payouts' }))
  assert.equal(
    await dialog
      .getByRole('table', { name: 'Available leg-ticket payouts' })
      .locator('tbody tr')
      .count(),
    5,
  )
  await tab('Test a roll').click()
  await buttons('Grey die').click()
  await buttons('Roll 3').click()
  await buttons('Black').click()
  await dialog.getByText(/1 in 36 chance/).waitFor()
  const unchanged = await api(path, owner)
  assert.deepEqual(unchanged.view, baseline.view, 'Reading or previewing a hint changed the game')
  assert.equal(unchanged.revision, baseline.revision)
  await tab('Best move').click()
  await guide.waitFor()
  await dialog.getByRole('button', { name: 'Show on table', exact: true }).click()
  await page.waitForFunction(() =>
    document.activeElement?.matches('button[data-hint-target="true"]:enabled'),
  )
  assert.equal(await dialog.count(), 0)
  const afterTarget = await api(path, owner)
  assert.equal(afterTarget.revision, baseline.revision)
  assert.deepEqual(afterTarget.view, baseline.view)
  await buttons('Hints').click()
  await guide.waitFor()
  // The panel remains open during real network turns; old recommendations must disappear.
  await roll()
  await page.waitForFunction(
    () =>
      !Array.from(document.querySelectorAll('[role="tab"]')).some(
        (n) => n.textContent.trim() === 'Best move',
      ),
  )
  await tab('Odds').click()
  await dialog.getByRole('table', { name: /Finishing chances/i }).waitFor({ timeout: 45000 })
  assert.equal(await guide.count(), 0)
  await periods.getByRole('button', { name: 'This leg' }).click()
  await place.selectOption({ label: 'First place' })
  await checkOdds(dialog, 'legFirst', analyzeGame((await api(path, owner)).view))
  for (let i = 0; i < 3; i++) await roll()
  await tab('Best move').waitFor({ timeout: 20000 })
  await tab('Odds').click()
  await periods.getByRole('button', { name: 'This leg' }).click()
  await dialog
    .locator('.camel-odds-basis')
    .filter({ hasText: 'Exact outcomes' })
    .waitFor({ timeout: 45000 })
  await buttons('Close race advisor').click()
  await buttons('Expand board').click()
  await page.reload()
  await buttons('Show full table').waitFor()
  await buttons('Show full table').click()
  await page.setViewportSize({ width: 390, height: 844 })
  await buttons('Hints').click()
  await guide.waitFor({ timeout: 45000 })
  assert.ok(await dialog.evaluate((n) => n.matches(':modal')))
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
  await page.keyboard.press('Escape')
  assert.equal(await dialog.count(), 0)
  assert.deepEqual(errors, [])
  console.log(
    'Passed expanded field, stored layout, ranked legal choices, exact and sampled odds, grey-die preview, unchanged game state, live turn refresh and the mobile hint sheet.',
  )
} finally {
  if (browser) await browser.close()
  if (referenceHost) await referenceHost.close()
  if (host) await host.close()
  await rm(temporary, { recursive: true, force: true })
}
