import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium } from 'playwright-core'
import { startHost } from '../server/index.mjs'

// Drive the actual setup screens as two independent people. Rendering performance is
// measured separately in browser-qa.mjs so these checks also cover the flat board.
const directory = await mkdtemp(join(tmpdir(), 'camel-up-flows-'))
let host, browser
try {
  host = await startHost({ host: '127.0.0.1', port: 0, directory })
  const base = 'http://127.0.0.1:' + host.port
  browser = await chromium.launch({
    ...(process.env.QA_CHROME ? { executablePath: process.env.QA_CHROME } : { channel: 'chrome' }),
    headless: true,
    args: ['--disable-webgl'],
  })
  const errors = []
  async function client(width) {
    const context = await browser.newContext({
      viewport: { width, height: 850 },
      reducedMotion: 'reduce',
    })
    await context.addInitScript(() => localStorage.setItem('cu.board', '2d'))
    const page = await context.newPage()
    page.on('pageerror', (e) => errors.push(e.message))
    return { context, page }
  }
  const { page } = await client(1440)
  const get = (tab, name) => tab.getByRole('button', { name, exact: true })
  async function checkPrivateBet(tab, color, pile, visible = true) {
    await tab.getByRole('button', { name: /Your tickets, \d+ held/ }).click()
    const sheet = tab.getByRole('dialog', { name: 'Your tickets' })
    const bet = sheet.getByText(new RegExp(color + ' for (overall )?' + pile, 'i'))
    if (visible) await bet.first().waitFor()
    else assert.equal(await bet.count(), 0)
    await tab.keyboard.press('Escape')
  }
  for (const quantity of [2, 7]) {
    await page.goto(base)
    await get(page, 'Play Solo').click()
    await page.getByLabel('Your name').fill('Solo tester')
    await get(page, 'Teal scarf').click()
    for (let n = 3; n !== quantity; n += Math.sign(quantity - n))
      await get(page, quantity < 3 ? 'Fewer bots' : 'More bots').click()
    await get(page, 'Hard').click()
    await page.getByText('Individual bot settings', { exact: true }).click()
    await page.locator('.setting-details select').first().selectOption('easy')
    await get(page, 'Start solo race').click()
    await get(page, 'Roll pyramid').waitFor()
    await get(page, 'Take a ticket').click()
    await page.getByRole('heading', { name: 'Choose a camel', exact: true }).waitFor()
    assert.equal(
      await page
        .getByRole('group', { name: 'Choose a camel for a free leg ticket' })
        .evaluate((n) => n === document.activeElement),
      true,
    )
    await get(page, 'Players').click()
    const mat = page.getByRole('dialog', { name: 'Players at the table' })
    assert.equal(await mat.locator('.tray-seats button').count(), quantity + 1)
    await page.keyboard.press('Escape')
    await page.locator('.other-actions summary').click()
    await get(page, 'Play a finish card').click()
    assert.equal(await page.locator('.other-actions').evaluate((n) => n.open), false)
    await get(page, 'Select green finish card').click()
    assert.equal(await page.locator('dialog[open]').count(), 0, 'Finishing a bet stays at the table')
    assert.equal(
      await get(page, 'Roll pyramid').count(),
      0,
      'Pending finish selection exposes an unrelated turn action',
    )
    await get(page, 'Confirm Green for overall winner').click()
    await checkPrivateBet(page, 'Green', 'winner')
    await page.reload()
    await checkPrivateBet(page, 'Green', 'winner')
  }
  await page.goto(base)
  await get(page, 'Host LAN Game').click()
  await page.getByLabel('Your name').fill('Alex')
  await get(page, 'Red fez').click()
  await get(page, 'Fewer bots').click()
  await get(page, 'Open LAN lobby').click()
  await page.getByRole('heading', { name: 'Gather at the table' }).waitFor()
  const code = await page.locator('.room-code').innerText()
  assert.equal(await get(page, 'Waiting for 1 guest').isDisabled(), true)
  const guest = (await client(390)).page
  await guest.goto(base + '/?room=' + code)
  await guest.getByLabel('Your name').fill('Riley')
  await guest.waitForFunction(() => document.querySelector('[aria-label="Red fez"]')?.disabled)
  await get(guest, 'Indigo shirt').click()
  await get(guest, 'Take a seat').click()
  await guest.getByText('Riley', { exact: true }).waitFor()
  await get(page, 'Start race').click()
  await get(page, 'Roll pyramid').waitFor()
  await page.getByRole('button', { name: /Take red leg ticket/ }).click()
  await get(guest, 'Finish card').click()
  await get(guest, 'Select blue finish card').click()
  await get(guest, 'Overall loser').click()
  await get(guest, 'Confirm Blue for overall loser').click()
  await checkPrivateBet(guest, 'Blue', 'loser')
  await guest.reload()
  await checkPrivateBet(guest, 'Blue', 'loser')
  await checkPrivateBet(page, 'Blue', 'loser', false)
  await get(page, 'How to play').click()
  await get(page, 'In the box').click()
  await page.getByText('finish cards', { exact: false }).first().waitFor()
  await page.keyboard.press('Escape')
  assert.deepEqual(errors, [])
  console.log(
    'Passed browser setup and play for 2 and 7 configurable bots, LAN invitations, character claims, seat restore, private bets, and the offline rules reference.',
  )
} finally {
  if (browser) await browser.close()
  if (host) await host.close()
  await rm(directory, { recursive: true, force: true })
}
