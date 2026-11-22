import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { startHost } from '../server/index.mjs'

test('LAN browsers get compressed bundles and can revalidate the original illustrations', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'camel-static-'))
  let host
  try {
    const dist = join(temporary, 'dist')
    await mkdir(join(dist, 'assets'), { recursive: true })
    await mkdir(join(dist, 'art'))
    const script = 'console.log("The racing table")\n'.repeat(100)
    const compressed = gzipSync(script)
    await writeFile(join(dist, 'assets', 'table.js'), script)
    await writeFile(join(dist, 'assets', 'table.js.gz'), compressed)
    await writeFile(join(dist, 'index.html'), '<title>Camel Up</title>')
    await writeFile(join(dist, 'art', 'board.webp'), Buffer.from('test illustration'))
    host = await startHost({
      host: '127.0.0.1',
      port: 0,
      directory: join(temporary, 'saves'),
      staticDir: dist,
    })
    const base = 'http://127.0.0.1:' + host.port
    const response = await fetch(base + '/assets/table.js', { headers: { 'Accept-Encoding': 'gzip' } })
    assert.equal(response.headers.get('Content-Encoding'), 'gzip')
    assert.equal(Number(response.headers.get('Content-Length')), compressed.length)
    assert.equal(await response.text(), script)
    const plain = await fetch(base + '/assets/table.js', {
      headers: { 'Accept-Encoding': 'gzip;q=0, identity' },
    })
    assert.equal(plain.headers.get('Content-Encoding'), null)
    assert.equal(await plain.text(), script)
    const art = await fetch(base + '/art/board.webp')
    assert.equal(art.headers.get('Content-Type'), 'image/webp')
    const cached = await fetch(base + '/art/board.webp', {
      headers: { 'If-None-Match': art.headers.get('etag') },
    })
    assert.equal(cached.status, 304)
  } finally {
    if (host) await host.close()
    await rm(temporary, { recursive: true, force: true })
  }
})
