/** A small deterministic PRNG used only for AI policy tie-breaking. */
export class DeterministicAiRng {
  private state: number

  constructor(seed: string | number) {
    this.state = typeof seed === 'number' ? seed >>> 0 : hashAiSeed(seed)
    if (this.state === 0) this.state = 0x9e3779b9
  }

  nextUint32(): number {
    let value = this.state
    value ^= value << 13
    value ^= value >>> 17
    value ^= value << 5
    this.state = value >>> 0
    return this.state
  }

  integer(maxExclusive: number): number {
    if (!Number.isSafeInteger(maxExclusive) || maxExclusive <= 0) {
      throw new RangeError('maxExclusive must be a positive safe integer')
    }

    const range = 0x1_0000_0000
    const limit = range - (range % maxExclusive)
    let value = this.nextUint32()
    while (value >= limit) value = this.nextUint32()
    return value % maxExclusive
  }

  pick<T>(values: readonly T[]): T | undefined {
    return values.length === 0 ? undefined : values[this.integer(values.length)]
  }
}

/** FNV-1a with an avalanche finalizer, specified so results remain replayable. */
export function hashAiSeed(value: string): number {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  hash ^= hash >>> 16
  hash = Math.imul(hash, 0x7feb352d)
  hash ^= hash >>> 15
  hash = Math.imul(hash, 0x846ca68b)
  hash ^= hash >>> 16
  return hash >>> 0
}

export function rngForDecision(
  seed: string,
  playerId: string,
  revision: number,
  purpose: string,
): DeterministicAiRng {
  return new DeterministicAiRng(`${seed}|${playerId}|${revision}|${purpose}`)
}

