import { ROLL_PRESENTATION_MS, sampleRoll, type RollMovement } from './board/roll-motion'
import {
  TEMPOS,
  midiHz,
  scoreStep,
  sixteenthSeconds,
  type ScoreNote,
  type Tempo,
} from './music-score'

export interface AudioSettings {
  enabled: boolean
  music: number
  effects: number
  tempo: Tempo
}
const defaults: AudioSettings = { enabled: false, music: 55, effects: 72, tempo: 96 }
const storageKey = 'cu.table-audio.v1'
const volume = (value: number) => Math.max(0, Math.min(100, Math.round(value)))
export function parseAudioSettings(value: unknown): AudioSettings {
  const source = (value && typeof value === 'object' ? value : {}) as Partial<AudioSettings>
  return {
    enabled: source.enabled === true,
    music: Number.isFinite(source.music) ? volume(source.music!) : defaults.music,
    effects: Number.isFinite(source.effects) ? volume(source.effects!) : defaults.effects,
    tempo: TEMPOS.includes(source.tempo as Tempo) ? source.tempo! : defaults.tempo,
  }
}
function loadSaved(): AudioSettings {
  try {
    return parseAudioSettings(JSON.parse(localStorage.getItem(storageKey) || 'null'))
  } catch {
    return { ...defaults }
  }
}
let settings: AudioSettings | undefined
export const getAudioSettings = () => (settings ??= loadSaved())
const listeners = new Set<() => void>()
export function subscribeAudio(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

interface VoiceGroup {
  output: GainNode
  stops: Set<() => void>
}
interface Mix {
  ctx: AudioContext
  music: GainNode
  effects: GainNode
  strings: PeriodicWave
  pipe: PeriodicWave
  noise: AudioBuffer
}
let mix: Mix | null = null,
  score: VoiceGroup | null = null,
  effects: VoiceGroup | null = null,
  hooves: VoiceGroup | null = null
let clock: ReturnType<typeof setTimeout> | undefined,
  requestedTempo: Tempo | null = null,
  unlocked = false,
  attached = 0
let resuming: Promise<void> | null = null,
  suspending: Promise<void> | null = null,
  pageLive = true
const audible = () => {
  const s = getAudioSettings()
  return (
    s.enabled &&
    (s.music > 0 || s.effects > 0) &&
    unlocked &&
    attached > 0 &&
    pageLive &&
    !document.hidden
  )
}

function createMix(): Mix {
  const ctx = new AudioContext()
  const music = ctx.createGain(),
    effects = ctx.createGain(),
    master = ctx.createDynamicsCompressor()
  master.threshold.value = -12
  master.knee.value = 13
  master.ratio.value = 3.2
  master.attack.value = 0.005
  master.release.value = 0.16
  music.connect(master)
  effects.connect(master)
  master.connect(ctx.destination)
  const noise = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 0.28), ctx.sampleRate)
  const samples = noise.getChannelData(0)
  let seed = 6173
  for (let i = 0; i < samples.length; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    samples[i] = seed / 2147483648 - 1
  }
  const wave = (harmonics: number[]) =>
    ctx.createPeriodicWave(new Float32Array(harmonics.length), new Float32Array(harmonics))
  return {
    ctx,
    music,
    effects,
    noise,
    strings: wave([0, 1, 0.44, 0.19, 0.37, 0.16, 0.08, 0.047, 0.028]),
    pipe: wave([0, 1, 0.09, 0.26, 0.035, 0.09, 0.02, 0.035]),
  }
}
function group(destination: GainNode): VoiceGroup {
  const output = destination.context.createGain()
  output.connect(destination)
  return { output, stops: new Set() }
}
function dispose(voices: VoiceGroup | null) {
  if (!voices) return
  voices.output.disconnect()
  for (const stop of [...voices.stops]) stop()
}
function launch(
  voices: VoiceGroup,
  source: AudioScheduledSourceNode,
  nodes: AudioNode[],
  start: number,
  end: number,
) {
  let ended = false
  function release() {
    if (ended) return
    ended = true
    voices.stops.delete(stop)
    source.onended = null
    source.disconnect()
    for (const n of nodes) n.disconnect()
  }
  function stop() {
    try {
      source.stop()
    } catch {
      /* Already finished. */
    }
    release()
  }
  voices.stops.add(stop)
  source.onended = release
  source.start(start)
  source.stop(end)
}
interface Tone {
  wave: OscillatorType | PeriodicWave
  hz: number
  endHz?: number
  duration: number
  amplitude: number
  attack?: number
  cutoff?: number
  sustain?: boolean
}
function tone(voices: VoiceGroup, t: number, o: Tone) {
  const ctx = mix!.ctx,
    osc = ctx.createOscillator(),
    level = ctx.createGain(),
    nodes: AudioNode[] = [level]
  if (typeof o.wave === 'object') osc.setPeriodicWave(o.wave)
  else osc.type = o.wave as OscillatorType
  osc.frequency.setValueAtTime(o.hz, t)
  if (o.endHz) osc.frequency.exponentialRampToValueAtTime(o.endHz, t + o.duration * 0.86)
  const attack = Math.min(o.attack ?? 0.003, o.duration * 0.35)
  level.gain.setValueAtTime(0.0001, t)
  level.gain.exponentialRampToValueAtTime(o.amplitude, t + attack)
  if (o.sustain) level.gain.exponentialRampToValueAtTime(o.amplitude * 0.65, t + o.duration * 0.7)
  level.gain.exponentialRampToValueAtTime(0.0001, t + o.duration)
  if (o.cutoff) {
    const f = ctx.createBiquadFilter()
    f.type = 'lowpass'
    f.Q.value = 0.49
    f.frequency.setValueAtTime(o.cutoff, t)
    f.frequency.exponentialRampToValueAtTime(Math.max(270, o.cutoff * 0.39), t + o.duration)
    osc.connect(f).connect(level)
    nodes.push(f)
  } else osc.connect(level)
  level.connect(voices.output)
  launch(voices, osc, nodes, t, t + o.duration + 0.012)
}
function hiss(
  voices: VoiceGroup,
  t: number,
  length: number,
  amp: number,
  hz: number,
  type: BiquadFilterType = 'bandpass',
) {
  const ctx = mix!.ctx,
    buffer = ctx.createBufferSource(),
    filter = ctx.createBiquadFilter(),
    level = ctx.createGain()
  buffer.buffer = mix!.noise
  buffer.loop = length > 0.27
  filter.type = type
  filter.frequency.value = hz
  filter.Q.value = 0.82
  level.gain.setValueAtTime(0.0001, t)
  level.gain.exponentialRampToValueAtTime(amp, t + 0.006)
  level.gain.exponentialRampToValueAtTime(0.0001, t + length)
  buffer.connect(filter).connect(level).connect(voices.output)
  launch(voices, buffer, [filter, level], t, t + length + 0.009)
}
function instrument(bus: VoiceGroup, n: ScoreNote, t: number, beat: number) {
  const strength = n.strength,
    hz = midiHz(n.midi),
    len = n.beats * beat
  switch (n.instrument) {
    case 'pluck':
      tone(bus, t, {
        wave: mix!.strings,
        hz,
        duration: len + 0.21,
        amplitude: strength * 0.31,
        cutoff: 3450,
      })
      tone(bus, t + 0.012, {
        wave: 'sine',
        hz: hz * 2.002,
        duration: len * 0.62,
        amplitude: strength * 0.058,
        attack: 0.007,
      })
      break
    case 'bass':
      tone(bus, t, {
        wave: 'triangle',
        hz,
        duration: len,
        amplitude: strength * 0.36,
        cutoff: 520,
        attack: 0.01,
      })
      break
    case 'reed':
      tone(bus, t, {
        wave: mix!.pipe,
        hz,
        duration: len,
        amplitude: strength * 0.2,
        cutoff: 2350,
        attack: 0.083,
        sustain: true,
      })
      break
    case 'drum':
      tone(bus, t, { wave: 'sine', hz: 163, endHz: 55, duration: 0.235, amplitude: strength * 0.6 })
      hiss(bus, t, 0.038, strength * 0.085, 780)
      break
    case 'rim':
      tone(bus, t, {
        wave: 'triangle',
        hz: 650,
        endHz: 230,
        duration: 0.071,
        amplitude: strength * 0.26,
      })
      hiss(bus, t, 0.085, strength * 0.19, 1880)
      break
    case 'shaker':
      hiss(bus, t, 0.064, strength * 0.18, 6300, 'highpass')
      break
  }
}
function stopMusic() {
  clearTimeout(clock)
  clock = undefined
  dispose(score)
  score = null
  requestedTempo = null
}
function startMusic(bpm: Tempo) {
  if (score && requestedTempo === bpm) return
  stopMusic()
  const m = mix!,
    bus = group(m.music),
    step = sixteenthSeconds(bpm)
  score = bus
  requestedTempo = bpm
  let n = 0,
    next = m.ctx.currentTime + 0.055
  const tick = () => {
    if (score !== bus || !audible() || m.ctx.state !== 'running') return
    const now = m.ctx.currentTime
    if (next < now - 0.025) {
      const skipped = Math.ceil((now - next) / step)
      n += skipped
      next += skipped * step
    }
    while (next < now + 0.135) {
      const swing = n % 2 ? step * 0.065 : 0
      for (const event of scoreStep(n)) instrument(bus, event, next + swing, step * 4)
      n++
      next += step
    }
    clock = setTimeout(tick, 35)
  }
  tick()
}
function stopEffects() {
  dispose(hooves)
  hooves = null
  dispose(effects)
  effects = null
}
function suspendMix() {
  stopMusic()
  stopEffects()
  if (mix?.ctx.state === 'running' && !suspending) {
    suspending = mix.ctx
      .suspend()
      .catch(() => {})
      .then(() => {
        suspending = null
        if (audible()) sync()
      })
  }
}
function sync() {
  const state = getAudioSettings()
  if (!audible()) {
    suspendMix()
    return
  }
  try {
    mix ??= createMix()
  } catch {
    return
  }
  const { ctx, music } = mix
  music.gain.setTargetAtTime(state.music / 100, ctx.currentTime, 0.015)
  mix.effects.gain.setTargetAtTime(state.effects / 100, ctx.currentTime, 0.015)
  if (suspending) return
  if (ctx.state !== 'running') {
    if (!resuming)
      resuming = ctx.resume().then(
        () => {
          resuming = null
          sync()
        },
        () => {
          resuming = null
        },
      )
    return
  }
  if (state.music > 0) startMusic(state.tempo)
  else stopMusic()
  if (state.effects === 0) stopEffects()
}
export function updateAudioSettings(changes: Partial<AudioSettings>) {
  settings = parseAudioSettings({ ...getAudioSettings(), ...changes })
  if (settings.enabled) unlocked = true
  try {
    localStorage.setItem(storageKey, JSON.stringify(settings))
  } catch {
    /* Audio still works for this session. */
  }
  sync()
  for (const notify of listeners) notify()
}
export const setSound = (enabled: boolean) => updateAudioSettings({ enabled })
function gesture() {
  if (!getAudioSettings().enabled || document.hidden || (unlocked && mix?.ctx.state === 'running'))
    return
  unlocked = true
  sync()
}
function background() {
  pageLive = false
  suspendMix()
}
function foreground() {
  pageLive = true
  sync()
}
function changedStorage(e: StorageEvent) {
  if (e.key !== storageKey && e.key !== null) return
  settings = loadSaved()
  sync()
  for (const notify of listeners) notify()
}
/** Saved opt-in resumes only after a gesture. Hidden pages release their voices and clock. */
export function attachAudioLifecycle() {
  if (++attached === 1) {
    pageLive = true
    document.addEventListener('pointerdown', gesture, true)
    document.addEventListener('keydown', gesture, true)
    document.addEventListener('visibilitychange', sync)
    window.addEventListener('pagehide', background)
    window.addEventListener('pageshow', foreground)
    window.addEventListener('storage', changedStorage)
  }
  return () => {
    if (--attached) return
    document.removeEventListener('pointerdown', gesture, true)
    document.removeEventListener('keydown', gesture, true)
    document.removeEventListener('visibilitychange', sync)
    window.removeEventListener('pagehide', background)
    window.removeEventListener('pageshow', foreground)
    window.removeEventListener('storage', changedStorage)
    background()
  }
}
function effectBus() {
  if (!mix || !audible() || !getAudioSettings().effects || mix.ctx.state !== 'running') return null
  return (effects ??= group(mix.effects))
}
export type TableCue = 'roll' | 'ticket' | 'tile' | 'finish' | 'partner' | 'copy'
export function playTableSound(action: TableCue | boolean) {
  const bus = effectBus()
  if (!bus) return
  const t = mix!.ctx.currentTime + 0.005,
    kind = typeof action === 'boolean' ? (action ? 'roll' : 'ticket') : action
  if (kind === 'roll') {
    for (const [i, offset] of [0, 0.077, 0.174, 0.305].entries()) {
      tone(bus, t + offset, {
        wave: 'triangle',
        hz: 520 - i * 47,
        endHz: 105 - i * 9,
        duration: 0.073,
        amplitude: 0.42 - i * 0.045,
      })
      hiss(bus, t + offset, 0.025, 0.14, 1530)
    }
  } else if (kind === 'ticket' || kind === 'finish') {
    hiss(bus, t, kind === 'finish' ? 0.23 : 0.11, 0.38, kind === 'finish' ? 1640 : 2600)
    tone(bus, t + (kind === 'finish' ? 0.14 : 0.07), {
      wave: 'triangle',
      hz: 340,
      endHz: 110,
      duration: 0.067,
      amplitude: 0.25,
    })
  } else if (kind === 'tile') {
    for (const [i, d] of [0, 0.083].entries())
      tone(bus, t + d, {
        wave: 'triangle',
        hz: 255 - i * 39,
        endHz: 86,
        duration: 0.089,
        amplitude: 0.37 - i * 0.12,
      })
  } else {
    for (const [i, midi] of (kind === 'copy' ? [74, 76] : [67, 74]).entries())
      tone(bus, t + i * 0.11, { wave: 'sine', hz: midiHz(midi), duration: 0.23, amplitude: 0.19 })
  }
}
export function playSettlementSound(scope: 'leg' | 'race') {
  const bus = effectBus()
  if (!bus) return
  const now = mix!.ctx.currentTime + 0.008,
    seq = scope === 'race' ? [62, 65, 69, 74] : [65, 69]
  seq.forEach((m, i) =>
    tone(bus, now + i * 0.105, {
      wave: mix!.strings,
      hz: midiHz(m),
      duration: i === seq.length - 1 ? 0.48 : 0.26,
      amplitude: 0.26,
      cutoff: 2700,
    }),
  )
}
export function playHooves(movement: RollMovement) {
  const fx = effectBus()
  if (!fx) return
  dispose(hooves)
  const bus = group(fx.output)
  hooves = bus
  const start = mix!.ctx.currentTime
  let last = 0
  for (let ms = 0; ms < ROLL_PRESENTATION_MS; ms += 16) {
    const contact = Math.floor(sampleRoll(ms, movement).distance * 3.44 + 0.17)
    if (contact <= last) continue
    last = contact
    tone(bus, start + ms / 1000, {
      wave: 'triangle',
      hz: contact % 2 ? 185 : 153,
      endHz: 49,
      duration: 0.08,
      amplitude: 0.28,
    })
    hiss(bus, start + ms / 1000, 0.043, 0.095, 520)
  }
  return () => {
    if (hooves === bus) {
      dispose(hooves)
      hooves = null
    }
  }
}
