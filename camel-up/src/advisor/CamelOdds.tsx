import { useState, type CSSProperties, type ReactNode } from 'react'
import { ChevronDown, Dices, Flag, Route, Ticket } from 'lucide-react'
import { capitalize, FINISH_COLORS } from '../board/layout'
import { Emblem } from '../components'
import type { AdvisorResult, RacerOdds } from './analysis'
import './camel-odds.css'

type Period = 'leg' | 'race'
type Place = 'first' | 'second' | 'last'
const numbers = new Intl.NumberFormat('en', { maximumFractionDigits: 2 })
const percentages = new Intl.NumberFormat('en', { style: 'percent', maximumFractionDigits: 1 })
const count = new Intl.NumberFormat('en')

function percent(p: number) {
  if (p > 0 && p < 0.001) return '<0.1%'
  if (p > 0.999 && p < 1 - 1e-10) return '>99.9%'
  return percentages.format(Math.max(0, Math.min(1, p)))
}

function payout(value: number) {
  if (Math.abs(value) < 0.005) return '0 EP'
  return (value > 0 ? '+' : '−') + numbers.format(Math.abs(value)) + ' EP'
}

function CamelName({ color }: Pick<RacerOdds, 'color'>) {
  return (
    <span className="co-camel">
      <span aria-hidden="true">
        <Emblem color={color} />
      </span>
      {capitalize(color)}
    </span>
  )
}

export function CamelOdds({ result, assumptions }: { result: AdvisorResult; assumptions?: ReactNode }) {
  const [period, setPeriod] = useState<Period>('leg')
  const [places, setPlaces] = useState<{ leg: 'first' | 'second'; race: 'first' | 'last' }>({
    leg: 'first',
    race: 'first',
  })
  const place: Place = places[period]
  const field =
    period === 'leg'
      ? place === 'first'
        ? 'legFirst'
        : 'legSecond'
      : place === 'first'
        ? 'raceFirst'
        : 'raceLast'
  const rows = [...result.racers].sort((a, b) => b[field] - a[field] || a.color.localeCompare(b.color))
  const tickets = [...result.racers].sort((a, b) => {
    if (a.ticketEV === null && b.ticketEV === null) return a.color.localeCompare(b.color)
    if (a.ticketEV === null) return 1
    if (b.ticketEV === null) return -1
    return b.ticketEV - a.ticketEV || a.color.localeCompare(b.color)
  })
  const basis = result[period],
    exact = basis.method === 'exact'
  const periodName = period === 'leg' ? 'this leg' : 'the whole race'
  function selectPlace(value: string) {
    if (period === 'leg') setPlaces({ ...places, leg: value === 'second' ? 'second' : 'first' })
    else setPlaces({ ...places, race: value === 'last' ? 'last' : 'first' })
  }
  return (
    <section className="camel-odds" aria-label="Camel odds">
      <div className="co-period" role="group" aria-label="Forecast period">
        <button type="button" aria-pressed={period === 'leg'} onClick={() => setPeriod('leg')}>
          <Route size={16} aria-hidden="true" />
          This leg
        </button>
        <button type="button" aria-pressed={period === 'race'} onClick={() => setPeriod('race')}>
          <Flag size={16} aria-hidden="true" />
          Whole race
        </button>
      </div>
      <label className="co-place">
        <span>Finishing place</span>
        <span className="co-selector">
          <select
            value={place}
            onChange={(e) => selectPlace(e.target.value)}
            aria-label="Finishing place"
          >
            <option value="first">First place</option>
            {period === 'leg' ? (
              <option value="second">Second place</option>
            ) : (
              <option value="last">Last place</option>
            )}
          </select>
          <ChevronDown size={15} aria-hidden="true" />
        </span>
      </label>
      <div className="co-sheet">
        <table
          className="co-chances"
          aria-label={'Finishing chances for ' + place + ' place in ' + periodName}
        >
          <colgroup>
            <col className="co-name-column" />
            <col />
          </colgroup>
          <thead>
            <tr>
              <th scope="col">Camel</th>
              <th scope="col" aria-sort="descending">
                Chance of {place} place
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.color} style={{ '--runner-ink': FINISH_COLORS[r.color] } as CSSProperties}>
                <th scope="row">
                  <CamelName color={r.color} />
                </th>
                <td>
                  <span className="co-reading">
                    <span className="co-track" aria-hidden="true">
                      <i style={{ width: Math.max(0, Math.min(1, r[field])) * 100 + '%' }} />
                    </span>
                    <strong>{percent(r[field])}</strong>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="camel-odds-basis">
          <Dices size={15} aria-hidden="true" />
          {exact ? (
            <span>
              <strong>Exact outcomes</strong> · {count.format(basis.samples)} possible roll{' '}
              {basis.samples === 1 ? 'sequence' : 'sequences'}
              {period === 'leg' && ' with the current tiles'}
            </span>
          ) : (
            <span>
              Estimated from{' '}
              <strong>
                {count.format(basis.samples)} simulated {period === 'leg' ? 'legs' : 'races'}
              </strong>
            </span>
          )}
        </p>
      </div>
      {period === 'leg' && (
        <details className="co-payouts">
          <summary>
            <Ticket size={17} aria-hidden="true" />
            <span>Leg-ticket payouts</span>
            <ChevronDown size={16} aria-hidden="true" />
          </summary>
          <p>
            The top ticket pays its face value for first, +1 EP for second, and −1 EP otherwise. The
            average uses all three results before the zero-coin floor.
          </p>
          <table aria-label="Available leg-ticket payouts">
            <thead>
              <tr>
                <th scope="col">Camel</th>
                <th scope="col">Face value</th>
                <th scope="col" aria-sort="descending">
                  Average payout
                </th>
              </tr>
            </thead>
            <tbody>
              {tickets.map((r) => (
                <tr key={r.color}>
                  <th scope="row">
                    <CamelName color={r.color} />
                  </th>
                  <td>{r.ticketValue === null ? 'Sold out' : numbers.format(r.ticketValue) + ' EP'}</td>
                  <td>
                    {r.ticketEV === null ? <span aria-label="Unavailable">—</span> : payout(r.ticketEV)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
      {assumptions}
    </section>
  )
}
