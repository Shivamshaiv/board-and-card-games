import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { CSSProperties, KeyboardEvent, PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import { Camera, ChevronDown, Focus, Layers, Minus, Orbit, Plus, RotateCcw } from 'lucide-react'
import { defaultBoardArt, illustratedBoardArt, paintNumberPlate } from './board-art'
import {
  BOARD_DEPTH,
  BOARD_WIDTH,
  FINISH_COLORS,
  MARKS,
  PROJECTED_SPACES,
  STRAIGHT_HALF,
  TRACK_RADIUS,
  boardLabel,
  currentLegDice,
  dieInk,
  capitalize,
  hudInsets,
  inscription,
  numberName,
  racePosition,
  rollSocket,
} from './layout'
import type { Anchor, BoardSpace, RaceBoardProps } from './layout'
import type { CameraPreset } from './viewpoints'
import { tileHit } from './picking'
import { getSetting, setSetting } from '../connection'
import './board.css'

export type { BoardSpace, BoardRoll, RaceBoardProps } from './layout'
const blankSpace = (n: number): BoardSpace => ({ number: n, camels: [] })
function BoardPortal({ host, children }: { host?: HTMLElement | null; children: ReactNode }) {
  return host ? createPortal(children, host) : children
}
const at = (x: number, y: number): CSSProperties => ({ left: x + '%', top: y + '%' })

function flatFit(width: number, height: number, immersive: boolean) {
  const { left, right, top, bottom } = hudInsets(width, height, immersive)
  const w = width - left - right,
    h = height - top - bottom
  let angle = 0
  let worldWidth = BOARD_WIDTH + 0.45,
    worldHeight = BOARD_DEPTH + 0.4
  if (width < 600) {
    // Fit a stadium, not its rectangular cabinet. A diagonal course makes use of both
    // dimensions on a square phone viewport; the expanded version turns lengthwise.
    const diameter = (TRACK_RADIUS + 1.025) * 2,
      straight = STRAIGHT_HALF * 2,
      ratio = w / h
    let low = 0,
      high = Math.PI / 2
    for (let i = 0; i < 13; i++) {
      const t = (low + high) / 2
      if ((diameter + straight * Math.cos(t)) / (diameter + straight * Math.sin(t)) > ratio) low = t
      else high = t
    }
    angle = (low + high) / 2
    worldWidth = (diameter + straight * Math.cos(angle)) / 0.95
    worldHeight = (diameter + straight * Math.sin(angle)) / 0.93
  }
  return {
    angle,
    scale: Math.min(w / worldWidth, h / worldHeight),
    cx: left + w / 2,
    cy: top + h / 2,
  }
}
function flatAnchors(width: number, height: number, immersive: boolean) {
  const { scale, cx, cy, angle } = flatFit(width, height, immersive)
  function project(x: number, z: number) {
    const u = x * Math.cos(angle) - z * Math.sin(angle),
      v = x * Math.sin(angle) + z * Math.cos(angle)
    return { x: ((cx + u * scale) / width) * 100, y: ((cy + v * scale) / height) * 100 }
  }
  const positions = PROJECTED_SPACES.map((n) => {
    const p = racePosition(n),
      q = inscription(n),
      l = project(q.x, q.z)
    return { ...project(p.x, p.z), labelX: l.x, labelY: l.y, tileHit: tileHit(n, project) }
  })
  const pyramid = project(-0.45, 0.05)
  const size = flatDieSize(scale)
  const tray = Array.from({ length: 5 }, (_, i) => {
    const pos = rollSocket(i, size + 0.08),
      p = project(pos.x, pos.z)
    return { ...p, labelX: p.x, labelY: p.y, dieSize: scale * size, dieRotation: angle }
  })
  return [...positions, { ...pyramid, labelX: pyramid.x, labelY: pyramid.y }, ...tray]
}
const flatDieSize = (scale: number) => Math.min(0.72, Math.max(0.38, 14 / scale))

function flatPaint(canvas: HTMLCanvasElement, art: HTMLCanvasElement, immersive: boolean) {
  const w = canvas.clientWidth,
    h = canvas.clientHeight
  if (!w || !h) return
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.65)
  canvas.width = Math.round(w * pixelRatio)
  canvas.height = Math.round(h * pixelRatio)
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.scale(pixelRatio, pixelRatio)
  const { scale, cx: originX, cy: originY, angle } = flatFit(w, h, immersive)
  ctx.translate(originX, originY)
  ctx.scale(scale, scale)
  ctx.rotate(angle)
  ctx.shadowColor = 'rgba(18,14,8,.40)'
  ctx.shadowBlur = scale * 0.19
  ctx.shadowOffsetY = scale * 0.1
  ctx.drawImage(art, -BOARD_WIDTH / 2, -BOARD_DEPTH / 2, BOARD_WIDTH, BOARD_DEPTH)
  ctx.shadowBlur = 0
  ctx.shadowOffsetY = 0
  ctx.fillStyle = '#785a35'
  ctx.beginPath()
  const dieSize = flatDieSize(scale),
    spacing = dieSize + 0.08,
    first = rollSocket(0),
    margin = dieSize / 2 + 0.055
  ctx.roundRect(first.x - margin, first.z - margin, 4 * spacing + 2 * margin, 2 * margin, 0.07)
  ctx.fill()
  for (let i = 0; i < 5; i++) {
    const socket = rollSocket(i, spacing)
    ctx.beginPath()
    ctx.arc(socket.x, socket.z, dieSize * 0.51, 0, Math.PI * 2)
    ctx.fillStyle = '#294337'
    ctx.fill()
    ctx.strokeStyle = '#c4a06b'
    ctx.lineWidth = 0.022
    ctx.stroke()
  }
  if (w > 510)
    for (let n = 1; n <= 16; n++) {
      const p = inscription(n)
      paintNumberPlate(ctx, n, p.x, p.z)
    }
  const cx = -0.45,
    cz = 0.05
  // Engraved plan view of the pyramid for the flat board.
  const corners = [
    [-0.92, -0.92],
    [0.92, -0.92],
    [0.92, 0.92],
    [-0.92, 0.92],
  ]
  const faces = ['#d9b678', '#ba945d', '#d0a36b', '#f0d496']
  for (let i = 0; i < 4; i++) {
    const a = corners[i],
      b = corners[(i + 1) % 4]
    ctx.fillStyle = faces[i]
    ctx.beginPath()
    ctx.moveTo(cx, cz)
    ctx.lineTo(cx + a[0], cz + a[1])
    ctx.lineTo(cx + b[0], cz + b[1])
    ctx.closePath()
    ctx.fill()
    for (const r of [0.3, 0.56, 0.8]) {
      ctx.strokeStyle = 'rgba(84,58,34,.32)'
      ctx.lineWidth = 0.019
      ctx.beginPath()
      ctx.moveTo(cx + a[0] * r, cz + a[1] * r)
      ctx.lineTo(cx + b[0] * r, cz + b[1] * r)
      ctx.stroke()
    }
  }
}

function CamelChip({ color }: { color: string }) {
  return (
    <span
      aria-hidden="true"
      className={'cu-piece-chip cu-chip-' + color}
      style={{ '--cu-piece': FINISH_COLORS[color] } as CSSProperties}
    >
      {MARKS[color] || '•'}
    </span>
  )
}

export function RaceBoard(props: RaceBoardProps) {
  const spaceId = useId()
  const {
    spaces,
    view = '3d',
    presentation = 'table',
    selectableSpaces,
    selectedSpace,
    onSelectSpace,
  } = props
  const showcase = presentation === 'showcase'
  const container = useRef<HTMLDivElement>(null),
    surface = useRef<HTMLDivElement>(null),
    flatCanvas = useRef<HTMLCanvasElement>(null)
  const api = useRef<ReturnType<(typeof import('./scene'))['mountRaceScene']> | null>(null)
  const latest = useRef(props)
  const [anchors, setAnchors] = useState<Anchor[]>([]),
    [threeAnchors, setThreeAnchors] = useState<Anchor[]>([])
  const [ready, setReady] = useState(false),
    [lost, setLost] = useState(false),
    [inspected, setInspected] = useState<number | null>(null)
  const [focused, setFocused] = useState(1)
  const [cameraOpen, setCameraOpen] = useState(false),
    [orbiting, setOrbiting] = useState(false),
    [preset, setPreset] = useState<CameraPreset>('table')
  const [followName, setFollowName] = useState('')
  const [autoRollCamera, setAutoRollCamera] = useState(() => getSetting('roll-camera') !== 'off')
  const effectiveCamera = props.autoRollCamera ?? autoRollCamera
  const lastAcknowledged = useRef<string | number | undefined>(undefined)
  const endCallback = useRef(props.onRollAnimationEnd)
  endCallback.current = props.onRollAnimationEnd
  function acknowledge(id: string | number) {
    if (lastAcknowledged.current === id) return
    lastAcknowledged.current = id
    endCallback.current?.(id)
  }
  const runtimeProps = { ...props, autoRollCamera: effectiveCamera, onRollAnimationEnd: acknowledge }
  latest.current = runtimeProps
  const previousRoll = useRef(props.lastRoll?.id)
  const gesture = useRef<{ id: number; x: number; y: number; distance: number } | null>(null)
  const lastDrag = useRef(0)
  const closeRef = useRef<HTMLButtonElement>(null)
  const buttons = useRef(new Map<number, HTMLButtonElement>())
  const flat = view === '2d' || !ready || lost
  const points = flat ? anchors : threeAnchors
  useEffect(() => {
    latest.current.on3DReady?.(ready && !lost)
  }, [ready, lost])
  useLayoutEffect(() => {
    const box = container.current,
      node = flatCanvas.current
    if (!box || !node || showcase) return
    let live = true,
      art = defaultBoardArt()
    function draw() {
      if (!live || !box || !node || !box.clientWidth || !box.clientHeight) return
      setAnchors(flatAnchors(box.clientWidth, box.clientHeight, !!props.immersiveHud))
      flatPaint(node, art, !!props.immersiveHud)
    }
    const ro = new ResizeObserver(draw)
    ro.observe(box)
    draw()
    void illustratedBoardArt().then((img) => {
      if (live) {
        art = img
        draw()
      }
    })
    return () => {
      live = false
      ro.disconnect()
    }
  }, [showcase, props.immersiveHud])
  useEffect(() => {
    const node = surface.current
    setReady(false)
    if (!node || view === '2d') {
      setLost(false)
      return
    }
    let live = true
    void import('./scene')
      .then(({ mountRaceScene }) => {
        if (!live) return
        try {
          api.current = mountRaceScene(
            node,
            latest.current,
            setThreeAnchors,
            () => {
              if (!live) return
              setLost(true)
              setReady(false)
              api.current?.dispose()
              api.current = null
            },
            () => {
              if (live) {
                setLost(false)
                setReady(true)
              }
            },
          )
        } catch {
          if (live) {
            setLost(true)
            setReady(false)
          }
        }
      })
      .catch(() => {
        if (live) setLost(true)
      })
    return () => {
      live = false
      api.current?.dispose()
      api.current = null
    }
  }, [view, showcase, props.immersiveHud])
  useEffect(() => {
    api.current?.update(latest.current)
    const id = props.lastRoll?.id
    const active =
      props.activeRollId !== undefined ? props.activeRollId === id : id !== previousRoll.current
    if (id !== undefined && active && !api.current && (view === '2d' || lost || props.reducedMotion))
      acknowledge(id)
    previousRoll.current = id
  }, [props, effectiveCamera, view, lost])
  useEffect(() => {
    if (selectableSpaces?.length && preset === 'follow') {
      setPreset('table')
      setFollowName('')
      setOrbiting(false)
      api.current?.preset('table')
    }
  }, [selectableSpaces?.length, preset])
  useEffect(() => {
    if (inspected !== null) {
      closeRef.current?.focus({ preventScroll: true })
      props.inspectorHost?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    }
  }, [inspected, props.inspectorHost])
  const byNumber = new Map(spaces.map((s) => [s.number, s]))
  function inspectSpace(n: number): BoardSpace {
    return byNumber.get(n) ?? blankSpace(n)
  }
  function choose(n: number) {
    if (performance.now() - lastDrag.current < 240) return
    setFocused(n)
    if (selectableSpaces?.includes(n) && onSelectSpace) {
      setInspected(null)
      onSelectSpace(n)
    } else setInspected(n)
  }
  function close() {
    const n = inspected
    setInspected(null)
    if (n !== null) buttons.current.get(n)?.focus({ preventScroll: true })
  }
  function onKey(e: KeyboardEvent<HTMLButtonElement>, n: number) {
    const d = ({ ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 } as Record<string, number>)[
      e.key
    ]
    let next: number | undefined
    if (d) next = ((n - 1 + d + 16) % 16) + 1
    else if (e.key === 'Home') next = 1
    else if (e.key === 'End') next = 16
    if (next !== undefined) {
      e.preventDefault()
      setFocused(next)
      buttons.current.get(next)?.focus({ preventScroll: true })
    }
  }
  const detail = inspected === null ? null : inspectSpace(inspected)
  function changeCamera(value: CameraPreset, camel?: string) {
    setPreset(value)
    setFollowName(value === 'follow' ? (camel ? capitalize(camel) : 'leader') : '')
    setOrbiting(false)
    setCameraOpen(false)
    api.current?.preset(value, camel)
  }
  function pointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (flat || e.button !== 0 || (!showcase && !orbiting && e.pointerType !== 'mouse')) return
    const target = e.target as HTMLElement
    if (target.closest('.cu-camera-bar,.cu-stack-inspector')) return
    if (!orbiting && target.closest('.cu-space-hit,.cu-mobile-number,.cu-piece-pick,.cu-pyramid-pick'))
      return
    gesture.current = { id: e.pointerId, x: e.clientX, y: e.clientY, distance: 0 }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  function pointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const g = gesture.current
    if (!g || g.id !== e.pointerId) return
    const dx = e.clientX - g.x,
      dy = e.clientY - g.y
    g.distance += Math.abs(dx) + Math.abs(dy)
    g.x = e.clientX
    g.y = e.clientY
    if (g.distance > 4) api.current?.orbit(dx, dy)
  }
  function pointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    const g = gesture.current
    if (!g || g.id !== e.pointerId) return
    if (g.distance > 4) lastDrag.current = performance.now()
    gesture.current = null
    if (e.currentTarget.hasPointerCapture(e.pointerId))
      e.currentTarget.releasePointerCapture(e.pointerId)
  }
  return (
    <div
      className={
        'cu-raceboard' +
        (showcase ? ' cu-showcase' : '') +
        (props.immersiveHud ? ' cu-hud' : '') +
        (flat ? ' cu-flat-board' : '') +
        (orbiting ? ' cu-orbiting' : '') +
        (selectableSpaces?.length ? ' cu-placement' : '')
      }
      ref={container}
      role={showcase ? 'img' : 'group'}
      aria-label={
        showcase
          ? 'Carved camels racing in an Egyptian courtyard'
          : 'Racecourse. Use arrow keys to inspect the 16 spaces.'
      }
      onPointerDown={pointerDown}
      onPointerMove={pointerMove}
      onPointerUp={pointerUp}
      onPointerCancel={pointerUp}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          if (inspected !== null) {
            e.stopPropagation()
            close()
          } else {
            setCameraOpen(false)
            setOrbiting(false)
          }
        }
      }}
    >
      {!showcase && (
        <canvas
          className="cu-flat-surface"
          ref={flatCanvas}
          aria-hidden="true"
          style={{ visibility: flat ? 'visible' : 'hidden' }}
        />
      )}
      <div
        className="cu-three-surface"
        ref={surface}
        style={{ visibility: flat ? 'hidden' : 'visible' }}
      />
      {!showcase && !flat && (
        <BoardPortal host={props.cameraToolbar}>
          <div className={'cu-camera-bar' + (props.cameraToolbar ? ' cu-camera-docked' : '')}>
            <button
              type="button"
              className="cu-camera-trigger"
              aria-expanded={cameraOpen}
              onClick={() => setCameraOpen(!cameraOpen)}
            >
              <Camera size={16} />
              <span>Camera</span>
              <ChevronDown size={13} />
            </button>
            {preset === 'follow' && !cameraOpen && (
              <button
                className="cu-camera-trigger"
                type="button"
                onClick={() => changeCamera('table')}
                title={'Following ' + followName + '. Return to the whole board.'}
              >
                <RotateCcw size={13} />
                Grandstand
              </button>
            )}
            {orbiting && !cameraOpen && (
              <button className="cu-camera-trigger" type="button" onClick={() => setOrbiting(false)}>
                Finish orbit
              </button>
            )}
            {cameraOpen && (
              <div className="cu-camera-menu" role="group" aria-label="Camera controls">
                <button
                  type="button"
                  role="switch"
                  aria-checked={effectiveCamera}
                  disabled={props.autoRollCamera !== undefined}
                  onClick={() => {
                    const next = !effectiveCamera
                    setAutoRollCamera(next)
                    setSetting('roll-camera', next ? 'on' : 'off')
                  }}
                >
                  <Focus size={14} />
                  Follow each roll{' '}
                  <span className="cu-camera-switch">{effectiveCamera ? 'On' : 'Off'}</span>
                </button>
                {(
                  [
                    ['table', 'Grandstand'],
                    ['trackside', 'Trackside'],
                    ['overhead', 'Overhead'],
                    ['follow', 'Follow leader'],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    disabled={key === 'follow' && !!selectableSpaces?.length}
                    aria-pressed={!orbiting && preset === key}
                    onClick={() => changeCamera(key)}
                  >
                    {label}
                  </button>
                ))}
                <button
                  aria-pressed={orbiting}
                  type="button"
                  onClick={() => {
                    setOrbiting(!orbiting)
                    setCameraOpen(false)
                  }}
                >
                  <Orbit size={15} />
                  Drag to orbit
                </button>
                <div>
                  <button
                    type="button"
                    onClick={() => api.current?.zoom(1 / 1.12)}
                    aria-label="Zoom out"
                  >
                    <Minus size={15} />
                  </button>
                  <button type="button" onClick={() => changeCamera('table')} aria-label="Reset camera">
                    <RotateCcw size={15} />
                  </button>
                  <button type="button" onClick={() => api.current?.zoom(1.12)} aria-label="Zoom in">
                    <Plus size={15} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </BoardPortal>
      )}
      {!showcase && props.onPyramidRoll && points[PROJECTED_SPACES.length] && (
        <button
          type="button"
          className="cu-pyramid-pick"
          style={at(points[PROJECTED_SPACES.length].x, points[PROJECTED_SPACES.length].y)}
          onClick={props.onPyramidRoll}
          aria-label="Shake the dice pyramid"
          title="Shake the dice pyramid"
        />
      )}
      {!showcase &&
        points.slice(0, PROJECTED_SPACES.length).map((point, i) => {
          const n = PROJECTED_SPACES[i],
            space = inspectSpace(n),
            legal = !!selectableSpaces?.includes(n),
            crossed = n === 0 || n === 17
          if (crossed && !space.camels.length) return null
          const cell = point.tileHit,
            figure = !flat ? point.figure : undefined
          return (
            <div className="cu-board-space-layer" key={n}>
              {!crossed && (
                <label
                  htmlFor={spaceId + '-' + n}
                  className={'cu-mobile-number' + (point.raisedNumber ? ' cu-raised-number' : '')}
                  aria-hidden="true"
                  style={at(point.labelX, point.labelY)}
                >
                  {n}
                </label>
              )}
              {flat && space.tile && (
                <span
                  aria-hidden="true"
                  style={at(point.x, point.y)}
                  className={'cu-tile-chip cu-' + space.tile.side}
                >
                  {space.tile.side === 'cheer' ? '+1' : '−1'}
                </span>
              )}
              {flat && space.camels.length > 0 && (
                <div className="cu-flat-stack" aria-hidden="true" style={at(point.x, point.y)}>
                  {space.camels.slice(-3).map((c) => (
                    <CamelChip key={c} color={c} />
                  ))}
                  {space.camels.length > 3 && <b>×{space.camels.length}</b>}
                </div>
              )}
              <button
                id={spaceId + '-' + n}
                ref={(el) => {
                  if (el) buttons.current.set(n, el)
                  else buttons.current.delete(n)
                }}
                type="button"
                tabIndex={focused === n || crossed ? 0 : -1}
                onFocus={() => {
                  if (!crossed) setFocused(n)
                }}
                aria-label={
                  boardLabel(space) +
                  (legal
                    ? ', available for spectator tile'
                    : props.placementReasons?.[n]
                      ? '. Unavailable. ' + props.placementReasons[n]
                      : '')
                }
                aria-haspopup={legal ? undefined : 'dialog'}
                aria-pressed={legal ? selectedSpace === n : undefined}
                data-hint-target={(legal && selectedSpace === n) || undefined}
                style={
                  cell
                    ? {
                        left: cell.left + '%',
                        top: cell.top + '%',
                        width: cell.width + '%',
                        height: cell.height + '%',
                        transform: 'none',
                        zIndex: figure?.order ?? 2,
                      }
                    : at(point.x, point.y)
                }
                className={
                  'cu-space-hit' +
                  (cell ? ' cu-projected-tile' : '') +
                  (legal ? ' cu-space-legal' : '') +
                  (selectedSpace === n ? ' cu-space-selected' : '')
                }
                onClick={(e) => {
                  const pointer =
                    e.detail > 0 &&
                    e.target instanceof Element &&
                    e.target.matches('.cu-figure-zone,.cu-tile-zone')
                  choose(pointer && !flat ? (api.current?.pickSpace(e.clientX, e.clientY) ?? n) : n)
                }}
                onKeyDown={(e) => onKey(e, n)}
              >
                {cell && (
                  <i aria-hidden="true" className="cu-tile-zone" style={{ clipPath: cell.polygon }} />
                )}
                {cell && figure && (
                  <i
                    aria-hidden="true"
                    className="cu-figure-zone"
                    style={{
                      left: ((figure.left - cell.left) / cell.width) * 100 + '%',
                      top: ((figure.top - cell.top) / cell.height) * 100 + '%',
                      width: (figure.width / cell.width) * 100 + '%',
                      height: (figure.height / cell.height) * 100 + '%',
                      clipPath: figure.polygon,
                    }}
                  />
                )}
                {cell && figure && space.camels.length >= 4 && (
                  <span
                    className="cu-stack-count"
                    aria-hidden="true"
                    style={{
                      left:
                        (100 * (Math.min(94, figure.left + figure.width + 2.8) - cell.left)) /
                          cell.width +
                        '%',
                      top:
                        (100 *
                          (Math.max(7, figure.top + Math.min(3.5, figure.height * 0.23)) - cell.top)) /
                          cell.height +
                        '%',
                    }}
                  >
                    <Layers size={11} />
                    {space.camels.length}
                  </span>
                )}
                {legal && (
                  <span
                    className={'cu-placement-ring' + (selectedSpace === n ? ' recommended' : '')}
                    aria-hidden="true"
                  />
                )}
              </button>
            </div>
          )
        })}
      {!showcase &&
        flat &&
        currentLegDice(props.rolledDice, props.lastRoll).map((face, i) => {
          const p = points[PROJECTED_SPACES.length + 1 + i]
          if (!p) return null
          const ink = dieInk(face),
            angle = p.dieRotation ?? 0
          return (
            <span
              key={face.die}
              className="cu-flat-die"
              role="img"
              data-die={face.die}
              data-ink={ink}
              data-value={face.value}
              aria-label={
                capitalize(face.die) +
                ' die showing ' +
                face.value +
                (face.die === 'grey' ? ' in ' + ink : '')
              }
              style={{
                ...at(p.x, p.y),
                width: p.dieSize,
                height: p.dieSize,
                fontSize: (p.dieSize ?? 14) * 0.78,
                transform: `translate(-50%,-50%) rotate(${angle}rad)`,
                background: FINISH_COLORS[face.die],
                color: ink === 'black' ? '#211e1a' : '#fff4db',
              }}
            >
              <b aria-hidden="true" style={{ transform: `rotate(${-angle}rad)` }}>
                {face.value}
              </b>
            </span>
          )
        })}
      {!showcase && lost && view === '3d' && (
        <span className="cu-board-mode-status" role="status">
          Flat board · 3D unavailable
        </span>
      )}
      {detail && (
        <BoardPortal host={props.inspectorHost}>
          <div
            className={'cu-stack-inspector' + (props.inspectorHost ? ' cu-inspector-docked' : '')}
            role="dialog"
            aria-label={'Inspect ' + numberName(detail.number)}
          >
            <header>
              <strong>{numberName(detail.number)}</strong>
              <button ref={closeRef} onClick={close} type="button" aria-label="Close space details">
                ×
              </button>
            </header>
            {props.placementReasons?.[detail.number] && (
              <p className="cu-placement-reason">{props.placementReasons[detail.number]}</p>
            )}
            {detail.camels.length > 0 ? (
              <>
                <small>
                  {detail.camels.length === 1
                    ? '1 camel'
                    : detail.camels.length + ' camels · Top to bottom'}
                </small>
                <ol>
                  {[...detail.camels].reverse().map((c) => (
                    <li key={c}>
                      <CamelChip color={c} />
                      {capitalize(c)}
                      {!flat && !selectableSpaces?.length && (
                        <button
                          type="button"
                          aria-label={'Follow ' + capitalize(c) + ' camel'}
                          title={'Follow ' + capitalize(c)}
                          onClick={() => {
                            setInspected(null)
                            changeCamera('follow', c)
                          }}
                        >
                          <Focus size={16} />
                        </button>
                      )}
                    </li>
                  ))}
                </ol>
              </>
            ) : (
              !props.placementReasons?.[detail.number] && <p>No camels here.</p>
            )}
            {detail.tile && (
              <p>
                {detail.tile.owner} · {detail.tile.side === 'cheer' ? 'Cheering (+1)' : 'Booing (−1)'}
              </p>
            )}
          </div>
        </BoardPortal>
      )}
    </div>
  )
}
export default RaceBoard
