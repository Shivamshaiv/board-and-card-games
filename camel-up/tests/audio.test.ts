import { describe, expect, it } from 'vitest'
import { parseAudioSettings } from '../src/ambience'
import { scoreStep, sixteenthSeconds, TEMPOS } from '../src/music-score'

describe('offline race score', () => {
  it('starts muted at 96 BPM and safely restores independent mixer levels', () => {
    expect(parseAudioSettings(null)).toEqual({ enabled: false, music: 55, effects: 72, tempo: 96 })
    expect(parseAudioSettings({ enabled: true, music: 0, effects: 37, tempo: 144 })).toEqual({
      enabled: true,
      music: 0,
      effects: 37,
      tempo: 144,
    })
    expect(parseAudioSettings({ enabled: 'yes', music: -11, effects: 827, tempo: 0 })).toEqual({
      enabled: false,
      music: 0,
      effects: 100,
      tempo: 96,
    })
  })
  it('keeps quarter notes at the selected BPM across the eight-bar phrase', () => {
    for (const tempo of TEMPOS) {
      expect(4 * sixteenthSeconds(tempo)).toBeCloseTo(60 / tempo)
      expect(128 * sixteenthSeconds(tempo)).toBeCloseTo((8 * 4 * 60) / tempo)
    }
    const phrase = Array.from({ length: 128 }, (_, i) => scoreStep(i))
    expect(phrase).toEqual(Array.from({ length: 128 }, (_, i) => scoreStep(i + 128)))
    const events = phrase.flat()
    expect(new Set(events.map((e) => e.instrument))).toEqual(
      new Set(['bass', 'pluck', 'reed', 'drum', 'rim', 'shaker']),
    )
    expect(
      new Set(events.filter((e) => e.instrument === 'pluck').map((e) => e.midi)).size,
    ).toBeGreaterThan(7)
    for (const event of events) {
      expect(event.strength).toBeGreaterThan(0)
      expect(event.beats).toBeGreaterThan(0)
    }
  })
})
