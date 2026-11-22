export type SoundCue =
  | "button"
  | "dice"
  | "card"
  | "page"
  | "footstep"
  | "door"
  | "passage"
  | "suggestion"
  | "accusation"
  | "reveal"
  | "victory";

export interface SoundLevels {
  effects: number;
  ambience: number;
  music: number;
  muted: boolean;
}

let audioContext: AudioContext | null = null;
let masterBus: GainNode | null = null;
let effectsBus: GainNode | null = null;
let musicBus: GainNode | null = null;
let ambienceBus: GainNode | null = null;
let bedsStarted = false;

function context() {
  if (typeof window === "undefined") return null;
  const AudioCtor = window.AudioContext ??
    (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtor) return null;
  audioContext ??= new AudioCtor();
  if (audioContext.state === "suspended") void audioContext.resume();
  return audioContext;
}

const cueNotes: Record<SoundCue, readonly number[]> = {
  button: [280],
  dice: [110, 145, 95],
  card: [420, 520],
  page: [320],
  footstep: [90],
  door: [135, 105],
  passage: [180, 120, 80],
  suggestion: [294, 370, 440],
  accusation: [110, 147, 220],
  reveal: [330, 494, 659],
  victory: [262, 330, 392, 523],
};

function mixer(ctx: AudioContext) {
  if (!masterBus || !effectsBus || !musicBus || !ambienceBus) {
    masterBus = ctx.createGain();
    effectsBus = ctx.createGain();
    musicBus = ctx.createGain();
    ambienceBus = ctx.createGain();
    effectsBus.connect(masterBus);
    musicBus.connect(masterBus);
    ambienceBus.connect(masterBus);
    masterBus.connect(ctx.destination);
    masterBus.gain.value = 1;
    effectsBus.gain.value = 1;
    musicBus.gain.value = 0;
    ambienceBus.gain.value = 0;
  }

  if (!bedsStarted) {
    bedsStarted = true;
    const chord = [65.41, 98, 130.81];
    chord.forEach((frequency, index) => {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = index === 1 ? "triangle" : "sine";
      oscillator.frequency.value = frequency;
      oscillator.detune.value = index * 3 - 3;
      gain.gain.value = index === 1 ? 0.012 : 0.008;
      oscillator.connect(gain).connect(musicBus!);
      oscillator.start();
    });

    const noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate);
    const channel = noiseBuffer.getChannelData(0);
    let seed = 0x5e2a1936;
    for (let index = 0; index < channel.length; index += 1) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      channel[index] = ((seed / 0xffffffff) * 2 - 1) * 0.045;
    }
    const noise = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    noise.buffer = noiseBuffer;
    noise.loop = true;
    filter.type = "lowpass";
    filter.frequency.value = 420;
    noise.connect(filter).connect(ambienceBus!);
    noise.start();
  }
  return { effectsBus, musicBus, ambienceBus, masterBus };
}

/** Applies the three user-facing buses after an autoplay-safe user gesture. */
export function syncAudioMix(levels: SoundLevels, active = true) {
  if (!audioContext) return;
  const ctx = audioContext;
  const buses = mixer(ctx);
  const muted = levels.muted || !active;
  buses.masterBus.gain.setTargetAtTime(muted ? 0 : 1, ctx.currentTime, 0.08);
  buses.effectsBus.gain.setTargetAtTime(levels.effects / 100, ctx.currentTime, 0.08);
  buses.musicBus.gain.setTargetAtTime(levels.music / 100, ctx.currentTime, 0.18);
  buses.ambienceBus.gain.setTargetAtTime(levels.ambience / 100, ctx.currentTime, 0.18);
}

export function playCue(cue: SoundCue, levels: SoundLevels) {
  if (levels.muted || levels.effects <= 0) return;
  const ctx = context();
  if (!ctx) return;

  const gain = ctx.createGain();
  const buses = mixer(ctx);
  const now = ctx.currentTime;
  const volume = Math.min(0.14, levels.effects * 0.0014);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume), now + 0.018);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.48);
  gain.connect(buses.effectsBus);

  cueNotes[cue].forEach((frequency, index) => {
    const oscillator = ctx.createOscillator();
    oscillator.type = cue === "dice" || cue === "footstep" ? "triangle" : "sine";
    oscillator.frequency.setValueAtTime(frequency, now + index * 0.055);
    oscillator.detune.setValueAtTime((index - 1) * 4, now);
    oscillator.connect(gain);
    oscillator.start(now + index * 0.055);
    oscillator.stop(now + 0.42 + index * 0.055);
  });
}

export function unlockAudio() {
  const ctx = context();
  if (ctx) {
    mixer(ctx);
    void ctx.resume();
  }
}
