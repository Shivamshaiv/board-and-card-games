import { createHash, randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { allowedPath, projectKachuApp } from './policy.mjs'

const collection = 'Shivamshaiv/board-and-card-games'
const kachu = 'Shivamshaiv/Card_Games_RL-Kachuful'
const owners = ['working', 'upstream']
const emptyId = '0'.repeat(40)
const safeKey = (name) => /^(clue|camel-up|kachu)\//.test(name) && allowedPath(name)
const records = (bytes) => bytes.toString('utf8').split('\0').filter(Boolean)
const sha = (bytes) =>
  createHash('sha1')
    .update('blob ' + bytes.length + '\0')
    .update(bytes)
    .digest('hex')

function run(file, args, env, input) {
  const p = spawnSync(file, args, {
    env,
    input,
    windowsHide: true,
    maxBuffer: 128 * 1024 * 1024,
    timeout: 120000,
  })
  if (p.error || p.status !== 0) {
    const details = (p.stderr?.toString() || p.error?.message || 'Command failed').trim()
    throw new Error(details.replace(/https:\/\/[^\s/]+@/gi, 'https://').slice(-1500))
  }
  return p.stdout
}

function tree(git, repo, ref) {
  const result = new Map()
  for (const line of records(git(repo, ['ls-tree', '-rz', ref]))) {
    const end = line.indexOf('\t')
    const [mode, , id] = line.slice(0, end).split(' ')
    result.set(line.slice(end + 1), mode + ' ' + id)
  }
  return result
}

function jsonFile(file, value) {
  const tmp = file + '.' + randomUUID() + '.tmp'
  try {
    fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n', { mode: 0o600, flush: true })
    fs.renameSync(tmp, file)
  } finally {
    fs.rmSync(tmp, { force: true })
  }
}

// A per-user named pipe is released by the OS even if the worker is killed mid-push.
async function lock(dir) {
  const key = createHash('sha256').update(dir).digest('hex').slice(0, 24)
  const endpoint =
    process.platform === 'win32'
      ? '\\\\.\\pipe\\board-game-sync-' + key
      : process.platform === 'linux'
        ? '\0board-game-sync-' + key
        : path.join(os.tmpdir(), 'board-game-sync-' + key + '.sock')
  const server = net.createServer((socket) => socket.destroy())
  await new Promise((resolve, reject) => server.once('error', reject).listen(endpoint, resolve))
  return () => new Promise((resolve) => server.close(resolve))
}

function readWorking(git, repo, prefix, snapshot, add) {
  const root = fs.realpathSync.native(repo)
  const gitRoot = fs.realpathSync.native(git(repo, ['rev-parse', '--show-toplevel']).toString().trim())
  if (path.relative(root, gitRoot) !== '') throw new Error('Expected a game Git checkout at ' + repo)
  if (git(repo, ['ls-files', '-u', '-z']).length) throw new Error('Resolve the Git merge in ' + repo)
  const sparse = git(repo, ['config', '--list', '--local']).toString()
  if (/^core\.sparsecheckout=true$/im.test(sparse))
    throw new Error('A complete source checkout is required.')
  for (const entry of prefix === 'clue/' ? ['README.md', 'camel-up/README.md'] : ['README.md']) {
    if (!fs.statSync(path.join(root, entry)).isFile()) throw new Error('Source unavailable: ' + entry)
  }
  const entries = new Map()
  for (const line of records(git(repo, ['ls-files', '--stage', '-z']))) {
    entries.set(line.slice(line.indexOf('\t') + 1), line.split(' ', 1)[0])
  }
  for (const rel of records(git(repo, ['ls-files', '-z', '--others', '--exclude-standard'])))
    entries.set(rel, null)
  for (const [rel, trackedMode] of entries) {
    const dest = prefix === 'clue/' && rel.startsWith('camel-up/') ? rel : prefix + rel
    if (!safeKey(dest)) continue
    const file = path.join(root, rel)
    const stat = fs.lstatSync(file, { throwIfNoEntry: false })
    if (!stat) continue // A tracked file that the user removed.
    if (trackedMode === '160000' || stat.isDirectory())
      throw new Error('Nested Git checkout needs a mapping: ' + dest)
    const mode = stat.isSymbolicLink()
      ? '120000'
      : trackedMode || (stat.mode & 0o111 ? '100755' : '100644')
    if (!stat.isSymbolicLink()) {
      const inside = path.relative(root, fs.realpathSync.native(file))
      if (inside.startsWith('..' + path.sep) || path.isAbsolute(inside))
        throw new Error('Source points outside the game: ' + dest)
      if (!stat.isFile() || stat.size >= 100 * 1024 * 1024)
        throw new Error('Unsupported game file: ' + dest)
    }
    const bytes = stat.isSymbolicLink() ? Buffer.from(fs.readlinkSync(file)) : fs.readFileSync(file)
    add(snapshot, dest, mode, bytes)
  }
}

function checkShape(files) {
  const names = new Set(),
    dirs = new Set()
  for (const original of files.keys()) {
    const name = original.toLowerCase()
    if (names.has(name) || dirs.has(name)) throw new Error('Conflicting collection paths: ' + original)
    names.add(name)
    for (let pos = name.indexOf('/'); pos >= 0; pos = name.indexOf('/', pos + 1)) {
      const parent = name.slice(0, pos)
      if (names.has(parent))
        throw new Error('A file and directory share a collection path: ' + original)
      dirs.add(parent)
    }
  }
}

function verifyConfig(c) {
  if (!/^[0-9a-f]{40}$/.test(c.baseCommit)) throw new Error('Missing pinned import commit.')
  if (c.verifyPrivate === false) {
    if (![c.collectionUrl, c.kachuUrl].every((p) => path.isAbsolute(p) && !p.startsWith('\\\\')))
      throw new Error('Local test mode requires local repositories.')
  } else if (
    c.collectionUrl !== 'https://github.com/' + collection + '.git' ||
    c.kachuUrl !== 'https://github.com/' + kachu + '.git'
  ) {
    throw new Error('Unexpected sync repository. Check the installed configuration.')
  }
}

export async function sync(c) {
  verifyConfig(c)
  fs.mkdirSync(c.stateDir, { recursive: true })
  const dir = fs.realpathSync.native(c.stateDir)
  const release = await lock(dir)
  const statusFile = path.join(dir, 'status.json')
  const stateFile = path.join(dir, 'baseline.json')
  const repo = path.join(dir, 'objects.git')
  const index = path.join(dir, 'index-' + randomUUID())
  const env = {
    ...process.env,
    GIT_TERMINAL_PROMPT: '0',
    GH_PROMPT_DISABLED: '1',
    GCM_INTERACTIVE: 'Never',
  }
  // A scheduled logon may have an older PATH than the installing shell.
  const pathVar = Object.keys(env).find((k) => k.toUpperCase() === 'PATH') || 'PATH'
  env[pathVar] = [c.ghPath, c.gitPath]
    .filter(Boolean)
    .map((p) => path.dirname(p))
    .concat(env[pathVar] || '')
    .join(path.delimiter)
  const git = (cwd, args, input, extra = {}) =>
    run(
      c.gitPath || 'git',
      [
        '-C',
        cwd,
        '-c',
        'credential.https://github.com.helper=',
        '-c',
        'credential.https://github.com.helper=!gh auth git-credential',
        ...args,
      ],
      { ...env, ...extra },
      input,
    )
  function verifyDestination() {
    if (c.verifyPrivate !== false) {
      const actual = JSON.parse(
        run(c.ghPath || 'gh', ['repo', 'view', collection, '--json', 'nameWithOwner,isPrivate'], env),
      )
      if (actual.nameWithOwner !== collection || !actual.isPrivate)
        throw new Error('Sync paused: the destination must be the private game collection.')
    }
  }
  try {
    verifyDestination()
    if (!fs.existsSync(path.join(repo, 'HEAD'))) git(dir, ['init', '--bare', repo])
    const configId = JSON.stringify([
      c.collectionUrl,
      c.kachuUrl,
      c.baseCommit,
      path.resolve(c.localRoot),
      path.resolve(c.kachuRoot),
    ])
    const branches = [c.localRoot, c.kachuRoot].map((p) =>
      git(p, ['symbolic-ref', '--short', 'HEAD']).toString().trim(),
    )
    const saved = fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, 'utf8')) : null
    if (saved && (saved.id !== configId || JSON.stringify(saved.branches) !== JSON.stringify(branches)))
      throw new Error('The source roots or branches changed. Sync is paused.')
    for (const [url, to] of [
      [c.collectionUrl, 'collection'],
      [c.kachuUrl, 'kachu'],
    ]) {
      git(repo, ['fetch', '--quiet', '--no-tags', url, '+refs/heads/main:refs/game-sync/' + to])
    }
    const head = git(repo, ['rev-parse', 'refs/game-sync/collection']).toString().trim()
    git(repo, ['merge-base', '--is-ancestor', c.baseCommit, head])
    const destination = tree(git, repo, head)
    const upstream = tree(git, repo, 'refs/game-sync/kachu')
    const imported = saved ? null : tree(git, repo, c.baseCommit)
    const bases = {}
    const now = { working: new Map(), upstream: new Map() }
    for (const owner of owners) {
      if (saved) {
        bases[owner] = new Map(saved[owner])
        continue
      }
      bases[owner] = new Map(
        [...imported].filter(([p]) => safeKey(p) && (owner === 'working' || p.startsWith('kachu/'))),
      )
      // The collection supplied its own Kachu .gitignore in the original import.
      if (c.baseCommit === '9b4ada9488f9d8801952a1eb94b1c3cd66f27e15')
        bases[owner].delete('kachu/.gitignore')
    }
    const blobs = new Map()
    const add = (snapshot, dest, mode, original) => {
      let bytes = dest === 'kachu/app.py' ? projectKachuApp(original) : original
      const binary = bytes.subarray(0, 8000).includes(0) || mode === '120000'
      if (!binary) {
        const text = bytes.toString('utf8')
        if (
          /-----BEGIN (?:[A-Z0-9 ]+ )?PRIVATE KEY-----|gh[pousr]_[\w]{36,}|github_pat_[\w]{45,}|AKIA[A-Z0-9]{16}|sk-(?:proj-)?[\w-]{35,}/.test(
            text,
          )
        )
          throw new Error('Potential credential in ' + dest + '; nothing was published.')
        // Git for Windows normally stores LF. Preserve files originally committed with raw CRLF.
        if (text.includes('\r\n') && Buffer.from(text).equals(bytes)) {
          const raw = mode + ' ' + sha(bytes)
          if (![bases.working.get(dest), bases.upstream.get(dest), destination.get(dest)].includes(raw))
            bytes = Buffer.from(text.replaceAll('\r\n', '\n'))
        }
      }
      const id = sha(bytes)
      blobs.set(id, bytes)
      snapshot.set(dest, mode + ' ' + id)
    }
    readWorking(git, c.localRoot, 'clue/', now.working, add)
    readWorking(git, c.kachuRoot, 'kachu/', now.working, add)
    for (const [p, entry] of upstream) {
      if (!safeKey('kachu/' + p)) continue
      const [mode, id] = entry.split(' ')
      if (mode === '160000') throw new Error('Unexpected Kachu submodule: ' + p)
      add(now.upstream, 'kachu/' + p, mode, git(repo, ['cat-file', 'blob', id]))
    }
    const keys = new Set(owners.flatMap((o) => [...bases[o].keys(), ...now[o].keys()]))
    const changes = new Map(),
      conflicts = []
    function acknowledge(owner, p) {
      if (now[owner].has(p)) bases[owner].set(p, now[owner].get(p))
      else bases[owner].delete(p)
    }
    for (const p of keys) {
      const old = destination.get(p)
      const pending = []
      for (const o of owners) {
        if (bases[o].get(p) === now[o].get(p)) continue
        if (now[o].get(p) === old) acknowledge(o, p)
        else pending.push(o)
      }
      if (!pending.length) continue
      const want = now[pending[0]].get(p)
      if (pending.some((o) => bases[o].get(p) !== old || now[o].get(p) !== want)) {
        conflicts.push(p)
        continue
      }
      changes.set(p, want)
      for (const o of pending) acknowledge(o, p)
    }
    let commit = head
    if (changes.size) {
      const after = new Map(destination),
        updates = []
      for (const [p, want] of changes) {
        if (want === undefined) {
          after.delete(p)
          updates.unshift('0 ' + emptyId + '\t' + p)
          continue
        }
        after.set(p, want)
        const id = want.split(' ')[1]
        const stored = git(repo, ['hash-object', '-w', '--stdin'], blobs.get(id)).toString().trim()
        if (stored !== id) throw new Error('Could not verify ' + p)
        updates.push(want + '\t' + p)
      }
      checkShape(after)
      const envIndex = { GIT_INDEX_FILE: index }
      git(repo, ['read-tree', head], undefined, envIndex)
      git(
        repo,
        ['update-index', '-z', '--index-info'],
        Buffer.from(updates.join('\0') + '\0'),
        envIndex,
      )
      const id = git(repo, ['write-tree'], undefined, envIndex).toString().trim()
      const written = tree(git, repo, id)
      if (written.size !== after.size || [...after].some(([p, v]) => written.get(p) !== v))
        throw new Error('Outgoing tree failed verification.')
      const games = [...new Set([...changes.keys()].map((p) => p.split('/')[0]))].sort().join(', ')
      commit = git(repo, [
        '-c',
        'user.name=Board game sync',
        '-c',
        'user.email=board-game-sync@users.noreply.github.com',
        'commit-tree',
        id,
        '-p',
        head,
        '-m',
        'Sync ' + games,
      ])
        .toString()
        .trim()
      // A concurrent update rejects this ordinary push. The next run fetches and retries.
      verifyDestination()
      git(repo, ['push', '--porcelain', c.collectionUrl, commit + ':refs/heads/main'])
    }
    jsonFile(stateFile, {
      id: configId,
      branches,
      working: [...bases.working],
      upstream: [...bases.upstream],
    })
    const result = {
      checkedAt: new Date().toISOString(),
      commit,
      updated: changes.size,
      paths: [...changes.keys()].sort(),
      conflicts: conflicts.sort(),
    }
    jsonFile(statusFile, result)
    return result
  } catch (error) {
    jsonFile(statusFile, { checkedAt: new Date().toISOString(), error: error.message })
    throw error
  } finally {
    try {
      fs.rmSync(index, { force: true })
    } finally {
      await release()
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const c = JSON.parse(fs.readFileSync(process.argv[2], 'utf8').replace(/^\uFEFF/, ''))
    const result = await sync(c)
    console.log(JSON.stringify(result))
    if (result.conflicts.length) process.exitCode = 2
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
