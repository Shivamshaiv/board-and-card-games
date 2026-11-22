import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { build } from 'vite'
import { chromium } from 'playwright-core'
import { startHost } from '../server/index.mjs'
import { makeReviewFixture } from './browser-fixtures.mjs'

// Cover keyboard/phone focus behavior and force worker failures without changing the
// production bundle. The first analysis uses an actual module worker.
const temporary = await mkdtemp(join(tmpdir(), 'camel-advisor-check-'))
let host, browser
async function inspectMobileIndicator(page, panel) {
  await panel.getByRole('tab', { name: 'Odds', exact: true }).click()
  await panel.getByRole('table', { name: /Finishing chances/i }).waitFor()
  await panel.evaluate(async (node) => {
    await new Promise((done) => requestAnimationFrame(done))
    await Promise.allSettled(
      node
        .getAnimations({ subtree: true })
        .filter((a) => Number.isFinite(a.effect?.getComputedTiming().endTime))
        .map((a) => a.finished),
    )
    await new Promise((done) =>
      requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(done))),
    )
  })
  // An earlier capture showed current Odds content with the previous tab's cached underline.
  // Verify the compositor pixels as well as ARIA and computed CSS.
  const screen = await page.screenshot({ type: 'png' })
  const markers = await panel.evaluate(async (node, encoded) => {
    const image = new Image()
    image.src = 'data:image/png;base64,' + encoded
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = image.width
    canvas.height = image.height
    const ctx = canvas.getContext('2d')
    ctx.drawImage(image, 0, 0)
    const sx = image.width / innerWidth,
      sy = image.height / innerHeight
    return [...node.querySelectorAll('[role="tab"]')].map((tab) => {
      const rect = tab.getBoundingClientRect(),
        css = getComputedStyle(tab)
      const x = Math.floor((rect.left + rect.width * 0.5) * sx),
        y = Math.floor((rect.bottom - parseFloat(css.borderBottomWidth) * 0.5) * sy)
      const actual = [...ctx.getImageData(x, y, 1, 1).data].slice(0, 3)
      return {
        name: tab.textContent.trim(),
        active: tab.getAttribute('aria-selected') === 'true',
        border: css.borderBottomColor,
        actual,
      }
    })
  }, screen.toString('base64'))
  const active = markers.find((m) => m.active)
  assert.equal(active.name, 'Odds')
  const rgb = active.border.match(/\d+/g).slice(0, 3).map(Number)
  assert.ok(
    rgb.every((n, i) => Math.abs(n - active.actual[i]) < 8),
    'Selected tab UI and painted border disagree: ' + JSON.stringify(markers),
  )
  for (const other of markers.filter((m) => !m.active))
    assert.ok(
      rgb.some((n, i) => Math.abs(n - other.actual[i]) > 32),
      'Inactive tab retained the active border: ' + JSON.stringify(markers),
    )
  console.log('Settled mobile tab markers ' + JSON.stringify(markers))
  await panel.getByRole('tab', { name: 'Best move', exact: true }).click()
}
async function assertFirstScreen(panel) {
  const recommendation = panel.getByRole('region', { name: 'Recommended move' })
  await recommendation.waitFor()
  const measurement = await recommendation.evaluate((region) => {
    const h = region.querySelector('h3[data-advisor-action]'),
      reason = region.querySelector('[data-advisor-reason]')
    if (!h || !reason || !h.textContent.trim() || !reason.textContent.trim())
      return { ok: false, reason: 'Missing action or explanation' }
    const clips = []
    for (let node = region; node; node = node.parentElement) {
      const style = getComputedStyle(node)
      if (/auto|scroll|hidden|clip/.test(style.overflowY)) {
        const bounds = node.getBoundingClientRect(),
          top = bounds.top + node.clientTop
        clips.push({ top, bottom: top + node.clientHeight, scrollTop: node.scrollTop })
      }
      if (node.tagName === 'DIALOG') break
    }
    const top = Math.max(0, ...clips.map((c) => c.top)),
      bottom = Math.min(innerHeight, ...clips.map((c) => c.bottom))
    const bounds = [h, reason].map((el) => {
      const range = document.createRange()
      range.selectNodeContents(el)
      return range.getBoundingClientRect().toJSON()
    })
    return {
      ok:
        clips.every((c) => c.scrollTop < 1) &&
        bounds.every(
          (b) => b.width > 0 && b.height > 0 && b.top >= top - 1 && b.bottom <= bottom + 1,
        ) &&
        bounds[0].bottom <= bounds[1].top + 2,
      top,
      bottom,
      clips,
      bounds,
    }
  })
  assert.ok(
    measurement.ok,
    'The action and its complete short reason should appear before scrolling: ' +
      JSON.stringify(measurement),
  )
}
try {
  const dist = join(temporary, 'dist'),
    directory = join(temporary, 'saves')
  await build({ logLevel: 'error', build: { outDir: dist, emptyOutDir: true } })
  const fixture = await makeReviewFixture(directory)
  host = await startHost({ port: 0, host: '127.0.0.1', directory, staticDir: dist })
  browser = await chromium.launch({
    ...(process.env.QA_CHROME ? { executablePath: process.env.QA_CHROME } : { channel: 'chrome' }),
    headless: true,
    args: process.env.QA_NATIVE_GPU === '1' ? [] : ['--disable-gpu'],
  })
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await page.addInitScript(({ code, tokens, nativeGpu }) => {
    localStorage.setItem('cu.seat.' + code, JSON.stringify({ code, token: tokens[0], seatId: 0 }))
    localStorage.setItem('cu.board', nativeGpu ? '3d' : '2d')
    const native = window.Worker
    window.advisorTest = { hold: false, stopped: 0, started: 0, tool: null }
    window.Worker = class extends native {
      constructor(url, opts) {
        if (opts?.name === 'Camel Up race advisor' && window.advisorTest.hold) {
          window.advisorTest.started++
          const tool = {
            onmessage: null,
            onerror: null,
            onmessageerror: null,
            postMessage() {},
            terminate() {
              window.advisorTest.stopped++
            },
          }
          window.advisorTest.tool = tool
          return tool
        }
        super(url, opts)
      }
    }
  }, { ...fixture, nativeGpu: process.env.QA_NATIVE_GPU === '1' })
  await page.goto('http://127.0.0.1:' + host.port + '/?room=' + fixture.code)
  const trigger = page.getByRole('button', { name: 'Hints', exact: true }),
    panel = page.getByRole('dialog', { name: 'Race advisor' })
  await trigger.focus()
  await page.keyboard.press('Enter')
  await panel.getByRole('region', { name: 'Recommended move' }).waitFor()
  assert.equal(await panel.evaluate((e) => e.matches(':modal')), false)
  assert.ok(
    (await panel.boundingBox()).x > 800,
    'The drawer obscured the left half of the desktop board.',
  )
  const comparison = panel.locator('summary').filter({ hasText: 'Compare all moves' })
  await comparison.focus()
  await page.keyboard.press('Enter')
  const alternative = panel.getByRole('combobox', { name: 'Legal move' })
  assert.match(await alternative.locator('option:checked').innerText(), /^#2\b/)
  await comparison.focus()
  await page.keyboard.press('Enter')
  assert.ok(!(await comparison.evaluate((n) => n.parentElement.open)))
  await panel.getByRole('tab', { name: 'Best move', exact: true }).focus()
  await page.keyboard.press('ArrowRight')
  await panel.getByRole('table', { name: /Finishing chances/i }).waitFor()
  const place = panel.getByRole('combobox', { name: 'Finishing place' })
  await place.focus()
  await page.keyboard.press('End')
  await panel.getByRole('table', { name: /Finishing chances for second place/i }).waitFor()
  await panel.getByRole('tab', { name: 'Odds', exact: true }).focus()
  await page.keyboard.press('End')
  assert.equal(
    await panel.getByRole('tab', { name: 'Test a roll' }).getAttribute('aria-selected'),
    'true',
  )
  await page.keyboard.press('Home')
  assert.equal(
    await panel.getByRole('tab', { name: 'Best move' }).getAttribute('aria-selected'),
    'true',
  )
  await page.keyboard.press('Escape')
  assert.ok(await trigger.evaluate((e) => e === document.activeElement))

  await page.setViewportSize({ width: 390, height: 844 })
  await trigger.click()
  await assertFirstScreen(panel)
  assert.equal(await panel.evaluate((e) => e.matches(':modal')), true)
  const box = await panel.boundingBox()
  assert.ok(
    box.width <= 390.5 && box.y > 100 && box.y + box.height <= 845,
    'Phone sheet did not fit the viewport: ' + JSON.stringify(box),
  )
  assert.ok(
    await panel.evaluate((e) => e.scrollWidth <= e.clientWidth + 1),
    'Sheet overflows horizontally.',
  )
  await inspectMobileIndicator(page, panel)
  await page.setViewportSize({ width: 360, height: 640 })
  await assertFirstScreen(panel)
  for (let i = 0; i < 13; i++) await page.keyboard.press('Tab')
  assert.ok(await panel.evaluate((e) => e.contains(document.activeElement)))
  await panel.getByRole('button', { name: 'Close race advisor' }).click()
  await page.evaluate(() => {
    window.advisorTest.hold = true
  })
  await trigger.click()
  await panel.getByRole('region', { name: 'Recommended move' }).waitFor()
  assert.equal(
    await page.evaluate(() => window.advisorTest.started),
    0,
    'Checking the same position twice started a duplicate simulation',
  )
  await page.reload()
  await trigger.waitFor()
  await page.evaluate(() => {
    window.advisorTest.hold = true
  })
  await trigger.click()
  await panel.getByText('Calculating race odds…').waitFor()
  await page.waitForFunction(() => window.advisorTest.started === 1)
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { value: true, configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await page.waitForFunction(() => window.advisorTest.stopped === 1)
  await page.evaluate(() => {
    delete document.hidden
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await page.waitForFunction(() => window.advisorTest.started === 2)
  await page.evaluate(() =>
    window.advisorTest.tool.onerror(new ErrorEvent('error', { cancelable: true })),
  )
  await panel.getByRole('button', { name: 'Retry analysis' }).click()
  await page.waitForFunction(() => window.advisorTest.started === 3)
  await page.keyboard.press('Escape')
  await page.waitForFunction(() => window.advisorTest.stopped === 3)
  console.log(
    'Passed: desktop keyboard tabs and focus return, exact mobile focus containment, ranked comparisons, hidden-tab cancellation, worker failure/retry and close cancellation.',
  )
} finally {
  if (browser) await browser.close()
  if (host) await host.close()
  await rm(temporary, { recursive: true, force: true })
}
