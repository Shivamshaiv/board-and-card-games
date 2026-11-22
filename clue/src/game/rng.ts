/** A compact deterministic PRNG suitable for reproducible game simulations. */
export class SeededRandom {
  private currentState: number;

  constructor(seed: string | number, restoredState?: number) {
    this.currentState = restoredState ?? hashSeed(String(seed));
  }

  get state(): number {
    return this.currentState >>> 0;
  }

  next(): number {
    this.currentState = (this.currentState + 0x6d2b79f5) >>> 0;
    let value = this.currentState;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  }

  int(maxExclusive: number): number {
    if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
      throw new RangeError("maxExclusive must be a positive integer");
    }
    return Math.floor(this.next() * maxExclusive);
  }

  shuffle<T>(values: readonly T[]): T[] {
    const result = [...values];
    for (let index = result.length - 1; index > 0; index -= 1) {
      const swapIndex = this.int(index + 1);
      [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
    }
    return result;
  }
}

export function hashSeed(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  hash += hash << 13;
  hash ^= hash >>> 7;
  hash += hash << 3;
  hash ^= hash >>> 17;
  hash += hash << 5;
  return hash >>> 0;
}

/**
 * Derives an opaque deterministic seed for a non-rules stream. Player-facing
 * projections must never expose the root rules seed, because client code could
 * otherwise replay dealing and reconstruct the sealed Case File.
 */
export function deriveStreamSeed(
  rootSeed: string,
  streamName: string,
): string {
  const first = hashSeed(`gilded-alibi:v1:first\0${streamName}\0${rootSeed}`);
  const second = hashSeed(`gilded-alibi:v1:second\0${rootSeed}\0${streamName}`);
  return `${first.toString(16).padStart(8, "0")}${second
    .toString(16)
    .padStart(8, "0")}`;
}
