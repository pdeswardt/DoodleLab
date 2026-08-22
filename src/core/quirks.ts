/**
 * The quirk layer.
 *
 * This runs *after* identity, anatomy, role, wardrobe and condition are
 * settled, and its job is to make some people memorable without turning the
 * population into a parade of caricatures. Three rules keep it honest:
 *
 *  - Quirks are rare. The count distribution is 55/30/12/3 for zero/one/two/
 *    three, exactly as specified, and `memorability` tilts that distribution
 *    rather than replacing it.
 *  - Quirks have intensity. A pencil behind the ear can be a barely-noticed
 *    detail or the first thing you see, and the tier distribution
 *    (50/30/17/3) is drawn independently per quirk.
 *  - Quirks are caused. Every entry can weight itself by age, years in role,
 *    grooming, personality and archetype, so they read as consequences of a
 *    life rather than as decoration.
 */

import type { Rng } from './rng'

export type QuirkCategory = 'physical' | 'clothing' | 'behaviour' | 'equipment'
export type QuirkPersistence = 'permanent' | 'semi' | 'temporary'
export type QuirkTier = 'subtle' | 'moderate' | 'strong' | 'extreme'

export interface QuirkContext {
  age: number
  yearsInRole: number
  grooming: number
  exposure: number
  archetype: string
  role: string
  personality: {
    meticulous: number
    eccentric: number
    superstitious: number
    sociable: number
  }
}

export interface QuirkDef {
  id: string
  /** Phrased as an observation, because that is how it reads in the inspector. */
  label: string
  category: QuirkCategory
  persistence: QuirkPersistence
  /** What this quirk occupies, for conflict checks. */
  tags: string[]
  /** Tags this quirk refuses to share a character with. */
  conflicts?: string[]
  weight: number
  /** Contextual multiplier. Returning 0 forbids the quirk outright. */
  bias?: (c: QuirkContext) => number
}

export interface AppliedQuirk {
  id: string
  label: string
  category: QuirkCategory
  persistence: QuirkPersistence
  tier: QuirkTier
  /** 0..1 — how far the drawing pushes this trait. */
  intensity: number
}

const older = (c: QuirkContext, from = 45): number => (c.age >= from ? 1.8 : 0.6)
const veteran = (c: QuirkContext): number => Math.min(2.2, 0.5 + c.yearsInRole / 9)

export const QUIRKS: QuirkDef[] = [
  /* ---------------------------------------------------------- physical */
  {
    id: 'asym-brows', label: 'eyebrows that have never agreed on a height',
    category: 'physical', persistence: 'permanent', tags: ['brow'], weight: 3,
  },
  {
    id: 'crooked-nose', label: 'a nose that took a turn somewhere',
    category: 'physical', persistence: 'permanent', tags: ['nose'], weight: 2.4,
    bias: (c) => older(c, 30) * (c.archetype === 'ruffian' ? 2 : 1),
  },
  {
    id: 'toothgap', label: 'a gap-toothed grin',
    category: 'physical', persistence: 'permanent', tags: ['mouth'], weight: 3,
  },
  {
    id: 'big-ear', label: 'one ear noticeably larger than the other',
    category: 'physical', persistence: 'permanent', tags: ['ear'],
    conflicts: ['ear-cover'], weight: 2,
  },
  {
    id: 'cloudy-eye', label: 'one eye gone milky and unbothered',
    category: 'physical', persistence: 'permanent', tags: ['eye'], weight: 1.2,
    bias: (c) => older(c, 50),
  },
  {
    id: 'scar', label: 'an old scar with no story attached',
    category: 'physical', persistence: 'permanent', tags: ['cheek'], weight: 1.8,
    bias: (c) => veteran(c) * (c.archetype === 'ruffian' || c.archetype === 'sailor' ? 2 : 1),
  },
  {
    id: 'heterochromia', label: 'two eyes that disagree on colour',
    category: 'physical', persistence: 'permanent', tags: ['eye'], weight: 1.4,
  },
  {
    id: 'freckle-storm', label: 'freckles well past the usual allowance',
    category: 'physical', persistence: 'permanent', tags: ['cheek'], weight: 2.6,
    bias: (c) => (c.age < 30 ? 1.6 : 0.8),
  },
  {
    id: 'mole', label: 'a beauty spot placed with intent',
    category: 'physical', persistence: 'permanent', tags: ['cheek'], weight: 2.2,
  },
  {
    id: 'blush-storm', label: 'a blush that will not quit',
    category: 'physical', persistence: 'permanent', tags: ['cheek'], weight: 2,
    bias: (c) => (c.personality.sociable < 0.4 ? 1.8 : 0.7),
  },
  {
    id: 'cowlick', label: 'one lock that has never once lain flat',
    category: 'physical', persistence: 'permanent', tags: ['hair'], weight: 3,
    bias: (c) => (1 - c.grooming) * 2 + 0.4,
  },
  {
    id: 'third-eye', label: 'a third eye, quite relaxed about it',
    category: 'physical', persistence: 'permanent', tags: ['forehead'],
    conflicts: ['forehead'], weight: 0.5,
    bias: (c) => (c.archetype === 'oddity' ? 6 : 0.25) * (0.5 + c.personality.eccentric),
  },

  /* ---------------------------------------------------------- clothing */
  {
    id: 'patched', label: 'a garment mended more often than replaced',
    category: 'clothing', persistence: 'semi', tags: ['garment'], weight: 3,
    bias: (c) => veteran(c) * (c.personality.meticulous > 0.6 ? 1.6 : 1),
  },
  {
    id: 'mismatch', label: 'one panel of cloth that never matched the rest',
    category: 'clothing', persistence: 'semi', tags: ['garment'], weight: 2.2,
    bias: (c) => 0.5 + c.personality.eccentric * 2,
  },
  {
    id: 'missing-button', label: 'a button lost and never chased down',
    category: 'clothing', persistence: 'semi', tags: ['fastening'], weight: 2.6,
    bias: (c) => (1 - c.personality.meticulous) * 2 + 0.3,
  },
  {
    id: 'badges', label: 'a collection of badges with no obvious theme',
    category: 'clothing', persistence: 'semi', tags: ['chest'], weight: 2,
    bias: (c) => veteran(c) * (0.4 + c.personality.sociable),
  },
  {
    id: 'charm', label: 'a small charm pinned where it can be touched',
    category: 'clothing', persistence: 'semi', tags: ['collar'], weight: 2,
    bias: (c) => 0.3 + c.personality.superstitious * 3,
  },
  {
    id: 'old-tie', label: 'an old-fashioned tie worn under working clothes',
    category: 'clothing', persistence: 'semi', tags: ['neck'],
    conflicts: ['neck'], weight: 1.6,
    bias: (c) => older(c, 48) * (0.5 + c.personality.meticulous),
  },
  {
    id: 'collar-up', label: 'a collar turned up against nothing in particular',
    category: 'clothing', persistence: 'temporary', tags: ['collar'], weight: 2,
  },

  /* --------------------------------------------------------- behaviour */
  {
    id: 'pencil', label: 'a pencil parked behind one ear',
    category: 'behaviour', persistence: 'temporary', tags: ['ear-prop'],
    conflicts: ['ear-cover'], weight: 3,
    bias: (c) => (c.archetype === 'tinkerer' || c.archetype === 'scholar' ? 2.4 : 0.9),
  },
  {
    id: 'two-pencils', label: 'a pencil behind each ear, in case',
    category: 'behaviour', persistence: 'temporary', tags: ['ear-prop'],
    conflicts: ['ear-cover', 'ear-prop'], weight: 0.9,
    bias: (c) => (c.personality.meticulous > 0.65 ? 2.5 : 0.6),
  },
  {
    id: 'flower', label: 'a flower tucked behind the ear, unexplained',
    category: 'behaviour', persistence: 'temporary', tags: ['ear-prop'],
    conflicts: ['ear-cover'], weight: 2.2,
    bias: (c) => (c.archetype === 'botanist' ? 3 : 1),
  },
  {
    id: 'leaf', label: 'a single leaf caught in the hair',
    category: 'behaviour', persistence: 'temporary', tags: ['hair-prop'], weight: 2.4,
    bias: (c) => (c.exposure > 0.5 ? 2 : 0.7),
  },
  {
    id: 'snail', label: 'a snail commuting across one shoulder',
    category: 'behaviour', persistence: 'temporary', tags: ['shoulder'], weight: 1.6,
    bias: (c) => (c.archetype === 'botanist' || c.archetype === 'keeper' ? 2.6 : 0.8),
  },
  {
    id: 'moth', label: 'a moth that will not be shooed',
    category: 'behaviour', persistence: 'temporary', tags: ['air'], weight: 1.6,
  },
  {
    id: 'bird', label: 'a very small bird, uninvited',
    category: 'behaviour', persistence: 'temporary', tags: ['shoulder'],
    conflicts: ['shoulder'], weight: 1.4,
  },
  {
    id: 'bubble', label: 'one escaped soap bubble',
    category: 'behaviour', persistence: 'temporary', tags: ['air'],
    conflicts: ['air'], weight: 1.6,
  },
  {
    id: 'sprout', label: 'a sprout growing straight out of the head',
    category: 'behaviour', persistence: 'temporary', tags: ['hair-prop'],
    conflicts: ['hair-prop'], weight: 1.2,
    bias: (c) => (c.archetype === 'botanist' ? 3.5 : 0.5) * (0.5 + c.personality.eccentric),
  },
  {
    id: 'steam', label: 'a curl of steam from something off-frame',
    category: 'behaviour', persistence: 'temporary', tags: ['air'], weight: 1.5,
    bias: (c) => (c.archetype === 'baker' ? 3 : 0.8),
  },
  {
    id: 'star', label: 'a stray star orbiting the crown',
    category: 'behaviour', persistence: 'temporary', tags: ['air'], weight: 1.1,
    bias: (c) => 0.4 + c.personality.eccentric * 2,
  },
  {
    id: 'halo', label: 'a slightly crooked halo',
    category: 'behaviour', persistence: 'temporary', tags: ['above'],
    conflicts: ['above'], weight: 0.7,
    bias: (c) => 0.3 + c.personality.superstitious * 2.4,
  },
  {
    id: 'ink-smudge', label: 'an ink smudge on one cheek',
    category: 'behaviour', persistence: 'temporary', tags: ['cheek'], weight: 2.4,
    bias: (c) => (c.archetype === 'scholar' || c.archetype === 'tinkerer' ? 2.4 : 0.9),
  },
  {
    id: 'bandaid', label: 'a plaster on the nose, cause unstated',
    category: 'behaviour', persistence: 'temporary', tags: ['nose'],
    conflicts: ['nose'], weight: 2,
    bias: (c) => (c.archetype === 'ruffian' ? 2.4 : 1),
  },
  {
    id: 'thread', label: 'a loose thread nobody has mentioned',
    category: 'behaviour', persistence: 'temporary', tags: ['garment'], weight: 2,
  },

  /* --------------------------------------------------------- equipment */
  {
    id: 'ear-defenders', label: 'hearing protection worn at all times',
    category: 'equipment', persistence: 'semi', tags: ['ear-cover', 'above'],
    conflicts: ['ear-prop', 'ear-cover', 'above'], weight: 1.8,
    bias: (c) => (c.archetype === 'tinkerer' ? 2.4 : 0.8) * (0.6 + c.personality.meticulous),
  },
  {
    id: 'goggles-up', label: 'goggles pushed up and long since forgotten',
    category: 'equipment', persistence: 'semi', tags: ['forehead'],
    conflicts: ['forehead'], weight: 2,
    bias: (c) => (c.archetype === 'tinkerer' || c.archetype === 'sailor' ? 2.6 : 0.7),
  },
  {
    id: 'monocle-chain', label: 'a monocle on a chain, used sparingly',
    category: 'equipment', persistence: 'semi', tags: ['eyewear'],
    conflicts: ['eyewear'], weight: 0.9,
    bias: (c) => (c.archetype === 'grandee' ? 4 : 0.4) * older(c, 45),
  },
  {
    id: 'painted-button', label: 'one button hand-painted a different colour',
    category: 'equipment', persistence: 'semi', tags: ['fastening'],
    conflicts: ['fastening'], weight: 1.6,
    bias: (c) => 0.4 + c.personality.eccentric * 2.2,
  },
  {
    id: 'antenna', label: 'one antenna, function unknown',
    category: 'equipment', persistence: 'semi', tags: ['above'],
    conflicts: ['above'], weight: 0.7,
    bias: (c) => (c.archetype === 'oddity' ? 5 : 0.2),
  },
]

export const QUIRK_BY_ID = new Map(QUIRKS.map((q) => [q.id, q]))

/** The spec's headline numbers, kept here so they are easy to audit. */
const COUNT_DISTRIBUTION = [0.55, 0.3, 0.12, 0.03]
const TIER_DISTRIBUTION: [QuirkTier, number][] = [
  ['subtle', 0.5], ['moderate', 0.3], ['strong', 0.17], ['extreme', 0.03],
]
const TIER_INTENSITY: Record<QuirkTier, [number, number]> = {
  subtle: [0.15, 0.35],
  moderate: [0.35, 0.62],
  strong: [0.62, 0.85],
  extreme: [0.85, 1],
}
const TIER_RANK: Record<QuirkTier, number> = { subtle: 0, moderate: 1, strong: 2, extreme: 3 }

export interface QuirkRollOptions {
  /** 0..1. Raises quirk probability and intensity — intentionally, not chaotically. */
  memorability: number
  /** Multiplier on how often quirks appear at all. 1 = the spec distribution. */
  density?: number
  maxQuirks?: number
  enabled?: boolean
}

/**
 * Tilt a discrete distribution toward its later entries.
 *
 * `p = 1` reproduces the input exactly, which means the default behaviour is
 * literally the specified 55/30/12/3. Higher `p` shifts mass toward more (or
 * stronger) quirks without ever making "none" impossible.
 */
function tilt(dist: readonly number[], p: number): number[] {
  const w = dist.map((v, i) => v * p ** i)
  const total = w.reduce((a, b) => a + b, 0)
  return w.map((v) => v / total)
}

/**
 * Choose this character's quirks.
 *
 * Selection is weighted by context, then filtered by conflict tags, then
 * capped so that at most one quirk is allowed to shout — competing extreme
 * traits are demoted rather than dropped, which keeps the silhouette readable.
 */
export function rollQuirks(
  rng: Rng, ctx: QuirkContext, o: QuirkRollOptions,
): AppliedQuirk[] {
  if (o.enabled === false) return []
  const density = o.density ?? 1
  const maxQuirks = o.maxQuirks ?? 3

  // Propensity 1 reproduces the designed distribution exactly. It is anchored
  // at the default memorability so that "quirk density 1.00" means literally
  // 55/30/12/3 out of the box, with memorability tilting gently either side of
  // that rather than quietly suppressing quirks at the default setting.
  const propensity = Math.max(0, density * (1 + (o.memorability - 0.35) * 1.15))
  const countDist = tilt(COUNT_DISTRIBUTION, propensity)
  let count = rng.fromDistribution(countDist.map((p, i) => [i, p] as const))
  count = Math.min(count, maxQuirks)
  if (count === 0) return []

  // Contextual weights, computed once.
  const pool = QUIRKS.map((q) => {
    const bias = q.bias ? q.bias(ctx) : 1
    return { def: q, weight: q.weight * Math.max(0, bias) }
  }).filter((e) => e.weight > 0)

  const chosen: QuirkDef[] = []
  const usedTags = new Set<string>()

  for (let i = 0; i < count; i++) {
    const legal = pool.filter((e) => {
      if (chosen.some((c) => c.id === e.def.id)) return false
      if (e.def.conflicts?.some((t) => usedTags.has(t))) return false
      // A quirk also loses if something already chosen forbids one of its tags.
      if (e.def.tags.some((t) => chosen.some((c) => c.conflicts?.includes(t)))) return false
      return true
    })
    if (legal.length === 0) break
    const def = rng.weighted(legal.map((e) => [e.def, e.weight] as const))
    chosen.push(def)
    for (const t of def.tags) usedTags.add(t)
  }

  // Intensity, drawn per quirk, then flattened so only one can dominate.
  const tierDist = tilt(TIER_DISTRIBUTION.map(([, p]) => p), 0.7 + o.memorability * 1.1)
  const applied: AppliedQuirk[] = chosen.map((def) => {
    const tier = rng.fromDistribution(
      TIER_DISTRIBUTION.map(([t], i) => [t, tierDist[i]!] as const),
    )
    const [lo, hi] = TIER_INTENSITY[tier]
    return {
      id: def.id,
      label: def.label,
      category: def.category,
      persistence: def.persistence,
      tier,
      intensity: rng.range(lo, hi),
    }
  })

  applied.sort((a, b) => TIER_RANK[b.tier] - TIER_RANK[a.tier])
  for (let i = 1; i < applied.length; i++) {
    const q = applied[i]!
    if (TIER_RANK[q.tier] >= 2) {
      q.tier = 'moderate'
      q.intensity = Math.min(q.intensity, 0.6)
    }
  }
  return applied
}

export function hasQuirk(quirks: readonly AppliedQuirk[], id: string): AppliedQuirk | undefined {
  return quirks.find((q) => q.id === id)
}
