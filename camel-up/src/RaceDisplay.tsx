import { useLayoutEffect, useMemo, useRef } from 'react'
import { Flag, History, Trophy } from 'lucide-react'
import { Emblem, Portrait } from './components'
import { capitalize, FINISH_COLORS, MARKS } from './board/layout'
import {
  COLORS,
  rankCamels,
  type Color,
  type GameEvent,
  type GameView,
  type Roll,
  type Stacks,
} from './engine'
import type { TurnFrame } from './connection'

const placeNames = ['1st', '2nd', '3rd', '4th', '5th']
const playerActions = new Set<GameEvent['kind']>([
  'roll',
  'ticket',
  'finish',
  'tile',
  'partner',
  'copy',
])

export function LegStatus({ leg, rolls, finished }: { leg: number; rolls: Roll[]; finished: boolean }) {
  return (
    <div className="leg-display">
      <Flag size={17} aria-hidden="true" />
      <strong>Leg {leg}</strong>
      <span>
        {finished
          ? 'Race finished'
          : rolls.length === 5
            ? 'Scoring'
            : rolls.length === 4
              ? 'Final roll next'
              : rolls.length + ' of 5 rolled'}
      </span>
    </div>
  )
}
export function RaceOrder({ stacks, reduce }: { stacks: Stacks; reduce: boolean }) {
  const order = useMemo(() => rankCamels(stacks), [stacks])
  const nodes = useRef(new Map<Color, HTMLLIElement>()),
    previous = useRef(new Map<Color, number>())
  useLayoutEffect(() => {
    const next = new Map<Color, number>()
    for (const color of order) {
      const node = nodes.current.get(color)
      if (!node) continue
      const x = node.offsetLeft,
        old = previous.current.get(color)
      next.set(color, x)
      if (old !== undefined && old !== x && !reduce && node.animate)
        node.animate([{ transform: 'translateX(' + (old - x) + 'px)' }, { transform: 'none' }], {
          duration: 320,
          easing: 'ease-out',
        })
    }
    previous.current = next
  }, [order, reduce])
  return (
    <div className="race-order">
      <div className="order-label">
        <Trophy size={16} />
        <span>Race order</span>
      </div>
      <ol aria-label="Race standings">
        {order.map((color, i) => (
          <li
            key={color}
            ref={(el) => {
              if (el) nodes.current.set(color, el)
              else nodes.current.delete(color)
            }}
            className={i === 0 ? 'leading' : ''}
            aria-label={placeNames[i] + ' ' + color}
            title={placeNames[i] + ' · ' + capitalize(color)}
          >
            <span className="place-number">{i + 1}</span>
            <span
              className="silk"
              style={{
                background: FINISH_COLORS[color],
                color: color === 'yellow' ? '#392d22' : '#fff',
              }}
            >
              {MARKS[color]}
            </span>
            <b>{capitalize(color)}</b>
          </li>
        ))}
      </ol>
    </div>
  )
}
export function latestPlayerEvent(game: GameView) {
  for (let i = game.events.length - 1; i >= 0; i--)
    if (playerActions.has(game.events[i].kind)) return game.events[i]
  return null
}
function rollName(roll: Roll) {
  return (
    capitalize(roll.die) + ' ' + roll.value + (roll.greyColor ? ' (' + roll.greyColor + ' face)' : '')
  )
}
function actionLine(event: GameEvent, name: string) {
  if (event.movement && event.roll) return 'Rolled ' + rollName(event.roll)
  const personal = event.text.startsWith(name + ' ') ? event.text.slice(name.length + 1) : event.text
  return capitalize(personal.replace(/\.$/, ''))
}
function place(space: number) {
  return space < 1 || space > 16 ? 'the finish' : 'space ' + space
}
export function RaceCall({
  game,
  frame,
  leaderChange,
  active,
  onHistory,
}: {
  game: GameView
  frame: TurnFrame | null
  leaderChange: Color | null
  active: boolean
  onHistory: () => void
}) {
  const event = frame
    ? (frame.events.find((e) => playerActions.has(e.kind)) ?? null)
    : latestPlayerEvent(game)
  if (!frame && !event)
    return (
      <div className="race-call race-goal">
        <Flag size={17} />
        <span>Finish with the most coins to win.</span>
      </div>
    )
  const actor = frame
    ? game.players[frame.actor]
    : event?.seat !== undefined
      ? game.players[event.seat]
      : null
  const movement = event?.movement,
    roll = event?.roll
  let explanation = ''
  if (movement && roll) {
    const riders = movement.unit.slice(1).map(capitalize)
    explanation = capitalize(movement.moved) + (active ? ' runs to ' : ' reached ') + place(movement.to)
    if (riders.length)
      explanation += ' with ' + new Intl.ListFormat('en', { style: 'short' }).format(riders)
    if (movement.tile)
      explanation += ' · ' + (movement.tile.side === 'cheer' ? 'Cheered forward' : 'Booed back')
  } else if (frame?.action.type === 'ticket')
    explanation =
      'Pays ' + frame.action.value + ' coins if ' + capitalize(frame.action.color) + ' leads this leg.'
  else if (frame?.action.type === 'finish' || event?.kind === 'finish')
    explanation = 'The camel stays secret until the race ends.'
  else if (frame?.action.type === 'partner')
    explanation = 'Each partner may copy one ticket at leg scoring.'
  else if (frame?.action.type === 'tile')
    explanation =
      frame.action.side === 'cheer'
        ? 'The next stack landing here advances one extra space.'
        : 'The next stack landing here goes back underneath.'
  const title = frame?.text || event?.text || game.events[0]?.text || 'The race is ready.'
  const named =
    frame?.action.type === 'ticket' && actor
      ? actor.name + ' took the ' + frame.action.color + ' ticket'
      : actor && event
        ? actor.name + ' ' + actionLine(event, actor.name).replace(/^./, (c) => c.toLowerCase())
        : title
  return (
    <div className={'race-call' + (active ? ' announcing' : '')} aria-live="polite" aria-atomic="true">
      {frame?.action.type === 'ticket' ? (
        <img className="call-piece" src={'/art/card-' + frame.action.color + '.webp'} alt="" />
      ) : actor ? (
        <Portrait index={actor.character} size={33} />
      ) : (
        <span className="call-flag">
          <Flag size={19} />
        </span>
      )}
      <div className="call-copy" key={frame?.revision ?? event?.id ?? 'start'}>
        {!active && <small>Last move</small>}
        <strong className="last-play">
          {movement && roll && actor
            ? actor.name + ' rolled ' + rollName(roll)
            : named.replace(/\.$/, '')}
        </strong>
        {explanation && <span>{explanation}</span>}
      </div>
      {leaderChange && (
        <span className="leader-change">
          <Flag size={12} />
          {capitalize(leaderChange)} takes the lead
        </span>
      )}
      <button className="call-history" onClick={onHistory} aria-label="Race log" title="Race log">
        <History size={17} />
      </button>
    </div>
  )
}
export function DiceInPyramid({ game }: { game: GameView }) {
  return (
    <>
      <div className="remaining-dice">
        <span>Still in the pyramid</span>
        <div aria-label="Remaining dice">
          {[...COLORS, 'grey' as const]
            .filter((c) => game.remainingDice.includes(c))
            .map((c) => (
              <Emblem key={c} color={c} />
            ))}
        </div>
      </div>
      {game.rolls.length > 0 && (
        <div className="leg-die-results">
          <span>Drawn this leg</span>
          <ol>
            {game.rolls.map((r) => (
              <li key={r.die}>
                <Emblem color={r.die} />
                {rollName(r)}
              </li>
            ))}
          </ol>
        </div>
      )}
    </>
  )
}
