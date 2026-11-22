import { useState } from 'react'
import { ArrowLeft, Check, Copy, Flag, Minus, Plus, Users, Wifi } from 'lucide-react'
import { CharacterPicker, Portrait } from './components'
import { getSetting, type Mode, type Room, type Setup } from './connection'
import type { Difficulty } from './engine'
import './setup.css'

const levels: Difficulty[] = ['easy', 'medium', 'hard']
const cap = (word: string) => word[0].toUpperCase() + word.slice(1)
function Stepper({
  value,
  min,
  max,
  label,
  set,
}: {
  value: number
  min: number
  max: number
  label: string
  set: (n: number) => void
}) {
  return (
    <div className="stepper">
      <button
        type="button"
        disabled={value <= min}
        aria-label={'Fewer ' + label}
        onClick={() => set(value - 1)}
      >
        <Minus size={16} />
      </button>
      <output aria-label={label}>{value}</output>
      <button
        type="button"
        disabled={value >= max}
        aria-label={'More ' + label}
        onClick={() => set(value + 1)}
      >
        <Plus size={16} />
      </button>
    </div>
  )
}
export function SetupForm({
  mode,
  onCancel,
  submit,
  busy,
  room,
}: {
  mode: Mode
  onCancel: () => void
  busy: boolean
  room?: Room
  submit: (name: string, setup: Setup) => Promise<void>
}) {
  const [name, setName] = useState(room?.seats[0].name || getSetting('name') || 'Player 1')
  const [character, setCharacter] = useState<number | null>(null)
  const [humans, setHumans] = useState(room?.humanSeats ?? (mode === 'lan' ? 2 : 1))
  const [all, setAll] = useState<Difficulty>('medium')
  const [bots, setBots] = useState<Difficulty[]>(
    room?.seats.filter((s) => s.kind === 'bot').map((s) => s.difficulty!) ??
      Array<Difficulty>(mode === 'lan' ? 2 : 3).fill('medium'),
  )
  const [starter, setStarter] = useState(room?.startingSeat ?? 0)
  const minHumans = room?.seats.filter((s) => s.kind === 'human' && s.name).length || 1
  function resize(n: number, list = bots) {
    return Array.from({ length: n }, (_, i) => list[i] ?? all)
  }
  function changeHumans(n: number) {
    setHumans(n)
    setBots(resize(Math.max(3 - n, Math.min(8 - n, bots.length))))
  }
  const total = humans + bots.length
  const oneLevel = bots.length && bots.every((bot) => bot === bots[0]) ? cap(bots[0]) : null
  const opponents = bots.length
    ? `${bots.length} ${oneLevel ? oneLevel + ' ' : ''}${bots.length === 1 ? 'bot' : 'bots'}`
    : 'no bots'
  const buttonText = busy
    ? 'Setting up…'
    : room
      ? 'Save table settings'
      : mode === 'solo'
        ? 'Start solo race'
        : 'Open LAN lobby'
  return (
    <main className="short-page setup-page">
      <button className="back" onClick={onCancel}>
        <ArrowLeft size={16} /> {room ? 'Back to lobby' : 'Back to menu'}
      </button>
      <section className="paper form-card setup-card">
        <div className="eyebrow">
          <Flag size={15} /> {room ? 'Local multiplayer' : 'Game setup'}
        </div>
        <h1>{room ? 'Table settings' : mode === 'solo' ? 'Solo race' : 'Host a LAN game'}</h1>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (name.trim() && !busy)
              void submit(name.trim(), {
                humanSeats: humans,
                bots,
                startingSeat: Math.min(starter, total - 1),
                ...(character === null ? {} : { character }),
              })
          }}
        >
          <div className="setup-start">
            <p>
              {mode === 'solo' ? (
                <>
                  You go first against <strong>{opponents}</strong>.
                </>
              ) : (
                <>
                  <strong>
                    {humans} {humans === 1 ? 'human seat' : 'human seats'}
                  </strong>{' '}
                  and {opponents}. Friends join on the same Wi-Fi.
                </>
              )}
            </p>
            <button className="primary" type="submit" disabled={busy || !name.trim()}>
              {buttonText}
            </button>
          </div>
          <div className={'setup-columns' + (room ? ' configuring' : '')}>
            <div className="setup-bots">
              {mode === 'lan' && (
                <div className="form-row">
                  <div>
                    <b>Human seats</b>
                    <small>Including the host</small>
                  </div>
                  <Stepper
                    label="human seats"
                    min={minHumans}
                    max={8}
                    value={humans}
                    set={changeHumans}
                  />
                </div>
              )}
              <div className="form-row">
                <div>
                  <b>Bot opponents</b>
                  <small>
                    {mode === 'solo' ? 'Choose 2–7 opponents' : total + ' of 8 total seats'}
                  </small>
                </div>
                <Stepper
                  value={bots.length}
                  min={Math.max(0, 3 - humans)}
                  max={8 - humans}
                  label="bots"
                  set={(n) => setBots(resize(n))}
                />
              </div>
              {bots.length > 0 && (
                <>
                  <fieldset>
                    <legend>Table difficulty</legend>
                    <div className="segments">
                      {levels.map((level) => (
                        <button
                          key={level}
                          type="button"
                          aria-pressed={bots.every((b) => b === level)}
                          onClick={() => {
                            setAll(level)
                            setBots(bots.map(() => level))
                          }}
                        >
                          {cap(level)}
                        </button>
                      ))}
                    </div>
                  </fieldset>
                  <details className="setting-details">
                    <summary>Individual bot settings</summary>
                    {bots.map((bot, i) => (
                      <label className="form-row" key={i}>
                        <span>
                          <Portrait index={humans + i} size={28} /> Opponent {i + 1}
                        </span>
                        <select
                          value={bot}
                          onChange={(e) =>
                            setBots(bots.map((v, j) => (i === j ? (e.target.value as Difficulty) : v)))
                          }
                        >
                          {levels.map((v) => (
                            <option key={v} value={v}>
                              {cap(v)}
                            </option>
                          ))}
                        </select>
                      </label>
                    ))}
                  </details>
                </>
              )}
            </div>
            <div className="setup-player">
              {!room && (
                <>
                  <label className="field">
                    Your name
                    <input
                      autoComplete="nickname"
                      maxLength={24}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                    />
                  </label>
                  <CharacterPicker selected={character} set={setCharacter} />
                </>
              )}
              {mode === 'lan' && (
                <label className="field">
                  Starting seat <small>The youngest player opens the race.</small>
                  <select
                    value={Math.min(starter, total - 1)}
                    onChange={(e) => setStarter(Number(e.target.value))}
                  >
                    {Array.from({ length: total }, (_, i) => (
                      <option key={i} value={i}>
                        {room?.seats[i]?.name ||
                          (i === 0 ? name : i < humans ? 'Guest ' + i : 'Bot ' + (i - humans + 1))}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          </div>
        </form>
      </section>
    </main>
  )
}
export function Lobby({
  room,
  edit,
  start,
  busy,
}: {
  room: Room
  edit: () => void
  start: () => void
  busy: boolean
}) {
  const [index, setIndex] = useState(0)
  const [copied, setCopied] = useState(false)
  const url = room.joinUrls[index]
  const missing = room.seats.filter((s) => !s.name).length
  if (room.mode === 'solo')
    return (
      <main className="short-page">
        <section className="paper form-card">
          <div className="eyebrow">
            <Flag size={16} />
            Solo game
          </div>
          <h1>Your table is ready</h1>
          <p className="muted">{room.seats.length - 1} opponents are seated.</p>
          <button className="primary wide" disabled={busy} onClick={start}>
            Start solo race
          </button>
        </section>
      </main>
    )
  return (
    <main className="short-page">
      <section className="paper lobby">
        <div className="eyebrow">
          <Wifi size={16} /> LAN lobby
        </div>
        <h1>Gather at the table</h1>
        <div className="lobby-cols">
          <div>
            <h3>
              <Users size={18} /> Players
            </h3>
            {room.seats.map((s) => (
              <div className="seat-line" key={s.id}>
                <Portrait index={s.character ?? s.id} />
                <span>
                  <b>{s.name || 'Open seat'}</b>
                  <small>
                    {s.kind === 'bot'
                      ? cap(s.difficulty!) + ' bot'
                      : s.id === room.seatId
                        ? 'You'
                        : s.name
                          ? s.connected
                            ? 'Connected'
                            : 'Reconnecting'
                          : 'Waiting for a guest'}
                  </small>
                </span>
              </div>
            ))}
          </div>
          <div className="invitation">
            <h3>Join this table</h3>
            {url && (
              <img
                className="qr"
                src={'/api/rooms/' + room.code + '/qr.svg?index=' + index}
                alt="Scan to join on the same Wi-Fi"
              />
            )}
            <strong className="room-code">{room.code}</strong>
            {room.joinUrls.length > 1 && (
              <label className="field">
                Network address
                <select value={index} onChange={(e) => setIndex(Number(e.target.value))}>
                  {room.joinUrls.map((u, i) => (
                    <option key={u} value={i}>
                      {new URL(u).host}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {url ? (
              <>
                <p>Scan or open this address on the same Wi-Fi.</p>
                <input
                  aria-label="LAN invitation address"
                  value={url}
                  readOnly
                  onFocus={(e) => e.target.select()}
                />
                <button
                  className="text-button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(url)
                      setCopied(true)
                    } catch {
                      const el = document.querySelector<HTMLInputElement>(
                        '[aria-label="LAN invitation address"]',
                      )
                      el?.focus()
                      el?.select()
                    }
                  }}
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copied' : 'Copy link'}
                </button>
              </>
            ) : (
              <p>Connect the host PC to your local network to get a join address.</p>
            )}
          </div>
        </div>
        {room.host ? (
          <div className="actions">
            <button className="secondary" onClick={edit}>
              Edit seats
            </button>
            <button className="primary" disabled={busy || !!missing} onClick={start}>
              {missing
                ? 'Waiting for ' + missing + (missing === 1 ? ' guest' : ' guests')
                : 'Start race'}
            </button>
          </div>
        ) : (
          <p className="muted">The host will start once everyone is seated.</p>
        )}
      </section>
    </main>
  )
}
