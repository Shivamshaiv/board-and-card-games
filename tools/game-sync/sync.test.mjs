import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { sync } from './sync.mjs'
import { allowedPath, projectKachuApp } from './policy.mjs'

test('source policy excludes private files and refuses an unfamiliar literal signing key', () => {
  for (const p of [
    'clue/.env.local',
    'camel-up/saves/room.json',
    'kachu/__pycache__/app.pyc',
    'kachu/credentials.json',
  ])
    assert.equal(allowedPath(p), false, p)
  assert.equal(allowedPath('clue/.openai/hosting.json'), true)
  const keyConfig = "app.config['SECRET_KEY'] = "
  const safe = Buffer.from(keyConfig + "os.environ['KACHU_SECRET_KEY']\n")
  assert.equal(projectKachuApp(safe), safe)
  assert.throws(
    () => projectKachuApp(Buffer.from(keyConfig + "'test-only-value'\n")),
    /unrecognized literal/,
  )
})

// All remotes in this suite are disposable local bare repositories.
function git(cwd, ...args) {
  return execFileSync('git', args, {
    cwd,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trimEnd()
}

function write(root, path, text) {
  const file = join(root, path)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, text)
}

function commit(root, message) {
  git(root, 'add', '--all')
  git(
    root,
    '-c',
    'user.name=Game sync test',
    '-c',
    'user.email=test@example.invalid',
    'commit',
    '-qm',
    message,
  )
  return git(root, 'rev-parse', 'HEAD')
}

function fixture(t) {
  const temp = resolve(tmpdir())
  const root = mkdtempSync(join(temp, 'game-sync-test-'))
  t.after(() => {
    assert.equal(dirname(root), temp)
    assert.ok(basename(root).startsWith('game-sync-test-'))
    rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  })
  const local = join(root, 'current-games')
  const kachu = join(root, 'kachu-worktree')
  const collection = join(root, 'collection-editor')
  const kachuRemote = join(root, 'kachu.git')
  const collectionRemote = join(root, 'collection.git')
  for (const repo of [kachuRemote, collectionRemote]) {
    git(root, 'init', '--bare', '-b', 'main', repo)
  }
  git(root, 'init', '-b', 'master', local)
  git(root, 'clone', kachuRemote, kachu)
  git(root, 'clone', collectionRemote, collection)

  const clueFiles = {
    'README.md': '# Clue\n',
    'package.json': '{"name":"clue"}\n',
    '.gitignore': 'node_modules/\n.env*\n/dist/\n/.next/\n/work/\n',
    'src/game.txt': 'clue v1\n',
    'src/retired.txt': 'old clue\n',
  }
  const camelFiles = {
    'README.md': '# Camel Up\n',
    'package.json': '{"name":"camel-up"}\n',
    '.gitignore': 'node_modules/\ndist/\nsaves/\n.env*\n',
    'src/game.txt': 'camel v1\n',
    'src/retired.txt': 'old camel\n',
  }
  const kachuFiles = {
    'README.md': '# Kachu\n',
    'requirements.txt': 'Flask\n',
    '.gitignore': '__pycache__/\n*.py[cod]\n.venv/\n.env*\n',
    'app.py': 'from flask import Flask\napp = Flask(__name__)\n',
    'game_logic.py': '# Kachu v1\n',
    'tests/retired.txt': 'old Kachu\n',
  }
  for (const [p, data] of Object.entries(clueFiles)) {
    write(local, p, data)
    write(collection, 'clue/' + p, data)
  }
  commit(local, 'Clue baseline')
  // The live Camel Up folder is initially untracked in the parent Clue repository.
  for (const [p, data] of Object.entries(camelFiles)) {
    write(local, 'camel-up/' + p, data)
    write(collection, 'camel-up/' + p, data)
  }
  for (const [p, data] of Object.entries(kachuFiles)) {
    write(kachu, p, data)
    write(collection, 'kachu/' + p, data)
  }
  commit(kachu, 'Kachu baseline')
  git(kachu, 'push', '-u', 'origin', 'main')
  write(collection, 'README.md', '# Private game collection\n')
  const baseCommit = commit(collection, 'Snapshot of the three games')
  git(collection, 'push', '-u', 'origin', 'main')

  const config = {
    stateDir: join(root, 'sync-state'),
    localRoot: local,
    kachuRoot: kachu,
    collectionUrl: collectionRemote,
    kachuUrl: kachuRemote,
    baseCommit,
    verifyPrivate: false,
  }
  const remoteFile = (path) => git(collectionRemote, 'show', 'main:' + path)
  const paths = () => git(collectionRemote, 'ls-tree', '-r', '--name-only', 'main').split('\n')
  const head = () => git(collectionRemote, 'rev-parse', 'main')
  const run = async () => sync(config)
  return {
    root,
    local,
    kachu,
    collection,
    collectionRemote,
    kachuRemote,
    run,
    config,
    remoteFile,
    paths,
    head,
  }
}

test('first run imports preexisting changes from all three games, excludes runtime files and is idempotent', async (t) => {
  const f = fixture(t)
  write(f.local, 'src/game.txt', 'clue v2\n')
  write(f.local, 'camel-up/src/new betting ticket.txt', 'camel new\n')
  const cardArt = Buffer.from([0x52, 0x49, 0x46, 0x46, 0x00, 0x0d, 0x0a, 0xff, 0x83])
  write(f.local, 'camel-up/public/art/final ticket.webp', cardArt)
  write(f.kachu, 'game_logic.py', '# Kachu v2\n')
  unlinkSync(join(f.local, 'camel-up/src/retired.txt'))
  write(f.local, 'camel-up/saves/PRIVATE.json', 'private match\n')
  write(f.local, 'dist/unused.js', 'build output\n')
  write(f.local, '.env.local', 'test setting\n')
  write(f.kachu, 'credentials.json', '{}\n')
  write(f.kachu, '__pycache__/unused.pyc', 'bytecode\n')

  const first = await f.run()
  assert.ok(first.updated > 0)
  assert.deepEqual(first.conflicts, [])
  assert.equal(f.remoteFile('clue/src/game.txt'), 'clue v2')
  assert.equal(f.remoteFile('camel-up/src/new betting ticket.txt'), 'camel new')
  const remoteArt = execFileSync('git', ['show', 'main:camel-up/public/art/final ticket.webp'], {
    cwd: f.collectionRemote,
  })
  assert.deepEqual(remoteArt, cardArt)
  assert.equal(f.remoteFile('kachu/game_logic.py'), '# Kachu v2')
  assert.equal(f.remoteFile('README.md'), '# Private game collection')
  assert.equal(f.remoteFile('clue/src/retired.txt'), 'old clue')
  const paths = f.paths()
  assert.ok(!paths.includes('camel-up/src/retired.txt'))
  assert.ok(
    !paths.some((p) =>
      /clue\/camel-up\/|__pycache__|PRIVATE\.json|dist\/unused|\.env\.local|credentials\.json/.test(p),
    ),
  )
  assert.equal(git(f.kachuRemote, 'show', 'main:game_logic.py'), '# Kachu v1')
  assert.equal(git(f.local, 'show', 'HEAD:src/game.txt'), 'clue v1')
  const saved = f.head()
  assert.equal((await f.run()).updated, 0)
  assert.equal(f.head(), saved)
})

test('destination-only edits survive; a conflicting path does not block an independent edit', async (t) => {
  const f = fixture(t)
  await f.run()
  git(f.collection, 'pull', '--ff-only')
  write(f.collection, 'clue/src/game.txt', 'changed on GitHub\n')
  write(f.collection, 'camel-up/src/game.txt', 'another remote edit\n')
  write(f.collection, 'notes.md', 'collection only\n')
  commit(f.collection, 'Edit in the collection')
  git(f.collection, 'push')
  assert.equal((await f.run()).updated, 0)
  write(f.local, 'src/game.txt', 'conflicting local edit\n')
  write(f.local, 'camel-up/src/independent.txt', 'safe local edit\n')
  const result = await f.run()
  assert.ok(
    result.conflicts.some((p) => p.includes('clue/src/game.txt')),
    JSON.stringify(result),
  )
  assert.equal(f.remoteFile('clue/src/game.txt'), 'changed on GitHub')
  assert.equal(f.remoteFile('camel-up/src/game.txt'), 'another remote edit')
  assert.equal(f.remoteFile('camel-up/src/independent.txt'), 'safe local edit')
  assert.equal(f.remoteFile('notes.md'), 'collection only')
  const saved = f.head()
  await f.run()
  assert.equal(f.head(), saved)
  write(f.local, 'src/game.txt', 'changed on GitHub\n')
  assert.deepEqual((await f.run()).conflicts, [])
  write(f.local, 'src/game.txt', 'new shared version\n')
  await f.run()
  assert.equal(f.remoteFile('clue/src/game.txt'), 'new shared version')
})

test('an upstream Kachu push is retained while the local Kachu checkout is stale', async (t) => {
  const f = fixture(t)
  await f.run()
  const external = join(f.root, 'another-kachu-editor')
  git(f.root, 'clone', f.kachuRemote, external)
  write(external, 'game_logic.py', '# upstream Kachu\n')
  unlinkSync(join(external, 'tests/retired.txt'))
  commit(external, 'Kachu edits from another computer')
  git(external, 'push')
  write(f.local, 'src/new-clue.txt', 'independent clue change\n')
  write(f.kachu, 'new-local-kachu.txt', 'independent uncommitted Kachu change\n')
  const result = await f.run()
  assert.deepEqual(result.conflicts, [])
  assert.equal(f.remoteFile('kachu/game_logic.py'), '# upstream Kachu')
  assert.ok(!f.paths().includes('kachu/tests/retired.txt'))
  assert.equal(f.remoteFile('kachu/new-local-kachu.txt'), 'independent uncommitted Kachu change')
  assert.equal(f.remoteFile('clue/src/new-clue.txt'), 'independent clue change')
  assert.match(readFileSync(join(f.kachu, 'game_logic.py'), 'utf8'), /Kachu v1/)
  const saved = f.head()
  await f.run()
  assert.equal(f.head(), saved)
  write(f.kachu, 'game_logic.py', '# edited from stale base\n')
  assert.ok((await f.run()).conflicts.some((p) => p.includes('kachu/game_logic.py')))
  assert.equal(f.remoteFile('kachu/game_logic.py'), '# upstream Kachu')
})

test('a missing source or a rejected push can be retried without losing pending work', async (t) => {
  const f = fixture(t)
  await f.run()
  const saved = f.head()
  const offline = join(f.root, 'temporarily-unavailable')
  renameSync(f.local, offline)
  try {
    // A runner may report the unavailable source or throw, but must never infer deletions.
    await f.run().catch(() => {})
    assert.equal(f.head(), saved)
  } finally {
    renameSync(offline, f.local)
  }
  write(f.local, 'src/game.txt', 'survived a failed push\n')
  const hook = join(f.collectionRemote, 'hooks/pre-receive')
  writeFileSync(hook, '#!/bin/sh\nexit 1\n', { mode: 0o755 })
  try {
    await f.run().catch(() => {})
    assert.equal(f.head(), saved)
  } finally {
    unlinkSync(hook)
  }
  await f.run()
  assert.equal(f.remoteFile('clue/src/game.txt'), 'survived a failed push')
})
