import { lazy, Suspense, useState } from 'react'
import { ArrowLeft, Clock3, Eye, Move, Play, RotateCcw, Users, Wifi } from 'lucide-react'
import type { Credentials, Mode } from './connection'
import type { BoardSpace } from './board/layout'

const RaceBoard = lazy(() => import('./board/RaceBoard'))
const staged: Record<number, string[]> = {
  1: ['red'],
  2: ['blue'],
  8: ['white', 'black'],
  15: ['purple'],
  16: ['green', 'yellow'],
}
const spaces: BoardSpace[] = Array.from({ length: 16 }, (_, i) => ({
  number: i + 1,
  camels: staged[i + 1] ?? [],
}))
const demoRoll = { id: 0, color: 'red', value: 3 }

export function Showcase({
  canHost,
  recent,
  setup,
  join,
  resume,
}: {
  canHost: boolean
  recent: Credentials | null
  setup: (mode: Mode) => void
  join: () => void
  resume: (c: Credentials) => void
}) {
  const [exploring, setExploring] = useState(false)
  const [worldReady, setWorldReady] = useState(false)
  return (
    <main className={'showcase' + (exploring ? ' exploring' : '')}>
      <div className="showcase-world">
        <img className="cinematic-poster" src="/art/courtyard.webp" alt="" fetchPriority="high" />
        <Suspense fallback={null}>
          <RaceBoard
            presentation="showcase"
            on3DReady={setWorldReady}
            spaces={spaces}
            lastRoll={demoRoll}
            view="3d"
            reducedMotion={matchMedia('(prefers-reduced-motion: reduce)').matches}
          />
        </Suspense>
      </div>
      <div className="showcase-shade" />
      {!exploring && (
        <section className="title-hud">
          <div className="title-edition">
            <span /> Second edition
          </div>
          <h1>
            Camel <em>Up</em>
          </h1>
          <p>Bet on the racing camels and finish with the most coins to win.</p>
          <div className="title-spec">
            <span>
              <Users size={16} />
              3–8 players, including bots
            </span>
            <span>
              <Clock3 size={16} />
              30–45 min
            </span>
          </div>
          <div className="title-choices">
            {canHost ? (
              <>
                <button className="gold-button" onClick={() => setup('solo')}>
                  <Play size={18} fill="currentColor" />
                  Play Solo
                </button>
                <button className="glass-button" onClick={() => setup('lan')}>
                  <Wifi size={18} />
                  Host LAN Game
                </button>
              </>
            ) : (
              <button className="gold-button" onClick={join}>
                <Wifi size={18} />
                Join LAN game
              </button>
            )}
          </div>
          {recent && (
            <button className="title-resume" onClick={() => resume(recent)}>
              <RotateCcw size={15} />
              Resume table {recent.code}
            </button>
          )}
        </section>
      )}
      <div className="showcase-bottom">
        <div>
          {canHost && !exploring && (
            <button onClick={join}>
              <Wifi size={15} />
              Join by code
            </button>
          )}
          <button
            disabled={!worldReady && !exploring}
            aria-pressed={exploring}
            onClick={() => setExploring(!exploring)}
          >
            {exploring ? <ArrowLeft size={16} /> : <Eye size={17} />}{' '}
            {exploring ? 'Show menu' : 'Explore courtyard'}
          </button>
        </div>
      </div>
      {exploring && (
        <div className="orbit-hint">
          <Move size={16} /> Drag to look around
        </div>
      )}
    </main>
  )
}
