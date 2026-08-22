/**
 * Population generation.
 *
 * A sheet is not 256 independent calls to the generator. Three things happen at
 * the population level that cannot happen per-character:
 *
 *  - **Clone protection.** Every new character is compared against everyone
 *    already on the sheet. If it lands too close to an existing person, the
 *    subsystems a viewer actually notices are rerolled — not the whole
 *    character, and not so aggressively that natural resemblance disappears.
 *  - **Memorable density.** Quirks are rare per character, but across 256 rolls
 *    a run of memorable people is entirely possible. If the running proportion
 *    drifts above target, the next character's quirk layer is rerolled.
 *  - **Word uniqueness.** One shared bag hands out 256 distinct captions.
 */

import type { Mood } from './color'
import {
  generateDNA, featureVector, featureDistance,
  type CharacterDNA, type Controls, type Locks,
} from './dna'
import { express } from './phenotype'
import { WordBag } from './words'
import type { Genome } from './types'

export type GenerationMode =
  | 'random' | 'population' | 'outlier' | 'memorable'
  | 'similar' | 'same-role' | 'new-wardrobe' | 'new-condition' | 'new-quirks'

export const MODE_LABELS: Record<GenerationMode, string> = {
  random: 'Random',
  population: 'Population member',
  outlier: 'Outlier',
  memorable: 'Memorable',
  similar: 'Similar to this one',
  'same-role': 'Same role',
  'new-wardrobe': 'Same person, new wardrobe',
  'new-condition': 'Same person, new day',
  'new-quirks': 'Same person, new quirks',
}

/** Modes that only make sense relative to an existing character. */
export const RELATIVE_MODES: GenerationMode[] = [
  'similar', 'same-role', 'new-wardrobe', 'new-condition', 'new-quirks',
]

/** How a mode reshapes the controls and the lock set. */
export function modeSetup(
  mode: GenerationMode, controls: Controls, locks: Locks,
): { controls: Controls; locks: Locks } {
  const c = { ...controls }
  const l = { ...locks }
  switch (mode) {
    case 'population':
      c.variationStrength = Math.min(c.variationStrength, 0.5)
      c.memorability = Math.min(c.memorability, 0.3)
      break
    case 'outlier':
      c.variationStrength = Math.max(c.variationStrength, 0.9)
      break
    case 'memorable':
      c.memorability = Math.max(c.memorability, 0.85)
      break
    case 'similar':
      // Same person-ish: keep the skeleton, let everything else drift a little.
      c.variationStrength = Math.min(c.variationStrength, 0.28)
      l.identity = true
      l.body = true
      break
    case 'new-wardrobe':
      l.role = true; l.identity = true; l.body = true; l.face = true; l.hair = true
      break
    case 'new-condition':
      l.role = true; l.identity = true; l.body = true; l.face = true
      l.hair = true; l.wardrobe = true; l.palette = true; l.quirk = true
      break
    case 'new-quirks':
      l.role = true; l.identity = true; l.body = true; l.face = true
      l.hair = true; l.wardrobe = true; l.condition = true; l.palette = true
      break
    case 'same-role':
      l.role = true
      break
    default:
      break
  }
  return { controls: c, locks: l }
}

export interface SheetOptions {
  seed: string
  count: number
  controls: Controls
  mood: Mood
  locks?: Locks
  /** Bump to reroll every unlocked subsystem while keeping the seed. */
  generation?: number
  /** Below this feature distance two characters read as the same person. */
  cloneThreshold?: number
}

/** Sample distribution across the sheet, for the stats readout. */
export interface SheetStats {
  archetypes: Record<string, number>
  quirkCounts: number[]
  memorableShare: number
  reroots: number
  ageMean: number
}

export interface SheetResult {
  characters: Genome[]
  stats: SheetStats
}

/**
 * Generate a whole sheet. Deterministic in `seed` + controls + generation.
 */
export function generateSheet(o: SheetOptions): SheetResult {
  const words = new WordBag()
  const threshold = o.cloneThreshold ?? 0.62
  const vectors: number[][] = []
  const characters: Genome[] = []

  const stats: SheetStats = {
    archetypes: {},
    quirkCounts: [0, 0, 0, 0],
    memorableShare: 0,
    reroots: 0,
    ageMean: 0,
  }

  // Target share of characters carrying at least one quirk, from the spec's
  // 55% no-quirk baseline, scaled by the sheet's memorability and density.
  const targetQuirked = Math.min(
    0.9,
    0.45 * o.controls.quirkDensity * (0.8 + o.controls.memorability * 0.8),
  )
  let quirkedSoFar = 0

  for (let i = 0; i < o.count; i++) {
    let dna = generateDNA(o.seed, i, {
      controls: o.controls,
      mood: o.mood,
      locks: o.locks,
      generation: o.generation,
    })

    // Hold the memorable density near target across the whole sheet.
    if (dna.quirks.length > 0 && i > 8) {
      const share = quirkedSoFar / i
      if (share > targetQuirked * 1.25) {
        const plain = generateDNA(o.seed, i, {
          controls: { ...o.controls, memorability: o.controls.memorability * 0.25 },
          mood: o.mood,
          locks: o.locks,
          generation: (o.generation ?? 0) + 7,
        })
        dna = plain
        stats.reroots++
      }
    }

    // Clone protection: reroll the loud subsystems only, never the whole person.
    let vec = featureVector(dna)
    for (let attempt = 0; attempt < 3; attempt++) {
      let nearest = Infinity
      for (const other of vectors) {
        const d = featureDistance(vec, other)
        if (d < nearest) nearest = d
        if (nearest < threshold) break
      }
      if (nearest >= threshold) break
      dna = generateDNA(o.seed, i, {
        controls: o.controls,
        mood: o.mood,
        locks: { ...o.locks, role: true, identity: true },
        base: dna,
        generation: (o.generation ?? 0) + 31 * (attempt + 1),
      })
      vec = featureVector(dna)
      stats.reroots++
    }

    vectors.push(vec)
    const g = express(dna, { mood: o.mood, words })
    characters.push(g)

    stats.archetypes[g.archetypeName] = (stats.archetypes[g.archetypeName] ?? 0) + 1
    stats.quirkCounts[Math.min(3, dna.quirks.length)]!++
    if (dna.quirks.length > 0) quirkedSoFar++
    stats.ageMean += dna.identity.age
  }

  stats.memorableShare = o.count > 0 ? quirkedSoFar / o.count : 0
  stats.ageMean = o.count > 0 ? stats.ageMean / o.count : 0
  return { characters, stats }
}

/**
 * Variants of one existing character — the "same person, new X" workflows.
 * Each variant gets its own generation number, so they are stable and
 * reproducible rather than re-randomised on every view.
 */
export function generateVariants(
  base: CharacterDNA, mode: GenerationMode, count: number, mood: Mood,
): Genome[] {
  const words = new WordBag()
  const out: Genome[] = []
  for (let i = 0; i < count; i++) {
    const { controls, locks } = modeSetup(mode, base.controls, {})
    const dna = generateDNA(base.masterSeed, base.index, {
      controls,
      mood,
      locks,
      base,
      archetype: mode === 'same-role' ? base.archetype : undefined,
      generation: 101 + i,
    })
    out.push(express(dna, { mood, words }))
  }
  return out
}
