import {
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type Ref,
} from 'react'
import { flushSync } from 'react-dom'
import { Flag, HandCoins, Layers, LockKeyhole } from 'lucide-react'
import type { Action, Color, GameView, Pile } from '../engine'
import { capitalize, FINISH_COLORS, MARKS } from '../board/layout'
import { Modal } from '../components'
import {
  artForFace,
  CARD_COLORS,
  publicCardLayout,
  publicTransfer,
  type Slot,
  type Transfer,
} from './model'
import type { openCardShelf } from './scene'
import './cards.css'

interface Props {
  game: GameView
  canAct: boolean
  onAction: (action: Action) => void
  view?: '2d' | '3d'
  reducedMotion?: boolean
  activeEventId?: number | null
  hintAction?: Action
  controls?: Ref<ShelfNavigation>
  onFinishSelection?: (color: Color | null) => void
}
type Panel = 'market' | 'hand'
export interface ShelfNavigation {
  show: (panel: Panel) => void
  returnToCard: () => void
  clearChoice: () => void
}
function PhysicalSlot({
  slot,
  src,
  count = 1,
  label,
  back = false,
}: {
  slot: Slot
  src?: string
  count?: number
  label?: string
  back?: boolean
}) {
  return (
    <span className={'tc-slot' + (count ? '' : ' empty')} data-card-slot={slot} aria-hidden="true">
      {!!count && src && (
        <span
          className={'tc-flat-card' + (back ? ' back' : '')}
          style={{ '--layers': Math.min(5, count) } as CSSProperties}
        >
          <img src={src} alt="" />
          {label && <b>{label}</b>}
        </span>
      )}
      {!count && <i className="tc-missing" />}
    </span>
  )
}

export function TabletopCards({
  game: g,
  canAct,
  onAction,
  view = '3d',
  reducedMotion = false,
  activeEventId,
  hintAction,
  controls,
  onFinishSelection,
}: Props) {
  const me = g.players[g.seat]
  const [panel, setPanel] = useState<Panel>('market'),
    [choice, setChoice] = useState<Color | null>(null),
    [pile, setPile] = useState<Pile>('winner')
  const [invited, setInvited] = useState<Panel | null>(null)
  const [holdings, setHoldings] = useState(false),
    [shown, setShown] = useState(false),
    [fly, setFly] = useState<Transfer | null>(null)
  const stage = useRef<HTMLDivElement>(null),
    host = useRef<HTMLDivElement>(null),
    scene = useRef<ReturnType<typeof openCardShelf> | null>(null)
  const lastId = useRef(g.events.at(-1)?.id ?? 0),
    timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const lastActive = useRef<number | null>(null),
    waiting = useRef<Transfer[]>([])
  const handFirst = useRef<HTMLButtonElement>(null),
    chosenPile = useRef<HTMLButtonElement>(null),
    confirm = useRef<HTMLButtonElement>(null)
  const layout = useMemo(() => publicCardLayout(g), [g])
  const latest = useRef({ layout, choice })
  latest.current = { layout, choice }
  const allowed = canAct && g.phase === 'playing' && g.turn === g.seat
  useLayoutEffect(() => {
    onFinishSelection?.(choice)
  }, [choice, onFinishSelection])
  useImperativeHandle(
    controls,
    () => ({
      show(next: Panel) {
        // The requested row may be hidden until React switches the shelf panel.
        flushSync(() => {
          setChoice(null)
          setPanel(next)
          setInvited(next)
        })
        const control = stage.current?.querySelector<HTMLElement>(
          next === 'market' ? '.tc-market-row' : '.tc-hand-row',
        )
        ;(control ?? stage.current)?.focus({ preventScroll: true })
        stage.current?.scrollIntoView({
          block: 'nearest',
          inline: 'nearest',
          behavior: reducedMotion ? 'instant' : 'smooth',
        })
      },
      returnToCard() {
        chosenPile.current?.focus({ preventScroll: true })
        chosenPile.current?.scrollIntoView({
          block: 'nearest',
          behavior: reducedMotion ? 'instant' : 'smooth',
        })
      },
      clearChoice() {
        setChoice(null)
        setInvited(null)
      },
    }),
    [reducedMotion],
  )
  useLayoutEffect(() => {
    if (hintAction?.type === 'ticket' || hintAction?.type === 'finish') {
      setPanel(hintAction.type === 'ticket' ? 'market' : 'hand')
      setChoice(null)
    }
  }, [hintAction])
  useEffect(() => {
    if (!allowed) {
      setChoice(null)
      setInvited(null)
    }
  }, [allowed])
  useEffect(() => {
    let disposed = false
    setShown(false)
    if (view === '3d' && !reducedMotion && host.current && stage.current) {
      import('./scene')
        .then(({ openCardShelf }) => {
          if (disposed || !host.current || !stage.current) return
          try {
            scene.current = openCardShelf(
              host.current,
              stage.current,
              () => {
                if (!disposed) setShown(true)
              },
              () => {
                if (!disposed) {
                  setShown(false)
                  scene.current?.dispose()
                  scene.current = null
                }
              },
            )
            scene.current.update(latest.current.layout, latest.current.choice, waiting.current)
            waiting.current = []
          } catch {
            setShown(false)
          }
        })
        .catch(() => {
          if (!disposed) setShown(false)
        })
    }
    return () => {
      disposed = true
      scene.current?.dispose()
      scene.current = null
    }
  }, [view, reducedMotion])
  useLayoutEffect(() => {
    const last = g.events.at(-1)?.id ?? 0
    const eventMoves =
      activeEventId === undefined
        ? last >= lastId.current
          ? g.events
              .filter((e) => e.id > lastId.current)
              .flatMap((e) => publicTransfer(g, e.id) ?? [])
          : []
        : activeEventId !== null && activeEventId !== lastActive.current
          ? [publicTransfer(g, activeEventId)].filter((m): m is Transfer => !!m)
          : []
    if (typeof activeEventId === 'number') lastActive.current = activeEventId
    lastId.current = last
    const moves = reducedMotion ? [] : eventMoves.slice(-3)
    if (moves.length) {
      const m = moves.at(-1)!
      clearTimeout(timer.current)
      setFly(m)
      timer.current = setTimeout(() => setFly(null), 550 * Math.max(1, moves.length))
    }
    if (scene.current) scene.current.update(layout, choice, moves, activeEventId === null)
    else if (view === '3d' && !reducedMotion) {
      if (activeEventId === null) waiting.current = []
      else if (moves.length) waiting.current = moves
    }
    if (activeEventId === null) {
      clearTimeout(timer.current)
      setFly(null)
    }
  }, [g, layout, choice, reducedMotion, panel, activeEventId, view])
  useLayoutEffect(() => {
    scene.current?.measure()
  }, [panel, fly])
  useEffect(() => () => clearTimeout(timer.current), [])
  const [fallbackFlight, setFallbackFlight] = useState<CSSProperties | null>(null)
  useLayoutEffect(() => {
    if (shown || !fly || reducedMotion || !stage.current) {
      setFallbackFlight(null)
      return
    }
    const base = stage.current.getBoundingClientRect()
    const center = (slot: Slot) => {
      const r = stage.current?.querySelector(`[data-card-slot="${slot}"]`)?.getBoundingClientRect()
      return r && r.width
        ? [r.left - base.left + r.width / 2, r.top - base.top + r.height / 2]
        : [base.width * 0.87, 21]
    }
    const [x, y] = center(fly.from),
      [toX, toY] = center(fly.to)
    setFallbackFlight({
      '--from-x': x + 'px',
      '--from-y': y + 'px',
      '--travel-x': toX - x + 'px',
      '--travel-y': toY - y + 'px',
    } as CSSProperties)
  }, [shown, fly, reducedMotion, panel])
  function openHand() {
    setPanel('hand')
    requestAnimationFrame(() => {
      if (allowed) handFirst.current?.focus({ preventScroll: true })
    })
  }
  function playFinish() {
    if (!choice || !allowed || !g.hand.includes(choice)) return
    onAction({ type: 'finish', pile, color: choice })
    setChoice(null)
  }
  function pickCard(color: Color) {
    setInvited(null)
    setPanel('hand')
    setPile(
      hintAction?.type === 'finish' && hintAction.color === color ? hintAction.pile : 'winner',
    )
    setChoice(color)
    requestAnimationFrame(() => {
      chosenPile.current?.focus({ preventScroll: true })
      stage.current?.scrollIntoView({
        block: 'nearest',
        inline: 'nearest',
        behavior: reducedMotion ? 'instant' : 'smooth',
      })
    })
  }
  function cancelFinish() {
    const previous = choice
    setChoice(null)
    requestAnimationFrame(() => {
      const original =
        previous &&
        stage.current?.querySelector<HTMLButtonElement>(
          `button[data-finish-color="${previous}"]:enabled`,
        )
      ;(original || handFirst.current)?.focus({ preventScroll: true })
    })
  }
  const bench = layout.find((s) => s.slot === 'my-bench')!,
    benchCount = bench.count
  return (
    <section
      id="tabletop-cards"
      className={'tc-shelf' + (reducedMotion ? ' tc-still' : '')}
      aria-label="Betting table"
    >
      <div
        ref={stage}
        className={'tc-stage ' + (shown ? 'tc-webgl' : 'tc-flat') + (choice ? ' tc-choosing' : '')}
        data-panel={panel}
        data-choosing-from={allowed ? invited : undefined}
        tabIndex={-1}
        data-transfer={fly?.kind}
        onKeyDown={(e) => {
          if (choice && e.key === 'Escape') {
            e.preventDefault()
            cancelFinish()
          }
        }}
      >
        <div className="tc-canvas" ref={host} aria-hidden="true" />
        <div className="tc-bar">
          <div className="tc-route" aria-live="polite">
            <span data-card-slot="other-bench" />
            {fly && fly.seat !== g.seat && (
              <>
                <img src={`/art/portrait-${g.players[fly.seat].character}.webp`} alt="" />
                <span>
                  {g.players[fly.seat].name}
                  {fly.kind === 'finish' ? ' · face down' : '’s tray'}
                </span>
              </>
            )}
          </div>
          {choice && allowed ? (
            <div className="tc-commitbar">
              <button className="tc-cancel" onClick={cancelFinish}>
                Cancel
              </button>
              <button className="tc-commit-button" ref={confirm} onClick={playFinish}>
                Confirm {capitalize(choice)} for overall {pile}
              </button>
            </div>
          ) : (
            <>
              <button
                className="tc-tab market-tab"
                aria-pressed={panel === 'market'}
                onClick={() => setPanel('market')}
              >
                Leg tickets
              </button>
              <button
                className="tc-tab"
                id="private-finish-hand"
                aria-pressed={panel === 'hand'}
                aria-label="Finish card"
                onClick={openHand}
              >
                <Layers size={14} />
                Finish cards
              </button>
            </>
          )}
          <button
            className="tc-holdings"
            onClick={() => setHoldings(true)}
            aria-label={`Your tickets, ${benchCount} held`}
          >
            <PhysicalSlot slot="my-bench" src={artForFace(bench.front)} count={benchCount} />
            <span className="tc-purse">
              <i aria-hidden="true">●</i>
              {me.coins} {me.coins === 1 ? 'coin' : 'coins'}
            </span>
            <span className="tc-held-count">{benchCount} held</span>
          </button>
        </div>
        <div className="tc-deal">
          <div className="tc-zone tc-market">
            <div className="tc-label">
              <h3>{invited === 'market' ? 'Choose a camel' : 'Free to take'}</h3>
              <small>
                {invited === 'market' ? 'Taking a ticket is free. ' : ''}First pays the amount
                shown. Second pays 1 coin. Other places cost 1.
              </small>
            </div>
            <div
              className="tc-market-row"
              tabIndex={-1}
              role="group"
              aria-label="Choose a camel for a free leg ticket"
            >
              {CARD_COLORS.map((c) => {
                const stock = g.tickets[c],
                  value = stock[0]
                return (
                  <button
                    className="tc-market-card"
                    key={c}
                    disabled={!allowed || !stock.length}
                    aria-label={
                      value
                        ? `Take ${c} leg ticket, pays ${value} coins for first, ${stock.length} left`
                        : `${c} leg tickets sold out`
                    }
                    data-hint-target={
                      (hintAction?.type === 'ticket' && hintAction.color === c) || undefined
                    }
                    onClick={() => onAction({ type: 'ticket', color: c })}
                  >
                    <PhysicalSlot
                      slot={`market-${c}`}
                      src={`/art/card-${c}.webp`}
                      count={stock.length}
                      label={value ? value + ' EP' : ''}
                    />
                    <span className="tc-card-label">
                      <i style={{ background: FINISH_COLORS[c] }}>{MARKS[c]}</i>
                      {capitalize(c)}
                    </span>
                    <small>
                      {value ? (
                        <>
                          Pays <b>{value}</b>
                          <span className="tc-stock">{stock.length} left</span>
                        </>
                      ) : (
                        'Sold out'
                      )}
                    </small>
                  </button>
                )
              })}
            </div>
          </div>
          <div className="tc-zone tc-hand">
            <div className="tc-label">
              <h3>
                <LockKeyhole size={13} />
                {invited === 'hand' ? 'Choose your finish card' : 'Bet on the final result'}
              </h3>
              <small>Choose a camel for overall winner or loser. Each color plays once.</small>
            </div>
            <div
              className="tc-hand-row"
              tabIndex={-1}
              role="group"
              aria-label="Choose a finish card"
            >
              {CARD_COLORS.map((c) => {
                const inHand = g.hand.includes(c)
                return (
                  <button
                    className={'tc-hand-card' + (choice === c ? ' chosen' : '')}
                    aria-pressed={choice === c}
                    key={c}
                    ref={
                      c === CARD_COLORS.find((color) => g.hand.includes(color))
                        ? handFirst
                        : undefined
                    }
                    disabled={!allowed || !inHand}
                    aria-label={`Select ${c} finish card`}
                    data-finish-color={c}
                    data-hint-target={
                      (hintAction?.type === 'finish' && hintAction.color === c) || undefined
                    }
                    onClick={() => pickCard(c)}
                  >
                    <PhysicalSlot
                      slot={`hand-${c}`}
                      src={`/art/card-${c}.webp`}
                      count={inHand ? 1 : 0}
                    />
                    <span className="tc-card-label">{capitalize(c)}</span>
                    {!inHand && <small className="tc-spent">Played</small>}
                  </button>
                )
              })}
            </div>
          </div>
          <div className="tc-zone tc-piles">
            <div
              className="tc-pyramid"
              role="group"
              aria-label="Pyramid tickets on the table"
              title="Each pyramid ticket pays 1 EP at leg scoring."
            >
              <PhysicalSlot
                slot="pyramid-bank"
                src="/art/card-pyramid.webp"
                count={5 - g.rolls.length}
              />
              <span>
                Pyramid <b>{5 - g.rolls.length}/5</b>
              </span>
            </div>
            <div className="tc-label">
              <h3>{choice ? 'Choose a pile' : 'Finish piles'}</h3>
              <small>
                <Flag size={13} />
              </small>
            </div>
            <div className="tc-pile-row">
              {(['winner', 'loser'] as const).map((p) => {
                const owners = g.finishOwners[p],
                  top = owners.at(-1)
                return (
                  <button
                    className={'tc-finish-pile' + (choice && pile === p ? ' chosen' : '')}
                    ref={p === pile ? chosenPile : undefined}
                    key={p}
                    disabled={!choice || !allowed}
                    aria-pressed={choice ? pile === p : undefined}
                    aria-label={
                      choice ? 'Overall ' + p : `Overall ${p}, ${owners.length} public card backs`
                    }
                    onClick={() => {
                      setPile(p)
                      requestAnimationFrame(() => confirm.current?.focus({ preventScroll: true }))
                    }}
                  >
                    <PhysicalSlot
                      slot={`pile-${p}`}
                      src={
                        top === undefined
                          ? undefined
                          : `/art/portrait-${g.players[top].character}.webp`
                      }
                      back
                      count={owners.length}
                    />
                    <span className="tc-card-label">
                      {capitalize(p)} <b>{owners.length}</b>
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
        {!shown && fly && fallbackFlight && !reducedMotion && (
          <span
            key={fly.id}
            className={'tc-flat-flight ' + (fly.faceDown ? 'tc-back-flight' : '')}
            style={fallbackFlight}
            aria-hidden="true"
          >
            <img src={artForFace(fly.front)} alt="" />
          </span>
        )}
      </div>
      {holdings && (
        <Modal title="Your tickets" onClose={() => setHoldings(false)}>
          <div className="tc-receipt">
            {me.tickets.length === 0 && !me.pyramidTickets ? (
              <p>You have no tickets this leg.</p>
            ) : (
              <>
                {me.tickets.map((t, i) => (
                  <div key={i}>
                    <img src={`/art/card-${t.color}.webp`} alt="" />
                    <span>{capitalize(t.color)} leg ticket</span>
                    <b>{t.value} EP</b>
                  </div>
                ))}
                {me.pyramidTickets > 0 && (
                  <div>
                    <img src="/art/card-pyramid.webp" alt="" />
                    <span>
                      {me.pyramidTickets} pyramid {me.pyramidTickets === 1 ? 'ticket' : 'tickets'}
                    </span>
                    <b>{me.pyramidTickets} EP</b>
                  </div>
                )}
              </>
            )}
            <div className="tc-account">
              <HandCoins size={17} />
              <b>{me.coins} EP</b> in your purse
            </div>
            {g.ownFinishBets.length > 0 && (
              <section className="tc-own-bets">
                <h3>Your face-down finish bets</h3>
                <ul>
                  {g.ownFinishBets.map((b) => (
                    <li key={b.color}>
                      {capitalize(b.color)} for {b.pile}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        </Modal>
      )}
    </section>
  )
}
