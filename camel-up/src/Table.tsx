import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import {
  Box,
  ArrowUp,
  ChevronRight,
  Coins,
  Dice5,
  Flag,
  Footprints,
  Handshake,
  Lightbulb,
  Layers,
  Map,
  Maximize2,
  Minimize2,
  Settings2,
  SkipForward,
  Trophy,
  Ticket,
  X,
} from 'lucide-react'
import {
  copyOptions,
  legalActions,
  rankCamels,
  spectatorPlacementBlock,
  type Action,
  type Color,
  type GameView,
  type Side,
} from './engine'
import RaceBoard from './board/RaceBoard'
import { capitalize } from './board/layout'
import { Emblem, Modal, Portrait } from './components'
import { PlayerTray } from './PlayerTray'
import { TrackMap } from './TrackMap'
import { Scoring } from './Scoring'
import { DiceInPyramid, LegStatus, RaceCall, RaceOrder } from './RaceDisplay'
import { TabletopCards, type ShelfNavigation } from './tabletop-cards/TabletopCards'
import { playHooves, playSettlementSound, playTableSound } from './ambience'
import { getSetting, setSetting, type Room } from './connection'
import { useTablePlayback } from './useTablePlayback'
import { visibleTable } from './table-presentation'
import './race-room.css'

const RaceAdvisor = lazy(() =>
  import('./advisor/RaceAdvisor').then((module) => ({ default: module.RaceAdvisor })),
)
type Drawer = 'players' | 'scores' | 'standings' | 'log' | 'settings' | 'advisor' | 'track' | null
const signed = (n: number) => (n > 0 ? '+' + n : String(n))
const activityVerbs = {
  roll: 'Rolling the pyramid',
  ticket: 'Drawing a leg ticket',
  finish: 'Playing a finish card',
  tile: 'Placing a spectator',
  partner: 'Forming a partnership',
  copy: 'Choosing a partner ticket',
}

function spacesFor(game: GameView) {
  return Object.entries(game.stacks)
    .filter(([k, cs]) => (Number(k) >= 1 && Number(k) <= 16) || cs.length > 0)
    .map(([k, camels]) => {
      const number = Number(k),
        tile = game.tiles.find((t) => t.space === number)
      return {
        number,
        camels,
        tile: tile ? { side: tile.side, owner: game.players[tile.owner].name } : null,
      }
    })
}

export function Table({
  room: latest,
  send,
  busy,
  home,
}: {
  room: Room
  send: (action: Action) => void
  busy: boolean
  home: () => void
}) {
  const [boardView, setBoardView] = useState<'2d' | '3d'>(() =>
    getSetting('board') === '2d' ? '2d' : '3d',
  )
  const [expanded, setExpanded] = useState(() => getSetting('expanded-board') === 'true')
  const shelfNav = useRef<ShelfNavigation>(null)
  const boardRef = useRef<HTMLDivElement>(null)
  const [cameraToolbar, setCameraToolbar] = useState<HTMLDivElement | null>(null)
  const [boardInspector, setBoardInspector] = useState<HTMLDivElement | null>(null)
  const turnRef = useRef<HTMLElement>(null)
  const moreMoves = useRef<HTMLDetailsElement>(null)
  const [awayFromRace, setAwayFromRace] = useState(false)
  useEffect(() => {
    const board = boardRef.current
    if (!board) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        setAwayFromRace(entry.boundingClientRect.top < 0 && entry.intersectionRatio < 0.65)
      },
      { rootMargin: '-52px 0px 0px 0px', threshold: [0, 0.65, 1] },
    )
    observer.observe(board)
    return () => observer.disconnect()
  }, [])
  function backToRace() {
    boardRef.current?.focus({ preventScroll: true })
    boardRef.current?.scrollIntoView({
      block: 'start',
      inline: 'nearest',
      behavior: reduce ? 'instant' : 'smooth',
    })
  }
  function toggleBoardSize() {
    const next = !expanded
    setExpanded(next)
    setSetting('expanded-board', String(next))
  }
  function showCards() {
    setExpanded(false)
    setSetting('expanded-board', 'false')
    requestAnimationFrame(() => {
      shelfNav.current?.show('market')
    })
  }
  const [reduce, setReduce] = useState(() =>
    getSetting('reduced') !== null
      ? getSetting('reduced') === 'true'
      : matchMedia('(prefers-reduced-motion: reduce)').matches,
  )
  const [ready3d, setReady3d] = useState(false)
  const playback = useTablePlayback(latest, reduce, boardView === '2d' || !ready3d)
  const room = playback.room ?? latest
  const { frame, before } = playback
  const game = useMemo(() => visibleTable(room.view!, before, frame), [room.view, before, frame])
  const mine =
    !busy &&
    !playback.blocked &&
    room.revision === latest.revision &&
    game.turn === game.seat &&
    game.phase !== 'finished'
  const canAct = mine && game.phase === 'playing'
  const [drawer, setDrawer] = useState<Drawer>(null)
  const [located, setLocated] = useState<{
    action: Action
    instruction: string
    revision: number
  } | null>(null)
  const hint = mine && located?.revision === room.revision ? located : null
  const hintAction = hint?.action
  const [matSeat, setMatSeat] = useState(room.seatId)
  const [placing, setPlacing] = useState<Side | null>(null)
  const [pairing, setPairing] = useState(false)
  const [finishChoice, setFinishChoice] = useState<Color | null>(null)
  function chooseFromShelf(panel: 'market' | 'hand') {
    if (moreMoves.current) moreMoves.current.open = false
    setLocated(null)
    shelfNav.current?.show(panel)
  }
  function cancelFinishFromStation() {
    shelfNav.current?.clearChoice()
    setFinishChoice(null)
    requestAnimationFrame(() =>
      turnRef.current
        ?.querySelector<HTMLButtonElement>('.roll-button:enabled')
        ?.focus({ preventScroll: true }),
    )
  }
  const [settledRoll, setSettledRoll] = useState<string | number | null>(null)
  const [leadChange, setLeadChange] = useState<{ revision: number; color: Color } | null>(null)
  useEffect(() => {
    if (!before || frame?.action.type !== 'roll') return
    const oldLeader = rankCamels(before.stacks)[0],
      newLeader = rankCamels(frame.view.stacks)[0]
    setLeadChange(oldLeader !== newLeader ? { revision: frame.revision, color: newLeader } : null)
  }, [frame?.revision, before])
  const currentSeat = frame?.actor ?? game.turn
  const current = game.players[currentSeat],
    me = game.players[game.seat]
  const available = useMemo(() => legalActions(game), [game])
  const partners = available.flatMap((a) => (a.type === 'partner' ? [a.partner] : []))
  const selection = canAct ? placing : null
  const spaces = useMemo(() => spacesFor(game), [game.stacks, game.tiles, game.players])
  const sourceSpaces = useMemo(() => (before ? spacesFor(before) : undefined), [before])
  const rollEvent = useMemo(
    () => [...game.events].reverse().find((e) => e.kind === 'roll'),
    [game.events],
  )
  const lastRoll = useMemo(
    () =>
      rollEvent?.roll
        ? {
            id: rollEvent.id,
            color: rollEvent.roll.die,
            value: rollEvent.roll.value,
            camel: rollEvent.roll.greyColor || rollEvent.movement?.moved,
            movement: rollEvent.movement,
          }
        : null,
    [rollEvent?.id],
  )
  const rolling = frame?.action.type === 'roll' && !!before && !!lastRoll && settledRoll !== lastRoll.id
  const standings = rolling && boardView === '3d' && ready3d && !reduce ? before!.stacks : game.stacks
  const legalSpaces = useMemo(
    () =>
      selection
        ? available.flatMap((a) => (a.type === 'tile' && a.side === selection ? [a.space] : []))
        : [],
    [selection, available],
  )
  const placementReasons = useMemo(() => {
    if (!selection) return undefined
    const reasons: Record<number, string> = {}
    for (let n = 1; n <= 16; n++) {
      const reason = spectatorPlacementBlock(game, game.seat, n)
      if (reason) reasons[n] = reason
    }
    return reasons
  }, [selection, game.stacks, game.tiles, game.seat])
  const ownSpectator = game.tiles.find((tile) => tile.owner === game.seat)
  const lastReceipt = game.receipts.filter((r) => r.seat === game.seat).at(-1)
  const revealKey = 'reveal.' + room.code + '.' + room.seatId
  const settlementCue = useRef<'leg' | 'race' | null>(null)
  const [revealed, setRevealed] = useState(() => Number(getSetting(revealKey)) || 0)
  useEffect(() => {
    if (!frame) {
      if (settlementCue.current) playSettlementSound(settlementCue.current)
      settlementCue.current = null
      return
    }
    settlementCue.current = frame.events.some((event) => event.kind === 'end')
      ? 'race'
      : frame.events.some((event) => event.kind === 'scoring')
        ? 'leg'
        : null
    playTableSound(frame.action.type)
    const movement = frame.events.find((e) => e.kind === 'roll')?.movement
    if (movement && !reduce && boardView === '3d' && ready3d) return playHooves(movement)
  }, [frame?.revision])
  useEffect(() => {
    setPlacing(null)
    setPairing(false)
    setLocated(null)
    if (moreMoves.current) moreMoves.current.open = false
  }, [game.turn, game.leg, game.phase])
  useEffect(() => {
    if (hint || (!selection && !pairing)) return
    const id = requestAnimationFrame(() => {
      const target = selection
        ? boardRef.current?.querySelector<HTMLButtonElement>('.cu-space-legal')
        : document.querySelector<HTMLButtonElement>('.field-choices .choice-button')
      target?.focus({ preventScroll: true })
      if (selection)
        boardRef.current?.scrollIntoView({
          block: 'start',
          inline: 'nearest',
          behavior: reduce ? 'instant' : 'smooth',
        })
      else target?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    })
    return () => cancelAnimationFrame(id)
  }, [selection, pairing, hint, reduce])
  useEffect(() => {
    if (!hint || drawer !== null) return
    const frameId = requestAnimationFrame(() => {
      const control = document.querySelector<HTMLButtonElement>(
        '.race-room button[data-hint-target="true"]:enabled',
      )
      if (control) {
        control.focus({ preventScroll: true })
        control.scrollIntoView({ block: 'nearest', inline: 'nearest' })
      }
    })
    return () => cancelAnimationFrame(frameId)
  }, [hint, drawer])
  function locateHint(a: Action, instruction: string) {
    if (!mine || !available.some((option) => JSON.stringify(option) === JSON.stringify(a))) return
    setDrawer(null)
    shelfNav.current?.clearChoice()
    setPlacing(a.type === 'tile' ? a.side : null)
    setPairing(a.type === 'partner')
    const prompt =
      a.type === 'tile'
        ? 'Choose space ' + a.space + ' to place your ' + a.side + ' tile.'
        : a.type === 'finish'
          ? 'Select the highlighted ' + a.color + ' card, then confirm the overall ' + a.pile + ' bet.'
          : a.type === 'partner'
            ? 'Choose ' + game.players[a.partner].name + ' to partner for this leg.'
            : instruction
    setLocated({ action: a, instruction: prompt, revision: room.revision })
  }
  function move(a: Action) {
    if (!mine) return
    setPlacing(null)
    setPairing(false)
    setLocated(null)
    if (document.activeElement?.matches(':focus-visible'))
      turnRef.current?.focus({ preventScroll: true })
    send(a)
  }
  function cancelChoice() {
    setLocated(null)
    setPlacing(null)
    setPairing(false)
    requestAnimationFrame(() =>
      moreMoves.current?.querySelector('summary')?.focus({ preventScroll: true }),
    )
  }
  function switchBoard(v: '2d' | '3d') {
    setBoardView(v)
    setSetting('board', v)
  }
  const finished = game.phase === 'finished' && !frame
  const waiting = (!canAct || busy) && !finished
  const turnTitle = frame
    ? activityVerbs[frame.action.type]
    : finished
      ? 'Race complete'
      : busy
        ? 'Playing your move…'
        : game.turn === game.seat
          ? 'Your turn'
          : current.name + '’s turn'
  const next = game.players[frame ? game.turn : (game.turn + 1) % game.players.length]
  const isPairChoice = game.phase === 'partnership' && !frame
  const turnKey = frame ? 'action-' + frame.revision : 'turn-' + currentSeat + '-' + game.phase
  return (
    <main
      className="race-room"
      data-reduced-motion={reduce}
      data-board-expanded={expanded}
      aria-label="Camel Up racing table"
    >
      <section className="race-ribbon" aria-label="Race status">
        <LegStatus leg={game.leg} rolls={game.rolls} finished={finished} />
        <button
          className="leader-button"
          type="button"
          aria-label="Race standings"
          onClick={() => setDrawer('standings')}
        >
          <Emblem color={rankCamels(standings)[0]} />
          <strong>{capitalize(rankCamels(standings)[0])} leads</strong>
          <ChevronRight size={14} />
        </button>
        <div className="race-ribbon-tools">
          {awayFromRace && (
            <button type="button" className="back-race" onClick={backToRace} aria-label="Back to race">
              <ArrowUp size={16} />
              Race
            </button>
          )}
          <button
            type="button"
            className="advisor-trigger"
            aria-label="Hints"
            aria-haspopup="dialog"
            aria-expanded={drawer === 'advisor'}
            onClick={() => {
              setLocated(null)
              setDrawer((open) => (open === 'advisor' ? null : 'advisor'))
            }}
          >
            <Lightbulb size={17} />
            <span>Hints</span>
          </button>
          <button
            type="button"
            className="table-menu-trigger"
            onClick={() => setDrawer('settings')}
            aria-label="Table menu"
            title="Table menu"
          >
            <Settings2 size={17} />
            <span>Table</span>
          </button>
        </div>
      </section>
      <section className="race-stage" aria-label="Racecourse and live move">
        <div className="race-viewport" ref={boardRef} tabIndex={-1} aria-label="Race board">
          <RaceBoard
            cameraToolbar={cameraToolbar}
            inspectorHost={boardInspector}
            spaces={spaces}
            sourceSpaces={sourceSpaces}
            activeRollId={frame?.action.type === 'roll' ? (lastRoll?.id ?? null) : null}
            remainingDice={game.remainingDice}
            rolledDice={game.rolls}
            view={boardView}
            lastRoll={lastRoll}
            selectableSpaces={legalSpaces}
            placementReasons={placementReasons}
            selectedSpace={
              hintAction?.type === 'tile' && selection === hintAction.side ? hintAction.space : null
            }
            reducedMotion={reduce}
            on3DReady={setReady3d}
            onRollAnimationEnd={setSettledRoll}
            onPyramidRoll={
              canAct && !selection && !pairing && !finishChoice
                ? () => move({ type: 'roll' })
                : undefined
            }
            onSelectSpace={(n) => {
              if (selection && legalSpaces.includes(n))
                move({ type: 'tile', space: n, side: selection })
            }}
          />
        </div>
        <div className="course-tools" role="group" aria-label="Board controls">
          <button
            type="button"
            className="track-map-trigger"
            onClick={() => setDrawer('track')}
            aria-haspopup="dialog"
          >
            <Map size={16} /> Track map
          </button>
          <div ref={setCameraToolbar} className="course-camera-tools" />
          <button
            type="button"
            className="field-size"
            aria-pressed={expanded}
            aria-label={expanded ? 'Show full table' : 'Expand board'}
            title={expanded ? 'Show full table' : 'Expand board'}
            onClick={toggleBoardSize}
          >
            {expanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            <span>{expanded ? 'Show full table' : 'Expand board'}</span>
          </button>
        </div>
        <div className="course-inspection" ref={setBoardInspector} />
      </section>
      <aside className="table-rail" aria-label="Play and recent activity">
        <section
          ref={turnRef}
          tabIndex={-1}
          className={'turn-station' + (mine ? ' my-turn' : '') + (frame ? ' presenting' : '')}
          aria-label="Turn station"
        >
          <div className="turn-identity" key={turnKey}>
            <Portrait index={current.character} size={48} />
            <div>
              <small>{current.name}</small>
              <h1 aria-live="polite">{turnTitle}</h1>
            </div>
          </div>
          {rolling && rollEvent?.movement && (
            <div className="course-plaque run-plaque" aria-label="Moving stack">
              <Emblem color={rollEvent.movement.moved} />
              <b>{capitalize(rollEvent.movement.moved)} runs</b>
              <span>
                {rollEvent.movement.from} →{' '}
                {rollEvent.movement.crossed ? 'Finish' : rollEvent.movement.to}
              </span>
            </div>
          )}
          {hint && (
            <div className="located-help" role="status">
              <Lightbulb size={15} />
              <span>{hint.instruction}</span>
              <button type="button" aria-label="Dismiss table hint" onClick={() => setLocated(null)}>
                <X size={13} />
              </button>
            </div>
          )}
          {(playback.pending > 1 || (rolling && !reduce)) && (
            <button className="catch-up" onClick={playback.jumpToLive}>
              <SkipForward size={13} />
              {playback.pending > 1 ? 'Catch up to live' : 'Skip shot'}
            </button>
          )}
          {finished ? (
            <div className="station-actions">
              <button className="roll-button" onClick={() => setDrawer('scores')}>
                <Trophy size={18} />
                Final scoring
              </button>
              <button className="station-link" onClick={home}>
                Main menu
              </button>
            </div>
          ) : frame ? null : isPairChoice ? (
            <div className="field-choices">
              <strong>{mine ? 'Copy a partner ticket' : 'Partner scoring'}</strong>
              {mine ? (
                <>
                  {copyOptions(game).map((o) => (
                    <button
                      className="choice-button"
                      key={o.ticket}
                      data-hint-target={
                        (hintAction?.type === 'copy' && hintAction.ticket === o.ticket) || undefined
                      }
                      onClick={() => move({ type: 'copy', ticket: o.ticket })}
                    >
                      {capitalize(o.label)} ({signed(o.value)} EP)
                    </button>
                  ))}
                  <button
                    className="station-link"
                    data-hint-target={
                      (hintAction?.type === 'copy' && hintAction.ticket === null) || undefined
                    }
                    onClick={() => move({ type: 'copy', ticket: null })}
                  >
                    Decline copy
                  </button>
                </>
              ) : (
                <p>{current.name} is choosing a ticket.</p>
              )}
            </div>
          ) : selection ? (
            <div className="field-choices">
              <div className="choice-caption">
                <strong>{ownSpectator ? 'Move your spectator' : 'Place your spectator'}</strong>
                <button aria-label="Cancel placement" onClick={cancelChoice}>
                  <X size={15} />
                </button>
              </div>
              <div className="segments">
                {(['cheer', 'boo'] as const).map((s) => (
                  <button
                    key={s}
                    aria-pressed={selection === s}
                    onClick={() => {
                      if (s !== selection) setLocated(null)
                      setPlacing(s)
                    }}
                  >
                    {s === 'cheer' ? 'Cheer +1' : 'Boo −1'}
                  </button>
                ))}
              </div>
              <p>
                Each landing earns you 1 coin.{' '}
                {selection === 'cheer'
                  ? 'Cheer sends the stack one step farther.'
                  : 'Boo sends it one step back, underneath.'}{' '}
                {ownSpectator
                  ? `Move your tile from space ${ownSpectator.space} to a different empty ring.`
                  : 'Choose an empty space marked with a ring.'}{' '}
                Keep space 1 clear and leave at least one track space between tiles.
              </p>
              <button type="button" className="choice-button" onClick={() => setDrawer('track')}>
                <Map size={16} /> Choose on map
              </button>
            </div>
          ) : pairing && canAct ? (
            <div className="field-choices">
              <div className="choice-caption">
                <strong>Choose a partner</strong>
                <button aria-label="Cancel partnership" onClick={cancelChoice}>
                  <X size={15} />
                </button>
              </div>
              {partners.map((seat) => (
                <button
                  className="choice-button"
                  key={seat}
                  data-hint-target={
                    (hintAction?.type === 'partner' && hintAction.partner === seat) || undefined
                  }
                  onClick={() => move({ type: 'partner', partner: seat })}
                >
                  <Portrait index={game.players[seat].character} size={22} />
                  {game.players[seat].name}
                </button>
              ))}
            </div>
          ) : finishChoice && canAct ? (
            <div className="confirm-navigation">
              <p>
                Choose winner or loser for {capitalize(finishChoice)}, then confirm on the card tray.
              </p>
              <button className="choice-button" onClick={() => shelfNav.current?.returnToCard()}>
                View finish bet
              </button>
              <button className="station-link" onClick={cancelFinishFromStation}>
                Cancel finish choice
              </button>
            </div>
          ) : (
            <div className="station-actions">
              {canAct ? (
                <>
                  <p className="turn-hint">Choose one action.</p>
                  <div className="station-buttons">
                    <button
                      className="roll-button"
                      data-hint-target={hintAction?.type === 'roll' || undefined}
                      onClick={() => move({ type: 'roll' })}
                    >
                      <Dice5 size={20} />
                      Roll pyramid
                    </button>
                    <button
                      className="secondary-action take-ticket"
                      onClick={() => chooseFromShelf('market')}
                      disabled={!available.some((a) => a.type === 'ticket')}
                    >
                      <Ticket size={19} />
                      Take a ticket
                    </button>
                  </div>
                  <details ref={moreMoves} className="other-actions">
                    <summary>
                      Other moves <ChevronRight size={14} />
                    </summary>
                    <div>
                      <button
                        type="button"
                        disabled={!me.handCount}
                        onClick={() => chooseFromShelf('hand')}
                      >
                        <Layers size={16} />
                        Play a finish card
                      </button>
                      <button
                        type="button"
                        disabled={!available.some((a) => a.type === 'tile')}
                        onClick={() => {
                          setLocated(null)
                          setPlacing('cheer')
                        }}
                      >
                        <Footprints size={16} />
                        Place spectator
                      </button>
                      {game.players.length >= 6 && (
                        <button
                          type="button"
                          disabled={!partners.length}
                          onClick={() => {
                            setLocated(null)
                            setPairing(true)
                          }}
                        >
                          <Handshake size={16} />
                          Choose partner
                        </button>
                      )}
                    </div>
                  </details>
                </>
              ) : (
                <p className="turn-hint">
                  {busy
                    ? 'Sending your move…'
                    : 'Choosing a move. You can inspect the board and cards.'}
                </p>
              )}
            </div>
          )}
          {lastReceipt && !frame && (
            <button className="payout-strip" onClick={() => setDrawer('scores')}>
              <Coins size={14} />
              Leg {lastReceipt.leg} payout{' '}
              <b>
                {signed(lastReceipt.change)} {Math.abs(lastReceipt.change) === 1 ? 'coin' : 'coins'}
              </b>
              <ChevronRight size={13} />
            </button>
          )}
          {expanded && (
            <button className="focus-table-link" type="button" onClick={showCards}>
              Tickets &amp; hand <ChevronRight size={15} />
            </button>
          )}
        </section>
        <RaceCall
          game={game}
          frame={frame ?? playback.lastFrame}
          leaderChange={
            !rolling && leadChange && leadChange.revision === (frame ?? playback.lastFrame)?.revision
              ? leadChange.color
              : null
          }
          active={!!frame}
          onHistory={() => setDrawer('log')}
        />

        <div className="people-shortcut">
          <button
            aria-label="Players"
            onClick={() => {
              setMatSeat(game.seat)
              setDrawer('players')
            }}
          >
            <span className="people-faces" aria-hidden="true">
              {game.players.slice(0, 4).map((p) => (
                <Portrait key={p.character} index={p.character} size={27} />
              ))}
            </span>
            <span>{game.players.length} players</span>
            <ChevronRight size={15} />
          </button>
          {game.phase !== 'finished' && (
            <small>
              Next ·{' '}
              {frame?.events.some((e) => e.kind === 'scoring')
                ? 'Leg scoring'
                : next === me
                  ? 'You'
                  : next.name}
            </small>
          )}
        </div>
      </aside>
      <div className={'card-shelf' + (waiting ? ' watching' : '')}>
        <TabletopCards
          controls={shelfNav}
          onFinishSelection={setFinishChoice}
          game={game}
          activeEventId={frame?.events.find((e) => e.kind === frame.action.type)?.id ?? null}
          hintAction={hintAction}
          canAct={canAct && !selection && !pairing}
          onAction={move}
          view={boardView}
          reducedMotion={reduce}
        />
      </div>
      {drawer === 'advisor' && (
        <Suspense
          fallback={
            <div className="advisor-opening" role="status">
              Opening race advisor…
            </div>
          }
        >
          <RaceAdvisor
            game={game}
            roomCode={room.code}
            revision={room.revision}
            waiting={busy || playback.blocked || room.revision !== latest.revision}
            onClose={() => setDrawer(null)}
            onLocate={locateHint}
          />
        </Suspense>
      )}
      {drawer === 'track' && (
        <TrackMap
          spaces={spaces}
          side={selection}
          legal={legalSpaces}
          reasons={placementReasons}
          onClose={() => setDrawer(null)}
          onPlace={(space) => {
            if (!selection || !legalSpaces.includes(space)) return
            setDrawer(null)
            move({ type: 'tile', side: selection, space })
          }}
        />
      )}
      {drawer === 'standings' && (
        <Modal title="Race standings" onClose={() => setDrawer(null)}>
          <RaceOrder stacks={standings} reduce={reduce} />
          <DiceInPyramid game={game} />
          <p className="table-modal-note">Racers higher in a stack are ahead of the ones below them.</p>
        </Modal>
      )}
      {drawer === 'settings' && (
        <Modal title="Table menu" onClose={() => setDrawer(null)}>
          <div className="table-menu-links">
            <button onClick={() => setDrawer('scores')}>
              <Coins size={18} />
              Scoring sheet
              <ChevronRight size={15} />
            </button>
            <button onClick={() => setDrawer('standings')}>
              <Trophy size={18} />
              Race standings
              <ChevronRight size={15} />
            </button>
            <button onClick={() => setDrawer('log')}>
              <Flag size={18} />
              Race log
              <ChevronRight size={15} />
            </button>
          </div>
          <fieldset className="view-settings">
            <legend>Board view</legend>
            <div className="segments">
              {(['3d', '2d'] as const).map((v) => (
                <button key={v} aria-pressed={boardView === v} onClick={() => switchBoard(v)}>
                  {v === '3d' ? <Box size={16} /> : <Map size={16} />} {v.toUpperCase()}
                </button>
              ))}
            </div>
          </fieldset>
          <label className="motion-setting">
            <input
              type="checkbox"
              checked={reduce}
              onChange={(e) => {
                setReduce(e.target.checked)
                setSetting('reduced', String(e.target.checked))
              }}
            />
            Reduce motion
          </label>
        </Modal>
      )}
      {drawer === 'players' && (
        <Modal title="Players at the table" onClose={() => setDrawer(null)}>
          <PlayerTray game={game} initialSeat={matSeat} />
        </Modal>
      )}
      {drawer === 'log' && (
        <Modal title="Race log" onClose={() => setDrawer(null)}>
          <ol className="race-log">
            {[...game.events].reverse().map((e) => (
              <li key={e.id}>{e.text}</li>
            ))}
          </ol>
        </Modal>
      )}
      {drawer === 'scores' && (
        <Modal title="Scoring sheet" onClose={() => setDrawer(null)}>
          <Scoring
            game={game}
            reveal={revealed}
            setReveal={(n) => {
              setRevealed(n)
              setSetting(revealKey, String(n))
            }}
          />
        </Modal>
      )}
    </main>
  )
}
