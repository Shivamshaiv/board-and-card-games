import { useState } from 'react'
import { Flag, RotateCw } from 'lucide-react'
import { Emblem, Modal } from './components'
import { boardLabel, capitalize, NUMBERS, type BoardSpace } from './board/layout'
import type { Side } from './engine'

// Clockwise from the finish, as seen from the grandstand.
const perimeter = [22, 21, 16, 11, 6, 1, 2, 3, 4, 5, 10, 15, 20, 25, 24, 23]

export function TrackMap({
  spaces,
  side,
  legal,
  reasons,
  onPlace,
  onClose,
}: {
  spaces: readonly BoardSpace[]
  side: Side | null
  legal: readonly number[]
  reasons?: Readonly<Record<number, string>>
  onPlace: (space: number) => void
  onClose: () => void
}) {
  const [selected, select] = useState<number | null>(null)
  const current = spaces.find((space) => space.number === selected)
  const across = spaces.filter(
    (space) => (space.number === 0 || space.number === 17) && space.camels.length,
  )
  const stack = [...(current?.camels ?? [])].reverse()
  return (
    <Modal title="Track map" onClose={onClose}>
      <div className="track-map">
        <div className="track-map-ring" role="group" aria-label="Numbered race spaces">
          <div className="track-map-center" data-selected={!!current || undefined}>
            {current ? (
              <>
                <span>Space</span>
                <strong>{current.number}</strong>
                <span>
                  {side
                    ? legal.includes(current.number)
                      ? 'Available for ' + side
                      : 'Unavailable for ' + side
                    : stack.length
                      ? stack.length + (stack.length === 1 ? ' camel' : ' camels')
                      : current.tile
                        ? capitalize(current.tile.side) + ' tile'
                        : 'Empty'}
                </span>
              </>
            ) : (
              <>
                <RotateCw size={22} aria-hidden="true" />
                <strong>Clockwise</strong>
                <span>{side ? 'Choose a space with a ring' : 'Select a space to inspect'}</span>
              </>
            )}
          </div>
          {NUMBERS.map((n) => {
            const space = spaces.find((s) => s.number === n) ?? { number: n, camels: [] }
            const top = space.camels.at(-1)
            const cell = perimeter[n - 1] - 1
            const available = !!side && legal.includes(n)
            return (
              <button
                key={n}
                type="button"
                className="track-map-cell"
                data-space={n}
                style={{ gridRow: Math.floor(cell / 5) + 1, gridColumn: (cell % 5) + 1 }}
                data-available={available || undefined}
                aria-pressed={n === selected}
                aria-label={
                  boardLabel(space) + (side ? (available ? ', available' : ', unavailable') : '')
                }
                onClick={() => select(n)}
              >
                <b>{n}</b>
                {top ? (
                  <Emblem color={top} />
                ) : space.tile ? (
                  <span className={'map-tile ' + space.tile.side}>
                    {space.tile.side === 'cheer' ? '+1' : '−1'}
                  </span>
                ) : (
                  available && <i aria-hidden="true" />
                )}
              </button>
            )
          })}
        </div>
        <div className="track-map-line">
          <Flag size={14} /> Finish line between 16 and 1
        </div>
        {across.map((space) => (
          <p key={space.number}>
            Across the line {space.number === 0 ? 'backward' : 'forward'} ·{' '}
            {[...space.camels].reverse().map(capitalize).join(', ')} (top first)
          </p>
        ))}
        <div aria-live="polite" className="track-map-detail">
          {current && (
            <>
              {stack.length > 0 && (
                <>
                  <strong>Stack from top to bottom</strong>
                  <ol>
                    {stack.map((c) => (
                      <li key={c}>
                        <Emblem color={c} />
                        {capitalize(c)}
                      </li>
                    ))}
                  </ol>
                </>
              )}
              {current.tile && (
                <p>
                  {current.tile.owner}’s {current.tile.side} tile ·{' '}
                  {current.tile.side === 'cheer' ? '+1' : '−1'}
                </p>
              )}
              {side &&
                (legal.includes(current.number) ? (
                  <button className="roll-button" onClick={() => onPlace(current.number)}>
                    Place {side} on space {current.number}
                  </button>
                ) : (
                  <p>{reasons?.[current.number]}</p>
                ))}
            </>
          )}
        </div>
      </div>
    </Modal>
  )
}
