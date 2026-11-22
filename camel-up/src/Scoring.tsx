import { useLayoutEffect, useRef, useState } from 'react'
import { Trophy } from 'lucide-react'
import { capitalize } from './board/layout'
import type { GameView } from './engine'
const signed = (n: number) => (n > 0 ? '+' + n : String(n))
export function Scoring({
  game,
  reveal,
  setReveal,
}: {
  game: GameView
  reveal: number
  setReveal: (count: number) => void
}) {
  const [leg, setLeg] = useState(game.receipts.at(-1)?.leg || 1)
  const winnerRef = useRef<HTMLDivElement>(null)
  const previousReveal = useRef(reveal)
  useLayoutEffect(() => {
    if (reveal > previousReveal.current && reveal >= game.finishResults.length) {
      // The reveal buttons disappear. Give keyboard and phone users the newly
      // visible result rather than leaving focus at the bottom of a long list.
      winnerRef.current?.focus({ preventScroll: true })
      winnerRef.current?.scrollIntoView({ block: 'nearest' })
    }
    previousReveal.current = reveal
  }, [reveal, game.finishResults.length])
  return (
    <div className="score-sheet">
      {game.phase === 'finished' && reveal >= game.finishResults.length && (
        <div
          ref={winnerRef}
          className="winner"
          role="group"
          aria-label={
            game.winners.map((i) => game.players[i].name).join(' and ') +
            ' ' +
            (game.winners.length > 1 ? 'share victory' : 'wins') +
            ' with ' +
            game.players[game.winners[0]].coins +
            ' EP'
          }
          tabIndex={-1}
        >
          <Trophy />
          <strong>{game.winners.map((i) => game.players[i].name).join(' & ')}</strong>
          <span>
            {game.players[game.winners[0]].coins} EP ·{' '}
            {game.winners.length > 1 ? 'Shared victory' : 'Race winner'}
          </span>
        </div>
      )}
      {game.receipts.length ? (
        <>
          <label className="field">
            Leg scoring
            <select value={leg} onChange={(e) => setLeg(Number(e.target.value))}>
              {[...new Set(game.receipts.map((r) => r.leg))].map((l) => (
                <option key={l} value={l}>
                  Leg {l}
                </option>
              ))}
            </select>
          </label>
          {game.receipts
            .filter((r) => r.leg === leg)
            .map((r) => {
              const nominal = r.lines.reduce((sum, line) => sum + line.value, 0)
              const unpaid = r.change - nominal
              return (
                <details className="receipt" key={r.seat} open={r.seat === game.seat}>
                  <summary>
                    {game.players[r.seat].name}
                    <b>{signed(r.change)} EP</b>
                  </summary>
                  {r.lines.length ? (
                    r.lines.map((line, i) => (
                      <div key={i}>
                        <span>{capitalize(line.label)}</span>
                        <span>{signed(line.value)}</span>
                      </div>
                    ))
                  ) : (
                    <p>No tickets this leg.</p>
                  )}
                  {unpaid > 0 && (
                    <p className="receipt-adjustment">
                      The purse covered {Math.abs(r.change)} of the {Math.abs(nominal)} EP loss. The
                      bank waived the remaining {unpaid} EP.
                    </p>
                  )}
                  {r.balance !== null && (
                    <div className="total">
                      <b>Balance after this leg</b>
                      <b>{r.balance} EP</b>
                    </div>
                  )}
                </details>
              )
            })}
        </>
      ) : (
        <p>The first leg is still running.</p>
      )}
      {game.phase === 'finished' && (
        <>
          <h3>Finish-card reveal</h3>
          <p className="muted">
            {game.finishResults.length
              ? 'Oldest bet first, winner pile then loser pile.'
              : 'No finish cards were played.'}
          </p>
          {game.finishResults.slice(0, reveal).map((r, i) => (
            <div className="finish-result" key={i}>
              <img className="revealed-card" src={'/art/card-' + r.color + '.webp'} alt="" />
              <span>
                <b>{game.players[r.seat].name}</b>
                <small>
                  {capitalize(r.color)} · Overall {r.pile}
                  {r.value < 0 && r.change === 0 && ' · No coins to pay'}
                </small>
              </span>
              <b>{signed(r.change)} EP</b>
            </div>
          ))}
          {reveal < game.finishResults.length && (
            <div className="actions">
              <button className="primary" onClick={() => setReveal(reveal + 1)}>
                Reveal next card
              </button>
              <button className="secondary" onClick={() => setReveal(game.finishResults.length)}>
                Reveal all
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
