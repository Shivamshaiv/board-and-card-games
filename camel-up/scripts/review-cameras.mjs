import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { build } from 'vite'
import { chromium } from 'playwright-core'
import { makeReviewFixture } from './browser-fixtures.mjs'
import { startHost } from '../server/index.mjs'

// Inspect the latest sources without replacing a running host's build or its saved games.
const temporary = await mkdtemp(join(tmpdir(), 'camel-up-camera-build-'))
const output = process.argv[2]
  ? resolve(process.argv[2])
  : await mkdtemp(join(tmpdir(), 'camel-up-cameras-'))
await mkdir(output, { recursive: true })
let host, browser
try {
  const staticDir = join(temporary, 'dist'),
    directory = join(temporary, 'saves')
  await build({ logLevel: 'error', build: { outDir: staticDir, emptyOutDir: true } })
  const fixture = await makeReviewFixture(directory)
  host = await startHost({ host: '127.0.0.1', port: 0, directory, staticDir })
  browser = await chromium.launch({
    ...(process.env.QA_CHROME ? { executablePath: process.env.QA_CHROME } : { channel: 'chrome' }),
    headless: true,
  })
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
  page.on('pageerror', (e) => console.warn(e.message))
  const url = 'http://127.0.0.1:' + host.port
  const ready = async () => {
    await page
      .locator('.cu-raceboard:not(.cu-flat-board) .cu-three-surface canvas')
      .waitFor({ timeout: 20000 })
    await page.evaluate(() => document.fonts.ready)
    await delay(800)
  }
  await page.goto(url)
  await ready()
  await page.screenshot({ path: join(output, 'menu.jpg'), quality: 84 })
  await page.evaluate(({ code, tokens }) => {
    localStorage.setItem('cu.seat.' + code, JSON.stringify({ code, token: tokens[0], seatId: 0 }))
  }, fixture)
  await page.goto(url + '/?room=' + fixture.code)
  await ready()
  await page.locator('.tc-webgl').waitFor()
  await page.screenshot({ path: join(output, 'grandstand.jpg'), quality: 84 })
  await page.getByRole('button', { name: 'Camera', exact: true }).click()
  await page.getByRole('button', { name: 'Trackside', exact: true }).click()
  await delay(400)
  await page.screenshot({ path: join(output, 'trackside.jpg'), quality: 84 })
  await page.getByRole('button', { name: 'Camera', exact: true }).click()
  await page.getByRole('button', { name: 'Follow leader', exact: true }).click()
  await delay(400)
  await page.screenshot({ path: join(output, 'follow.jpg'), quality: 90 })
  if (process.env.CAPTURE_RACE_CLIP === '1') {
    await page.getByRole('button', { name: 'Grandstand', exact: true }).click()
    await delay(350)
    const cdp = await page.context().newCDPSession(page)
    const frames = []
    cdp.on('Page.screencastFrame', (e) => {
      void cdp.send('Page.screencastFrameAck', { sessionId: e.sessionId }).catch(() => {})
      const stamp = e.metadata.timestamp * 1000
      if (!frames.length || stamp - frames.at(-1).stamp >= 64) frames.push({ stamp, data: e.data })
    })
    await cdp.send('Page.startScreencast', {
      format: 'jpeg',
      quality: 83,
      maxWidth: 1100,
      maxHeight: 688,
      everyNthFrame: 1,
    })
    await delay(450)
    await page.getByRole('button', { name: 'Roll pyramid', exact: true }).click()
    await page.locator('.run-plaque').waitFor()
    await delay(1050)
    await page.screenshot({ path: join(output, 'running.jpg'), quality: 90 })
    await page.locator('.turn-station.presenting').waitFor({ state: 'hidden', timeout: 8500 })
    await delay(200)
    await cdp.send('Page.stopScreencast')
    await cdp.detach()
    if (frames.length < 10) throw new Error('Too few presented frames to capture the run.')
    const capture = join(output, 'frames')
    await mkdir(capture, { recursive: true })
    for (const [i, frame] of frames.entries())
      await writeFile(join(capture, i + '.jpg'), Buffer.from(frame.data, 'base64'))
    await writeFile(
      join(capture, 'times.json'),
      JSON.stringify(frames.map((f) => Math.round(f.stamp - frames[0].stamp))),
    )
  }
  console.log(output)
} finally {
  if (browser) await browser.close()
  if (host) await host.close()
  await rm(temporary, { recursive: true, force: true })
}
