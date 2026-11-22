import * as T from 'three'
import { createCardAtlas } from './atlas'
import { FACE, PAPER_EDGE, type Slot, type SlotCards, type Transfer } from './model'
import type { Color } from '../engine'

interface Anchor {
  x: number
  y: number
  width: number
  height: number
}
interface Pose {
  x: number
  y: number
  z: number
  width: number
  height: number
  thick: number
  rx: number
  ry: number
  rz: number
}
function cardSolid(ticket: boolean) {
  const ring: T.Vector2[] = []
  const r = ticket ? 0.045 : 0.072
  for (let corner = 0; corner < 4; corner++) {
    const cx = (corner < 2 ? 1 : -1) * (0.5 - r),
      cy = (corner === 1 || corner === 2 ? 1 : -1) * (0.5 - r)
    for (let i = 0; i <= 3; i++) {
      const a = ((corner - 1 + i / 3) * Math.PI) / 2
      ring.push(new T.Vector2(cx + Math.cos(a) * r, cy + Math.sin(a) * r))
    }
    if (ticket && (corner === 0 || corner === 2)) {
      const side = corner === 0 ? 1 : -1
      for (let k = 0; k <= 6; k++) {
        const a = (k * Math.PI) / 6
        ring.push(new T.Vector2(side * (0.5 - 0.032 * Math.sin(a)), side * (-0.048 * Math.cos(a))))
      }
    }
  }
  const pos: number[] = [],
    norm: number[] = [],
    uv: number[] = [],
    kinds: number[] = []
  const add = (
    x: number,
    y: number,
    z: number,
    n: T.Vector3,
    f: number,
    u = x + 0.5,
    v = y + 0.5,
  ) => {
    pos.push(x, y, z)
    norm.push(n.x, n.y, n.z)
    uv.push(u, v)
    kinds.push(f)
  }
  const up = new T.Vector3(0, 0, 1),
    down = new T.Vector3(0, 0, -1)
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i],
      b = ring[(i + 1) % ring.length],
      edge = new T.Vector3(b.y - a.y, a.x - b.x, 0).normalize()
    add(0, 0, 0.5, up, 1)
    add(a.x, a.y, 0.5, up, 1)
    add(b.x, b.y, 0.5, up, 1)
    add(0, 0, -0.5, down, -1)
    add(b.x, b.y, -0.5, down, -1, 0.5 - b.x, b.y + 0.5)
    add(a.x, a.y, -0.5, down, -1, 0.5 - a.x, a.y + 0.5)
    add(a.x, a.y, -0.5, edge, 0, 0, 0)
    add(b.x, b.y, -0.5, edge, 0, 1, 0)
    add(a.x, a.y, 0.5, edge, 0, 0, 1)
    add(a.x, a.y, 0.5, edge, 0, 0, 1)
    add(b.x, b.y, -0.5, edge, 0, 1, 0)
    add(b.x, b.y, 0.5, edge, 0, 1, 1)
  }
  const geo = new T.BufferGeometry()
  geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3))
  geo.setAttribute('normal', new T.Float32BufferAttribute(norm, 3))
  geo.setAttribute('uv', new T.Float32BufferAttribute(uv, 2))
  geo.setAttribute('faceKind', new T.Float32BufferAttribute(kinds, 1))
  geo.setAttribute(
    'cardTiles',
    new T.InstancedBufferAttribute(new Float32Array(64 * 2), 2).setUsage(T.DynamicDrawUsage),
  )
  return geo
}

export function openCardShelf(
  host: HTMLElement,
  stage: HTMLElement,
  visible: () => void,
  lost: () => void,
) {
  const renderer = new T.WebGLRenderer({
    alpha: true,
    antialias: true,
    powerPreference: 'low-power',
    stencil: false,
  })
  renderer.setClearColor(0x000000, 0)
  renderer.outputColorSpace = T.SRGBColorSpace
  renderer.setPixelRatio(Math.min(1.45, devicePixelRatio || 1))
  renderer.domElement.setAttribute('aria-hidden', 'true')
  host.append(renderer.domElement)
  const scene = new T.Scene(),
    camera = new T.PerspectiveCamera(35, 1, 1, 3000)
  const sun = new T.DirectionalLight(0xffeed0, 1.5)
  sun.position.set(-80, 110, 200)
  scene.add(sun)
  scene.add(new T.HemisphereLight(0xfff5e1, 0xa48d62, 1.72))
  let frame = 0,
    dead = false,
    width = 0,
    height = 0,
    drawn = false
  let anchorChange = true,
    staticTickets = 0,
    staticCards = 0
  let slots: SlotCards[] = [],
    selected: Color | null = null
  const anchors = new Map<Slot, Anchor>()
  let active: { move: Transfer; since: number; prior?: SlotCards } | null = null
  const pending: Transfer[] = []
  const atlas = createCardAtlas(invalidate)
  const material = new T.MeshStandardMaterial({
    map: atlas.texture,
    roughness: 0.88,
    metalness: 0,
    side: T.FrontSide,
  })
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nattribute float faceKind;attribute vec2 cardTiles;',
      )
      .replace(
        '#include <uv_vertex>',
        `#include <uv_vertex>
       float cardCell=faceKind>.5?cardTiles.x:faceKind<-.5?cardTiles.y:${PAPER_EDGE}.;
       vec2 cardUv=clamp(vMapUv,vec2(.014),vec2(.986));
       vMapUv=(vec2(mod(cardCell,6.),5.-floor(cardCell/6.))+cardUv)/6.;`,
      )
  }
  material.customProgramCacheKey = () => 'ticket-table-atlas-v1'
  const bucket = (ticket: boolean) => {
    const mesh = new T.InstancedMesh(cardSolid(ticket), material, 64)
    mesh.frustumCulled = false
    mesh.count = 0
    mesh.instanceMatrix.setUsage(T.DynamicDrawUsage)
    scene.add(mesh)
    return mesh
  }
  const tickets = bucket(true),
    cards = bucket(false),
    body = new T.Object3D()
  const rackGeo = new T.BoxGeometry(1, 1, 1),
    rackColor: number[] = []
  for (let i = 0; i < rackGeo.getAttribute('position').count; i++) {
    const face = Math.floor(i / 4),
      tone = new T.Color(['#a47a42', '#90683a', '#e0c389', '#614229', '#bc945b', '#725033'][face])
    rackColor.push(tone.r, tone.g, tone.b)
  }
  rackGeo.setAttribute('color', new T.Float32BufferAttribute(rackColor, 3))
  const rackMat = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.67 })
  const rack = new T.Mesh(rackGeo, rackMat)
  scene.add(rack)
  function put(shape: 'card' | 'ticket', p: Pose, front: number, back: number) {
    const mesh = shape === 'ticket' ? tickets : cards,
      i = mesh.count++
    const align = 1 - p.z / camera.position.z
    body.position.set(p.x * align, p.y * align, p.z)
    body.rotation.set(p.rx, p.ry, p.rz, 'ZYX')
    body.scale.set(p.width, p.height, p.thick)
    body.updateMatrix()
    mesh.setMatrixAt(i, body.matrix)
    mesh.geometry.getAttribute('cardTiles').setXY(i, front, back)
  }
  function rectFor(slot: Slot): Anchor {
    const a = anchors.get(slot)
    if (a) return a
    const bench = anchors.get('my-bench') ?? { x: width * 0.79, y: 12, width: 30, height: 19 }
    if (slot === 'other-bench') return { ...bench, x: width - 17, y: 7 }
    const right = slot.startsWith('pile') || slot.startsWith('hand')
    return { x: right ? width - 8 : 8, y: Math.max(45, height * 0.42), width: 35, height: 31 }
  }
  function placement(slot: Slot, shape: 'card' | 'ticket'): Pose {
    const a = rectFor(slot),
      hand = slot.startsWith('hand-'),
      bank = slot.startsWith('market-'),
      sm = a.height < 37
    const ratio = shape === 'card' ? 0.78 : 1.24
    const h = Math.min(a.height / (hand ? 0.91 : 0.88), (a.width * (sm ? 0.93 : 0.95)) / ratio),
      w = h * ratio
    const index = hand ? FACE(slot.slice(5) as Color) : 0
    return {
      x: a.x - width / 2,
      y: height / 2 - a.y + (hand && selected === slot.slice(5) ? 3 : 0),
      z: hand ? 5 : 1,
      width: w,
      height: h,
      thick: sm ? 0.9 : 1.45,
      rx: hand ? -0.16 : bank ? -0.5 : -0.38,
      ry: 0,
      rz: hand ? (2 - index) * 0.068 : 0,
    }
  }
  function staticCard(s: SlotCards) {
    if (!s.count || !anchors.has(s.slot)) return
    const p = placement(s.slot, s.shape),
      layers = Math.min(s.count, s.slot.startsWith('market-') ? 4 : 5),
      small = p.height < 35
    // Frontmost card first lets the GPU depth-reject the layers of paper it covers.
    for (let i = layers - 1; i >= 0; i--) {
      const d = i * (small ? 0.5 : 1.15),
        top = i === layers - 1
      const pose = {
        ...p,
        x: p.x - d * 0.56,
        y: p.y + d * 0.76,
        z: p.z + d * 0.94,
        rz: p.rz + (s.slot.startsWith('pile-') ? Math.sin(i * 2.83) * 0.037 : 0),
      }
      put(s.shape, pose, s.layers?.[i] ?? (top ? s.front : s.faceDown ? s.back : s.front), s.back)
    }
  }
  function flight(move: Transfer, t: number) {
    const a = placement(move.from, move.shape),
      b = placement(move.to, move.shape)
    const f = t * t * (3 - 2 * t),
      wave = Math.sin(Math.PI * t),
      mix = (x: number, y: number) => x + (y - x) * f
    const goingOut = move.to === 'other-bench',
      incoming = move.from === 'other-bench'
    const pose: Pose = {
      x: mix(a.x, b.x),
      y: mix(a.y, b.y) + wave * Math.min(34, height * 0.19),
      z: 16 + wave * 24,
      width: mix(a.width, b.width) * (1 + wave * 0.12),
      height: mix(a.height, b.height) * (1 + wave * 0.12),
      thick: 1.7,
      rx: mix(a.rx, b.rx) + wave * 0.2,
      ry: move.kind === 'finish' && !move.faceDown ? Math.PI * f : wave * (goingOut ? -0.18 : 0.15),
      rz: mix(a.rz, b.rz) + wave * (incoming ? -0.12 : 0.09),
    }
    put(move.shape, pose, move.front, move.back)
  }
  function invalidate() {
    if (!dead && !frame) frame = requestAnimationFrame(draw)
  }
  function draw(now: number) {
    frame = 0
    if (dead || !stage.isConnected) return
    if (active && now - active.since >= 490) {
      const next = pending.shift()
      active = next ? { move: next, since: now } : null
      anchorChange = true
    }
    const rebuild = anchorChange
    if (rebuild) {
      tickets.count = cards.count = 0
      for (const s of slots) {
        if (active?.prior && active.move.to === s.slot) staticCard(active.prior)
        else staticCard(s)
      }
      staticTickets = tickets.count
      staticCards = cards.count
      anchorChange = false
      for (const mesh of [tickets, cards]) {
        mesh.instanceMatrix.clearUpdateRanges()
        mesh.instanceMatrix.needsUpdate = true
        const faces = mesh.geometry.getAttribute('cardTiles') as T.InstancedBufferAttribute
        faces.clearUpdateRanges()
        faces.needsUpdate = true
      }
    } else {
      tickets.count = staticTickets
      cards.count = staticCards
    }
    if (active) {
      const mesh = active.move.shape === 'ticket' ? tickets : cards,
        flightIndex = mesh.count
      flight(active.move, Math.min(1, (now - active.since) / 490))
      if (!rebuild) {
        // The flight is the last instance in its already-resident deck batch.
        mesh.instanceMatrix.addUpdateRange(flightIndex * 16, 16)
        mesh.instanceMatrix.needsUpdate = true
        const faces = mesh.geometry.getAttribute('cardTiles') as T.InstancedBufferAttribute
        faces.addUpdateRange(flightIndex * 2, 2)
        faces.needsUpdate = true
      }
    }
    renderer.render(scene, camera)
    if (!drawn) {
      drawn = true
      visible()
    }
    if (active) invalidate()
  }
  function measure() {
    if (dead) return
    const base = stage.getBoundingClientRect()
    if (!base.width || !base.height) return
    if (width !== base.width || height !== base.height) {
      width = base.width
      height = base.height
      // A longer lens keeps the end decks aligned with their labels on wide, shallow shelves.
      const lens = Math.max(width * 0.96, height * 2.35)
      camera.aspect = width / height
      camera.position.z = lens
      camera.fov = (2 * Math.atan(height / (2 * lens)) * 180) / Math.PI
      camera.updateProjectionMatrix()
      // Three resets the drawing buffer even if setSize receives the same dimensions.
      renderer.setSize(width, height, false)
    }
    anchorChange = true
    anchors.clear()
    for (const item of stage.querySelectorAll<HTMLElement>('[data-card-slot]')) {
      const r = item.getBoundingClientRect()
      if (r.width && r.height)
        anchors.set(item.dataset.cardSlot as Slot, {
          x: r.left - base.left + r.width / 2,
          y: r.top - base.top + r.height / 2,
          width: r.width,
          height: r.height,
        })
    }
    const hand = [...anchors].filter(([key]) => key.startsWith('hand-')).map(([, a]) => a)
    rack.visible = hand.length > 0
    if (hand.length) {
      const left = Math.min(...hand.map((a) => a.x - a.width * 0.42)),
        right = Math.max(...hand.map((a) => a.x + a.width * 0.42))
      const y = hand[0].y + hand[0].height * 0.39
      rack.position.set((left + right) / 2 - width / 2, height / 2 - y, 1)
      rack.scale.set(right - left, 4.4, 6)
      rack.rotation.x = -0.45
    }
    invalidate()
  }
  const observer = new ResizeObserver(measure)
  observer.observe(stage)
  const onLost = (e: Event) => {
    e.preventDefault()
    lost()
  }
  renderer.domElement.addEventListener('webglcontextlost', onLost)
  measure()
  return {
    update(next: SlotCards[], focus: Color | null, moves: Transfer[], clear = false) {
      const old = slots
      slots = next
      selected = focus
      if (clear) {
        active = null
        pending.length = 0
      }
      if (moves.length) {
        if (!active) {
          const move = moves[0]
          active = { move, since: performance.now(), prior: old.find((s) => s.slot === move.to) }
          pending.push(...moves.slice(1))
        } else pending.push(...moves)
        if (pending.length > 3) pending.splice(0, pending.length - 3)
      }
      measure()
    },
    measure,
    dispose() {
      dead = true
      cancelAnimationFrame(frame)
      observer.disconnect()
      renderer.domElement.removeEventListener('webglcontextlost', onLost)
      for (const m of [tickets, cards]) {
        m.geometry.dispose()
        m.dispose()
      }
      rackGeo.dispose()
      rackMat.dispose()
      atlas.dispose()
      material.dispose()
      renderer.dispose()
      renderer.forceContextLoss()
      renderer.domElement.remove()
    },
  }
}
