import * as T from 'three'
import { createElement } from 'react'
import { createRoot, useFrame, type RootState } from '@react-three/fiber'
import { defaultBoardArt, illustratedBoardArt } from './board-art'
import { createCabinet } from './cabinet'
import { createEnvironment, configureAtmosphere } from './environment'
import { createViewpoint, type CameraPreset } from './viewpoints'
import { trackRelief, trackNumbers } from './track-relief'
import { diceRackGeometry } from './dice-rack'
import { coversNumber, stackHit, tileHit } from './picking'
import { createRunningCamel } from './camel-rig'
import { ROLL_PRESENTATION_MS, sampleRoll, stride, type RollMovement } from './roll-motion'
import {
  camelGeometry,
  DIE_DOCK,
  dieAtlas,
  dieGeometry,
  finishCarvedPaint,
  PYRAMID,
  PYRAMID_ANGLE,
  sceneryGeometry,
  shutterGeometry,
} from './pieces'
import {
  BOARD_DEPTH,
  BOARD_WIDTH,
  camelBearing as bearing,
  inscription,
  locateCamels,
  PROJECTED_SPACES,
  racePosition,
  rollSocket,
  spaceLap,
  trackPoint,
} from './layout'
import type { Anchor, CamelPlace, RaceBoardProps } from './layout'

const COLORS = ['red', 'blue', 'green', 'yellow', 'purple', 'black', 'white']
const carvedModels = new Map<string, T.BufferGeometry>()
function carvedModel(key: string, make: () => T.BufferGeometry) {
  let geometry = carvedModels.get(key)
  if (!geometry) {
    geometry = make()
    carvedModels.set(key, geometry)
  }
  return geometry
}
const BASE = 0.086,
  LEVEL = 0.71
const clamp = (v: number) => Math.min(1, Math.max(0, v))
const ease = (v: number) => v * v * (3 - 2 * v)

function canvasTexture(canvas: HTMLCanvasElement) {
  const tex = new T.CanvasTexture(canvas)
  tex.colorSpace = T.SRGBColorSpace
  tex.anisotropy = 2
  return tex
}

function softShadow() {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const ctx = c.getContext('2d')!,
    gradient = ctx.createRadialGradient(32, 32, 3, 32, 32, 32)
  gradient.addColorStop(0, 'rgba(35,19,10,.77)')
  gradient.addColorStop(0.33, 'rgba(42,25,13,.52)')
  gradient.addColorStop(0.7, 'rgba(54,31,15,.19)')
  gradient.addColorStop(1, 'rgba(49,33,14,0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, 64, 64)
  return canvasTexture(c)
}

function tileCanvas(side: 'boo' | 'cheer', owner: string) {
  const c = document.createElement('canvas')
  c.width = 224
  c.height = 160
  const ctx = c.getContext('2d')!
  ctx.fillStyle = side === 'cheer' ? '#2c6d60' : '#a34b3d'
  ctx.fillRect(0, 0, 224, 160)
  ctx.strokeStyle = '#ead297'
  ctx.lineWidth = 5
  ctx.strokeRect(7, 7, 210, 146)
  ctx.fillStyle = '#fff1cd'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = 'bold 82px Georgia'
  ctx.fillText(side === 'cheer' ? '+1' : '−1', 112, 65)
  ctx.font = 'bold 22px sans-serif'
  ctx.fillText(owner.toUpperCase(), 112, 126, 178)
  return c
}

interface Motion {
  start: number
  id: string | number
  source: Map<string, CamelPlace>
  move?: RollMovement
  chase: boolean
}

export function mountRaceScene(
  host: HTMLElement,
  initial: RaceBoardProps,
  setAnchors: (positions: Anchor[]) => void,
  loseContext: () => void,
  onPresented: () => void,
) {
  const renderer = new T.WebGLRenderer({
    alpha: false,
    antialias: true,
    powerPreference: 'high-performance',
    stencil: false,
  })
  const gl = renderer.getContext(),
    debug = gl.getExtension('WEBGL_debug_renderer_info')
  const gpu = debug ? String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)) : ''
  const software = /swiftshader|llvmpipe|software rasterizer|microsoft basic render/i.test(gpu)
  const integrated = /intel|iris|radeon\(tm\) graphics|adreno|mali/i.test(gpu)
  renderer.outputColorSpace = T.SRGBColorSpace
  renderer.toneMapping = T.ACESFilmicToneMapping
  renderer.toneMappingExposure = 0.81
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = T.PCFShadowMap
  renderer.shadowMap.autoUpdate = false
  renderer.setClearColor('#d6ad82')
  renderer.domElement.setAttribute('aria-hidden', 'true')
  host.appendChild(renderer.domElement)
  const scene = new T.Group(),
    world = new T.Scene(),
    showcase = initial.presentation === 'showcase'
  const viewpoint = createViewpoint(showcase, !!initial.immersiveHud),
    camera = viewpoint.camera
  const fiber = createRoot(renderer.domElement)
  let store: RootState | null = null
  let stopped = false,
    lastFrame = 0,
    slow = 0,
    pixelCap = 1.6,
    orbitFrame = 0,
    lastShadow = 0,
    orbitSettle = 0
  let warmDraw = false
  let cancelWarm = () => {}
  const ambient = new T.HemisphereLight('#c2cde4', '#86603e', 0.49)
  const sun = new T.DirectionalLight('#ffcf94', 3.05)
  sun.position.set(-8.4, 10, -8.1)
  sun.castShadow = true
  sun.shadow.mapSize.setScalar(software || host.clientWidth < 600 ? 1024 : 1536)
  Object.assign(sun.shadow.camera, { left: -13, right: 13, top: 10, bottom: -10, near: 0.5, far: 36 })
  sun.shadow.bias = -0.00025
  sun.shadow.normalBias = 0.018
  sun.shadow.radius = 2.3
  const fill = new T.DirectionalLight('#c4d9e8', 0.56)
  fill.position.set(3, 5, 9)
  const rim = new T.DirectionalLight('#ffddac', 0.82)
  rim.position.set(8, 4, -3)
  scene.add(ambient, sun, fill, rim)
  // The photographed courtyard supplies the physically based reflection map once for this scene.
  world.environmentIntensity = 0.38
  const environment = createEnvironment(invalidate)
  scene.add(environment.group)
  const disposeSky = configureAtmosphere(world, invalidate)
  const cabinet = createCabinet(invalidate)
  scene.add(cabinet.group)
  const surfaceMat = new T.MeshPhysicalMaterial({
    vertexColors: true,
    roughness: 0.42,
    metalness: 0.015,
    clearcoat: 0.34,
    clearcoatRoughness: 0.25,
    side: T.DoubleSide,
  })
  finishCarvedPaint(surfaceMat, invalidate)
  const boardMap = canvasTexture(defaultBoardArt())
  boardMap.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8)
  const surface = new T.Mesh(
    new T.PlaneGeometry(BOARD_WIDTH, BOARD_DEPTH),
    new T.MeshStandardMaterial({ map: boardMap, metalness: 0.015, roughness: 0.68, alphaTest: 0.2 }),
  )
  surface.rotation.x = -Math.PI / 2
  surface.receiveShadow = true
  scene.add(surface)
  const inlays = new T.Mesh(
    trackRelief(),
    new T.MeshStandardMaterial({
      map: boardMap,
      vertexColors: true,
      roughness: 0.82,
      side: T.DoubleSide,
    }),
  )
  inlays.castShadow = true
  inlays.receiveShadow = true
  scene.add(inlays)
  const numberPlates = trackNumbers()
  scene.add(numberPlates.mesh)
  let artComplete = false,
    presented = false
  surface.onAfterRender = () => {
    if (presented || !artComplete || stopped) return
    presented = true
    queueMicrotask(() => {
      if (!stopped) {
        onPresented()
        if (!showcase) scheduleFirstRollWarmup()
      }
    })
  }
  const sceneryMat = new T.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.7,
    side: T.DoubleSide,
  })
  const staticScenery = new T.Mesh(carvedModel('scenery', sceneryGeometry), sceneryMat)
  staticScenery.castShadow = true
  staticScenery.receiveShadow = true
  scene.add(staticScenery)
  const shutter = new T.Mesh(carvedModel('shutter', shutterGeometry), surfaceMat)
  const exitX = PYRAMID.x + Math.sin(PYRAMID_ANGLE) * 0.973,
    exitZ = PYRAMID.z + Math.cos(PYRAMID_ANGLE) * 0.973
  shutter.position.set(exitX, 0.235, exitZ)
  shutter.rotation.y = PYRAMID_ANGLE
  shutter.castShadow = true
  scene.add(shutter)
  const shadowTexture = softShadow(),
    shadowMaterial = new T.MeshBasicMaterial({
      map: shadowTexture,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    })
  const plane = new T.PlaneGeometry(1, 1)
  plane.rotateX(-Math.PI / 2)
  function shade(x: number, z: number, w: number, d: number) {
    const mesh = new T.Mesh(plane, shadowMaterial)
    mesh.position.set(x, 0.014, z)
    mesh.scale.set(w, 1, d)
    mesh.renderOrder = 1
    scene.add(mesh)
    return mesh
  }
  shade(PYRAMID.x, PYRAMID.z, 2.68, 2.6)
  shade(-2.98, 0.35, 1.15, 0.62)
  shade(3.85, -0.04, 0.9, 0.56)
  const pieces = new Map(
    COLORS.map((c) => {
      const mesh = new T.Mesh(
        carvedModel(c, () => camelGeometry(c)),
        surfaceMat,
      )
      mesh.visible = false
      mesh.scale.setScalar(0.99)
      mesh.castShadow = true
      mesh.receiveShadow = true
      scene.add(mesh)
      return [c, { mesh, shadow: shade(0, 0, 1.39, 0.69) }]
    }),
  )
  const runner = createRunningCamel(pieces.get('red')!.mesh.geometry, surfaceMat)
  const pickRay = new T.Raycaster(),
    pickPoint = new T.Vector2()
  const pickedCamels = new Map<T.Object3D, string>(
    [...pieces].map(([camel, { mesh }]) => [mesh, camel]),
  )
  scene.add(runner.actor)
  const up = new T.Vector3(0, 1, 0),
    yawQ = new T.Quaternion(),
    tiltQ = new T.Quaternion(),
    correction = new T.Quaternion(),
    tiltRotation = new T.Euler(),
    seatOffset = new T.Vector3()
  const dieMat = new T.MeshStandardMaterial({ roughness: 0.52 })
  const die = new T.Mesh(carvedModel('die', dieGeometry), dieMat)
  die.visible = false
  die.castShadow = true
  die.receiveShadow = true
  scene.add(die)
  function setDieFace(value: number, color: string, camel?: string) {
    const face = dieAtlas(value, color, camel)
    if (dieMat.map) {
      // All faces have the same dimensions and sampler. Keep the allocated texture and shader.
      dieMat.map.image = face
      dieMat.map.needsUpdate = true
    } else {
      dieMat.map = canvasTexture(face)
      dieMat.needsUpdate = true
    }
  }
  function idle(work: () => void) {
    if (typeof window.requestIdleCallback === 'function') {
      const token = window.requestIdleCallback(work, { timeout: 350 })
      return () => window.cancelIdleCallback(token)
    }
    const token = window.setTimeout(work, 20)
    return () => window.clearTimeout(token)
  }
  function scheduleFirstRollWarmup() {
    // Compile/link during a free main-thread slice after first paint. A separate demand frame
    // uploads the rig and reaches Three's real shadow path, which compile() alone cannot do.
    cancelWarm = idle(() => {
      if (stopped || motion || !store) return
      if (!dieMat.map) setDieFace(1, 'red')
      const bones = runner.actor.skeleton
      if (!bones.boneTexture) bones.computeBoneTexture()
      renderer.initTexture(bones.boneTexture!)
      renderer.initTexture(dieMat.map!)
      renderer.compile(runner.actor, camera, world)
      renderer.compile(die, camera, world)
      if (host.clientWidth <= 510) {
        renderer.initTexture(numberPlates.mesh.material.map!)
        renderer.compile(numberPlates.mesh, camera, world)
      }
      cancelWarm = idle(() => {
        if (stopped || motion) return
        warmDraw = true
        renderer.shadowMap.needsUpdate = true
        invalidate()
      })
    })
  }
  const rack = new T.Mesh(carvedModel('rack', diceRackGeometry), sceneryMat)
  rack.castShadow = true
  rack.receiveShadow = true
  scene.add(rack)
  const previousDice = Array.from({ length: 4 }, () => {
    const mesh = new T.Mesh(die.geometry, new T.MeshStandardMaterial({ roughness: 0.47 }))
    mesh.visible = false
    mesh.castShadow = true
    mesh.receiveShadow = true
    scene.add(mesh)
    return { signature: '', mesh }
  })
  let dock = DIE_DOCK,
    showRestingDie = !!initial.lastRoll
  const tileGeo = new T.PlaneGeometry(0.98, 0.72)
  tileGeo.rotateX(-Math.PI / 2)
  const tiles = new Map<
    number,
    { signature: string; mesh: T.Mesh<T.PlaneGeometry, T.MeshBasicMaterial> }
  >()
  let current = locateCamels(initial.spaces),
    motion: Motion | null = null,
    dieId: string | number | undefined
  let layoutKey = '',
    visualKey = '',
    following = false,
    followedCamel: string | undefined,
    lastOverlay = 0
  type Pose = { number: number; level: number; lift?: number; lateral?: number }
  const animatedPoses = new Map<string, Pose>()
  let autoPreference = initial.autoRollCamera !== false,
    onRollEnd = initial.onRollAnimationEnd
  let lastAnimatedId: string | number | undefined
  function completeMotion(notify = true) {
    const finished = motion
    motion = null
    if (finished && notify)
      queueMicrotask(() => {
        if (!stopped) onRollEnd?.(finished.id)
      })
  }

  function project(x: number, z: number, y = 0.035) {
    const pos = new T.Vector3(x, y, z).project(camera)
    return { x: (pos.x + 1) * 50, y: (1 - pos.y) * 50 }
  }
  function compose(poses: ReadonlyMap<string, Pose> = current, movingCamera = false, chaseWeight = 0) {
    const width = host.clientWidth,
      height = host.clientHeight
    if (!width || !height) return
    const tops: T.Vector3[] = []
    const figures = new Map<number, T.Vector3[]>()
    const now = performance.now(),
      needOverlay = !movingCamera || now - lastOverlay > (chaseWeight > 0 ? 100 : 48)
    const directShot = chaseWeight === 1 && Boolean(motion?.move?.unit.length)
    const needHomeBounds = !following && !directShot
    for (const [c, placement] of poses) {
      if (!needHomeBounds && (showcase || !needOverlay)) break
      const p = racePosition(placement.number)
      if (needHomeBounds) {
        const top = BASE + placement.level * LEVEL + 1.4
        tops.push(
          new T.Vector3(p.x - 0.79, top, p.z - 0.25),
          new T.Vector3(p.x + 0.79, top, p.z + 0.25),
        )
      }
      if (showcase || !needOverlay) continue
      const collected = figures.get(placement.number) ?? [],
        angle = bearing(placement.number, c),
        co = Math.cos(angle),
        si = Math.sin(angle)
      for (const [x, y] of [
        [-0.61, 0.06],
        [0.48, 0.05],
        [0.96, 1.055],
        [0.58, 1.31],
        [-0.17, 0.93],
        [-0.67, 0.55],
      ]) {
        for (const z of [-0.16, 0.16])
          collected.push(
            new T.Vector3(
              p.x + x * co + z * si,
              BASE + placement.level * LEVEL + y,
              p.z - x * si + z * co,
            ),
          )
      }
      figures.set(placement.number, collected)
    }
    let subject = followedCamel && poses.has(followedCamel) ? followedCamel : ''
    if (following && !subject) {
      let best = -Infinity
      for (const [c, p] of poses) {
        if (c === 'black' || c === 'white') continue
        const order = p.number + p.level * 0.005
        if (order > best) {
          subject = c
          best = order
        }
      }
    }
    const selected = poses.get(subject)
    if (following && selected && !directShot) {
      const position = racePosition(selected.number)
      position.x += position.nx * (selected.lateral ?? 0)
      position.z += position.nz * (selected.lateral ?? 0)
      let level = selected.level
      for (const p of poses.values())
        if (Math.abs(p.number - selected.number) < 0.075) level = Math.max(level, p.level)
      viewpoint.follow(
        width,
        height,
        position.x,
        position.z,
        position.nx,
        position.nz,
        1.32 + level * LEVEL,
        selected.lift ?? 0,
        subject === 'black' || subject === 'white',
        movingCamera,
      )
    } else if (!directShot) viewpoint.frame(width, height, tops)
    const driver = motion?.move?.unit[0],
      tracked = driver ? poses.get(driver) : undefined
    if (chaseWeight > 0 && tracked && driver) {
      let top = tracked.level
      for (const rider of motion!.move!.unit) top = Math.max(top, poses.get(rider)?.level ?? 0)
      const place = racePosition(tracked.number)
      place.x += place.nx * (tracked.lateral ?? 0)
      place.z += place.nz * (tracked.lateral ?? 0)
      viewpoint.chase(
        width,
        height,
        place,
        1.32 + top * LEVEL,
        tracked.lift ?? 0,
        driver === 'black' || driver === 'white',
        chaseWeight,
      )
    }
    if (!showcase && needOverlay) {
      lastOverlay = now
      const spots: Anchor[] = PROJECTED_SPACES.map((n) => {
        const dot = racePosition(n),
          num = inscription(n)
        const p = project(dot.x, dot.z),
          label = project(num.x, num.z)
        const depth = new T.Vector3(dot.x, 0.07, dot.z).applyMatrix4(camera.matrixWorldInverse).z
        if (
          (following || chaseWeight > 0) &&
          (depth > -0.5 || p.x < -12 || p.x > 112 || p.y < -12 || p.y > 112)
        )
          return { x: -999, y: -999, labelX: -999, labelY: -999 }
        return {
          ...p,
          labelX: label.x,
          labelY: label.y,
          figure: stackHit(figures.get(n) ?? [], camera),
          tileHit: tileHit(n, (x, z) => project(x, z, 0.075)),
        }
      })
      let hidden = 0
      if (width > 510 && !following && chaseWeight === 0) {
        for (let i = 0; i < 16; i++) {
          const spot = spots[i]
          spot.raisedNumber = spots.some(
            (other) => other.figure && coversNumber(other.figure, spot.labelX, spot.labelY),
          )
          if (spot.raisedNumber) hidden |= 1 << i
        }
      }
      numberPlates.hide(hidden)
      const pyramid = project(PYRAMID.x, PYRAMID.z, 0.65)
      setAnchors([...spots, { ...pyramid, labelX: pyramid.x, labelY: pyramid.y }])
    }
    if (!movingCamera) invalidate()
  }
  function resolution(animating: boolean) {
    const width = host.clientWidth,
      height = host.clientHeight
    const movingPixels = software ? 280000 : integrated ? 805000 : 1550000
    const budget = animating ? movingPixels : software ? 1150000 : 2450000
    const dpr = Math.min(
      window.devicePixelRatio || 1,
      width < 600 ? 1.4 : 1.6,
      animating ? pixelCap : 1.6,
      Math.sqrt(budget / Math.max(1, width * height)),
    )
    if (store && Math.abs(store.get().viewport.dpr - dpr) > 0.015) store.setDpr(dpr)
  }
  function resize() {
    const width = host.clientWidth,
      height = host.clientHeight
    if (store && width && height) {
      store.setSize(width, height)
      resolution(!!motion)
    }
    compose()
  }
  function update(next: RaceBoardProps) {
    onRollEnd = next.onRollAnimationEnd
    const allow = next.autoRollCamera !== false && !showcase
    if (!allow && autoPreference && motion) {
      motion.chase = false
      compose()
    }
    autoPreference = allow
    const layout = next.spaces
      .map((s) => [s.number, s.camels.join(''), s.tile?.side, s.tile?.owner].join(':'))
      .join('|')
    const fingerprint = JSON.stringify([
      layout,
      next.lastRoll?.id,
      next.activeRollId,
      !!next.sourceSpaces,
      next.rolledDice,
      next.reducedMotion,
    ])
    if (fingerprint === visualKey) return
    visualKey = fingerprint
    const targets = locateCamels(next.spaces)
    const roll = next.lastRoll
    const explicit = next.activeRollId !== undefined
    const activeRoll = !!roll && next.activeRollId === roll.id
    if (explicit && motion && (!activeRoll || motion.id !== next.activeRollId)) {
      completeMotion(false)
      resolution(false)
      compose(targets)
    }
    const revealed = next.rolledDice
    dock = revealed?.length ? rollSocket(revealed.length - 1) : DIE_DOCK
    showRestingDie = !!roll && (revealed === undefined || revealed.length > 0)
    for (let i = 0; i < previousDice.length; i++) {
      const previous = previousDice[i],
        face = revealed && i < revealed.length - 1 ? revealed[i] : undefined
      previous.mesh.visible = !!face
      if (!face) continue
      const signature = face.die + ':' + face.value + ':' + face.greyColor
      if (signature !== previous.signature) {
        previous.mesh.material.map?.dispose()
        previous.mesh.material.map = canvasTexture(dieAtlas(face.value, face.die, face.greyColor))
        previous.mesh.material.needsUpdate = true
        previous.signature = signature
      }
      const socket = rollSocket(i)
      previous.mesh.position.set(socket.x, 0.294, socket.z)
      previous.mesh.rotation.y = 0.12 - i * 0.043
    }
    if (roll && (roll.id !== dieId || (explicit && activeRoll && lastAnimatedId !== roll.id))) {
      const animate = explicit
        ? activeRoll && lastAnimatedId !== roll.id
        : dieId !== undefined || (current.size > 0 && roll.id !== initial.lastRoll?.id)
      completeMotion(!explicit)
      const source = next.sourceSpaces ? locateCamels(next.sourceSpaces) : current
      const reported = roll.movement
      const aligned = reported?.unit.every((c) => source.get(c)?.number === reported.from)
      if (animate) lastAnimatedId = roll.id
      motion =
        animate && !next.reducedMotion
          ? {
              id: roll.id,
              start: performance.now(),
              source,
              move: aligned ? reported : undefined,
              chase: autoPreference && !!aligned && !next.selectableSpaces?.length,
            }
          : null
      if (animate && next.reducedMotion)
        queueMicrotask(() => {
          if (!stopped) onRollEnd?.(roll.id)
        })
      resolution(!!motion)
      setDieFace(roll.value, roll.color, roll.camel)
      dieId = roll.id
      die.visible = true
    } else if (!roll) {
      die.visible = false
      dieId = undefined
      completeMotion()
    }
    if (next.reducedMotion && motion) {
      completeMotion()
      resolution(false)
      compose(targets)
    }
    current = targets
    if (layout !== layoutKey) {
      layoutKey = layout
      compose()
    }
    renderer.shadowMap.needsUpdate = true
    const active = new Set<number>()
    for (const space of next.spaces) {
      if (!space.tile) continue
      active.add(space.number)
      const { owner, side } = space.tile,
        signature = owner + ':' + side
      const old = tiles.get(space.number)
      if (old?.signature === signature) continue
      const mesh = old?.mesh ?? new T.Mesh(tileGeo, new T.MeshBasicMaterial())
      mesh.material.map?.dispose()
      mesh.material.map = canvasTexture(tileCanvas(side, owner))
      mesh.material.needsUpdate = true
      const point = trackPoint(spaceLap(space.number))
      mesh.position.set(point.x, 0.081, point.z)
      if (!old) scene.add(mesh)
      tiles.set(space.number, { signature, mesh })
    }
    for (const [n, tile] of tiles)
      if (!active.has(n)) {
        scene.remove(tile.mesh)
        tile.mesh.material.map?.dispose()
        tile.mesh.material.dispose()
        tiles.delete(n)
      }
    invalidate()
  }
  function draw(now: number) {
    if (stopped) return
    const elapsed = motion ? Math.max(0, now - motion.start) : ROLL_PRESENTATION_MS
    const moving = !!motion && elapsed < ROLL_PRESENTATION_MS
    const movement = motion?.move,
      driver = movement?.unit[0]
    const clock = movement ? sampleRoll(elapsed, movement) : undefined
    const crazy = driver === 'white' || driver === 'black'
    const gait = clock
      ? stride(clock.distance, clock.strength, clock.direction < 0 !== crazy)
      : undefined
    const sourceBase = driver ? (motion?.source.get(driver)?.level ?? 0) : 0
    const targetBase = driver ? (current.get(driver)?.level ?? 0) : 0
    const chaseWeight = moving && motion?.chase ? (clock?.cameraWeight ?? 0) : 0
    const cameraMode = chaseWeight > 0.01 ? 'chase' : following ? 'follow' : 'table'
    if (host.dataset.camera !== cameraMode) host.dataset.camera = cameraMode
    numberPlates.mesh.visible = showcase || host.clientWidth > 510 || cameraMode !== 'table'
    if (cameraMode !== 'table') numberPlates.hide(0)
    let passingLane = 0
    if (moving && movement && clock) {
      const a = clock.secondLeg ? movement.landing : movement.from,
        b = clock.secondLeg ? movement.to : movement.landing
      for (const [camel, p] of motion!.source) {
        if (movement.unit.includes(camel) || p.number <= Math.min(a, b) || p.number >= Math.max(a, b))
          continue
        // Pass a stationary stack on the inside lane rather than intersect its occupants.
        const separation = Math.abs(clock.space - p.number)
        passingLane = Math.max(passingLane, 0.63 * (1 - ease(clamp(separation / 0.78))))
      }
    }
    runner.actor.visible = false
    const warmPawn = warmDraw && !motion ? pieces.get('red') : undefined
    warmDraw = false
    if (gait && driver && clock && moving) {
      yawQ.setFromAxisAngle(up, bearing(clock.space, driver))
      tiltQ.setFromEuler(tiltRotation.set(gait.roll, 0, gait.pitch))
      correction.copy(yawQ).multiply(tiltQ).multiply(yawQ.invert())
    }
    for (const [c, { mesh, shadow }] of pieces) {
      const target = current.get(c)
      mesh.visible = !!target
      shadow.visible = !!target
      if (!target) continue
      const source = motion?.source.get(c) ?? target
      const index = movement?.unit.indexOf(c) ?? -1
      let n = target.number,
        lift = 0,
        row = target.level
      if (moving && clock && gait) {
        if (index >= 0) {
          n = clock.space
          row = index + sourceBase * (1 - clock.departure) + targetBase * clock.arrival
          lift =
            gait.bob +
            Math.sin(clock.arrival * Math.PI) * 0.2 * Math.min(1, targetBase) +
            Math.sin(clock.departure * Math.PI) * 0.1 * Math.min(1, sourceBase)
        } else if (source.level !== target.level) {
          // A boo inserts the moving unit underneath the waiting stack.
          row = source.level + (target.level - source.level) * clock.makeRoom
          lift = Math.sin(clock.makeRoom * Math.PI) * 0.14
        }
      }
      const pos = racePosition(n)
      const lateral = index >= 0 ? -passingLane : 0
      pos.x += pos.nx * lateral
      pos.z += pos.nz * lateral
      if (following || motion?.chase) animatedPoses.set(c, { number: n, level: row, lift, lateral })
      mesh.position.set(pos.x, BASE + LEVEL * row + lift, pos.z)
      mesh.quaternion.setFromAxisAngle(up, bearing(n, c))
      if (c === 'red' && warmPawn) {
        // The rigged pawn in its bind pose is exactly the same sculpture at the same coordinates.
        mesh.visible = false
        runner.actor.visible = true
        runner.actor.geometry = mesh.geometry
        runner.actor.position.copy(mesh.position)
        runner.actor.quaternion.copy(mesh.quaternion)
        runner.apply(stride(0, 0, false))
      }
      if (moving && gait && index >= 0) {
        // All passengers keep the same rigid saddle-to-foot transform as the running base.
        seatOffset.set(0, LEVEL * index, 0).applyQuaternion(correction)
        mesh.position.x += seatOffset.x
        mesh.position.y += seatOffset.y - LEVEL * index
        mesh.position.z += seatOffset.z
        mesh.quaternion.premultiply(correction)
        if (index === 0) {
          mesh.visible = false
          runner.actor.geometry = mesh.geometry
          runner.actor.visible = true
          runner.actor.position.copy(mesh.position)
          runner.actor.quaternion.copy(mesh.quaternion)
          runner.apply(gait)
        }
      }
      shadow.visible = row < 0.45
      shadow.position.set(pos.x + 0.035, 0.076, pos.z + 0.04)
    }
    if (motion && (following || motion.chase)) compose(animatedPoses, moving, chaseWeight)
    die.visible = dieId !== undefined && (moving || showRestingDie)
    if (die.visible) {
      const phase = clamp((elapsed - 80) / 325),
        t = ease(phase)
      die.position.set(
        exitX + (dock.x - exitX) * t,
        0.294 + Math.sin(phase * Math.PI) * 0.57,
        exitZ + (dock.z - exitZ) * t,
      )
      die.rotation.set((1 - t) * Math.PI * 1.5, 0.22 + (1 - t) * 2.1, (1 - t) * 1.6)
      shutter.position.y = 0.235 + Math.max(0, Math.sin(clamp(elapsed / 415) * Math.PI)) * 0.29
    }
    if (warmPawn) {
      if (!die.visible) {
        // Fully enclosed by the opaque cabinet, this one draw also primes the die vertex array.
        die.visible = true
        die.position.set(0, -0.38, 0)
      }
      queueMicrotask(() => {
        if (stopped || motion) return
        warmPawn.mesh.visible = current.has('red')
        runner.actor.visible = false
        die.visible = showRestingDie
      })
    }
    if (moving) {
      const shadowInterval = software ? 170 : integrated ? 83 : 42
      if (now - lastShadow > shadowInterval) {
        renderer.shadowMap.needsUpdate = true
        lastShadow = now
      }
      if (lastFrame && now - lastFrame > 38) slow++
      else slow = Math.max(0, slow - 1)
      if (slow >= 6 && pixelCap > 1) {
        pixelCap = 1
        slow = 0
        resize()
      }
      lastFrame = now
      invalidate()
    } else {
      if (motion) {
        renderer.shadowMap.needsUpdate = true
        resolution(false)
      }
      completeMotion()
      lastFrame = 0
    }
  }
  function invalidate() {
    if (!stopped) store?.invalidate()
  }
  function Tabletop() {
    useFrame(() => draw(performance.now()))
    return createElement('primitive', { object: scene, dispose: null })
  }
  function onLost(e: Event) {
    e.preventDefault()
    completeMotion()
    loseContext()
  }
  renderer.domElement.addEventListener('webglcontextlost', onLost)
  const observer = new ResizeObserver(resize)
  observer.observe(host)
  void fiber
    .configure({
      gl: renderer,
      scene: world,
      camera,
      frameloop: 'demand',
      shadows: 'percentage',
      dpr: 1,
      size: { width: host.clientWidth, height: host.clientHeight, top: 0, left: 0 },
      onCreated(state) {
        if (!stopped) {
          store = state
          resize()
          invalidate()
        }
      },
    })
    .then(() => {
      if (!stopped) fiber.render(createElement(Tabletop))
    })
    .catch(() => {
      if (!stopped) loseContext()
    })
  update(initial)
  resize()
  void illustratedBoardArt().then(function (canvas) {
    if (stopped) return
    if (boardMap.image !== canvas) {
      boardMap.image = canvas
      boardMap.needsUpdate = true
    }
    artComplete = true
    invalidate()
  })
  return {
    update,
    pickSpace(clientX: number, clientY: number) {
      const r = host.getBoundingClientRect()
      if (!r.width || !r.height) return undefined
      pickPoint.set(((clientX - r.left) / r.width) * 2 - 1, 1 - ((clientY - r.top) / r.height) * 2)
      pickRay.setFromCamera(pickPoint, camera)
      const targets: T.Object3D[] = [inlays]
      for (const { mesh } of pieces.values()) if (mesh.visible) targets.push(mesh)
      if (runner.actor.visible) targets.push(runner.actor)
      const first = pickRay.intersectObjects(targets, false)[0]
      if (!first) return undefined
      if (first.object === inlays && first.faceIndex != null)
        return inlays.geometry.userData.spaces[first.faceIndex] as number
      const camel =
        first.object === runner.actor ? motion?.move?.unit[0] : pickedCamels.get(first.object)
      return camel ? current.get(camel)?.number : undefined
    },
    preset(name: CameraPreset, camel?: string) {
      if (motion) motion.chase = false
      following = name === 'follow'
      followedCamel = camel
      viewpoint.preset(name)
      compose()
    },
    orbit(dx: number, dy: number) {
      if (motion) motion.chase = false
      viewpoint.orbit(dx, dy)
      resolution(true)
      window.clearTimeout(orbitSettle)
      orbitSettle = window.setTimeout(() => {
        if (!stopped) {
          resolution(!!motion)
          invalidate()
        }
      }, 130)
      if (!orbitFrame)
        orbitFrame = requestAnimationFrame(() => {
          orbitFrame = 0
          if (!stopped) compose()
        })
    },
    zoom(factor: number) {
      if (motion) motion.chase = false
      viewpoint.magnify(factor)
      compose()
    },
    dispose() {
      stopped = true
      store = null
      observer.disconnect()
      cancelAnimationFrame(orbitFrame)
      window.clearTimeout(orbitSettle)
      cancelWarm()
      scene.remove(environment.group)
      runner.dispose()
      environment.dispose()
      disposeSky()
      cabinet.release()
      sun.shadow.dispose()
      renderer.domElement.removeEventListener('webglcontextlost', onLost)
      const materials = new Set<T.Material>(),
        geometries = new Set<T.BufferGeometry>(),
        textures = new Set<T.Texture>()
      scene.traverse((object) => {
        if (!(object instanceof T.Mesh)) return
        geometries.add(object.geometry)
        for (const mat of Array.isArray(object.material) ? object.material : [object.material]) {
          materials.add(mat)
          if ('map' in mat && mat.map instanceof T.Texture) textures.add(mat.map)
        }
      })
      geometries.forEach((g) => g.dispose())
      materials.forEach((m) => m.dispose())
      textures.forEach((t) => t.dispose())
      tileGeo.dispose()
      fiber.unmount()
      renderer.dispose()
      renderer.domElement.remove()
    },
  }
}
