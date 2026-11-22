import { useMemo, useState } from 'react'
import { ArrowRight, Flag, Footprints } from 'lucide-react'
import { capitalize } from '../board/layout'
import { Emblem } from '../components'
import type { Crazy, Die, GameView } from '../engine'
import { enumerateNextRoll } from './next-roll'
import './next-roll.css'

const percentage = new Intl.NumberFormat('en', { style: 'percent', maximumFractionDigits: 1 })
const names = new Intl.ListFormat('en', { style: 'short', type: 'conjunction' })
const space = (n: number) => (n === 0 || n === 17 ? 'Finish line' : 'Space ' + n)

export function NextRoll({ game }: { game: GameView }) {
  const result = useMemo(
    () => enumerateNextRoll(game),
    [game.phase, game.stacks, game.tiles, game.remainingDice],
  )
  const [choice, setDie] = useState<Die | null>(null)
  const [value, setValue] = useState(1)
  const [ink, setInk] = useState<Crazy>('white')
  const die = choice && game.remainingDice.includes(choice) ? choice : game.remainingDice[0]
  const branch = result.branches.find(
    (b) => b.die === die && b.value === value && (die !== 'grey' || b.ink === ink),
  )
  if (!branch) return <p>The current leg is being scored.</p>
  const m = branch.movement,
    odds = branch.weight / result.total
  const riders = m.unit.slice(1).map(capitalize)
  const otherCrazy = m.moved === 'black' ? 'white' : 'black'
  const from = game.stacks[m.from]
  const greyOverride =
    branch.ink !== null && branch.ink !== m.moved
      ? from[from.indexOf(m.moved) - 1] === otherCrazy
        ? capitalize(m.moved) + ' sits directly on the other crazy camel and takes this roll.'
        : capitalize(m.moved) + ' is the only crazy camel carrying a racer and takes this roll.'
      : null
  return (
    <section className="next-roll" aria-label="Next roll simulator">
      <h3>If the pyramid is rolled now</h3>
      <div className="nr-odds">
        <div>
          <b>{percentage.format(result.leadChanges)}</b>
          <span>Leader changes</span>
        </div>
        <div>
          <b>{percentage.format(result.endsRace)}</b>
          <span>Race ends</span>
        </div>
      </div>
      <fieldset>
        <legend>Choose a die</legend>
        <div className="nr-dice">
          {game.remainingDice.map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={c === die}
              aria-label={capitalize(c) + ' die'}
              onClick={() => setDie(c)}
            >
              <Emblem color={c} />
              <span>{capitalize(c)}</span>
            </button>
          ))}
        </div>
      </fieldset>
      <div className="nr-face">
        <fieldset>
          <legend>Number</legend>
          <div className="nr-choice">
            {[1, 2, 3].map((n) => (
              <button
                key={n}
                type="button"
                aria-label={'Roll ' + n}
                aria-pressed={value === n}
                onClick={() => setValue(n)}
              >
                {n}
              </button>
            ))}
          </div>
        </fieldset>
        {die === 'grey' && (
          <fieldset>
            <legend>Pip color</legend>
            <div className="nr-choice">
              {(['white', 'black'] as const).map((c) => (
                <button key={c} aria-pressed={ink === c} onClick={() => setInk(c)}>
                  {capitalize(c)}
                </button>
              ))}
            </div>
          </fieldset>
        )}
      </div>
      <div className="nr-result" aria-live="polite" aria-atomic="true">
        <header>
          <Emblem color={m.moved} />
          <strong>{capitalize(m.moved)} would move</strong>
        </header>
        <div className="nr-track">
          <b>{space(m.from)}</b>
          <ArrowRight size={15} />
          <b>{space(m.landing)}</b>
          {m.tile && (
            <>
              <ArrowRight size={15} />
              <b>{space(m.to)}</b>
            </>
          )}
        </div>
        {riders.length > 0 && <p>Carrying {names.format(riders)}.</p>}
        {greyOverride && <p>{greyOverride}</p>}
        {m.tile && (
          <p>
            <Footprints size={14} /> {game.players[m.tile.owner].name} earns 1 EP. The {m.tile.side}{' '}
            tile moves the stack{' '}
            {m.tile.side === 'cheer'
              ? 'one further space'
              : 'back one space, underneath any waiting camels'}
            .
          </p>
        )}
        <p>
          <Flag size={14} /> {capitalize(branch.order[0])} would{' '}
          {m.crossed ? 'win the race' : game.rolls.length === 4 ? 'win this leg' : 'lead'}, with{' '}
          {capitalize(branch.order[1])} second.
        </p>
        <small>
          This die and face have a 1 in {result.total / branch.weight} chance ({percentage.format(odds)}
          ) on the next draw.
        </small>
      </div>
    </section>
  )
}
