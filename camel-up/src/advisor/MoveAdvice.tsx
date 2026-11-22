import { useRef, useState, type ReactNode } from 'react'
import { ArrowUpRight, Check, ChevronDown, Compass } from 'lucide-react'
import type { Action, GameView } from '../engine'
import type { ActionEstimate, AdvisorResult } from './analysis'
import { compareMoves, moveEvidence, type MoveEvidence } from './move-evidence'
import './move-advice.css'

const number = new Intl.NumberFormat('en', { maximumFractionDigits: 2 })
const percentage = new Intl.NumberFormat('en', { style: 'percent', maximumFractionDigits: 1 })
const coins = (n: number) =>
  (n > 0.00499 ? '+' : n < -0.00499 ? '−' : '') + number.format(Math.abs(n) < 0.005 ? 0 : Math.abs(n))
const unit = (n: number) => (Math.abs(Number(n.toFixed(2))) === 1 ? 'coin' : 'coins')
const keyOf = (a: Action) => JSON.stringify(a)
function comparisonTextForSelection(selected: ActionEstimate, best: ActionEstimate) {
  const compared = compareMoves(selected, best)
  if (compared.kind === 'close') return 'The two estimates are within sampling uncertainty.'
  if (compared.kind === 'tie') return 'This earns the same average gain as the recommendation.'
  const gap = number.format(Math.abs(compared.gap))
  return (
    'About ' +
    gap +
    ' ' +
    (gap === '1' ? 'coin' : 'coins') +
    ' less on average than the recommendation.'
  )
}
function reward([min, max]: [number, number]) {
  return min === max ? coins(min) : coins(min) + ' to ' + coins(max)
}
function EstimateNote({ estimate }: { estimate: ActionEstimate }) {
  if (estimate.method === 'exact')
    return <p>The model counted every possible outcome for this estimate.</p>
  const margin = 1.96 * estimate.standardError
  return (
    <p>
      {estimate.samples.toLocaleString('en')} simulated outcomes. The approximate 95% sampling margin is{' '}
      {margin < 0.005 ? 'under 0.01' : '±' + number.format(margin)} coins.
    </p>
  )
}
function TicketMath({ data }: { data: MoveEvidence }) {
  if (data.kind !== 'ticket') return null
  const raw = data.outcomes.reduce((total, o) => total + o.probability * o.payout[0], 0)
  return (
    <div className="move-math">
      <b>Average ticket payout</b>
      <p>
        {data.outcomes.map((o, i) => (
          <span key={o.label}>
            {i > 0 ? (o.payout[0] < 0 ? ' − ' : ' + ') : ''}
            {percentage.format(o.probability)} × {number.format(Math.abs(o.payout[0]))}
          </span>
        ))}{' '}
        ≈{' '}
        <strong>
          {coins(raw)} {unit(raw)}
        </strong>
      </p>
    </div>
  )
}
function Evidence({ data }: { data: MoveEvidence }) {
  return (
    <div className="move-evidence">
      {data.outcomes.length > 0 && (
        <>
          <div className="move-section-heading">
            <h4>{data.outcomeHeading}</h4>
            <span>{data.outcomeMethod === 'exact' ? 'Exact chances' : 'Estimated chances'}</span>
          </div>
          <div className="move-chances" aria-hidden="true">
            {data.outcomes.map((o, i) => (
              <i
                key={o.label}
                data-tone={o.tone}
                data-index={i}
                style={{ width: o.probability * 100 + '%' }}
              />
            ))}
          </div>
          <table className="move-outcomes" aria-label={data.outcomeHeading}>
            <thead>
              <tr>
                <th scope="col">Outcome</th>
                <th scope="col">Chance</th>
                <th scope="col">Coins</th>
              </tr>
            </thead>
            <tbody>
              {data.outcomes.map((o, i) => (
                <tr key={o.label}>
                  <th scope="row">
                    <i aria-hidden="true" data-tone={o.tone} data-index={i} />
                    {o.label}
                  </th>
                  <td>{percentage.format(o.probability)}</td>
                  <td data-tone={o.tone}>{reward(o.payout)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      {data.facts.length > 0 && (
        <dl className="move-facts">
          {data.facts.map((f) => (
            <div key={f.label}>
              <dt>{f.label}</dt>
              <dd>{f.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  )
}

export function MoveAdvice({
  game,
  result,
  onLocate,
  methods,
}: {
  game: GameView
  result: AdvisorResult
  onLocate: (action: Action, instruction: string) => void
  methods: ReactNode
}) {
  const [selected, setSelected] = useState('')
  const [expanded, setExpanded] = useState(false)
  const chooser = useRef<HTMLSelectElement>(null)
  const [first, ...rest] = result.actions
  if (!first) return <p className="ra-message">No move is available in this position.</p>
  const best = moveEvidence(game, result, first)
  const other = result.actions.find((a) => keyOf(a.action) === selected) ?? rest[0] ?? first
  const alt = moveEvidence(game, result, other)
  const comparison = rest[0] ? compareMoves(first, rest[0]) : null
  function inspect(a: ActionEstimate) {
    setSelected(keyOf(a.action))
    setExpanded(true)
    requestAnimationFrame(() => {
      chooser.current?.focus({ preventScroll: true })
      chooser.current?.scrollIntoView({ block: 'nearest' })
    })
  }
  return (
    <>
      <section className="move-pick" aria-label="Recommended move">
        <div className="move-identity">
          {best.art ? (
            <img className="move-art" src={best.art.src} alt="" />
          ) : (
            <span className="move-symbol" aria-hidden="true">
              <Compass size={28} />
            </span>
          )}
          <div>
            <span className="move-kicker">
              {comparison?.kind === 'tie'
                ? 'Joint best move'
                : comparison?.kind === 'close'
                  ? 'Suggested move · close call'
                  : 'Your next move'}
            </span>
            <h3 data-advisor-action={keyOf(first.action)}>{best.title}</h3>
          </div>
        </div>
        <p data-advisor-reason>{best.why}</p>
        <div className="move-numbers">
          <div>
            <span>{first.method === 'sampled' ? 'Estimated average gain' : 'Average gain'}</span>
            <strong>
              {coins(first.ev)} <small>{unit(first.ev)}</small>
            </strong>
          </div>
          <button type="button" onClick={() => onLocate(first.action, best.instruction)}>
            Show on table <ArrowUpRight size={15} />
          </button>
        </div>
      </section>
      <details className="ra-notes move-proof">
        <summary>
          Chances and payouts <ChevronDown size={16} />
        </summary>
        <div className="move-support">
          <Evidence data={best} />
          {comparison && (
            <p className="move-comparison-note">
              {comparison.kind === 'higher'
                ? comparison.gap < 0.005
                  ? 'Less than 0.01 coin separates the top two moves.'
                  : 'About ' +
                    number.format(comparison.gap) +
                    ' more ' +
                    (Number(comparison.gap.toFixed(2)) === 1 ? 'coin' : 'coins') +
                    ' on average than the next-best move.'
                : comparison.kind === 'tie'
                  ? 'The next-best move earns the same amount on average.'
                  : 'The top two moves are close enough that their order could change with another simulation.'}
            </p>
          )}
        </div>
        <details className="ra-notes move-method">
          <summary>
            How we calculated this <ChevronDown size={16} />
          </summary>
          <TicketMath data={best} />
          <p>{best.evNote}</p>
          <EstimateNote estimate={first} />
          {methods}
        </details>
      </details>
      {rest.length > 0 && (
        <details
          open={expanded}
          onToggle={(e) => setExpanded(e.currentTarget.open)}
          className="ra-notes move-all"
        >
          <summary>
            Compare all moves <ChevronDown size={16} />
          </summary>
          <section className="move-alternatives" aria-label="Other moves">
            <div className="move-section-heading">
              <h4>Other moves</h4>
              <span>Average gain in coins</span>
            </div>
            <ul>
              {rest.slice(0, 2).map((a) => (
                <li key={keyOf(a.action)}>
                  <button type="button" onClick={() => inspect(a)}>
                    <span>{moveEvidence(game, result, a).title}</span>
                    <b>{coins(a.ev)}</b>
                    <ArrowUpRight size={13} />
                  </button>
                </li>
              ))}
            </ul>
            <label className="move-select">
              Legal move
              <select
                ref={chooser}
                value={keyOf(other.action)}
                onChange={(e) => setSelected(e.target.value)}
              >
                {result.actions.map((a, i) => (
                  <option value={keyOf(a.action)} key={keyOf(a.action)}>
                    #{i + 1} · {moveEvidence(game, result, a).title} · {coins(a.ev)} {unit(a.ev)}
                  </option>
                ))}
              </select>
            </label>
            <section data-advisor-comparison aria-label="Selected alternative">
              <div className="move-alternative-result">
                <b>
                  {coins(other.ev)} {unit(other.ev)} on average
                </b>
                {other === first && (
                  <span>
                    <Check size={13} />
                    Recommended
                  </span>
                )}
              </div>
              <p>{alt.why}</p>
              {other !== first && <p>{comparisonTextForSelection(other, first)}</p>}
              <Evidence data={alt} />
              <details className="move-source">
                <summary>Calculation details</summary>
                <TicketMath data={alt} />
                <p>{alt.evNote}</p>
                <EstimateNote estimate={other} />
              </details>
            </section>
          </section>
        </details>
      )}
    </>
  )
}
