export const TEMPOS = [96, 120, 144] as const
export type Tempo = (typeof TEMPOS)[number]
export type Instrument = 'pluck' | 'bass' | 'reed' | 'drum' | 'rim' | 'shaker'
export interface ScoreNote {
  instrument: Instrument
  midi: number
  strength: number
  beats: number
}

// An original eight-bar call and response. Pitch numbers are MIDI notes; positions
// are sixteenths and note lengths are quarter-note beats, independent of the mixer.
const melody: readonly (readonly (readonly [number, number, number])[])[] = [
  [
    [0, 62, 0.7],
    [3, 65, 0.4],
    [6, 67, 0.6],
    [10, 69, 0.82],
    [14, 67, 0.44],
  ],
  [
    [0, 65, 0.8],
    [4, 64, 0.42],
    [7, 62, 0.68],
    [12, 60, 0.75],
  ],
  [
    [0, 65, 0.55],
    [3, 67, 0.5],
    [6, 70, 0.8],
    [10, 69, 0.5],
    [13, 65, 0.65],
  ],
  [
    [0, 64, 0.9],
    [5, 61, 0.65],
    [11, 64, 0.4],
    [14, 69, 0.38],
  ],
  [
    [0, 74, 0.75],
    [3, 72, 0.4],
    [6, 69, 0.7],
    [10, 67, 0.65],
    [14, 65, 0.38],
  ],
  [
    [0, 67, 0.8],
    [4, 70, 0.55],
    [7, 69, 0.43],
    [10, 65, 0.62],
  ],
  [
    [0, 64, 0.6],
    [3, 67, 0.5],
    [6, 69, 0.9],
    [11, 73, 0.67],
  ],
  [
    [0, 74, 0.9],
    [5, 69, 0.55],
    [9, 65, 0.65],
    [12, 62, 0.94],
  ],
]
const roots = [50, 48, 46, 45, 50, 43, 45, 50]
export const midiHz = (midi: number) => 440 * 2 ** ((midi - 69) / 12)
export const sixteenthSeconds = (tempo: Tempo) => 15 / tempo

export function scoreStep(step: number): ScoreNote[] {
  const bar = Math.floor(step / 16) % 8,
    beat = step % 16,
    notes: ScoreNote[] = []
  const add = (instrument: Instrument, midi: number, strength: number, beats: number) =>
    notes.push({ instrument, midi, strength, beats })
  if (beat === 0 || beat === 8 || (bar % 2 === 0 && beat === 10))
    add('drum', 0, beat === 0 ? 1 : beat === 8 ? 0.82 : 0.5, 0.36)
  if (beat === 4 || beat === 12 || (bar % 2 === 1 && beat === 15))
    add('rim', 0, beat % 4 === 0 ? 0.77 : 0.42, 0.19)
  if (beat % 2 === 0 || (bar % 2 === 1 && beat === 13))
    add('shaker', 0, beat % 4 === 2 ? 0.82 : 0.47, 0.14)
  if (beat === 0 || beat === 8)
    add('bass', roots[bar] + (beat === 8 && bar % 2 ? 7 : 0), beat === 0 ? 0.83 : 0.58, 0.87)
  for (const [start, pitch, length] of melody[bar])
    if (beat === start) add('pluck', pitch, beat % 4 === 0 ? 0.92 : 0.76, length)
  if ((bar === 1 || bar === 5) && beat === 9) add('reed', bar === 1 ? 69 : 67, 0.5, 1.45)
  if (bar === 7 && beat === 2) add('reed', 74, 0.39, 2.05)
  return notes
}
