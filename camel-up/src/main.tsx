import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ArrowLeft, Users, Wifi, X } from 'lucide-react'
import '@fontsource/dm-sans/latin-400.css'
import '@fontsource/dm-sans/latin-600.css'
import '@fontsource/dm-sans/latin-700.css'
import '@fontsource/playfair-display/latin-800.css'
import '@fontsource/playfair-display/latin-700-italic.css'
import { CharacterPicker, Header, Help, Modal } from './components'
import { Lobby, SetupForm } from './Setup'
import { Showcase } from './Showcase'
import {
  getSetting,
  readSeat,
  pollRoom,
  rememberSeat,
  request,
  requestId,
  RequestError,
  setSetting,
  type Credentials,
  type Mode,
  type Room,
  type Setup,
} from './connection'
import type { Action } from './engine'
import './style.css'
import './immersive.css'

const Table = lazy(() => import('./Table').then((m) => ({ default: m.Table })))
const roomInUrl = () => new URLSearchParams(location.search).get('room')?.trim().toUpperCase() || ''
const message = (e: unknown) => (e instanceof Error ? e.message : 'Could not reach the host.')
function App() {
  const [target, setTarget] = useState(roomInUrl)
  const [credentials, setCredentials] = useState(() => readSeat(roomInUrl()))
  const [room, setRoom] = useState<Room | null>(null)
  const [setup, setSetup] = useState<Mode | null>(null),
    [editing, setEditing] = useState(false)
  const [help, setHelp] = useState(false),
    [joining, setJoining] = useState(false)
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [offline, setOffline] = useState(false)
  const [canHost, setCanHost] = useState(
    ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname),
  )
  const [name, setName] = useState(getSetting('name') || ''),
    [code, setCode] = useState(roomInUrl)
  const [character, setCharacter] = useState<number | null>(null),
    [freeCharacters, setFreeCharacters] = useState<number[]>()
  const credRef = useRef(credentials)
  credRef.current = credentials
  const [recent, setRecent] = useState(() => readSeat(getSetting('recent')))
  const invite = (target || code).trim().toUpperCase()
  useEffect(() => {
    if (credentials || !/^[A-Z2-9]{6}$/.test(invite)) {
      setFreeCharacters(undefined)
      return
    }
    let active = true
    const check = () =>
      void request<{ available: number[] }>('rooms/' + invite + '/characters')
        .then(({ available }) => {
          if (active && Array.isArray(available)) {
            setFreeCharacters(available)
            setCharacter((c) => (c !== null && !available.includes(c) ? null : c))
          }
        })
        .catch(() => {})
    check()
    const timer = setInterval(check, 3500)
    return () => {
      active = false
      clearInterval(timer)
    }
  }, [invite, credentials])
  useEffect(() => {
    let cancelled = false,
      timer: ReturnType<typeof setTimeout>
    const check = () =>
      void request<{ canHost: boolean }>('info')
        .then((info) => {
          if (!cancelled) {
            setCanHost(info.canHost)
            setOffline(false)
          }
        })
        .catch(() => {
          if (!cancelled) {
            setOffline(true)
            timer = setTimeout(check, 2500)
          }
        })
    check()
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [])
  function update(next: Room) {
    setRoom((old) => {
      if (old?.code !== next.code || old.seatId !== next.seatId) return next
      if (old.revision > next.revision) return old
      if (
        old.revision === next.revision &&
        old.seats.every((s, i) => s.connected === next.seats[i]?.connected)
      )
        return old
      return next
    })
  }
  useEffect(() => {
    if (!credentials) return
    let live = true,
      timer: ReturnType<typeof setTimeout>
    let tag: string | null = null
    async function poll() {
      try {
        const snapshot = await pollRoom(credentials!, tag)
        if (!live) return
        tag = snapshot.tag
        if (snapshot.room) update(snapshot.room)
        setOffline(false)
        if (snapshot.room?.status === 'finished') return
      } catch (e) {
        if (!live) return
        if (e instanceof RequestError && [401, 403, 404].includes(e.status)) {
          setSetting('seat.' + credentials!.code, '')
          setRecent(readSeat(getSetting('recent')))
          setError(message(e))
          setCredentials(null)
          setRoom(null)
          return
        }
        setOffline(true)
      }
      if (live) timer = setTimeout(poll, document.hidden ? 2000 : 550)
    }
    void poll()
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [credentials])
  function takeSeat(c: Credentials) {
    rememberSeat(c)
    setRecent(c)
    setRoom(null)
    setTarget(c.code)
    setCode(c.code)
    setCredentials(c)
    setJoining(false)
    setSetup(null)
    setEditing(false)
    setOffline(false)
    history.replaceState(null, '', '/?room=' + c.code)
  }
  function home() {
    setTarget('')
    setCode('')
    setCredentials(null)
    setRoom(null)
    setSetup(null)
    setEditing(false)
    setJoining(false)
    setError('')
    history.replaceState(null, '', '/')
  }
  const lock = useRef(false)
  async function run(task: () => Promise<void>) {
    if (lock.current) return
    lock.current = true
    setBusy(true)
    setError('')
    try {
      await task()
    } catch (e) {
      setError(message(e))
    } finally {
      lock.current = false
      setBusy(false)
    }
  }
  async function create(name: string, choices: Setup) {
    if (!setup) return
    await run(async () => {
      setSetting('name', name)
      const c = await request<Credentials>('rooms', null, { ...choices, mode: setup, name })
      takeSeat(c)
      if (setup === 'solo') update(await request<Room>('rooms/' + c.code + '/start', c, {}))
    })
  }
  async function change(operation: string, body: unknown = {}) {
    if (!credentials) return
    const c = credentials
    await run(async () => {
      const next = await request<Room>('rooms/' + c.code + '/' + operation, c, body)
      if (credRef.current?.code === c.code) {
        update(next)
        setEditing(false)
      }
    })
  }
  async function join() {
    const dest = (target || code).trim().toUpperCase()
    if (!/^[A-Z2-9]{6}$/.test(dest)) {
      setError('Enter the six-character code shown on the host.')
      return
    }
    const c = readSeat(dest)
    if (c) {
      setError('')
      takeSeat(c)
      return
    }
    await run(async () => {
      const joinKey = getSetting('join.' + dest) || requestId()
      setSetting('join.' + dest, joinKey)
      const auth = await request<Credentials>('rooms/' + dest + '/join', null, {
        name: name.trim(),
        joinKey,
        ...(character === null ? {} : { character }),
      })
      setSetting('name', name.trim())
      takeSeat(auth)
    })
  }
  function send(action: Action) {
    if (room) void change('actions', { action, revision: room.revision, requestId: requestId() })
  }
  const joinForm = (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void join()
      }}
    >
      <p className="muted">Join a table on this local network.</p>
      {joining && error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <label className="field">
        Your name
        <input
          required
          maxLength={24}
          autoComplete="nickname"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Player name"
        />
      </label>
      <label className="field">
        Room code
        <input
          required
          value={target || code}
          readOnly={!!target}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          maxLength={6}
          placeholder="Six characters"
        />
      </label>
      <CharacterPicker selected={character} set={setCharacter} available={freeCharacters} />
      <button className="primary wide" disabled={busy || !name.trim()}>
        <Users size={17} />
        Take a seat
      </button>
    </form>
  )
  return (
    <>
      <Header onHome={home} onHelp={() => setHelp(true)} />
      {error && !joining && (
        <div className="notice" role="alert">
          <span>{error}</span>
          <button aria-label="Dismiss error" onClick={() => setError('')}>
            <X size={16} />
          </button>
        </div>
      )}
      {offline && (
        <div className="notice" role="status">
          The game host is unavailable. Open the Windows launcher to connect.
          {credentials ? ' Your seat will reconnect automatically.' : ''}
        </div>
      )}
      {room && !editing ? (
        room.view ? (
          <Suspense fallback={<main className="short-page">Preparing the table…</main>}>
            <Table key={room.code} room={room} send={send} busy={busy} home={home} />
          </Suspense>
        ) : (
          <Lobby
            room={room}
            busy={busy}
            edit={() => setEditing(true)}
            start={() => void change('start')}
          />
        )
      ) : editing && room ? (
        <SetupForm
          mode={room.mode}
          room={room}
          busy={busy}
          onCancel={() => setEditing(false)}
          submit={(_, choices) => change('config', choices)}
        />
      ) : credentials ? (
        <main className="short-page">
          <h1>Opening your table…</h1>
          <button className="back" onClick={home}>
            <ArrowLeft size={16} />
            Main menu
          </button>
        </main>
      ) : target ? (
        <main className="short-page">
          <section className="paper form-card">
            <div className="eyebrow">
              <Wifi size={16} />
              Local multiplayer
            </div>
            <h1>Join the table</h1>
            {joinForm}
          </section>
        </main>
      ) : setup ? (
        <SetupForm mode={setup} onCancel={() => setSetup(null)} submit={create} busy={busy} />
      ) : (
        <Showcase
          canHost={canHost}
          recent={recent}
          setup={setSetup}
          join={() => setJoining(true)}
          resume={takeSeat}
        />
      )}
      {joining && (
        <Modal title="Join a LAN game" onClose={() => setJoining(false)}>
          {joinForm}
        </Modal>
      )}
      {help && <Help onClose={() => setHelp(false)} />}
    </>
  )
}
createRoot(document.getElementById('root')!).render(<App />)
