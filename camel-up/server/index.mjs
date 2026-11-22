import { createServer } from 'node:http'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { networkInterfaces } from 'node:os'
import { dirname, extname, join, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { spawn } from 'node:child_process'
import { pipeline } from 'node:stream/promises'
import QRCode from 'qrcode'
import { createAuthority, reject } from './authority.mjs'

const project = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const applicationId = 'camel-up-tabletop'
const protocolVersion = 1
const mediaTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.glb': 'model/gltf-binary',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.mp3': 'audio/mpeg',
}

function privatePriority(ip) {
  if (/^192\.168\./.test(ip)) return 0
  if (/^10\./.test(ip)) return 1
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return 2
  return 3
}

function localIps() {
  const addresses = Object.values(networkInterfaces())
    .flat()
    .filter(Boolean)
    .filter(
      (iface) => iface.family === 'IPv4' && !iface.internal && !iface.address.startsWith('169.254.'),
    )
    .map((iface) => iface.address)
  return [...new Set(addresses)].sort((a, b) => privatePriority(a) - privatePriority(b))
}

function loopback(address) {
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1'
}

async function readInput(req) {
  if (req.headers['content-type']?.split(';')[0] !== 'application/json')
    reject(415, 'Send a JSON request.')
  let length = 0
  const chunks = []
  for await (const chunk of req) {
    length += chunk.length
    if (length > 16_384) reject(413, 'Request exceeds the size limit.')
    chunks.push(chunk)
  }
  let input
  try {
    input = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
  } catch {
    reject(400, 'The request is not valid JSON.')
  }
  if (!input || typeof input !== 'object' || Array.isArray(input))
    reject(400, 'Expected a JSON object.')
  return input
}

function json(res, status, value) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  })
  res.end(JSON.stringify(value))
}

export async function startHost({
  port = 4174,
  host = '0.0.0.0',
  directory = join(project, 'saves'),
  staticDir = join(project, 'dist'),
  botDelay,
} = {}) {
  const ips = localIps()
  const allowedHosts = new Set(['localhost', '127.0.0.1', '[::1]', ...ips])
  let boundPort
  const addresses = () => ips.map((ip) => 'http://' + ip + ':' + boundPort)
  const joinUrls = (code) => addresses().map((base) => base + '/?room=' + code)
  let authority
  const server = createServer(async (req, res) => {
    try {
      res.setHeader('X-Content-Type-Options', 'nosniff')
      res.setHeader('Referrer-Policy', 'no-referrer')
      if (!authority) reject(503, 'The host is loading saved games.')
      const origin = 'http://' + req.headers.host
      const base = new URL(origin)
      if (!allowedHosts.has(base.hostname) || base.username || base.password)
        reject(403, 'Use the local address shown by the host.')
      const url = new URL(req.url, origin)
      if (url.origin !== base.origin) reject(400, 'Use a local request.')
      if (req.headers.origin && req.headers.origin !== base.origin)
        reject(403, 'The request came from another origin.')
      const canHost =
        loopback(req.socket.remoteAddress) &&
        ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname)
      const path = url.pathname
      if (req.method === 'GET' && path === '/api/info') {
        return json(res, 200, {
          application: applicationId,
          protocol: protocolVersion,
          canHost,
          addresses: addresses(),
          port: boundPort,
        })
      }
      if (req.method === 'POST' && path === '/api/rooms') {
        if (!canHost) reject(403, 'Open the game on the host computer to create a table.')
        return json(res, 201, await authority.create(await readInput(req)))
      }
      const route =
        /^\/api\/rooms\/([A-Z2-9]{6})(?:\/(join|characters|actions|config|start|qr\.svg))?$/i.exec(path)
      if (route) {
        const code = route[1].toUpperCase()
        const operation = route[2]
        const token = /^Bearer ([^ ]+)$/.exec(req.headers.authorization ?? '')?.[1]
        if (req.method === 'GET' && operation === 'characters')
          return json(res, 200, authority.characters(code))
        if (req.method === 'GET' && !operation) {
          const cursor = url.searchParams.get('after')
          if (cursor !== null && (!/^\d{1,15}$/.test(cursor) || !Number.isSafeInteger(Number(cursor))))
            reject(400, 'Invalid turn cursor.')
          const { tag, value } = authority.read(
            code,
            token,
            req.headers['if-none-match'],
            cursor === null ? null : Number(cursor),
          )
          res.setHeader('ETag', tag)
          res.setHeader('Vary', 'Authorization')
          if (value === null) {
            res.writeHead(304, { 'Cache-Control': 'private, no-cache' })
            return res.end()
          }
          res.writeHead(200, {
            'Cache-Control': 'private, no-cache',
            'Content-Type': 'application/json; charset=utf-8',
          })
          return res.end(JSON.stringify(value))
        }
        if (req.method === 'POST' && operation === 'join')
          return json(res, 201, await authority.join(code, await readInput(req)))
        if (req.method === 'POST' && ['actions', 'config', 'start'].includes(operation)) {
          return json(res, 200, await authority.change(code, token, operation, await readInput(req)))
        }
        if (req.method === 'GET' && operation === 'qr.svg') {
          if (authority.get(code).mode !== 'lan') reject(404, 'This table has no invitation.')
          const selected = joinUrls(code)[Number(url.searchParams.get('index') ?? 0)]
          if (!selected) reject(404, 'No LAN address is available for this invitation.')
          const svg = await QRCode.toString(selected, { type: 'svg', width: 240, margin: 4 })
          res.writeHead(200, { 'Content-Type': mediaTypes['.svg'], 'Cache-Control': 'no-store' })
          return res.end(svg)
        }
        reject(405, 'Method unavailable for this request.')
      }
      if (path.startsWith('/api/')) reject(404, 'Unknown game API route.')
      if (!['GET', 'HEAD'].includes(req.method)) reject(405, 'Use GET for game files.')
      const root = resolve(staticDir)
      let pathname
      try {
        pathname = decodeURIComponent(path)
      } catch {
        reject(400, 'Invalid path.')
      }
      const target = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname))
      if (!target.startsWith(root + sep)) reject(404, 'File not found.')
      const info = await stat(target).catch(() => null)
      if (!info?.isFile())
        reject(
          404,
          pathname === '/' ? 'Build the game with npm run build before launching.' : 'File not found.',
        )
      let representation = target
      let size = info.size
      let encoding = ''
      const cache = pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache'
      if (pathname.startsWith('/assets/') && /\.(js|css)$/.test(target)) {
        res.setHeader('Vary', 'Accept-Encoding')
        const acceptsGzip = (req.headers['accept-encoding'] ?? '').split(',').some((item) => {
          const [token, weight = 'q=1'] = item
            .trim()
            .toLowerCase()
            .split(/\s*;\s*/)
          return token === 'gzip' && Number(weight.replace(/^q=/, '')) > 0
        })
        if (acceptsGzip) {
          const compressed = await stat(target + '.gz').catch(() => null)
          if (compressed?.isFile()) {
            encoding = 'gzip'
            representation += '.gz'
            size = compressed.size
          }
        }
      }
      const tag = '"' + [size, Math.trunc(info.mtimeMs), encoding || 'identity'].join('-') + '"'
      res.setHeader('ETag', tag)
      res.setHeader('Cache-Control', cache)
      if (req.headers['if-none-match'] === tag) {
        res.writeHead(304)
        return res.end()
      }
      res.writeHead(200, {
        'Content-Type': mediaTypes[extname(target)] ?? 'application/octet-stream',
        'Content-Length': size,
        ...(encoding ? { 'Content-Encoding': encoding } : {}),
      })
      if (req.method === 'HEAD') return res.end()
      await pipeline(createReadStream(representation), res)
    } catch (error) {
      if (res.headersSent || res.destroyed) return
      if (!error.status) console.error('Host request failed:', error.message)
      return json(res, error.status ?? 500, {
        error: error.status ? error.message : 'The host could not complete the request.',
      })
    }
  })

  await new Promise((accepted, failed) => {
    server.once('error', failed)
    server.listen(port, host, () => {
      server.off('error', failed)
      accepted()
    })
  })
  boundPort = server.address().port
  try {
    authority = await createAuthority({ directory, joinUrls, botDelay })
  } catch (error) {
    server.close()
    throw error
  }
  return {
    port: boundPort,
    addresses: addresses(),
    async close() {
      const shutdown = new Promise((done) => server.close(done))
      server.closeAllConnections()
      await authority.close()
      await shutdown
    },
  }
}

function openBrowser(url) {
  const [cmd, args] =
    process.platform === 'win32'
      ? ['rundll32.exe', ['url.dll,FileProtocolHandler', url]]
      : process.platform === 'darwin'
        ? ['open', [url]]
        : ['xdg-open', [url]]
  const child = spawn(cmd, args, { detached: true, stdio: 'ignore', windowsHide: true })
  child.once('error', () => console.log('Open the local address above in your browser.'))
  child.unref()
}

export async function isRunningHost(port) {
  try {
    const response = await fetch('http://127.0.0.1:' + port + '/api/info', {
      redirect: 'error',
      signal: AbortSignal.timeout(1500),
    })
    if (!response.ok) return false
    const info = await response.json()
    return (
      info.application === applicationId &&
      info.protocol === protocolVersion &&
      info.canHost === true &&
      info.port === port
    )
  } catch {
    return false
  }
}

async function launch() {
  const port = Number(process.env.PORT || 4174)
  const show = process.argv.includes('--open')
  try {
    const host = await startHost({ port })
    const url = 'http://127.0.0.1:' + host.port
    console.log('Camel Up is ready. Host the game at ' + url)
    for (const address of host.addresses) console.log('LAN address: ' + address)
    console.log('Keep this window open while playing. Press Ctrl+C to close.')
    if (show) openBrowser(url)
    const stop = async () => {
      await host.close()
      process.exit(0)
    }
    process.once('SIGINT', stop)
    process.once('SIGTERM', stop)
  } catch (error) {
    if (show && error.code === 'EADDRINUSE' && (await isRunningHost(port))) {
      const url = 'http://127.0.0.1:' + port
      console.log('Opening the running Camel Up host at ' + url)
      openBrowser(url)
      return
    }
    console.error(
      error.code === 'EADDRINUSE'
        ? 'The game port is already in use. Close the other host or choose another PORT.'
        : error.message,
    )
    process.exitCode = 1
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await launch()
