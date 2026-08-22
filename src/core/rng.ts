/**
 * Deterministic randomness.
 *
 * Every visual decision in PencilFolk comes from one of these generators, so a
 * seed string reproduces a sheet exactly — on any machine, in any browser.
 * Generators can be `fork`ed by tag, which lets one subsystem (say, hair) draw
 * as many numbers as it likes without shifting what another subsystem (say,
 * the background wash) receives.
 */

/* ---------------------------------------------------------------- hashing */

const MASK64 = (1n << 64n) - 1n
const FNV_OFFSET = 14695981039346656037n
const FNV_PRIME = 1099511628211n

/** splitmix64's finaliser — a strong 64-bit avalanche. */
function mix64(z: bigint): bigint {
  z = (z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n & MASK64
  z = (z ^ (z >> 27n)) * 0x94d049bb133111ebn & MASK64
  return (z ^ (z >> 31n)) & MASK64
}

/**
 * 64-bit FNV-1a over the seed's UTF-8 bytes, avalanched.
 *
 * The seed space is the whole 64-bit range — about 1.8e19 distinct sheets, and
 * 1.8e19 more per character index on each of them. A 32-bit hash would have
 * collided somewhere around the 80,000th seed (birthday bound); at 64 bits you
 * would need on the order of five billion seeds before a collision became
 * likely, which is the difference between "lots of variations" and "you will
 * never see the same sheet twice".
 */
export function hash64(str: string): bigint {
  let h = FNV_OFFSET
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i)
    // Fold the code unit in a byte at a time so surrogate pairs and ASCII
    // both spread properly.
    h = ((h ^ BigInt(code & 0xff)) * FNV_PRIME) & MASK64
    h = ((h ^ BigInt((code >> 8) & 0xff)) * FNV_PRIME) & MASK64
  }
  return mix64(h)
}

/** A 64-bit seed rendered as 16 hex digits — shown in the UI as a fingerprint. */
export function seedFingerprint(seed: string): string {
  return hash64(seed).toString(16).padStart(16, '0')
}

/** splitmix64: expands one 64-bit seed into an unlimited stream of 64-bit words. */
function splitmix64(seed: bigint): () => bigint {
  let state = seed & MASK64
  return () => {
    state = (state + 0x9e3779b97f4a7c15n) & MASK64
    return mix64(state)
  }
}

/** sfc32 — small, fast, statistically sound counter-based PRNG. */
function sfc32(a: number, b: number, c: number, d: number): () => number {
  return () => {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0
    let t = (a + b) | 0
    a = b ^ (b >>> 9)
    b = (c + (c << 3)) | 0
    c = (c << 21) | (c >>> 11)
    d = (d + 1) | 0
    t = (t + d) | 0
    c = (c + t) | 0
    return (t >>> 0) / 4294967296
  }
}

export type WeightedEntry<T> = readonly [value: T, weight: number]

export class Rng {
  private readonly next01: () => number
  readonly seed: string

  /** The 64-bit hash this generator was expanded from. */
  readonly hash: bigint

  constructor(seed: string) {
    this.seed = seed
    this.hash = hash64(seed)
    // Two 64-bit splitmix draws give the four 32-bit words sfc32 needs, with
    // every one of the 64 seed bits feeding all four.
    const next64 = splitmix64(this.hash)
    const w0 = next64()
    const w1 = next64()
    this.next01 = sfc32(
      Number(w0 & 0xffffffffn), Number((w0 >> 32n) & 0xffffffffn),
      Number(w1 & 0xffffffffn), Number((w1 >> 32n) & 0xffffffffn),
    )
    // Discard a short warm-up run so near-identical seeds diverge immediately.
    for (let i = 0; i < 12; i++) this.next01()
  }

  /** Uniform in [0, 1). */
  next(): number {
    return this.next01()
  }

  /** Uniform in [min, max). */
  range(min: number, max: number): number {
    return min + this.next01() * (max - min)
  }

  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1))
  }

  /** True with probability `p`. */
  bool(p = 0.5): boolean {
    return this.next01() < p
  }

  /** -1 or 1. */
  sign(): number {
    return this.next01() < 0.5 ? -1 : 1
  }

  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next01() * items.length)]!
  }

  /** Weighted choice. Weights need not sum to 1. */
  weighted<T>(entries: readonly WeightedEntry<T>[]): T {
    let total = 0
    for (const [, w] of entries) total += w
    let r = this.next01() * total
    for (const [value, w] of entries) {
      r -= w
      if (r <= 0) return value
    }
    return entries[entries.length - 1]![0]
  }

  /** Approximate normal draw (Irwin–Hall, n=3) clamped to ±3 sd. */
  gauss(mean = 0, sd = 1): number {
    const u = this.next01() + this.next01() + this.next01() - 1.5
    return mean + u * 2 * sd
  }

  /** Beta-ish draw in [0,1] biased toward `center`; `tight` in (0,1]. */
  around(center: number, tight = 0.35): number {
    const v = center + this.gauss(0, tight * 0.5)
    return Math.min(1, Math.max(0, v))
  }

  /**
   * Log-normal draw. The right distribution for anything that is usually small
   * but occasionally much larger: stain size, scar length, damage severity.
   */
  logNormal(median: number, sigma = 0.6): number {
    return median * Math.exp(this.gauss(0, sigma))
  }

  /**
   * Poisson draw (Knuth's method — fine for the small lambdas we use). The
   * right distribution for counts of independent small events: scratches,
   * patches, missing buttons, stray accessories.
   */
  poisson(lambda: number): number {
    if (lambda <= 0) return 0
    const limit = Math.exp(-lambda)
    let k = 0
    let prod = this.next01()
    while (prod > limit && k < 64) {
      k++
      prod *= this.next01()
    }
    return k
  }

  /**
   * Draw from a discrete distribution given as explicit probabilities that sum
   * to ~1 — used where the design document names exact percentages, so the
   * code reads the same as the spec.
   */
  fromDistribution<T>(dist: readonly (readonly [T, number])[]): T {
    let r = this.next01()
    for (const [value, p] of dist) {
      r -= p
      if (r <= 0) return value
    }
    return dist[dist.length - 1]![0]
  }

  /** Fisher–Yates, in place. */
  shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(this.next01() * (i + 1))
      ;[items[i], items[j]] = [items[j]!, items[i]!]
    }
    return items
  }

  /** Pick `n` distinct items (or all of them, if the pool is smaller). */
  sample<T>(items: readonly T[], n: number): T[] {
    return this.shuffle([...items]).slice(0, Math.min(n, items.length))
  }

  /** A child generator whose stream is independent of this one's future draws. */
  fork(tag: string): Rng {
    return new Rng(`${this.seed}::${tag}`)
  }
}

/** Human-friendly seed words, so the seed field is fun to type into. */
const SEED_WORDS = [
  'acorn', 'lantern', 'marmalade', 'pebble', 'thistle', 'compass', 'velvet',
  'harbour', 'sparrow', 'cobble', 'juniper', 'mitten', 'saffron', 'driftwood',
  'clementine', 'bramble', 'kettle', 'moss', 'plum', 'orbit', 'fennel',
  'quill', 'tumbleweed', 'nutmeg', 'lighthouse', 'periwinkle', 'gumdrop',
  'walnut', 'ripple', 'ginger', 'satchel', 'meadow', 'coriander', 'cardigan',
]

/**
 * A fresh seed with real entropy behind it.
 *
 * The two words are for humans — they make a seed sayable and memorable. The
 * trailing hex block is drawn from `crypto.getRandomValues`, so the practical
 * seed space is the full 64 bits of the hash rather than the few thousand
 * combinations the word list alone would give.
 */
export function randomSeed(): string {
  const words = SEED_WORDS
  const buf = new Uint32Array(3)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(buf)
  } else {
    for (let i = 0; i < buf.length; i++) buf[i] = Math.floor(Math.random() * 0x100000000)
  }
  const a = words[buf[0]! % words.length]!
  const b = words[buf[1]! % words.length]!
  const tail = buf[2]!.toString(36).padStart(7, '0')
  return `${a}-${b}-${tail}`
}
