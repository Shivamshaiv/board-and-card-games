import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import {
  ChartNoAxesColumnIncreasing,
  ChevronDown,
  Compass,
  Dices,
  Flag,
  RotateCcw,
} from 'lucide-react'
import { rankCamels, type Action, type GameView } from '../engine'
import { capitalize } from '../board/layout'
import { Emblem } from '../components'
import { DialogClose } from '../DialogClose'
import type { AdvisorResult } from './analysis'
import { MoveAdvice } from './MoveAdvice'
import { CamelOdds } from './CamelOdds'
import { NextRoll } from './NextRoll'
import { useAdvisor } from './useAdvisor'
import './advisor.css'

type Tab = 'advice' | 'odds' | 'next'
const tabs: Record<Tab, string> = { advice: 'Best move', odds: 'Odds', next: 'Test a roll' }
function MethodNotes({ result }: { result: AdvisorResult }) {
  return (
    <>
      <p>
        One coin is one Egyptian pound (EP). The advisor estimates the extra coins a move adds to
        your final purse.
      </p>
      <ul>
        {result.assumptions.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ul>
      {result.race.method === 'sampled' && result.race.samples > 0 && (
        <p>
          With {result.race.samples.toLocaleString('en')} simulated races, the approximate 95%
          sampling margin for a 50% probability is ±
          {(98 / Math.sqrt(result.race.samples)).toFixed(1)} percentage points.
        </p>
      )}
    </>
  )
}

function Status({ working, children }: { working?: boolean; children: ReactNode }) {
  return (
    <div className="ra-status" role="status">
      {working ? (
        <span className="ra-spinner" aria-hidden="true" />
      ) : (
        <Flag size={19} aria-hidden="true" />
      )}
      <div>{children}</div>
    </div>
  )
}

function dialogModeChanged(callback: () => void) {
  const media = window.matchMedia('(max-width: 700px)')
  media.addEventListener('change', callback)
  return () => media.removeEventListener('change', callback)
}

export function RaceAdvisor({
  game,
  roomCode,
  revision,
  waiting = false,
  onClose,
  onLocate,
}: {
  game: GameView
  roomCode: string
  revision: number
  waiting?: boolean
  onClose: () => void
  onLocate: (action: Action, instruction: string) => void
}) {
  const id = useId(),
    dialog = useRef<HTMLDialogElement>(null),
    closer = useRef<HTMLButtonElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  const [preferred, setPreferred] = useState<Tab | null>(null)
  const { state, retry } = useAdvisor(game, roomCode, revision, waiting)
  const personal = game.seat === game.turn && game.seat >= 0,
    finished = game.phase === 'finished'
  const choices: Tab[] = [
    ...(personal ? ['advice' as const] : []),
    'odds',
    ...(game.phase === 'playing' ? ['next' as const] : []),
  ]
  const selected = preferred && choices.includes(preferred) ? preferred : choices[0]
  const body = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (body.current) body.current.scrollTop = 0
  }, [selected, revision])
  useEffect(() => {
    const node = dialog.current!,
      trigger = document.activeElement
    const open = () => {
      if (node.open) node.close()
      if (matchMedia('(max-width: 700px)').matches) node.showModal()
      else node.show()
      closer.current?.focus({ preventScroll: true })
    }
    open()
    const restore = dialogModeChanged(open)
    const escape = (event: globalThis.KeyboardEvent) => {
      if (
        event.key === 'Escape' &&
        !event.defaultPrevented &&
        node.open &&
        !node.matches(':modal') &&
        !document.querySelector('dialog:modal')
      ) {
        event.preventDefault()
        closeRef.current()
      }
    }
    document.addEventListener('keydown', escape)
    return () => {
      restore()
      document.removeEventListener('keydown', escape)
      if (node.open) node.close()
      if (trigger instanceof HTMLElement && trigger.isConnected)
        trigger.focus({ preventScroll: true })
    }
  }, [])
  function nav(event: KeyboardEvent<HTMLButtonElement>, tab: Tab) {
    const index = choices.indexOf(tab)
    const move = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
    const destination = move
      ? choices[(index + move + choices.length) % choices.length]
      : event.key === 'Home'
        ? choices[0]
        : event.key === 'End'
          ? choices.at(-1)
          : null
    if (destination) {
      event.preventDefault()
      setPreferred(destination)
      document.getElementById(id + '-' + destination)?.focus()
    }
  }
  return (
    <dialog
      ref={dialog}
      className="advisor-drawer"
      aria-labelledby={id + '-title'}
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      onClick={(e) => {
        if (e.target !== dialog.current) return
        const r = dialog.current!.getBoundingClientRect()
        if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)
          onClose()
      }}
    >
      <header className="ra-header">
        <div className="ra-compass">
          <Compass size={24} aria-hidden="true" />
        </div>
        <div>
          <h2 id={id + '-title'}>Race advisor</h2>
          <p>
            {finished
              ? 'Race complete'
              : 'Leg ' +
                game.leg +
                ' · ' +
                (waiting
                  ? 'Turn in progress'
                  : personal
                    ? 'Your turn'
                    : (game.players[game.turn]?.name ?? 'Player') + '’s turn')}
          </p>
        </div>
        <DialogClose
          buttonRef={closer}
          className="ra-close"
          onClose={onClose}
          label="Close race advisor"
        />
      </header>
      {!finished && (
        <nav className="ra-tabs" role="tablist" aria-label="Advisor views">
          {choices.map((tab) => (
            <button
              key={tab}
              id={id + '-' + tab}
              role="tab"
              tabIndex={selected === tab ? 0 : -1}
              aria-selected={selected === tab}
              aria-controls={id + '-panel'}
              onKeyDown={(e) => nav(e, tab)}
              onClick={() => setPreferred(tab)}
            >
              {tab === 'odds' && <ChartNoAxesColumnIncreasing size={15} />}
              {tab === 'next' && <Dices size={15} />} {tabs[tab]}
            </button>
          ))}
        </nav>
      )}
      <div
        ref={body}
        className="ra-body"
        id={id + '-panel'}
        role={finished ? 'region' : 'tabpanel'}
        aria-labelledby={finished ? id + '-title' : id + '-' + selected}
        tabIndex={0}
      >
        {state.status === 'paused' ? (
          <Status>Updating after the current move…</Status>
        ) : finished ? (
          <>
            <h3 className="ra-body-title">Final placings</h3>
            <ol className="ra-placings">
              {rankCamels(game.stacks).map((c) => (
                <li key={c}>
                  <Emblem color={c} />
                  {capitalize(c)}
                </li>
              ))}
            </ol>
          </>
        ) : selected === 'next' ? (
          <NextRoll game={game} />
        ) : state.status === 'working' ? (
          <Status working>Calculating race odds…</Status>
        ) : state.status === 'hidden' ? (
          <Status>Analysis is paused while this tab is hidden.</Status>
        ) : state.status === 'failed' ? (
          <Status>
            <p>{state.message}</p>
            {state.retryable && (
              <button className="ra-retry" onClick={retry}>
                <RotateCcw size={14} />
                Retry analysis
              </button>
            )}
          </Status>
        ) : state.status === 'ready' ? (
          selected === 'advice' ? (
            <MoveAdvice
              key={revision}
              game={game}
              result={state.result}
              onLocate={onLocate}
              methods={<MethodNotes result={state.result} />}
            />
          ) : (
            <CamelOdds
              result={state.result}
              assumptions={
                <details className="ra-notes">
                  <summary>
                    How we calculated this <ChevronDown size={15} />
                  </summary>
                  <MethodNotes result={state.result} />
                </details>
              }
            />
          )
        ) : null}
      </div>
    </dialog>
  )
}
