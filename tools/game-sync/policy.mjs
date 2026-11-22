import { createHash } from 'node:crypto'

const excludedDirectories = new Set([
  '.git',
  '.next',
  '.nuxt',
  '.vinext',
  '.vite',
  '.wrangler',
  '.vercel',
  '.parcel-cache',
  '.pnp',
  '.cache',
  '.pytest_cache',
  '.mypy_cache',
  '.ruff_cache',
  '.tox',
  '.nox',
  '.venv',
  'venv',
  '__pycache__',
  'node_modules',
  'dist',
  'build',
  'out',
  'coverage',
  'saves',
  'sessions',
  'flask_session',
  'instance',
  'logs',
  'outputs',
  'work',
  '.aws',
  '.ssh',
  '.gnupg',
  '.codex',
])
const privateFiles =
  /^(?:\.env(?:rc|\..*)?|\.npmrc|\.pypirc|\.netrc|_netrc|\.git-credentials|id_(?:rsa|dsa|ecdsa|ed25519)(?:\.pub)?|(?:[\w.-]+[-_.])?(?:credentials?|secrets?|tokens?|(?:api|private)[-_]?keys?|service[-_]account)(?:[-_.][\w.-]+)?\.(?:json|ya?ml|toml|ini|cfg|txt|xml)|credentials?|secrets?|tokens?)$/i
const localExtensions =
  /\.(?:env|py[co]|tsbuildinfo|pem|key|p12|pfx|jks|kdbx|keytab|log|sqlite3?|db)(?:-(?:wal|shm|journal))?$/i

export function allowedPath(rel) {
  if (typeof rel !== 'string' || !rel || /[\x00-\x1f:\x7f]/.test(rel)) return false
  const parts = rel.replaceAll('\\', '/').toLowerCase().split('/')
  if (parts.some((part) => !part || part === '.' || part === '..' || excludedDirectories.has(part)))
    return false
  const openaiIndex = parts.indexOf('.openai')
  if (openaiIndex >= 0 && parts.slice(openaiIndex).join('/') !== '.openai/hosting.json') return false
  const name = parts.at(-1)
  return (
    !privateFiles.test(name) &&
    !localExtensions.test(name) &&
    name !== '.ds_store' &&
    name !== 'thumbs.db' &&
    name !== 'desktop.ini'
  )
}

// Fingerprint of the one legacy assignment from the original Kachu repo.
// Keeping only the fingerprint lets the importer recognize it without shipping its value.
const legacyDigest = 'f578805d740605b26cbe5f824357d7b24ff117576fe79f185908076c2915704c'
const desiredAssignment =
  "app.config['SECRET_KEY'] = os.environ.get('KACHU_SECRET_KEY') or secrets.token_hex(32)"
const assignment =
  /^([ \t]*)(?:\w+\.config\[\s*(['"])SECRET_KEY\2\s*\]|\w+\.secret_key)\s*=(?!=)\s*(.*)$/i
const stringOrComment = /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|#.*$/g
const envKey =
  /\b(?:os\.)?(?:environ\s*\[|environ\.get\s*\(|getenv\s*\()\s*(?:'[A-Za-z_][A-Za-z_0-9]*'|"[A-Za-z_][A-Za-z_0-9]*")/g

function unknownLiteral() {
  throw new Error(
    'Kachu signing-key configuration contains an unrecognized literal. Use an environment variable or runtime-generated key.',
  )
}

function checkExpression(lines, start, first) {
  // Permit references, runtime key generators and environment lookups. A string elsewhere,
  // including a literal default to getenv, could be a signing key. Cover continued lines too.
  let depth = 0
  const expression = []
  for (let i = start; i < lines.length; i++) {
    const raw = i === start ? first : lines[i]
    const code = raw.replace(stringOrComment, (token) => (token.startsWith('#') ? '' : token))
    expression.push(code)
    for (const char of code.replace(stringOrComment, '')) {
      if ('([{'.includes(char)) depth++
      if (')]}'.includes(char)) depth--
    }
    if (depth <= 0 && !code.trimEnd().endsWith('\\')) {
      // A quoted environment variable name is public. Leave the rest intact so a quoted
      // fallback is caught even if the two getenv arguments are on separate lines.
      if (/['"]/.test(expression.join('\n').replace(envKey, ''))) unknownLiteral()
      return i
    }
  }
  return unknownLiteral()
}

export function projectKachuApp(buffer) {
  if (!Buffer.isBuffer(buffer)) throw new TypeError('projectKachuApp expects a Buffer')
  const original = buffer.toString('utf8')
  const eol = original.includes('\r\n') ? '\r\n' : '\n'
  const lines = original.split(/\r?\n/)
  let firstLegacy = -1
  for (let i = 0; i < lines.length; i++) {
    const found = assignment.exec(lines[i])
    if (!found) continue
    const stripped = lines[i].trim()
    if (createHash('sha256').update(stripped).digest('hex') === legacyDigest) {
      lines[i] = found[1] + desiredAssignment
      if (firstLegacy === -1) firstLegacy = i
    } else {
      i = checkExpression(lines, i, found[3])
    }
  }
  if (firstLegacy === -1) return buffer
  const uuid = lines.findIndex((line) => /^import uuid\s*(?:#.*)?$/.test(line))
  const at = uuid >= 0 && uuid < firstLegacy ? uuid : firstLegacy
  const indent = lines[at].match(/^[ \t]*/)[0]
  const imports = ['os', 'secrets'].filter(
    (name) =>
      !lines
        .slice(0, firstLegacy)
        .some((line) => new RegExp('^import ' + name + '\\s*(?:#.*)?$').test(line)),
  )
  lines.splice(at, 0, ...imports.map((name) => indent + 'import ' + name))
  return Buffer.from(lines.join(eol))
}
