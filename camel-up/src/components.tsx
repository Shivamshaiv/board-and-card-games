import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import { BookOpen, Maximize, Minimize, Volume2, VolumeX } from 'lucide-react'
import { DialogClose } from './DialogClose'
import { attachAudioLifecycle, getAudioSettings, subscribeAudio, updateAudioSettings } from './ambience'
import { TEMPOS } from './music-score'
import './modal-audio.css'
import { COMPONENTS, COMPONENTS_URL, REPRINT_URL, RULES, TUTORIAL_URL, rulePage } from './rules-content'
import { capitalize, MARKS, FINISH_COLORS } from './board/layout'

export function CamelLogo() {
  return (
    <svg viewBox="0 0 70 45" aria-hidden="true" fill="currentColor">
      <path d="M3 27q6-2 8-9 3-7 7-8 4 0 6 6 2 2 4-4 3-6 7-6 6 1 8 10l6 1 6-15q2-3 5 0l2 4 6 2-1 5-6 1-4 16-9 2-2 10h-5l1-11-9 1-5 10h-5l3-12-7-1-6 12H9l4-17-6 7z" />
    </svg>
  )
}
export function Header({ onHome, onHelp }: { onHome: () => void; onHelp: () => void }) {
  const [audioOpen, setAudioOpen] = useState(false),
    [full, setFull] = useState(false)
  const sound = useSyncExternalStore(subscribeAudio, getAudioSettings, getAudioSettings)
  useEffect(() => {
    const changed = () => setFull(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', changed)
    return () => document.removeEventListener('fullscreenchange', changed)
  }, [])
  useEffect(attachAudioLifecycle, [])
  return (
    <>
      <header className="mast">
        <div className="mast-inner">
          <button className="brand" onClick={onHome} aria-label="Camel Up home">
            <span className="brand-seal">
              <CamelLogo />
            </span>
            <span className="mast-brand-title">Camel Up</span>
          </button>
          <div className="mast-controls">
            <button
              aria-label="Sound settings"
              title="Sound settings"
              aria-haspopup="dialog"
              aria-expanded={audioOpen}
              onClick={() => setAudioOpen(true)}
            >
              {sound.enabled ? <Volume2 size={19} /> : <VolumeX size={19} />}
            </button>
            {document.fullscreenEnabled && (
              <button
                aria-label={full ? 'Exit fullscreen' : 'Enter fullscreen'}
                title={full ? 'Exit fullscreen' : 'Enter fullscreen'}
                onClick={() => {
                  void (
                    full ? document.exitFullscreen() : document.documentElement.requestFullscreen()
                  ).catch(() => {})
                }}
              >
                {full ? <Minimize size={18} /> : <Maximize size={18} />}
              </button>
            )}
            <button className="header-help" aria-label="How to play" onClick={onHelp}>
              <BookOpen size={17} /> <span className="mast-help-full">How to play</span>
              <span className="mast-help-short">Rules</span>
            </button>
          </div>
        </div>
      </header>
      {audioOpen && (
        <Modal title="Sound settings" onClose={() => setAudioOpen(false)}>
          <div className="audio-mixer">
            <button
              type="button"
              className="audio-toggle"
              role="switch"
              aria-label="Game audio"
              aria-checked={sound.enabled}
              onClick={() => updateAudioSettings({ enabled: !sound.enabled })}
            >
              <span>{sound.enabled ? <Volume2 size={18} /> : <VolumeX size={18} />}Game audio</span>
              <span className="audio-state">
                {sound.enabled ? 'On' : 'Off'}
                <i aria-hidden="true" />
              </span>
            </button>
            {(['music', 'effects'] as const).map((key) => (
              <label className="audio-slider" key={key}>
                <span>
                  {key === 'music' ? 'Music' : 'Sound effects'}
                  <output>{sound[key]}%</output>
                </span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  aria-label={key === 'music' ? 'Music volume' : 'Effects volume'}
                  aria-valuetext={sound[key] + ' percent'}
                  value={sound[key]}
                  onChange={(e) => updateAudioSettings({ [key]: Number(e.target.value) })}
                />
              </label>
            ))}
            <fieldset className="audio-tempo">
              <legend>Music tempo</legend>
              <div>
                {TEMPOS.map((tempo, i) => (
                  <label key={tempo}>
                    <input
                      type="radio"
                      name="music-tempo"
                      checked={sound.tempo === tempo}
                      aria-label={tempo + ' BPM'}
                      onChange={() => updateAudioSettings({ tempo })}
                    />
                    <span>
                      {['Relaxed', 'Brisk', 'Fast'][i]}
                      <b>{tempo} BPM</b>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
        </Modal>
      )}
    </>
  )
}
export function Modal({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useLayoutEffect(() => {
    const d = ref.current!
    const prior = document.activeElement
    d.showModal()
    return () => {
      d.close()
      if (prior instanceof HTMLElement && prior.isConnected) prior.focus({ preventScroll: true })
    }
  }, [])
  return (
    <dialog
      ref={ref}
      className="dialog"
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      aria-label={title}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return
        const r = event.currentTarget.getBoundingClientRect()
        if (
          event.clientX < r.left ||
          event.clientX > r.right ||
          event.clientY < r.top ||
          event.clientY > r.bottom
        )
          onClose()
      }}
    >
      <div className="dialog-body">
        <div className="section-head">
          <h2>{title}</h2>
          <DialogClose onClose={onClose} />
        </div>
        <div className="dialog-scroll" role="region" aria-label={title + ' content'} tabIndex={0}>
          {children}
        </div>
      </div>
    </dialog>
  )
}
export function Emblem({ color }: { color: string }) {
  return (
    <span
      className="emblem"
      style={{
        backgroundColor: FINISH_COLORS[color],
        color: color === 'yellow' || color === 'white' ? '#413629' : '#fff',
      }}
      aria-label={capitalize(color)}
    >
      {MARKS[color]}
    </span>
  )
}
export function Portrait({ index, size = 36 }: { index: number; size?: number }) {
  return (
    <img
      className="portrait"
      alt=""
      width={size}
      height={size}
      src={'/art/portrait-' + index + '.webp'}
    />
  )
}
const characters = [
  'Teal scarf',
  'Ochre suit',
  'Plum headwrap',
  'Red fez',
  'Coral jacket',
  'Indigo shirt',
  'Green blouse',
  'Sun hat',
]
export function CharacterPicker({
  selected,
  set,
  available,
}: {
  selected: number | null
  set: (id: number | null) => void
  available?: number[]
}) {
  return (
    <fieldset className="character-picker">
      <legend>Your character</legend>
      <div>
        {characters.map((character, id) => (
          <button
            type="button"
            key={id}
            title={character}
            aria-label={character}
            aria-pressed={selected === id}
            disabled={!!available && !available.includes(id)}
            onClick={() => set(selected === id ? null : id)}
          >
            <Portrait index={id} size={40} />
          </button>
        ))}
      </div>
      <small>{selected === null ? 'Any available character' : characters[selected]}</small>
    </fieldset>
  )
}
export function Help({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<'rules' | 'inventory'>('rules')
  return (
    <Modal title="How to play" onClose={onClose}>
      <p className="intro">
        Back any racing camel. The spectators with the most Egyptian pounds share the win.
      </p>
      <div className="segments">
        <button aria-pressed={tab === 'rules'} onClick={() => setTab('rules')}>
          Rules
        </button>
        <button aria-pressed={tab === 'inventory'} onClick={() => setTab('inventory')}>
          In the box
        </button>
      </div>
      {tab === 'rules' ? (
        <div className="howto">
          {RULES.map((r) => (
            <details key={r.title} className="help-item" open={r.title === 'Your first turn'}>
              <summary>{r.title}</summary>
              <p>{r.body}</p>
              <div className="rule-sources">
                <span>Rulebook</span>
                {r.pages.map((p) => (
                  <a key={p} href={rulePage(p)} target="_blank" rel="noreferrer">
                    p. {p}
                  </a>
                ))}
                <a href={TUTORIAL_URL + '&t=' + r.seconds + 's'} target="_blank" rel="noreferrer">
                  Video {Math.floor(r.seconds / 60)}:{String(r.seconds % 60).padStart(2, '0')} ↗
                </a>
              </div>
            </details>
          ))}
          <a href={REPRINT_URL} target="_blank" rel="noreferrer">
            Lookout’s English reprint ↗
          </a>
        </div>
      ) : (
        <>
          <ul className="inventory">
            {COMPONENTS.map((c) => (
              <li key={c.name}>
                <b>{c.quantity}</b> {c.name}
              </li>
            ))}
          </ul>
          <div className="rule-sources">
            <a href={rulePage(1)} target="_blank" rel="noreferrer">
              Rulebook p. 1
            </a>
            <a href={COMPONENTS_URL} target="_blank" rel="noreferrer">
              Publisher’s component list ↗
            </a>
          </div>
        </>
      )}
    </Modal>
  )
}
