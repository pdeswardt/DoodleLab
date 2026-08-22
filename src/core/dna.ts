/**
 * Character DNA — the genotype.
 *
 * This module never draws anything. It produces a serialisable description of
 * one person, built in dependency order, where each subsystem draws from its
 * own derived seed:
 *
 *   role -> identity -> body -> face -> hair -> wardrobe -> condition
 *        -> palette -> quirks
 *
 * Two properties fall out of that structure and both matter:
 *
 *  - Rerolling one subsystem cannot disturb another. `faceSeed` is
 *    `hash(masterSeed, index, "face", salt)`, so consuming a different number
 *    of random values while generating a face leaves the wardrobe untouched.
 *  - Traits are *caused*. Shoulder width is not a random number; it is a base
 *    plus contributions from skeletal frame, muscularity and body mass. Years
 *    in a role drive garment wear. Age drives greying, thinning and eye size.
 *    Almost nothing here is sampled independently.
 */

import { Rng, seedFingerprint } from './rng'
import { clamp } from './color'
import { archetypeById, ARCHETYPES, type Archetype, type Role } from './archetypes'
import { rollQuirks, type AppliedQuirk, type QuirkContext } from './quirks'
import type {
  BrowStyle, CollarStyle, FacialHairStyle, GlassesStyle, HatStyle,
  HeadShape, LidStyle, MouthStyle, NoseStyle, PatternStyle,
} from './types'

/* ------------------------------------------------------------- subsystems */

export const SUBSYSTEMS = [
  'role', 'identity', 'body', 'face', 'hair', 'wardrobe', 'condition', 'palette', 'quirk',
] as const
export type Subsystem = (typeof SUBSYSTEMS)[number]
export type Locks = Partial<Record<Subsystem, boolean>>

/** Derived subsystem seed. `salt` lets validation reroll one layer in place. */
export function seedFor(master: string, index: number, sub: Subsystem, salt = 0): string {
  return `${master}#${index}:${sub}${salt ? `/${salt}` : ''}`
}

/* ---------------------------------------------------------------- controls */

export interface Controls {
  moodId: string
  /** -1 (cool) .. 1 (warm) bias applied to every hue decision on the sheet. */
  warmth: number
  /**
   * How far an individual may sit from the population mean, 0..1.
   * 0.5 is ordinary population spread; 1.0 is a valid outlier, never a
   * different species.
   */
  variationStrength: number
  /**
   * How likely this person is to be *memorable*, 0..1. Deliberately separate
   * from variationStrength: someone can be physically average and unforgettable,
   * or unusual-looking and completely understated.
   */
  memorability: number
  quirkDensity: number
  maxQuirks: number
  quirksEnabled: boolean
  /** 1 = spotless, 0 = filthy. */
  cleanliness: number
  /** 0 = new clothes, 1 = threadbare. */
  wear: number
  /** -1 younger population, 1 older population. */
  ageBias: number
}

export const DEFAULT_CONTROLS: Controls = {
  moodId: 'meadow',
  warmth: 0.1,
  variationStrength: 0.5,
  memorability: 0.35,
  quirkDensity: 1,
  maxQuirks: 3,
  quirksEnabled: true,
  cleanliness: 0.72,
  wear: 0.35,
  ageBias: 0,
}

/* ------------------------------------------------------------ DNA sections */

export type AgeBand = 'child' | 'youth' | 'adult' | 'elder'

export interface IdentityDNA {
  age: number
  ageBand: AgeBand
  /** Latent traits, all -1..1 unless noted. Everything physical derives from these. */
  frame: number
  mass: number
  muscularity: number
  posture: number
  /**
   * A continuous presentation axis. It is not a category and carries no
   * meaning on its own — it exists only so that jaw width, brow weight and
   * facial-hair likelihood correlate with each other the way they do in
   * real faces, instead of being drawn independently.
   */
  morph: number
  /** 0..1 */
  grooming: number
  yearsInRole: number
  /** 0..1 environmental exposure implied by the role. */
  exposure: number
  /** 0..1 how far into a long day this person is. */
  shift: number
  personality: {
    meticulous: number
    eccentric: number
    superstitious: number
    sociable: number
  }
}

export interface BodyDNA {
  shape: HeadShape
  headScale: number
  headRatio: number
  jaw: number
  crown: number
  cheek: number
  chin: number
  neck: number
  shoulderSpan: number
  slope: number
  tilt: number
  cxJitter: number
  cyJitter: number
}

export interface FaceAsymDNA {
  eyeDY: number
  eyeDR: number
  browDY: number
  earDY: number
  noseSkew: number
  mouthTilt: number
}

export interface FaceDNA {
  eyeSize: number
  eyeSpacing: number
  eyeY: number
  eyeTilt: number
  lid: LidStyle
  lashes: boolean
  iris: [number, number, number]
  pupil: number
  gazeX: number
  gazeY: number
  brow: BrowStyle
  browThick: number
  browLift: number
  browAngle: number
  nose: NoseStyle
  noseSize: number
  noseY: number
  mouth: MouthStyle
  mouthW: number
  mouthY: number
  earSize: number
  earTilt: number
  facialHair: FacialHairStyle
  freckles: number
  blush: number
  lines: number
  asym: FaceAsymDNA
}

export interface HairDNA {
  style: string
  density: number
  curl: number
  part: number
  fringe: number
  crown: number
  sides: number
  back: number
  tufts: number
  tuftLen: number
  bun: 'none' | 'top' | 'back' | 'double'
  tail: 'none' | 'low' | 'high' | 'twin'
  braids: number
  mohawk: boolean
  bald: boolean
}

export interface WardrobeDNA {
  collar: CollarStyle
  pattern: PatternStyle
  patternScale: number
  patternAngle: number
  buttons: number
  pocket: boolean
  lapel: boolean
  scarf: boolean
  hat: HatStyle
  hatTilt: number
  glasses: GlassesStyle
  earring: boolean
  necklace: boolean
}

export interface ConditionDNA {
  grime: number
  wear: number
  damage: number
  patches: number
  stains: { x: number; y: number; r: number }[]
  tired: number
}

export type Triple = [number, number, number]

export interface PaletteDNA {
  skin: Triple
  hair: Triple
  garment: Triple
  garmentAlt: Triple
  accent: Triple
  wash: Triple
  washAlt: Triple
  grime: Triple
}

export interface CharacterDNA {
  version: 2
  masterSeed: string
  index: number
  /** 16 hex digits of the 64-bit seed hash — the character's fingerprint. */
  fingerprint: string
  archetype: string
  role: string
  roleName: string
  controls: Controls
  identity: IdentityDNA
  body: BodyDNA
  face: FaceDNA
  hair: HairDNA
  wardrobe: WardrobeDNA
  condition: ConditionDNA
  palette: PaletteDNA
  quirks: AppliedQuirk[]
  /** Per-subsystem reroll salts, so a saved DNA reproduces exactly. */
  salts: Partial<Record<Subsystem, number>>
}

/* ----------------------------------------------------------------- stage 1 */

interface RoleChoice {
  archetype: Archetype
  role: Role
}

function genRole(rng: Rng, forced?: string): RoleChoice {
  const archetype = forced ? archetypeById(forced) : rng.pick(ARCHETYPES)
  return { archetype, role: rng.pick(archetype.roles) }
}

/* ----------------------------------------------------------------- stage 2 */

const AGE_RANGES: Record<AgeBand, [number, number]> = {
  child: [7, 13],
  youth: [14, 24],
  adult: [25, 54],
  elder: [55, 82],
}

function genIdentity(rng: Rng, a: Archetype, role: Role, c: Controls): IdentityDNA {
  // Age: a weighted band, then a normal draw inside it. The band weights are
  // tilted by both the sheet-wide age bias and the role's own bias, because a
  // festival errand-runner and an emeritus scholar are not the same draw.
  const bias = c.ageBias + role.ageBias * 0.6
  const bandWeights: [AgeBand, number][] = [
    ['child', 0.08], ['youth', 0.2], ['adult', 0.54], ['elder', 0.18],
  ]
  const tilted = bandWeights.map(([b, w], i) => [b, w * Math.exp(bias * 0.9 * (i - 1.4))] as const)
  const ageBand = rng.weighted(tilted)
  const [lo, hi] = AGE_RANGES[ageBand]
  const age = Math.round(clamp(rng.gauss((lo + hi) / 2, (hi - lo) / 4.2), lo, hi))

  const v = 0.45 + c.variationStrength * 1.1

  // Latent build traits. Mass and muscularity are mildly correlated with each
  // other and with age; frame is largely independent, as skeletons are.
  const frame = clamp(rng.gauss(0, 0.38 * v), -1, 1)
  const muscularity = clamp(
    rng.gauss(0.05 + frame * 0.18, 0.34 * v) * (ageBand === 'child' ? 0.5 : ageBand === 'elder' ? 0.7 : 1),
    -1, 1,
  )
  const mass = clamp(rng.gauss(frame * 0.22 + (ageBand === 'elder' ? 0.12 : 0), 0.4 * v), -1, 1)
  const posture = clamp(rng.gauss(ageBand === 'elder' ? -0.25 : 0.1, 0.35 * v), -1, 1)

  const morph = clamp(rng.gauss(0, 0.55), -1, 1)

  // Years in role can never exceed a plausible working life, and children are
  // not veterans of anything.
  const workingYears = Math.max(0, age - (ageBand === 'child' ? 5 : 15))
  const yearsInRole = ageBand === 'child'
    ? 0
    : Math.round(clamp(rng.logNormal(Math.max(0.6, workingYears * 0.4), 0.62), 0, workingYears))

  const exposure = clamp(a.exposure * role.exposure * rng.range(0.75, 1.2), 0, 1)

  return {
    age, ageBand, frame, mass, muscularity, posture, morph,
    grooming: clamp(rng.gauss(0.58 - exposure * 0.16, 0.22), 0, 1),
    yearsInRole,
    exposure,
    shift: clamp(rng.next() ** 1.4, 0, 1),
    personality: {
      meticulous: clamp(rng.gauss(0.5, 0.22), 0, 1),
      eccentric: clamp(rng.gauss(0.42, 0.24), 0, 1),
      superstitious: clamp(rng.gauss(0.4, 0.24), 0, 1),
      sociable: clamp(rng.gauss(0.52, 0.23), 0, 1),
    },
  }
}

/* ----------------------------------------------------------------- stage 3 */

function genBody(rng: Rng, id: IdentityDNA, c: Controls): BodyDNA {
  const v = 0.4 + c.variationStrength * 1.2

  // Head shape is weighted by frame and morph rather than picked flat: broad
  // frames square off, slight frames taper.
  const shape = rng.weighted<HeadShape>([
    ['round', 3 + (1 - Math.abs(id.frame)) * 2],
    ['pear', 2 + Math.max(0, id.mass) * 2.5],
    ['square', 1.6 + Math.max(0, id.frame) * 3 + Math.max(0, id.morph) * 1.5],
    ['egg', 2 + Math.max(0, -id.frame) * 2],
    ['acorn', 1.6 + Math.max(0, -id.mass) * 2],
    ['moon', 1.4 + Math.max(0, id.mass) * 2],
  ])

  // Children have proportionally larger heads; that is the single strongest
  // age cue available in a bust.
  const ageHead = id.ageBand === 'child' ? 1.1 : id.ageBand === 'youth' ? 1.04 : 1
  const headScale = clamp(ageHead * (1 + id.frame * 0.05 + rng.gauss(0, 0.05 * v)), 0.82, 1.24)

  // Derived, not sampled: every one of these is a base plus contributions.
  const jaw = clamp(
    1 + id.frame * 0.1 + id.muscularity * 0.07 + id.mass * 0.11 + id.morph * 0.09 + rng.gauss(0, 0.05 * v),
    0.74, 1.34,
  )
  const cheek = clamp(
    1 + id.mass * 0.2 + (id.ageBand === 'child' ? 0.16 : 0) - Math.max(0, id.age - 55) * 0.004 + rng.gauss(0, 0.07 * v),
    0.76, 1.4,
  )
  const shoulderSpan = clamp(
    1.95 + id.frame * 0.22 + id.muscularity * 0.16 + id.mass * 0.12 -
      (id.ageBand === 'child' ? 0.3 : 0) + rng.gauss(0, 0.09 * v),
    1.5, 2.6,
  )

  return {
    shape, headScale,
    headRatio: clamp(1.04 + rng.gauss(0, 0.05 * v) - id.mass * 0.04, 0.9, 1.2),
    jaw, crown: clamp(1 + rng.gauss(0, 0.06 * v) - id.mass * 0.03, 0.8, 1.24),
    cheek,
    chin: clamp(1 + id.morph * 0.06 + rng.gauss(0, 0.06 * v), 0.84, 1.2),
    neck: clamp(0.5 + id.muscularity * 0.09 + id.mass * 0.07 + rng.gauss(0, 0.04 * v), 0.36, 0.72),
    shoulderSpan,
    slope: clamp(0.3 - id.posture * 0.1 + id.muscularity * 0.05 + rng.gauss(0, 0.05), 0.12, 0.48),
    // Posture shows up as a small lean; slumped people tip slightly further.
    tilt: rng.gauss(-id.posture * 0.01, 0.035 + c.variationStrength * 0.04),
    cxJitter: rng.gauss(0, 2.2 + c.variationStrength * 2.4),
    cyJitter: rng.gauss(0, 3),
  }
}

/* ----------------------------------------------------------------- stage 4 */

function genFace(rng: Rng, id: IdentityDNA, body: BodyDNA, a: Archetype, c: Controls): FaceDNA {
  const v = 0.4 + c.variationStrength * 1.2
  const young = id.ageBand === 'child' ? 1 : id.ageBand === 'youth' ? 0.55 : 0
  const old = clamp((id.age - 46) / 36, 0, 1)

  // Stylised but consistent: younger faces get larger eyes set lower, which is
  // the same cue the reference uses to read as gentle rather than severe.
  const eyeSize = clamp(0.175 + young * 0.03 - old * 0.018 + rng.gauss(0, 0.02 * v), 0.12, 0.245)

  // A tired character is likelier to be caught mid-blink.
  const lid = rng.weighted<LidStyle>([
    ['open', 5],
    ['wide', 2 + young * 1.5],
    ['half', 1.6 + id.shift * 3],
    ['squint', 1.4 + old * 1.6],
    ['sparkle', 1 + young],
    ['wink', 0.7 + id.personality.sociable],
    ['closed', 0.5 + id.shift * 1.2],
    ...a.lids.map((l) => [l, 2.2] as const),
  ])

  const mouth = rng.weighted<MouthStyle>([
    ['smile', 3.4 + id.personality.sociable * 2],
    ['grin', 2 + young * 1.5],
    ['flat', 2 + old],
    ['smirk', 1.6 + id.personality.eccentric],
    ['ohh', 1.1], ['toothy', 1.1 + young], ['pout', 0.9], ['whistle', 0.6],
    ...a.mouths.map((m) => [m, 2] as const),
  ])

  // Brow weight tracks the same latent axis as jaw width and facial hair.
  const browThick = clamp(0.85 + id.morph * 0.4 + old * 0.25 + rng.gauss(0, 0.18 * v), 0.45, 1.9)

  // Facial hair is impossible before adulthood, likelier along the morph axis,
  // and tidier at high grooming.
  const facialHair: FacialHairStyle = id.age < 17
    ? 'none'
    : rng.weighted<FacialHairStyle>([
      ['none', 8 - id.morph * 3],
      ['stubble', 1.6 + id.morph * 2 + (1 - id.grooming) * 1.6],
      ['moustache', 1 + id.morph * 1.4 + old],
      ['goatee', 0.8 + id.morph * 1.2],
      ['beard', 0.9 + id.morph * 2 + (1 - id.grooming) * 1.2],
      ['muttonchops', 0.35 + id.morph * 0.6],
      ['fluff', 0.6 + Math.max(0, -id.morph)],
    ])

  const asymScale = 0.4 + c.variationStrength * 1.3
  return {
    eyeSize,
    // Eye spacing follows the width of the face it sits on, rather than being
    // sampled independently of the skull it has to fit inside.
    eyeSpacing: clamp(0.53 + (body.cheek - 1) * 0.06 + rng.gauss(0, 0.032 * v), 0.42, 0.64),
    eyeY: clamp(0.09 + young * 0.03 + rng.gauss(0, 0.032 * v), 0.0, 0.19),
    eyeTilt: rng.gauss(0, 0.075 * v),
    lid,
    lashes: rng.bool(0.42 + Math.max(0, -id.morph) * 0.2),
    iris: rng.weighted<Triple>([
      [[28, 45, 28], 3], [[30, 38, 20], 3], [[120, 30, 34], 2],
      [[205, 42, 44], 2], [[38, 50, 40], 1.6], [[180, 30, 36], 1],
      [[280, 30, 40], 0.6], [[0, 0, 26], 1.4],
    ]),
    pupil: clamp(rng.gauss(0.55, 0.05), 0.4, 0.7),
    gazeX: rng.gauss(0, 0.26),
    gazeY: rng.gauss(-0.08, 0.18),
    brow: rng.weighted<BrowStyle>([
      ['soft', 4], ['bushy', 1.4 + id.morph * 2 + old], ['thin', 2 - id.morph],
      ['arched', 2], ['straight', 1.8 + id.morph], ['worried', 1.2],
    ]),
    browThick,
    browLift: clamp(rng.gauss(0.62, 0.12 * v), 0.35, 0.95),
    browAngle: rng.gauss(0, 0.12 * v),
    nose: rng.weighted<NoseStyle>([
      ['button', 4 + young * 2], ['upturned', 2.2], ['blob', 1.8 + id.mass],
      ['broad', 1.4 + id.mass * 1.2 + id.morph], ['beak', 1.2 + old], ['long', 0.9 + old],
    ]),
    noseSize: clamp(1 + id.morph * 0.12 + old * 0.12 - young * 0.15 + rng.gauss(0, 0.12 * v), 0.7, 1.45),
    noseY: clamp(0.36 + rng.gauss(0, 0.028 * v), 0.28, 0.45),
    mouth,
    mouthW: clamp(rng.gauss(1, 0.14 * v), 0.7, 1.45),
    mouthY: clamp(0.58 + rng.gauss(0, 0.03 * v), 0.5, 0.68),
    earSize: clamp(1 + old * 0.16 + rng.gauss(0, 0.11 * v), 0.72, 1.42),
    earTilt: rng.gauss(0, 0.13),
    facialHair,
    freckles: rng.bool(0.34 - old * 0.15) ? rng.range(0.3, 1) : 0,
    blush: rng.bool(0.66) ? rng.range(0.25, 0.9) : 0,
    lines: clamp(old * rng.range(0.6, 1.1), 0, 1),
    // Subtle by construction: these are fractions of a millimetre at print size.
    asym: {
      eyeDY: rng.gauss(0, 0.55) * asymScale,
      eyeDR: rng.gauss(0, 0.035) * asymScale,
      browDY: rng.gauss(0, 0.9) * asymScale,
      earDY: rng.gauss(0, 1.1) * asymScale,
      noseSkew: rng.gauss(0, 0.5) * asymScale,
      mouthTilt: rng.gauss(0, 0.035) * asymScale,
    },
  }
}

/* ----------------------------------------------------------------- stage 5 */

const HAIR_PRESETS: Record<string, Partial<HairDNA>> = {
  swoop: { back: 0.5, crown: 0.42, sides: 0.3, tufts: 3, tuftLen: 12, fringe: 0.55, curl: 0.15, part: -0.5 },
  curls: { back: 0.8, crown: 0.5, sides: 0.75, tufts: 6, tuftLen: 8, fringe: 0.4, curl: 0.95 },
  bob: { back: 0.85, crown: 0.24, sides: 0.95, tufts: 1, tuftLen: 7, fringe: 0.85, curl: 0.2 },
  bun: { back: 0.5, crown: 0.2, sides: 0.28, tufts: 3, tuftLen: 10, fringe: 0.3, curl: 0.3, bun: 'top' },
  buzz: { back: 0.16, crown: 0.1, sides: 0.2, tufts: 0, tuftLen: 4, fringe: 0.15, curl: 0.5 },
  bald: { back: 0, crown: 0, sides: 0.12, tufts: 0, tuftLen: 3, fringe: 0, curl: 0, bald: true },
  afro: { back: 0.95, crown: 0.85, sides: 0.8, tufts: 2, tuftLen: 6, fringe: 0.25, curl: 1 },
  ponytail: { back: 0.42, crown: 0.26, sides: 0.3, tufts: 2, tuftLen: 11, fringe: 0.35, curl: 0.25, tail: 'high' },
  mohawk: { back: 0.2, crown: 0.95, sides: 0.14, tufts: 5, tuftLen: 15, fringe: 0.1, curl: 0.4, mohawk: true },
  long: { back: 1.05, crown: 0.3, sides: 1.25, tufts: 3, tuftLen: 16, fringe: 0.5, curl: 0.35 },
  pigtails: { back: 0.5, crown: 0.25, sides: 0.45, tufts: 2, tuftLen: 9, fringe: 0.75, curl: 0.4, tail: 'twin' },
  topknot: { back: 0.35, crown: 0.18, sides: 0.22, tufts: 4, tuftLen: 13, fringe: 0.2, curl: 0.3, bun: 'top' },
  fringe: { back: 0.6, crown: 0.28, sides: 0.6, tufts: 1, tuftLen: 6, fringe: 1, curl: 0.1 },
  wild: { back: 0.7, crown: 0.75, sides: 0.6, tufts: 9, tuftLen: 18, fringe: 0.45, curl: 0.6 },
  braids: { back: 0.55, crown: 0.28, sides: 0.5, tufts: 1, tuftLen: 8, fringe: 0.6, curl: 0.35, braids: 2 },
  waves: { back: 0.85, crown: 0.44, sides: 0.95, tufts: 4, tuftLen: 12, fringe: 0.45, curl: 0.62 },
}

export const HAIR_STYLES = Object.keys(HAIR_PRESETS)

function genHair(rng: Rng, id: IdentityDNA, a: Archetype, c: Controls): HairDNA {
  const old = clamp((id.age - 45) / 40, 0, 1)
  // Thinning is age- and morph-linked, and children never get it.
  const thinning = id.ageBand === 'child' ? 0 : old * (0.35 + Math.max(0, id.morph) * 0.5)

  const weights: [string, number][] = HAIR_STYLES.map((s) => {
    let w = 1
    if (a.hair.includes(s)) w += 2.6
    if (s === 'bald') w = thinning * 6
    if (s === 'buzz') w = 1 + thinning * 3 + (1 - id.grooming) * 1.2
    if (s === 'wild') w += (1 - id.grooming) * 2.6
    if (s === 'mohawk') w *= 0.5 + id.personality.eccentric * 1.8
    if ((s === 'pigtails' || s === 'braids') && id.ageBand === 'child') w += 2
    if (s === 'long' || s === 'waves') w *= 1 - thinning * 0.7
    return [s, Math.max(0.02, w)]
  })

  const style = rng.weighted(weights)
  const preset = HAIR_PRESETS[style]!
  const v = 0.5 + c.variationStrength * 1.1
  // Tidy people have less stray hair; weathered people have more.
  const messiness = clamp(1 - id.grooming + id.exposure * 0.3, 0, 1.6)
  const j = (value: number, sd: number): number => Math.max(0, value + rng.gauss(0, sd * v))

  const density = clamp(1 - thinning * 0.8 + rng.gauss(0, 0.12), 0.15, 1.2)

  return {
    style,
    density,
    curl: clamp(j(preset.curl ?? 0.3, 0.13), 0, 1),
    part: preset.part ?? rng.range(-0.7, 0.7),
    fringe: clamp(j(preset.fringe ?? 0.5, 0.12), 0, 1),
    crown: j(preset.crown ?? 0.3, 0.08) * density,
    sides: j(preset.sides ?? 0.4, 0.1),
    back: j(preset.back ?? 0.5, 0.09) * density,
    tufts: Math.round(rng.poisson((preset.tufts ?? 2) * (0.5 + messiness))),
    tuftLen: j(preset.tuftLen ?? 9, 2),
    bun: preset.bun ?? 'none',
    tail: preset.tail ?? 'none',
    braids: preset.braids ?? 0,
    mohawk: preset.mohawk ?? false,
    bald: preset.bald ?? false,
  }
}

/** How tall the hair stands — the number hat compatibility is decided on. */
export function hairHeight(h: HairDNA): number {
  return h.crown + (h.bun === 'top' || h.bun === 'double' ? 0.5 : 0) + (h.mohawk ? 1 : 0)
}

/* ----------------------------------------------------------------- stage 6 */

function genWardrobe(rng: Rng, id: IdentityDNA, hair: HairDNA, a: Archetype, c: Controls): WardrobeDNA {
  const collar = rng.weighted<CollarStyle>([
    ['buttonup', 3], ['crew', 2.6], ['vneck', 1.6], ['turtleneck', 1.6],
    ['overalls', 1.4], ['apron', 1.3], ['hoodie', 1.3], ['sailor', 1],
    ['robe', 0.9], ['ruffle', 0.9],
    ...a.collars.map((x) => [x, 3.2] as const),
  ])

  // Headwear must fit the hair. Fitted caps cannot go over a mohawk or a top
  // bun; loose or brimmed hats can.
  const tall = hairHeight(hair)
  const hatWeights: (readonly [HatStyle, number])[] = [
    ['none', 5],
    ['beanie', tall > 0.75 ? 0 : 1.8],
    ['cap', tall > 0.8 ? 0 : 1.8],
    ['beret', tall > 1.1 ? 0 : 1.5],
    ['sunhat', tall > 1.3 ? 0 : 1.4],
    ['band', 2],
    ['kerchief', tall > 1.2 ? 0 : 1.4],
    ['crown', 0.7],
    ['boat', tall > 1.1 ? 0 : 0.6],
    ...a.hats.map((h) => [h, 2.6] as const),
  ]
  const hat = rng.weighted(hatWeights.filter(([h, w]) => w > 0 || h === 'none'))

  const glasses = rng.weighted<GlassesStyle>([
    ['none', 6],
    ['round', 2.6 + id.personality.meticulous],
    ['square', 1.6], ['halfmoon', 0.8 + clamp((id.age - 45) / 30, 0, 1) * 2],
    ['cateye', 0.9], ['goggles', 0.7 + id.exposure], ['monocle', 0.3 + (a.id === 'grandee' ? 1.5 : 0)],
  ])

  const buttons = collar === 'buttonup' || collar === 'overalls'
    ? rng.int(2, 4)
    : rng.bool(0.28) ? rng.int(1, 2) : 0

  return {
    collar,
    pattern: rng.weighted<PatternStyle>([
      ['none', 5], ['stripe', 2.2], ['plaid', 2], ['dot', 1.5],
      ['knit', 1.5 + (collar === 'turtleneck' ? 2 : 0)], ['check', 1.3],
      ['speck', 1.1], ['zigzag', 0.8],
    ]),
    patternScale: rng.range(0.7, 1.5),
    patternAngle: rng.gauss(0, 0.25),
    buttons,
    pocket: rng.bool(0.42),
    lapel: collar === 'buttonup' && rng.bool(0.5),
    // A scarf over a turtleneck is too much bulk for this silhouette.
    scarf: collar !== 'turtleneck' && rng.bool(0.18 + c.memorability * 0.14),
    hat,
    hatTilt: rng.gauss(0, 0.13),
    glasses,
    earring: rng.bool(0.22 + c.memorability * 0.1),
    necklace: rng.bool(0.16),
  }
}

/* ----------------------------------------------------------------- stage 7 */

function genCondition(rng: Rng, id: IdentityDNA, c: Controls): ConditionDNA {
  // Wear is a consequence, not a setting: exposure and years in the role do
  // most of the work, and the sheet-wide sliders only scale the result.
  const service = clamp(id.yearsInRole / 22, 0, 1)
  const dirtiness = clamp(
    (1 - c.cleanliness) * 0.7 + id.exposure * 0.4 + id.shift * 0.25 - id.personality.meticulous * 0.2,
    0, 1,
  )
  const worn = clamp(c.wear * 0.6 + service * 0.5 + id.exposure * 0.25, 0, 1)

  // Stains are log-normal in size and Poisson in count: usually a couple of
  // small ones, occasionally one big memorable mark.
  const stainCount = rng.poisson(dirtiness * 2.6)
  const stains: ConditionDNA['stains'] = []
  for (let i = 0; i < Math.min(6, stainCount); i++) {
    stains.push({
      // Biased low and toward the centre-front, where a person actually
      // wipes their hands and leans against things.
      x: rng.gauss(0, 0.42),
      y: clamp(rng.range(0.25, 1), 0, 1),
      r: rng.logNormal(4 + dirtiness * 4, 0.55),
    })
  }

  return {
    grime: dirtiness,
    wear: worn,
    damage: clamp(worn * rng.range(0.2, 0.9) - id.personality.meticulous * 0.2, 0, 1),
    patches: rng.poisson(service * 1.4 * (0.5 + id.personality.meticulous)),
    stains,
    tired: clamp(id.shift * 0.8 + rng.gauss(0, 0.15), 0, 1),
  }
}

/* ----------------------------------------------------------------- stage 8 */

const SKIN_TONES: Triple[] = [
  [28, 48, 88], [26, 52, 83], [24, 50, 77], [22, 46, 70],
  [20, 44, 62], [18, 42, 54], [16, 40, 45], [14, 38, 37],
  [12, 36, 30], [30, 40, 92], [34, 34, 86], [10, 30, 26],
  [20, 30, 66], [32, 44, 80], [16, 34, 42],
]

const HAIR_TONES: Triple[] = [
  [28, 30, 18], [24, 34, 26], [26, 40, 36], [30, 46, 48],
  [36, 55, 60], [40, 62, 70], [16, 48, 34], [12, 55, 42],
  [22, 20, 30], [8, 40, 22],
]

const FANCY_HAIR_TONES: Triple[] = [
  [200, 45, 58], [280, 38, 58], [330, 46, 64], [150, 38, 52], [20, 70, 56], [50, 65, 62],
]

interface MoodSpec {
  hues: [number, number][]
  sat: [number, number]
  light: [number, number]
  washSat: number
}

function genPalette(
  rng: Rng, id: IdentityDNA, a: Archetype, mood: MoodSpec, c: Controls,
): PaletteDNA {
  const skinBase = rng.pick(SKIN_TONES)
  const skin: Triple = [
    skinBase[0] + rng.gauss(0, 4),
    skinBase[1] + rng.gauss(0, 3),
    // Weathered skin reads slightly deeper and ruddier.
    skinBase[2] + rng.gauss(0, 2.5) - id.exposure * 3,
  ]

  // Greying is age-driven and gradual, never a switch.
  const grey = clamp((id.age - 38) / 34, 0, 1) * rng.range(0.5, 1.3)
  const hairBase = rng.bool(0.08 + c.memorability * 0.2) ? rng.pick(FANCY_HAIR_TONES) : rng.pick(HAIR_TONES)
  const hair: Triple = [
    hairBase[0] + rng.gauss(0, 5),
    hairBase[1] * (1 - clamp(grey, 0, 1) * 0.85) + 8 + rng.gauss(0, 4),
    hairBase[2] + clamp(grey, 0, 1) * (78 - hairBase[2]) + rng.gauss(0, 4),
  ]

  // Garment hue lives inside the mood's bands, pulled by the archetype and the
  // sheet's warmth control. Nothing is sampled outside the approved palette.
  const bands = a.hue && rng.bool(0.6) ? [a.hue] : mood.hues
  const [lo, hi] = rng.pick(bands)
  let gh = rng.range(lo, hi)
  const target = c.warmth >= 0 ? 30 : 215
  let dh = target - gh
  if (dh > 180) dh -= 360
  if (dh < -180) dh += 360
  gh += dh * Math.abs(c.warmth) * 0.3

  const garment: Triple = [gh, rng.range(mood.sat[0], mood.sat[1]), rng.range(mood.light[0], mood.light[1])]

  // The second garment colour is a harmony, not a fresh sample.
  const shift = rng.weighted<number>([
    [rng.range(18, 42), 3], [rng.range(150, 210), 1.4], [rng.range(-42, -18), 2],
  ])
  const garmentAlt: Triple = [gh + shift, garment[1] * rng.range(0.6, 1.05), garment[2] + rng.range(-14, 16)]

  const accent: Triple = [gh + rng.sign() * rng.range(120, 180), rng.range(45, 78), rng.range(46, 66)]

  // The wash must stay far lighter than anything in front of it, and leans
  // complementary so the figure separates from its own background.
  const wh = gh + rng.sign() * rng.range(40, 150)
  const wash: Triple = [wh, rng.range(12, 30) * mood.washSat, rng.range(80, 92)]
  const washAlt: Triple = [wh + rng.sign() * rng.range(25, 70), wash[1] * rng.range(0.7, 1.2), wash[2] + rng.range(-4, 5)]

  // Grime takes its hue from the working environment, which is why a sailor's
  // dirt is grey-blue and an orchard keeper's is brown-green.
  const grimeHue = a.id === 'sailor' ? 205 : a.id === 'botanist' || a.id === 'keeper' ? 70 : a.id === 'tinkerer' ? 30 : 40
  const grime: Triple = [grimeHue + rng.gauss(0, 12), rng.range(8, 24), rng.range(28, 46)]

  return { skin, hair, garment, garmentAlt, accent, wash, washAlt, grime }
}

/* ------------------------------------------------------------- validation */

export interface ValidationIssue {
  subsystem: Subsystem
  reason: string
}

/**
 * Reject combinations that are implausible or that break the archetype.
 *
 * Anything that fails causes *only its own subsystem* to be regenerated with a
 * new salt, which is far cheaper than throwing the whole character away and
 * keeps every other trait stable.
 */
export function validate(dna: CharacterDNA): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const { body, face, hair, wardrobe, quirks, palette, identity } = dna

  // Anatomy: proportions must stay inside the archetype's stylised range.
  if (body.shoulderSpan < 1.45 || body.shoulderSpan > 2.7) {
    issues.push({ subsystem: 'body', reason: 'shoulder span outside archetype range' })
  }
  if (body.headScale < 0.8 || body.headScale > 1.28) {
    issues.push({ subsystem: 'body', reason: 'head scale outside archetype range' })
  }
  // The eyes have to fit on the head, with room for the ears.
  if (face.eyeSpacing + face.eyeSize > 0.84) {
    issues.push({ subsystem: 'face', reason: 'eyes do not fit within the skull' })
  }
  if (identity.age < 17 && face.facialHair !== 'none') {
    issues.push({ subsystem: 'face', reason: 'facial hair on a child' })
  }

  // Wardrobe compatibility.
  const tall = hairHeight(hair)
  const fitted: HatStyle[] = ['beanie', 'cap']
  if (fitted.includes(wardrobe.hat) && tall > 0.8) {
    issues.push({ subsystem: 'wardrobe', reason: 'fitted hat over standing hair' })
  }
  if (wardrobe.scarf && wardrobe.collar === 'turtleneck') {
    issues.push({ subsystem: 'wardrobe', reason: 'scarf over a turtleneck reads as bulk' })
  }
  if (wardrobe.glasses === 'goggles' && wardrobe.hat === 'crown') {
    issues.push({ subsystem: 'wardrobe', reason: 'goggles with a crown breaks the archetype' })
  }

  // Quirks: never more than one loud one, never over the cap.
  if (quirks.length > dna.controls.maxQuirks) {
    issues.push({ subsystem: 'quirk', reason: 'too many quirks' })
  }
  if (quirks.filter((q) => q.tier === 'strong' || q.tier === 'extreme').length > 1) {
    issues.push({ subsystem: 'quirk', reason: 'competing loud quirks' })
  }
  if (quirks.some((q) => q.id === 'ear-defenders') && quirks.some((q) => q.id.includes('pencil'))) {
    issues.push({ subsystem: 'quirk', reason: 'ear slot double-booked' })
  }

  // Palette: the figure must separate from its own background.
  if (Math.abs(palette.garment[2] - palette.wash[2]) < 16) {
    issues.push({ subsystem: 'palette', reason: 'garment and wash too close in value' })
  }
  if (palette.wash[2] < 74) {
    issues.push({ subsystem: 'palette', reason: 'background wash too dark to sit behind the figure' })
  }

  return issues
}

/* ------------------------------------------------------------- generation */

export interface GenerateOptions {
  controls: Controls
  mood: MoodSpec
  /** Subsystems to carry over unchanged from `base`. */
  locks?: Locks
  base?: CharacterDNA
  /** Force a specific archetype — used by the "same role" generation mode. */
  archetype?: string
  /** Extra salt applied to every subsystem, for "reroll everything but X". */
  generation?: number
}

/**
 * Build one character.
 *
 * Locked subsystems are copied from `base` verbatim; everything else is
 * generated in dependency order and then validated, with failing layers
 * regenerated individually.
 */
export function generateDNA(
  masterSeed: string, index: number, o: GenerateOptions,
): CharacterDNA {
  const locks = o.locks ?? {}
  const base = o.base
  const gen = o.generation ?? 0
  const c = o.controls
  const salts: Partial<Record<Subsystem, number>> = { ...(base?.salts ?? {}) }

  const rngFor = (sub: Subsystem, salt: number): Rng =>
    new Rng(seedFor(masterSeed, index, sub, salt + gen * 1000))

  const held = <T>(sub: Subsystem, value: T | undefined, make: () => T): T =>
    (locks[sub] && value !== undefined ? value : make())

  // 1. Role.
  const roleChoice = locks.role && base
    ? { archetype: archetypeById(base.archetype), role: archetypeById(base.archetype).roles.find((r) => r.id === base.role) ?? archetypeById(base.archetype).roles[0]! }
    : genRole(rngFor('role', salts.role ?? 0), o.archetype)
  const a = roleChoice.archetype
  const role = roleChoice.role

  // 2-8. Everything else, each from its own stream.
  let identity = held('identity', base?.identity, () => genIdentity(rngFor('identity', salts.identity ?? 0), a, role, c))
  let body = held('body', base?.body, () => genBody(rngFor('body', salts.body ?? 0), identity, c))
  let face = held('face', base?.face, () => genFace(rngFor('face', salts.face ?? 0), identity, body, a, c))
  let hair = held('hair', base?.hair, () => genHair(rngFor('hair', salts.hair ?? 0), identity, a, c))
  let wardrobe = held('wardrobe', base?.wardrobe, () => genWardrobe(rngFor('wardrobe', salts.wardrobe ?? 0), identity, hair, a, c))
  let condition = held('condition', base?.condition, () => genCondition(rngFor('condition', salts.condition ?? 0), identity, c))
  let palette = held('palette', base?.palette, () => genPalette(rngFor('palette', salts.palette ?? 0), identity, a, o.mood, c))

  // 9. Quirks, last, because they depend on everything above.
  const quirkCtx = (): QuirkContext => ({
    age: identity.age,
    yearsInRole: identity.yearsInRole,
    grooming: identity.grooming,
    exposure: identity.exposure,
    archetype: a.id,
    role: role.id,
    personality: identity.personality,
  })
  let quirks = held('quirk', base?.quirks, () => rollQuirks(rngFor('quirk', salts.quirk ?? 0), quirkCtx(), {
    memorability: c.memorability,
    density: c.quirkDensity,
    maxQuirks: c.maxQuirks,
    enabled: c.quirksEnabled,
  }))
  // Archetype-preferred quirks get a second chance at appearing, which is what
  // makes a botanist feel like a botanist rather than a person with a plant.
  if (quirks.length > 0) {
    const pref = rngFor('quirk', (salts.quirk ?? 0) + 500)
    if (pref.bool(0.35) && a.quirks.length > 0) {
      const wanted = pref.pick(a.quirks)
      if (!quirks.some((q) => q.id === wanted)) {
        const swapped = rollQuirks(pref, quirkCtx(), {
          memorability: c.memorability, density: c.quirkDensity,
          maxQuirks: c.maxQuirks, enabled: c.quirksEnabled,
        })
        if (swapped.length > 0) quirks = swapped
      }
    }
  }

  const build = (): CharacterDNA => ({
    version: 2,
    masterSeed,
    index,
    fingerprint: seedFingerprint(`${masterSeed}#${index}`),
    archetype: a.id,
    role: role.id,
    roleName: role.name,
    controls: c,
    identity, body, face, hair, wardrobe, condition, palette, quirks,
    salts,
  })

  // Validate, and reroll only what fails.
  let dna = build()
  for (let attempt = 0; attempt < 6; attempt++) {
    const issues = validate(dna)
    if (issues.length === 0) break
    for (const issue of issues) {
      const sub = issue.subsystem
      if (locks[sub]) continue
      salts[sub] = (salts[sub] ?? 0) + 1
      const salt = salts[sub]!
      switch (sub) {
        case 'identity': identity = genIdentity(rngFor('identity', salt), a, role, c); break
        case 'body': body = genBody(rngFor('body', salt), identity, c); break
        case 'face': face = genFace(rngFor('face', salt), identity, body, a, c); break
        case 'hair': hair = genHair(rngFor('hair', salt), identity, a, c); break
        case 'wardrobe': wardrobe = genWardrobe(rngFor('wardrobe', salt), identity, hair, a, c); break
        case 'condition': condition = genCondition(rngFor('condition', salt), identity, c); break
        case 'palette': palette = genPalette(rngFor('palette', salt), identity, a, o.mood, c); break
        case 'quirk':
          quirks = rollQuirks(rngFor('quirk', salt), quirkCtx(), {
            memorability: c.memorability, density: c.quirkDensity,
            maxQuirks: c.maxQuirks, enabled: c.quirksEnabled,
          })
          break
        default: break
      }
    }
    dna = build()
  }
  return dna
}

/* ---------------------------------------------------------- serialisation */

/**
 * A character's DNA as a shareable string. Round-trips exactly, so a saved
 * string always reproduces the same person — the reproducibility guarantee the
 * whole system rests on.
 */
export function encodeDNA(dna: CharacterDNA): string {
  const json = JSON.stringify(dna)
  const bytes = new TextEncoder().encode(json)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function decodeDNA(text: string): CharacterDNA | null {
  try {
    const trimmed = text.trim()
    if (trimmed.startsWith('{')) return JSON.parse(trimmed) as CharacterDNA
    const b64 = trimmed.replace(/-/g, '+').replace(/_/g, '/')
    const bin = atob(b64)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    const dna = JSON.parse(new TextDecoder().decode(bytes)) as CharacterDNA
    return dna.version === 2 ? dna : null
  } catch {
    return null
  }
}

/**
 * A comparable summary of a character, used to catch accidental clones.
 * Deliberately weighted toward what a viewer actually notices first:
 * silhouette, colour and the loudest features.
 */
export function featureVector(dna: CharacterDNA): number[] {
  const { body, face, hair, wardrobe, palette } = dna
  const style = HAIR_STYLES.indexOf(hair.style) / HAIR_STYLES.length
  return [
    body.headScale * 2, body.shoulderSpan * 0.8, body.jaw, body.cheek,
    face.eyeSize * 6, face.eyeSpacing * 3, face.noseSize, face.mouthW,
    style * 2, hair.curl, hair.crown, hair.sides,
    palette.skin[2] / 60, palette.hair[0] / 240, palette.hair[2] / 60,
    palette.garment[0] / 200, palette.garment[2] / 70,
    wardrobe.collar.length / 10, wardrobe.pattern.length / 10,
  ]
}

export function featureDistance(a: number[], b: number[]): number {
  let sum = 0
  for (let i = 0; i < a.length; i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0)
    sum += d * d
  }
  return Math.sqrt(sum)
}
