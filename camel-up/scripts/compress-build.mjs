import { readdir, readFile, writeFile } from 'node:fs/promises'
import { promisify } from 'node:util'
import { gzip } from 'node:zlib'

// Text bundles are identical for every guest. Compress once at build time so even
// an eight-seat LAN game never spends a turn's CPU budget on HTTP compression.
const compress = promisify(gzip)
const directory = new URL('../dist/assets/', import.meta.url)
const files = (await readdir(directory)).filter((name) => /\.(?:js|css)$/.test(name))
await Promise.all(
  files.map(async (name) => {
    const source = await readFile(new URL(name, directory))
    await writeFile(new URL(name + '.gz', directory), await compress(source, { level: 9 }))
  }),
)
