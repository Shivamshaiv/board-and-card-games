import { useState, type CSSProperties } from 'react'
import { Flag, Handshake, Ticket as TicketIcon } from 'lucide-react'
import { CamelLogo, Emblem, Portrait } from './components'
import { capitalize, FINISH_COLORS } from './board/layout'
import {
  visibleCoinStacks,
  type Color,
  type GameView,
  type Pile,
  type PlayerView,
  type Tile,
} from './engine'
import './tray.css'

const colorOrder: Color[] = ['red', 'yellow', 'green', 'blue', 'purple']
const portrait = (character: number) => `/art/portrait-${character}.webp`

function CardBack({ character }: { character: number }) {
  return (
    <span className="tray-card-back" aria-hidden="true">
      <img src={portrait(character)} alt="" />
    </span>
  )
}

function Purse({ player }: { player: PlayerView }) {
  const amount = player.coins
  const groups = amount === null ? (player.coinStacks ?? []) : visibleCoinStacks(amount)
  return (
    <div className="tray-object tray-purse">
      <div className="tray-object-title">Coin purse</div>
      <div className="tray-coins">
        {groups.map((g) => (
          <div key={g.denomination} className="tray-coin-group">
            <span
              className={'tray-coin coin-' + g.denomination + (g.stacked ? ' stacked' : '')}
              aria-label={`${g.denomination} EP ${g.stacked ? 'coins' : 'coin'}`}
            >
              {g.denomination}
            </span>
            {amount !== null && (
              <small>×{g.denomination === 5 ? Math.floor(amount / 5) : amount % 5}</small>
            )}
          </div>
        ))}
        {!groups.length && <span className="tray-blank">Empty purse</span>}
      </div>
      {amount !== null && <strong>{amount} EP</strong>}
    </div>
  )
}

function Spectator({ player, tile }: { player: PlayerView; tile?: Tile }) {
  const sides = tile ? [tile.side] : (['cheer', 'boo'] as const)
  return (
    <div className="tray-object">
      <div className="tray-object-title">Spectator tile</div>
      <div className="tray-tile-faces">
        {sides.map((side) => (
          <span className={'tray-spectator tile-' + side} key={side} title={capitalize(side)}>
            <img src={portrait(player.character)} alt="" />
            <b>{side === 'cheer' ? '+1' : '−1'}</b>
          </span>
        ))}
      </div>
      <small>
        {tile ? `${capitalize(tile.side)} · Space ${tile.space}` : 'In hand · Both sides'}
      </small>
    </div>
  )
}

function Partnership({ game, selected }: { game: GameView; selected: number }) {
  const owner = game.players[selected]
  const partner = owner.partner === null ? null : game.players[owner.partner]
  // In a partnership, the physical card in front of a player is the OTHER person's card.
  const shown = partner ?? owner
  return (
    <div className="tray-object">
      <div className="tray-object-title">Partnership card</div>
      <div className={'tray-partner' + (partner ? ' paired' : '')}>
        <img src={portrait(shown.character)} alt="" />
        {partner && <Handshake size={18} aria-hidden="true" />}
        <b>{partner ? 'Partner' : 'Available'}</b>
      </div>
      {partner && <small>{partner.name}</small>}
    </div>
  )
}

function PyramidTicket({ count, supply }: { count: number; supply: number }) {
  return (
    <div className="tray-object">
      <div className="tray-object-title">Pyramid tickets</div>
      <div className={'tray-pyramid' + (count ? '' : ' unclaimed')}>
        <img src="/art/card-pyramid.webp" alt="" />
        <b>
          1 <small>EP</small>
        </b>
      </div>
      <small>
        {count} held · {supply} on table
      </small>
    </div>
  )
}

function FinishHand({ game, player, own }: { game: GameView; player: PlayerView; own: boolean }) {
  return (
    <section className="tray-section">
      <div className="tray-section-title">
        <h3>{own ? 'Your finish cards' : 'Finish cards'}</h3>
        <span>{player.handCount} in hand</span>
      </div>
      {own ? (
        <div className="tray-hand">
          {colorOrder.map((color) => {
            const committed = game.ownFinishBets.find((b) => b.color === color)
            return (
              <div className={'tray-face' + (committed ? ' committed' : '')} key={color}>
                <div className="tray-face-art">
                  <img src={`/art/card-${color}.webp`} alt="" />
                  <Emblem color={color} />
                </div>
                <b>{capitalize(color)}</b>
                {committed && <small>{capitalize(committed.pile)} pile</small>}
              </div>
            )
          })}
        </div>
      ) : (
        <div className="tray-other-hand" aria-label={`${player.handCount} face-down finish cards`}>
          {Array.from({ length: player.handCount }, (_, i) => (
            <CardBack key={i} character={player.character} />
          ))}
          {!player.handCount && <span className="tray-blank">All cards played</span>}
        </div>
      )}
    </section>
  )
}

function PublicPile({ game, pile }: { game: GameView; pile: Pile }) {
  const owners = game.finishOwners[pile]
  const revealed = game.phase === 'finished'
  const results = revealed ? game.finishResults.filter((card) => card.pile === pile) : []
  // Before scoring the most recently played character back is on top. Turning the
  // entire pile over exposes the earliest finish card first.
  const visible = owners.map((seat, index) => ({ seat, result: results[index] }))
  const cards = revealed ? visible.slice(0, 3).reverse() : visible.slice(-3)
  return (
    <div className="tray-pile">
      <div className="tray-pile-line">
        <div className="tray-pile-art" aria-hidden="true">
          {cards.map(({ seat, result }, index) => (
            <span key={index} style={{ '--layer': index } as CSSProperties}>
              {result ? (
                <img className="tray-pile-face" src={`/art/card-${result.color}.webp`} alt="" />
              ) : (
                <CardBack character={game.players[seat].character} />
              )}
            </span>
          ))}
        </div>
        <div>
          <b>Overall {pile}</b>
          <small>
            {owners.length
              ? `${owners.length} ${revealed ? 'revealed' : 'face down'}`
              : 'Empty pile'}
          </small>
        </div>
      </div>
      {owners.length > 0 && (
        <details>
          <summary>{revealed ? 'Scoring order' : 'Play order'}</summary>
          <ol>
            {visible.map(({ seat, result }, index) => (
              <li key={index}>
                <Portrait index={game.players[seat].character} size={20} />
                <span>{game.players[seat].name}</span>
                {result && (
                  <small>
                    {capitalize(result.color)} · {result.change > 0 ? '+' : ''}
                    {result.change} EP
                  </small>
                )}
              </li>
            ))}
          </ol>
        </details>
      )}
    </div>
  )
}

export function PlayerTray({
  game,
  initialSeat = game.seat,
}: {
  game: GameView
  initialSeat?: number
}) {
  const [seat, setSeat] = useState(() => (game.players[initialSeat] ? initialSeat : 0))
  const selected = game.players[seat] ? seat : 0
  const player = game.players[selected]
  const own = selected === game.seat
  const starter = game.players[game.starter]
  const lastMove = [...game.events]
    .reverse()
    .find(
      (e) =>
        e.seat === selected &&
        ['roll', 'ticket', 'finish', 'tile', 'partner', 'copy'].includes(e.kind),
    )
  return (
    <div className="player-tray">
      <div className="tray-seats" role="group" aria-label="Inspect a player’s pieces">
        {game.players.map((p, i) => (
          <button
            key={i}
            type="button"
            aria-pressed={selected === i}
            aria-label={`View ${p.name}’s pieces`}
            onClick={() => setSeat(i)}
          >
            <Portrait index={p.character} size={26} />
            <span>{p.name}</span>
            {i === game.starter && <Flag size={13} aria-label="Starting player" />}
          </button>
        ))}
      </div>
      <div className="tray-mat">
        <div className="tray-mat-head">
          <Portrait index={player.character} size={43} />
          <div>
            <h3>{player.name}</h3>
            <small>
              {own
                ? 'Your pieces'
                : player.difficulty
                  ? `${capitalize(player.difficulty)} bot`
                  : 'Player'}
              {game.phase !== 'finished' && selected === game.turn ? ' · Current turn' : ''}
            </small>
          </div>
          {selected === game.starter && (
            <span className="tray-starter">
              <span>
                <CamelLogo />
              </span>
              Leg starter
            </span>
          )}
        </div>
        {lastMove && (
          <p className="tray-last-move">
            <b>Last move</b> {lastMove.text}
          </p>
        )}
        <div className="tray-objects">
          <Purse player={player} />
          <Spectator player={player} tile={game.tiles.find((t) => t.owner === selected)} />
          <PyramidTicket count={player.pyramidTickets} supply={5 - game.rolls.length} />
          {game.players.length >= 6 && <Partnership game={game} selected={selected} />}
        </div>
        <section className="tray-section">
          <div className="tray-section-title">
            <h3>Leg tickets</h3>
            <span>{player.tickets.length} held</span>
          </div>
          {player.tickets.length ? (
            <div className="tray-tickets">
              {player.tickets.map((t, index) => (
                <div key={index} style={{ '--ticket': FINISH_COLORS[t.color] } as CSSProperties}>
                  <TicketIcon aria-hidden="true" size={16} />
                  <span>{capitalize(t.color)}</span>
                  <b>{t.value} EP</b>
                </div>
              ))}
            </div>
          ) : (
            <p className="tray-blank">No leg tickets held.</p>
          )}
        </section>
        <FinishHand game={game} player={player} own={own} />
      </div>
      <section className="tray-section tray-table">
        <div className="tray-section-title">
          <h3>Finish piles</h3>
          {selected !== game.starter && (
            <span>
              <Flag size={12} /> Leg starter · {starter.name}
            </span>
          )}
        </div>
        <div className="tray-piles">
          <PublicPile game={game} pile="winner" />
          <PublicPile game={game} pile="loser" />
        </div>
      </section>
    </div>
  )
}
