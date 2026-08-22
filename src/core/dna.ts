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
  BeardGeom, BrowGeom, BrowStyle, CollarSpec, CollarStyle, EyeGeom, EyeShape,
  FaceGeom, FacialHairStyle, GlassesSpec, GlassesStyle, HatSpec, HatStyle,
  HatTrim, HeadFamily, HeadShape, LidStyle, MouthGeom, MouthStyle, NoseGeom,
  NoseStyle, PatternStyle, ShoulderStyle,
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
  family: HeadFamily
  /** Half-width multipliers at crown, upper temple, temple, cheek, jaw, chin. */
  profile: number[]
  headNx: number
  headAsym: number
  facet: boolean
  shoulderStyle: ShoulderStyle
  shoulderRise: [number, number]
  shoulderRound: number
  headScale: number
  /** Suggestion of a three-quarter turn, -1 (their right) .. 1. */
  turn: number
  /** How large this figure is drawn within its frame. */
  frameScale: number
  /** How low the bust is cut off by the frame. */
  cropDepth: number
  /** How hard this one was pressed. */
  pressure: number
  /** How loose the wrist was. */
  lineWobble: number
  /** Which way the hatching runs, as an offset in radians. */
  hatchAngle: number
  /** How finished it is — heavier contours and firmer edges at the top end. */
  finish: number
  /** How blunt the pencil is — fused tone at the top end, visible strokes low. */
  nib: number
  /** How broken the line is. */
  looseness: number
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
  eyeShape: EyeShape
  /** The numbers every facial feature is actually drawn from. */
  geom: FaceGeom
  /** Scales every feature together, independently of the head it sits on. */
  featureScale: number
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
  collarSpec: CollarSpec
  hat: HatStyle
  hatSpec: HatSpec
  hatTilt: number
  glasses: GlassesStyle
  glassesSpec: GlassesSpec
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

/**
 * Head silhouette families.
 *
 * Each entry is a half-width profile sampled at six heights — crown, upper
 * temple, temple, cheek, jaw, chin — plus the superellipse exponents that say
 * how flat the sides and the crown are. These are genuinely different skulls
 * rather than one oval with modifiers, which is the only way a sheet stops
 * looking like the same head redrawn.
 */
const HEAD_FAMILIES: Record<HeadFamily, {
  profile: number[]
  nx: number
  ny: number
  ratio: number
  facet?: boolean
  asym?: number
}> = {
  // These are *relative* widths. The superellipse term already tapers toward
  // the crown and the chin, so a profile value near 1 means "as wide as the
  // natural taper allows here" and the families differ by where they bulge and
  // where they pinch — not by driving the chin toward a point, which turns a
  // head into a diamond.
  oval: { profile: [0.94, 1.0, 1.02, 1.0, 0.94, 0.86], nx: 2.05, ny: 2.05, ratio: 1.06 },
  heart: { profile: [0.90, 1.02, 1.09, 0.98, 0.84, 0.70], nx: 2.1, ny: 2.0, ratio: 1.04 },
  blocky: { profile: [1.02, 1.04, 1.03, 1.03, 1.02, 1.0], nx: 3.4, ny: 3.0, ratio: 1.0 },
  pear: { profile: [0.84, 0.92, 0.98, 1.06, 1.09, 1.0], nx: 2.3, ny: 2.2, ratio: 1.02 },
  long: { profile: [0.92, 0.96, 0.97, 0.95, 0.90, 0.84], nx: 2.4, ny: 2.3, ratio: 1.28 },
  bulb: { profile: [0.80, 0.94, 1.13, 1.15, 0.92, 0.78], nx: 2.0, ny: 1.95, ratio: 0.98 },
  angular: { profile: [0.98, 1.07, 0.95, 1.07, 0.96, 0.86], nx: 2.7, ny: 2.4, ratio: 1.05, facet: true },
  lopsided: { profile: [0.94, 1.0, 1.03, 1.0, 0.93, 0.85], nx: 2.2, ny: 2.1, ratio: 1.05, asym: 0.1 },
  chinny: { profile: [0.92, 0.98, 0.99, 0.97, 0.99, 1.03], nx: 2.5, ny: 2.6, ratio: 1.12 },
  wide: { profile: [0.96, 1.06, 1.14, 1.10, 0.98, 0.84], nx: 2.2, ny: 2.1, ratio: 0.86 },
}

/** Shoulder constructions. A bust is mostly silhouette, and this is most of it. */
export const SHOULDER_STYLES: Record<ShoulderStyle, {
  tipDrop: number
  ctrlX: number
  ctrlY: number
  round: number
  width: number
  rise: number
}> = {
  sloped: { tipDrop: 0.42, ctrlX: 0.42, ctrlY: 0.12, round: 0.5, width: 1, rise: 0 },
  square: { tipDrop: 0.08, ctrlX: 0.64, ctrlY: -0.08, round: 0.18, width: 1.06, rise: 0 },
  round: { tipDrop: 0.26, ctrlX: 0.33, ctrlY: 0.24, round: 0.95, width: 0.98, rise: 0 },
  hunched: { tipDrop: 0.04, ctrlX: 0.3, ctrlY: -0.2, round: 0.75, width: 0.9, rise: -0.16 },
  narrow: { tipDrop: 0.36, ctrlX: 0.38, ctrlY: 0.14, round: 0.62, width: 0.76, rise: 0.05 },
  uneven: { tipDrop: 0.3, ctrlX: 0.44, ctrlY: 0.08, round: 0.55, width: 1, rise: 0 },
}

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

  // The silhouette family, weighted by the same latent traits that drive
  // everything else, then jittered control point by control point so two
  // characters of the same family still are not the same skull.
  const family = rng.weighted<HeadFamily>([
    ['oval', 3],
    ['heart', 2 + Math.max(0, -id.mass) * 2],
    ['blocky', 1.6 + Math.max(0, id.frame) * 3 + Math.max(0, id.morph) * 1.6],
    ['pear', 1.8 + Math.max(0, id.mass) * 2.6],
    ['long', 1.8 + Math.max(0, -id.mass) * 1.6],
    ['bulb', 1.4 + Math.max(0, id.mass) * 2.2 + (id.ageBand === 'child' ? 2 : 0)],
    ['angular', 1.4 + Math.max(0, id.frame) * 1.8],
    ['lopsided', 1.2],
    ['chinny', 1.4 + Math.max(0, id.morph) * 1.6],
    ['wide', 1.5 + Math.max(0, id.mass) * 1.8],
  ])
  const fam = HEAD_FAMILIES[family]
  const spread = 0.035 + c.variationStrength * 0.055
  // The chin gets a higher floor than the rest: a skull can taper a long way
  // and still read as a face, but past a point it stops being one.
  const profile = fam.profile.map((w, i) =>
    Math.max(i === 5 ? 0.62 : 0.6, w + rng.gauss(0, spread)))

  const shoulderStyle = rng.weighted<ShoulderStyle>([
    ['sloped', 3],
    ['square', 2 + Math.max(0, id.frame) * 2.4 + Math.max(0, id.muscularity) * 1.6],
    ['round', 2.2 + Math.max(0, id.mass) * 2],
    ['hunched', 1.4 + Math.max(0, -id.posture) * 3],
    ['narrow', 1.6 + Math.max(0, -id.frame) * 2.6 + (id.ageBand === 'child' ? 2 : 0)],
    ['uneven', 1.2],
  ])
  const shoulder = SHOULDER_STYLES[shoulderStyle]

  // Children have proportionally larger heads; that is the single strongest
  // age cue available in a bust.
  const ageHead = id.ageBand === 'child' ? 1.1 : id.ageBand === 'youth' ? 1.04 : 1
  const headScale = clamp(ageHead * (1 + id.frame * 0.06 + rng.gauss(0, 0.075 * v)), 0.8, 1.26)

  // Derived, not sampled: every one of these is a base plus contributions.
  const jaw = clamp(
    1 + id.frame * 0.14 + id.muscularity * 0.09 + id.mass * 0.14 + id.morph * 0.12 + rng.gauss(0, 0.08 * v),
    0.7, 1.4,
  )
  const cheek = clamp(
    1 + id.mass * 0.26 + (id.ageBand === 'child' ? 0.18 : 0) - Math.max(0, id.age - 55) * 0.005 + rng.gauss(0, 0.1 * v),
    0.72, 1.46,
  )
  const shoulderSpan = clamp(
    1.95 + id.frame * 0.22 + id.muscularity * 0.16 + id.mass * 0.12 -
      (id.ageBand === 'child' ? 0.3 : 0) + rng.gauss(0, 0.09 * v),
    1.5, 2.6,
  )

  return {
    shape, headScale,
    family,
    profile,
    headNx: fam.nx * rng.range(0.9, 1.12),
    headAsym: (fam.asym ?? 0) * rng.sign() + rng.gauss(0, 0.022 * v),
    facet: fam.facet ?? false,
    shoulderStyle,
    // An uneven pair of shoulders is its own style, but every figure gets a
    // little of it.
    shoulderRise: shoulderStyle === 'uneven'
      ? [rng.range(-0.14, 0.02), rng.range(-0.02, 0.16)]
      : [rng.gauss(0, 0.025), rng.gauss(0, 0.025)],
    shoulderRound: shoulder.round * rng.range(0.8, 1.25),
    headRatio: clamp(fam.ratio + rng.gauss(0, 0.075 * v) - id.mass * 0.05, 0.82, 1.34),
    jaw, crown: clamp(1 + rng.gauss(0, 0.09 * v) - id.mass * 0.04, 0.76, 1.3),
    cheek,
    chin: clamp(1 + id.morph * 0.08 + rng.gauss(0, 0.09 * v), 0.8, 1.26),
    // A slight turn of the head is the cheapest large gain in variety: it moves
    // every feature at once without changing a single proportion.
    turn: clamp(rng.gauss(0, 0.34 * v), -0.85, 0.85),
    // The camera. Previously every one of 256 cells framed its subject at the
    // same distance, the same height and the same crop — which a viewer reads
    // in the first fraction of a second, before hair or colour or age. Widened
    // hard: some figures sit close and fill the cell, others sit back with air
    // around them.
    frameScale: clamp(rng.gauss(1, 0.13 * v), 0.7, 1.32),
    /** How low the bust is cut off by the frame. */
    cropDepth: clamp(rng.gauss(1, 0.1 * v), 0.78, 1.22),
    pressure: clamp(rng.gauss(1, 0.16), 0.7, 1.4),
    lineWobble: clamp(rng.gauss(1, 0.28), 0.5, 1.75),
    hatchAngle: rng.gauss(0, 0.62),
    finish: clamp(rng.gauss(1, 0.2), 0.6, 1.45),
    nib: clamp(rng.gauss(0.84, 0.13), 0.58, 1.06),
    looseness: clamp(rng.gauss(1, 0.34), 0.4, 1.9),
    neck: clamp(0.5 + id.muscularity * 0.09 + id.mass * 0.07 + rng.gauss(0, 0.04 * v), 0.36, 0.72),
    shoulderSpan: shoulderSpan * shoulder.width,
    slope: clamp(shoulder.tipDrop + rng.gauss(0, 0.06) - id.posture * 0.05, 0.02, 0.6),
    // A real in-plane tilt, not the two degrees it was.
    tilt: clamp(rng.gauss(-id.posture * 0.02, 0.055 + c.variationStrength * 0.06), -0.2, 0.2),
    cxJitter: rng.gauss(0, 5 + c.variationStrength * 7),
    cyJitter: rng.gauss(0, 6 + c.variationStrength * 8),
  }
}

/* ------------------------------------------------------- face geometry */

/**
 * Every facial feature is drawn from one of the parameter spaces below.
 *
 * `*_RANGES` are the bounds of the whole space — what a nose *can* be, not
 * what the average nose is. A `*_FAMILIES` entry constrains only the two or
 * three numbers that make a style that style; everything else falls through to
 * the global range, which is what stops two "almond" eyes from being the same
 * pair of eyes.
 */
function spaceFor<K extends string>(
  rng: Rng, ranges: Record<K, Range>, family: Partial<Record<K, Range>>, c: Controls,
): { pick: (key: K) => number; maybe: (key: K, chance: number) => number } {
  // Uniform across the range rather than gaussian about its midpoint: a normal
  // draw piles most of a sheet into the middle however wide the tails are, and
  // sameness in the middle is the exact complaint this is fixing.
  const bias = 0.45 + c.variationStrength * 0.55
  const pick = (key: K): number => {
    const [lo, hi] = family[key] ?? ranges[key]
    const mid = (lo + hi) / 2
    return mid + (rng.range(lo, hi) - mid) * bias
  }
  // Zero-inflated. Whether a face has a hooded fold, a hook in the nose or an
  // open mouth at all separates two of them further than any amount of it does.
  const maybe = (key: K, chance: number): number =>
    family[key] || rng.bool(chance) ? pick(key) : 0
  return { pick, maybe }
}

type EyeNumeric =
  | 'lidTop' | 'lidBottom' | 'tall' | 'topH' | 'botH' | 'widen'
  | 'outerDrop' | 'innerDrop' | 'fold' | 'sparkle'

const EYE_RANGES: Record<EyeNumeric, Range> = {
  lidTop: [0.02, 0.4],
  lidBottom: [0, 0.26],
  tall: [0.74, 1.2],
  topH: [0.5, 1.24],
  botH: [0.42, 1.12],
  widen: [0.64, 1.3],
  outerDrop: [-0.42, 0.5],
  innerDrop: [-0.16, 0.24],
  fold: [0.3, 1],
  sparkle: [0.35, 1],
}

/** The lid decides how much of the opening is covered; not what shape it is. */
const LID_FAMILIES: Record<LidStyle, Partial<Record<EyeNumeric, Range>>> = {
  open: { lidTop: [0.04, 0.2], lidBottom: [0, 0.11] },
  wide: { lidTop: [0, 0.06], lidBottom: [0, 0.07], tall: [1.02, 1.24] },
  half: { lidTop: [0.32, 0.5], lidBottom: [0, 0.12], tall: [0.86, 1.02] },
  squint: { lidTop: [0.26, 0.42], lidBottom: [0.2, 0.36], tall: [0.72, 0.92] },
  // A shut eye is both lids all the way down, not a separate drawing.
  closed: { lidTop: [1, 1], lidBottom: [1, 1], tall: [0.8, 1] },
  sparkle: { lidTop: [0, 0.09], lidBottom: [0, 0.06], tall: [1.04, 1.24], sparkle: [0.6, 1] },
  wink: { lidTop: [0.02, 0.16], lidBottom: [0, 0.1] },
}

/** The shape decides where the corners sit; not how far the lids come down. */
const EYE_FAMILIES: Record<EyeShape, Partial<Record<EyeNumeric, Range>>> = {
  round: { topH: [0.9, 1.16], botH: [0.84, 1.1], widen: [0.88, 1.08] },
  almond: { topH: [0.76, 0.96], botH: [0.58, 0.8], widen: [1.04, 1.26] },
  narrow: { topH: [0.42, 0.62], botH: [0.34, 0.52], widen: [1.1, 1.34] },
  droop: { outerDrop: [0.28, 0.6], topH: [0.7, 0.94], botH: [0.6, 0.86] },
  upturn: { outerDrop: [-0.52, -0.24], innerDrop: [0.05, 0.24], topH: [0.7, 0.94] },
  wide: { topH: [1.04, 1.3], botH: [0.94, 1.2] },
  dot: { topH: [0.44, 0.66], botH: [0.44, 0.66], widen: [0.52, 0.74] },
  hooded: { topH: [0.5, 0.72], botH: [0.78, 1.02], fold: [0.5, 1], outerDrop: [0.04, 0.3] },
}

function genEyeGeom(rng: Rng, lid: LidStyle, shape: EyeShape, c: Controls): EyeGeom {
  const { pick, maybe } = spaceFor<EyeNumeric>(
    rng, EYE_RANGES, { ...LID_FAMILIES[lid], ...EYE_FAMILIES[shape] }, c,
  )
  return {
    lidTop: pick('lidTop'),
    lidBottom: pick('lidBottom'),
    tall: pick('tall'),
    topH: pick('topH'),
    botH: pick('botH'),
    widen: pick('widen'),
    outerDrop: pick('outerDrop'),
    innerDrop: pick('innerDrop'),
    fold: maybe('fold', 0.16),
    sparkle: maybe('sparkle', 0.1),
    winkSide: lid === 'wink' ? rng.sign() : 0,
  }
}

type BrowNumeric =
  | 'arch' | 'tilt' | 'belly' | 'innerW' | 'outerW' | 'hook' | 'reach'
  | 'hairy' | 'broken' | 'density'

const BROW_RANGES: Record<BrowNumeric, Range> = {
  arch: [-0.12, 0.5],
  tilt: [-0.34, 0.36],
  belly: [0.28, 0.72],
  innerW: [0.45, 2.2],
  outerW: [0.2, 1.7],
  hook: [0.2, 0.8],
  reach: [0.3, 1.9],
  hairy: [0, 1],
  broken: [0.12, 0.45],
  density: [0.3, 1],
}

const BROW_FAMILIES: Record<BrowStyle, Partial<Record<BrowNumeric, Range>>> = {
  soft: { arch: [0.1, 0.32], innerW: [0.8, 1.35], outerW: [0.6, 1.15], hairy: [0.5, 1] },
  bushy: { innerW: [1.55, 2.3], outerW: [1.05, 1.8], hairy: [0.7, 1], density: [0.7, 1] },
  thin: { innerW: [0.3, 0.62], outerW: [0.25, 0.55], hairy: [0, 0.3] },
  arched: { arch: [0.3, 0.56], belly: [0.4, 0.62] },
  straight: { arch: [-0.06, 0.09], innerW: [0.6, 1.15], outerW: [0.55, 1.05] },
  // Inner ends up and outer ends down — the only brow whose tilt runs negative.
  worried: { tilt: [-0.4, -0.16], arch: [-0.12, 0.1] },
  bar: { arch: [-0.05, 0.07], innerW: [1.25, 1.9], outerW: [1.25, 1.9], hairy: [0, 0.25] },
  wedge: { innerW: [1.5, 2.3], outerW: [0.12, 0.42], hairy: [0, 0.3] },
  comma: { hook: [0.45, 0.85], innerW: [1.15, 2], outerW: [0.28, 0.7] },
  dash: { broken: [0.22, 0.48], hairy: [0.6, 1], innerW: [0.5, 0.95], outerW: [0.5, 0.95] },
  // Not a twelfth shape: a pair of brows that reach far enough in to meet.
  unibrow: { reach: [1.35, 1.95], hairy: [0.6, 1] },
  angled: { tilt: [0.2, 0.44], innerW: [1.05, 1.8], outerW: [0.5, 1.05] },
}

function genBrowGeom(rng: Rng, style: BrowStyle, c: Controls): BrowGeom {
  const { pick, maybe } = spaceFor<BrowNumeric>(rng, BROW_RANGES, BROW_FAMILIES[style], c)
  return {
    arch: pick('arch'),
    tilt: pick('tilt'),
    belly: pick('belly'),
    innerW: pick('innerW'),
    outerW: pick('outerW'),
    hook: maybe('hook', 0.18),
    reach: maybe('reach', 0.2),
    hairy: pick('hairy'),
    broken: maybe('broken', 0.12),
    density: pick('density'),
  }
}

type NoseNumeric =
  | 'width' | 'tipH' | 'tipDrop' | 'bridge' | 'hook' | 'upturn'
  | 'nostril' | 'contour' | 'shadow'

const NOSE_RANGES: Record<NoseNumeric, Range> = {
  width: [0.8, 1.75],
  tipH: [0.66, 1.45],
  tipDrop: [-0.3, 0.5],
  bridge: [1, 3.6],
  hook: [0.2, 0.95],
  upturn: [0.25, 1],
  nostril: [0.5, 1.35],
  contour: [0.1, 1],
  shadow: [0.5, 1],
}

const NOSE_FAMILIES: Record<NoseStyle, Partial<Record<NoseNumeric, Range>>> = {
  button: { width: [0.86, 1.16], tipH: [0.82, 1.15], bridge: [1, 1.9] },
  beak: { hook: [0.5, 0.95], bridge: [2.2, 3.6], width: [0.7, 1.05], tipDrop: [0.12, 0.5], contour: [0.5, 1] },
  upturned: { upturn: [0.55, 1], tipDrop: [-0.35, 0.02], width: [0.85, 1.3] },
  broad: { width: [1.3, 1.8], tipH: [0.85, 1.25], nostril: [0.95, 1.4] },
  long: { bridge: [2.4, 3.8], tipH: [0.66, 1], tipDrop: [0.2, 0.55] },
  blob: { width: [1.15, 1.65], tipH: [1.05, 1.5], bridge: [1, 1.7] },
}

function genNoseGeom(rng: Rng, style: NoseStyle, c: Controls): NoseGeom {
  const { pick, maybe } = spaceFor<NoseNumeric>(rng, NOSE_RANGES, NOSE_FAMILIES[style], c)
  return {
    width: pick('width'),
    tipH: pick('tipH'),
    tipDrop: pick('tipDrop'),
    bridge: maybe('bridge', 0.75),
    hook: maybe('hook', 0.2),
    upturn: maybe('upturn', 0.24),
    nostril: maybe('nostril', 0.66),
    contour: pick('contour'),
    shadow: pick('shadow'),
  }
}

type MouthNumeric =
  | 'lift' | 'open' | 'upperLip' | 'lowerLip' | 'teeth' | 'pucker' | 'skew'

const MOUTH_RANGES: Record<MouthNumeric, Range> = {
  lift: [-0.5, 0.9],
  open: [0.12, 0.9],
  upperLip: [0.2, 1.1],
  lowerLip: [0.3, 1.35],
  teeth: [0.3, 1],
  pucker: [0.2, 0.85],
  skew: [-0.5, 0.5],
}

const MOUTH_FAMILIES: Record<MouthStyle, Partial<Record<MouthNumeric, Range>>> = {
  smile: { lift: [0.32, 0.8] },
  grin: { lift: [0.5, 0.95], open: [0.12, 0.42] },
  smirk: { skew: [0.28, 0.6], lift: [0.1, 0.5] },
  ohh: { pucker: [0.5, 0.85], open: [0.55, 0.95], lift: [-0.2, 0.16] },
  flat: { lift: [-0.16, 0.16] },
  toothy: { teeth: [0.6, 1], open: [0.3, 0.68], lift: [0.28, 0.8] },
  pout: { lift: [-0.5, -0.08], lowerLip: [0.9, 1.4], pucker: [0.35, 0.72] },
  whistle: { pucker: [0.58, 0.9], open: [0.32, 0.7], skew: [0.15, 0.5] },
}

function genMouthGeom(rng: Rng, style: MouthStyle, c: Controls): MouthGeom {
  const { pick, maybe } = spaceFor<MouthNumeric>(rng, MOUTH_RANGES, MOUTH_FAMILIES[style], c)
  const open = maybe('open', 0.3)
  return {
    lift: pick('lift'),
    open,
    upperLip: pick('upperLip'),
    lowerLip: pick('lowerLip'),
    // Teeth need somewhere to be. Rolled independently of the opening they
    // turned up on closed mouths, where they read as a smear on the lip line.
    teeth: open > 0.12 ? maybe('teeth', 0.3) : 0,
    // Zero-inflated, or every mouth on the sheet is drawn in toward the middle
    // and the whole population ends up pursed. Only the families that need a
    // narrow mouth — a pucker, a whistle, a pout — force one.
    pucker: maybe('pucker', 0.26),
    skew: pick('skew'),
  }
}

type BeardNumeric = 'moustache' | 'chin' | 'cheek' | 'jaw' | 'density' | 'length'

const BEARD_RANGES: Record<BeardNumeric, Range> = {
  moustache: [0.3, 1.1],
  chin: [0.3, 1.1],
  cheek: [0.25, 1],
  jaw: [0.2, 1],
  density: [0.35, 1],
  length: [0.15, 1],
}

/**
 * The masses, not the drawings. A goatee is chin without cheek, muttonchops
 * are cheek without chin, a full beard is both plus the jaw between them, and
 * stubble is all three at zero length.
 */
const BEARD_FAMILIES: Record<FacialHairStyle, Partial<Record<BeardNumeric, Range>>> = {
  none: { moustache: [0, 0], chin: [0, 0], cheek: [0, 0], jaw: [0, 0], density: [0, 0], length: [0, 0] },
  stubble: { length: [0, 0.1], density: [0.5, 1], cheek: [0.5, 1], chin: [0.5, 1], jaw: [0.6, 1] },
  moustache: { moustache: [0.55, 1.1], chin: [0, 0], cheek: [0, 0], jaw: [0, 0] },
  goatee: { chin: [0.5, 1.1], cheek: [0, 0], jaw: [0, 0.22] },
  beard: { chin: [0.6, 1.1], cheek: [0.5, 1], jaw: [0.6, 1], length: [0.4, 1] },
  muttonchops: { cheek: [0.62, 1], chin: [0, 0], jaw: [0, 0.3] },
  fluff: { length: [0.5, 1], density: [0.15, 0.42], cheek: [0.3, 0.75], jaw: [0.3, 0.8], chin: [0.2, 0.62] },
}

function genBeardGeom(rng: Rng, style: FacialHairStyle, c: Controls): BeardGeom {
  const { pick, maybe } = spaceFor<BeardNumeric>(rng, BEARD_RANGES, BEARD_FAMILIES[style], c)
  return {
    // A beard with a moustache and one without are two different faces.
    moustache: maybe('moustache', 0.55),
    chin: pick('chin'),
    cheek: pick('cheek'),
    jaw: pick('jaw'),
    density: pick('density'),
    length: pick('length'),
  }
}

/* ----------------------------------------------------------------- stage 4 */

function genFace(rng: Rng, id: IdentityDNA, body: BodyDNA, a: Archetype, c: Controls): FaceDNA {
  const v = 0.4 + c.variationStrength * 1.2
  const young = id.ageBand === 'child' ? 1 : id.ageBand === 'youth' ? 0.55 : 0
  const old = clamp((id.age - 46) / 36, 0, 1)

  // Stylised but consistent: younger faces get larger eyes set lower, which is
  // the same cue the reference uses to read as gentle rather than severe.
  const eyeSize = clamp(0.175 + young * 0.035 - old * 0.02 + rng.gauss(0, 0.03 * v), 0.115, 0.26)

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

  // Facial hair is a two-stage decision, not seven competing weights.
  //
  // Written as one weighted list it was impossible to see what the actual rate
  // was, and the answer turned out to be "about 44% of every adult regardless
  // of anything else" — which is how characters ended up with lashes, long
  // hair, an earring and a full beard at the same time. Asking "does this
  // person have facial hair at all" separately makes the rate legible and lets
  // it depend properly on the presentation axis.
  //
  // `presentation` runs 0 at the low end of the morph axis to 1 at the high
  // end. Facial hair is essentially absent below the middle and common above
  // it, which is what makes the cue agree with the jaw, brow and lash cues
  // rather than contradicting them.
  const presentation = clamp((id.morph + 0.35) / 1.1, 0, 1)
  const youngAdult = id.age < 20 ? 0.3 : id.age < 25 ? 0.7 : 1
  const facialHairChance = presentation ** 1.7 * (0.6 + (1 - id.grooming) * 0.3) * youngAdult

  const facialHair: FacialHairStyle = id.age < 17 || !rng.bool(facialHairChance)
    ? 'none'
    : rng.weighted<FacialHairStyle>([
      ['stubble', 2.6 + (1 - id.grooming) * 2],
      ['beard', 1.6 + presentation * 1.6 + (1 - id.grooming) * 1.2],
      ['moustache', 1.4 + old * 1.2],
      ['goatee', 1.1],
      ['muttonchops', 0.4 + old * 0.5],
      ['fluff', 0.7 * (1 - presentation)],
    ])

  const eyeShape = rng.weighted<EyeShape>([
    ['round', 3 + young * 2],
    ['almond', 2.6],
    ['narrow', 1.6 + old * 1.4],
    ['droop', 1.4 + old * 1.8],
    ['upturn', 1.6],
    ['wide', 1.6 + young * 1.6],
    ['dot', 1 + Math.max(0, id.mass) * 1.2],
    ['hooded', 1.3 + old * 2 + Math.max(0, id.morph)],
  ])

  const brow = rng.weighted<BrowStyle>([
    ['soft', 2.6], ['bushy', 1.2 + id.morph * 2 + old], ['thin', 1.8 - id.morph],
    ['arched', 1.8], ['straight', 1.4 + id.morph], ['worried', 1.1],
    ['bar', 1.4 + id.morph * 1.2], ['wedge', 1.4], ['comma', 1.3],
    ['dash', 1.2 + (1 - id.grooming) * 1.2], ['angled', 1.4],
    ['unibrow', 0.45 + id.morph * 0.8 + (1 - id.grooming) * 0.6],
  ])

  const nose = rng.weighted<NoseStyle>([
    ['button', 4 + young * 2], ['upturned', 2.2], ['blob', 1.8 + id.mass],
    ['broad', 1.4 + id.mass * 1.2 + id.morph], ['beak', 1.2 + old], ['long', 0.9 + old],
  ])

  const asymScale = 0.4 + c.variationStrength * 1.3
  return {
    eyeShape,
    // Each feature draws from its own fork, so rerolling the shape of one of
    // them cannot shift the numbers of the others.
    geom: {
      eye: genEyeGeom(rng.fork('eye'), lid, eyeShape, c),
      brow: genBrowGeom(rng.fork('brow'), brow, c),
      nose: genNoseGeom(rng.fork('nose'), nose, c),
      mouth: genMouthGeom(rng.fork('mouth'), mouth, c),
      beard: genBeardGeom(rng.fork('beard'), facialHair, c),
    },
    // Two people with the same size head can carry very differently sized
    // features on it, and that reads as strongly as any single proportion.
    featureScale: clamp(rng.gauss(1, 0.11 * v), 0.72, 1.32),
    eyeSize,
    // Eye spacing follows the width of the face it sits on, rather than being
    // sampled independently of the skull it has to fit inside.
    eyeSpacing: clamp(0.53 + (body.cheek - 1) * 0.08 + rng.gauss(0, 0.05 * v), 0.4, 0.68),
    eyeY: clamp(0.09 + young * 0.04 + rng.gauss(0, 0.055 * v), -0.04, 0.24),
    eyeTilt: rng.gauss(0, 0.075 * v),
    lid,
    // Part of the same cluster: a viewer reads lashes, jaw, brow weight and
    // facial hair together, so they have to move together.
    lashes: rng.bool(clamp(0.62 - id.morph * 0.34, 0.1, 0.92)),
    iris: rng.weighted<Triple>([
      [[28, 45, 28], 3], [[30, 38, 20], 3], [[120, 30, 34], 2],
      [[205, 42, 44], 2], [[38, 50, 40], 1.6], [[180, 30, 36], 1],
      [[280, 30, 40], 0.6], [[0, 0, 26], 1.4],
    ]),
    pupil: clamp(rng.gauss(0.55, 0.05), 0.4, 0.7),
    gazeX: rng.gauss(0, 0.26),
    gazeY: rng.gauss(-0.08, 0.18),
    brow,
    browThick,
    browLift: clamp(rng.gauss(0.62, 0.22 * v), 0.22, 1.25),
    browAngle: rng.gauss(0, 0.12 * v),
    nose,
    noseSize: clamp(1 + id.morph * 0.14 + old * 0.14 - young * 0.16 + rng.gauss(0, 0.17 * v), 0.62, 1.55),
    noseY: clamp(0.36 + rng.gauss(0, 0.05 * v), 0.24, 0.5),
    mouth,
    mouthW: clamp(rng.gauss(1, 0.2 * v), 0.62, 1.55),
    mouthY: clamp(0.58 + rng.gauss(0, 0.055 * v), 0.46, 0.74),
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

/**
 * Family presets for headwear. These are *biases*, not drawings — every field
 * is jittered per character below, and the fields not named here are rolled
 * from scratch. Two beanies on the same sheet share a region of the parameter
 * space and nothing else.
 */
/** The numeric fields of a collar, all drawn from ranges. */
type CollarNumeric =
  | 'openWidth' | 'dropDepth' | 'vee' | 'bandDepth' | 'standHeight' | 'ribs'
  | 'pointReach' | 'pointDrop' | 'pointSplay' | 'lapel' | 'placket' | 'straps'
  | 'bib' | 'bibWidth' | 'flap' | 'ruffle' | 'ruffleCount' | 'wrap' | 'strings'

const COLLAR_RANGES: Record<CollarNumeric, Range> = {
  openWidth: [1.1, 2.1],
  dropDepth: [8, 44],
  vee: [0, 1],
  bandDepth: [4, 16],
  standHeight: [0, 30],
  ribs: [3, 9],
  pointReach: [1.1, 1.9],
  pointDrop: [12, 30],
  pointSplay: [0.1, 0.9],
  lapel: [0.4, 1],
  placket: [0.5, 1],
  straps: [4, 12],
  bib: [18, 40],
  bibWidth: [1.1, 2],
  flap: [0.5, 1],
  ruffle: [5, 12],
  ruffleCount: [5, 11],
  wrap: [0.4, 1],
  strings: [0.5, 1],
}

/**
 * A family fixes only the parts that make it that collar. Everything else —
 * how deep the opening is, whether there is a band, a placket, a ruffle, how
 * far the points reach — is free, which is what stops two button-ups from
 * being the same button-up in a different colour.
 */
const COLLAR_FAMILIES: Record<CollarStyle, Partial<Record<CollarNumeric, Range>>> = {
  buttonup: { pointReach: [1.2, 1.9], placket: [0.6, 1], standHeight: [0, 8] },
  crew: { pointReach: [0, 0], bandDepth: [5, 14], dropDepth: [10, 26] },
  turtleneck: { pointReach: [0, 0], standHeight: [16, 34], ribs: [4, 9], bandDepth: [10, 20] },
  vneck: { pointReach: [0, 0], vee: [0.75, 1], dropDepth: [26, 48] },
  overalls: { straps: [5, 13], bib: [20, 42] },
  apron: { bib: [16, 38], bibWidth: [1.4, 2.4], straps: [0, 0] },
  robe: { wrap: [0.5, 1], pointReach: [0, 0] },
  hoodie: { strings: [0.6, 1], bandDepth: [8, 20], pointReach: [0, 0] },
  sailor: { flap: [0.6, 1], pointReach: [0, 0] },
  ruffle: { ruffle: [5, 13], ruffleCount: [5, 11], pointReach: [0, 0] },
}

function genCollarSpec(rng: Rng, id: CollarStyle, c: Controls): CollarSpec {
  const family = COLLAR_FAMILIES[id]
  const bias = 0.45 + c.variationStrength * 0.55
  const pick = (key: CollarNumeric): number => {
    const [lo, hi] = family[key] ?? COLLAR_RANGES[key]
    const mid = (lo + hi) / 2
    return mid + (rng.range(lo, hi) - mid) * bias
  }
  // Absent unless the family calls for it or the roll turns it up. Whether a
  // collar has a placket at all separates two of them more than any amount of
  // placket does.
  const maybe = (key: CollarNumeric, chance: number): number =>
    family[key] ? pick(key) : rng.bool(chance) ? pick(key) : 0

  return {
    id,
    openWidth: pick('openWidth'),
    dropDepth: pick('dropDepth'),
    vee: pick('vee'),
    bandDepth: maybe('bandDepth', 0.6),
    standHeight: maybe('standHeight', 0.3),
    ribs: Math.round(maybe('ribs', 0.25)),
    pointReach: maybe('pointReach', 0.3),
    pointDrop: pick('pointDrop'),
    pointSplay: pick('pointSplay'),
    lapel: maybe('lapel', 0.22),
    placket: maybe('placket', 0.3),
    straps: maybe('straps', 0.12),
    bib: maybe('bib', 0.12),
    bibWidth: pick('bibWidth'),
    flap: maybe('flap', 0.1),
    ruffle: maybe('ruffle', 0.12),
    ruffleCount: Math.round(pick('ruffleCount')),
    wrap: maybe('wrap', 0.1),
    strings: maybe('strings', 0.14),
  }
}

/** The numeric fields of a hat, which are all drawn from ranges. */
type HatNumeric =
  | 'crownW' | 'crownH' | 'seat' | 'crownN' | 'taper' | 'lean' | 'slouch'
  | 'lumps' | 'brim' | 'brimWrap' | 'brimDrop' | 'brimCurl' | 'brimN'
  | 'brimAngle' | 'band' | 'bandY' | 'peakH' | 'peakSharp' | 'cuff' | 'dent'
  | 'trimScale'

type Range = readonly [number, number]

/**
 * The space every hat is drawn from. Wide on purpose: these are the bounds of
 * what a hat can be, not the average hat.
 */
const HAT_RANGES: Record<HatNumeric, Range> = {
  crownW: [0.82, 1.32],
  crownH: [0.12, 0.82],
  seat: [0.18, 0.56],
  crownN: [1.5, 4.8],
  taper: [0.18, 1.42],
  lean: [-0.3, 0.3],
  slouch: [0.01, 0.24],
  lumps: [1.6, 4.4],
  brim: [0.18, 1.3],
  brimWrap: [0, 1],
  // The brim's *half*-thickness, so this is doubled on the page. Any deeper
  // and the brim is a slab as tall as the crown it hangs off.
  brimDrop: [0.04, 0.16],
  brimCurl: [-0.45, 0.55],
  brimN: [1.7, 5],
  brimAngle: [-0.24, 0.24],
  band: [0.14, 0.46],
  bandY: [0, 0.6],
  peakH: [0.06, 0.52],
  peakSharp: [0, 1],
  cuff: [0.08, 0.32],
  dent: [0.06, 0.42],
  trimScale: [0.6, 1.6],
}

/**
 * A family constrains only the few numbers that make it that family. A cap is
 * a fitted crown with a brim on one side; everything else about it — how tall,
 * how square, how much it leans, whether it has a band, a dent, seams or a
 * feather — is free.
 *
 * This is the difference between varied and merely jittered. Pinning every
 * field to a preset and adding a few per cent of noise produced two caps that
 * were plainly the same cap in different colours, which is exactly what the
 * eight hardcoded drawings did.
 */
const HAT_FAMILIES: Record<Exclude<HatStyle, 'none'>, Partial<Record<HatNumeric, Range>>> = {
  beanie: { brim: [0, 0.03], crownH: [0.4, 0.8], cuff: [0.1, 0.32] },
  beret: { brim: [0, 0.03], crownH: [0.26, 0.5], taper: [1, 1.4], lean: [-0.3, 0.3] },
  cap: { brim: [0.38, 0.92], brimWrap: [0, 0.26], crownH: [0.32, 0.66] },
  sunhat: { brim: [0.7, 1.3], brimWrap: [0.72, 1], crownH: [0.36, 0.72] },
  band: { brim: [0, 0.03], crownH: [0.08, 0.21], seat: [0.42, 0.58] },
  crown: { brim: [0, 0.03], crownH: [0.1, 0.28], seat: [0.28, 0.46] },
  kerchief: { brim: [0, 0.03], crownH: [0.38, 0.68], slouch: [0.1, 0.24] },
  boat: { crownN: [1.4, 1.85], taper: [0.1, 0.36], brim: [0, 0.24] },
}

/** Fields a family always has, always lacks, or fixes outright. */
const HAT_FORCED: Partial<Record<Exclude<HatStyle, 'none'>, Partial<HatSpec>>> = {
  cap: { seams: 3 },
  crown: { peaks: 0, trim: 'jewels' },
  kerchief: { trim: 'knot', seams: 0 },
  boat: { seams: 0, cuff: 0 },
}

const HAT_TRIMS: readonly HatTrim[] = [
  'none', 'bobble', 'feather', 'pin', 'stud', 'knot', 'tassel', 'jewels',
]

function genHatSpec(rng: Rng, id: HatStyle, hair: HairDNA, c: Controls): HatSpec {
  const family: Partial<Record<HatNumeric, Range>> = id === 'none' ? {} : HAT_FAMILIES[id]
  const forced: Partial<HatSpec> = (id === 'none' ? undefined : HAT_FORCED[id]) ?? {}

  // Uniform across the family's range, not gaussian around its midpoint: a
  // normal distribution piles most of a sheet into the middle of the range,
  // which reads as sameness however wide the tails are. Variation strength
  // pulls each draw toward or away from the midpoint.
  const bias = 0.45 + c.variationStrength * 0.55
  const pick = (key: HatNumeric): number => {
    const [lo, hi] = family[key] ?? HAT_RANGES[key]
    const mid = (lo + hi) / 2
    return mid + (rng.range(lo, hi) - mid) * bias
  }
  // Zero-inflated: a field a family does not force is often absent entirely,
  // and that presence or absence is a bigger difference than any amount of it.
  const maybe = (key: HatNumeric, chance: number): number =>
    family[key] || rng.bool(chance) ? pick(key) : 0

  // A hat has to clear whatever is under it.
  const tall = hairHeight(hair)
  const brim = maybe('brim', 0.45)
  // Points are a coronet feature. Cut into the crown of a brimmed hat they
  // drew a sunhat with a sawtooth edge, which is not a hat.
  const peaks = forced.peaks !== undefined
    ? rng.int(3, 9)
    : brim < 0.06 && rng.bool(0.16 + c.memorability * 0.12) ? rng.int(3, 9) : 0

  return {
    id,
    crownW: pick('crownW'),
    crownH: Math.max(0.08, pick('crownH') + tall * 0.1),
    seat: clamp(pick('seat'), 0.1, 0.58),
    crownN: pick('crownN'),
    taper: pick('taper'),
    lean: pick('lean'),
    slouch: pick('slouch'),
    lumps: pick('lumps'),
    brim,
    brimWrap: clamp(pick('brimWrap'), 0, 1),
    brimDrop: pick('brimDrop'),
    brimCurl: pick('brimCurl'),
    brimSide: rng.bool(0.5) ? 1 : -1,
    brimN: pick('brimN'),
    brimAngle: pick('brimAngle'),
    band: maybe('band', 0.34),
    bandY: pick('bandY'),
    peaks,
    peakH: pick('peakH'),
    peakSharp: pick('peakSharp'),
    cuff: maybe('cuff', 0.26),
    dent: maybe('dent', 0.3),
    seams: forced.seams ?? (rng.bool(0.3) ? rng.int(2, 5) : 0),
    trim: forced.trim ?? rng.weighted<HatTrim>(
      HAT_TRIMS.map((t) => [t, t === 'none' ? 3.4 - c.memorability * 1.6 : 1] as const),
    ),
    trimScale: pick('trimScale'),
    trimAngle: rng.range(-Math.PI, Math.PI),
  }
}

/** Family presets for eyewear. Biases, not drawings — see `HAT_PRESETS`. */
const GLASSES_PRESETS: Record<Exclude<GlassesStyle, 'none'>, Partial<GlassesSpec>> = {
  round: { lensW: 1.2, lensH: 1.15, lensN: 2.05, flick: 0, halfCut: 0 },
  square: { lensW: 1.16, lensH: 0.88, lensN: 4.4, flick: 0, halfCut: 0 },
  halfmoon: { lensW: 1.2, lensH: 0.8, lensN: 2.4, flick: 0, halfCut: 0.92 },
  cateye: { lensW: 1.16, lensH: 0.9, lensN: 2.5, flick: 0.6, halfCut: 0 },
  goggles: { lensW: 1.35, lensH: 1.1, lensN: 2.6, flick: 0, halfCut: 0, frameW: 2.7, strap: true, tint: 0.5 },
  monocle: { lensW: 1.2, lensH: 1.15, lensN: 2.05, flick: 0, halfCut: 0, pair: false },
}

function genGlassesSpec(rng: Rng, id: GlassesStyle, c: Controls): GlassesSpec {
  const preset: Partial<GlassesSpec> = id === 'none' ? {} : GLASSES_PRESETS[id]
  const v = 0.6 + c.variationStrength * 0.9
  const j = (base: number, spread: number): number => base + rng.gauss(0, spread * v)
  return {
    id,
    lensW: Math.max(0.7, j(preset.lensW ?? rng.range(1, 1.4), 0.1)),
    lensH: Math.max(0.5, j(preset.lensH ?? rng.range(0.7, 1.2), 0.09)),
    // The exponent is what makes one pair round and the next rectangular, and
    // it used to be a constant per family.
    lensN: clamp(j(preset.lensN ?? rng.range(2, 4), 0.5), 1.5, 6),
    flick: Math.max(0, j(preset.flick ?? 0, 0.1)),
    halfCut: clamp(preset.halfCut ?? 0, 0, 0.95) * rng.range(0.9, 1.05),
    lensTilt: rng.gauss(0, 0.06),
    frameW: clamp(j(preset.frameW ?? rng.range(1.4, 2.6), 0.35), 0.9, 3.4),
    spread: j(preset.spread ?? 0, 0.08),
    bridgeY: j(preset.bridgeY ?? rng.range(-0.4, 0.1), 0.12),
    bridgeSag: Math.max(0, j(preset.bridgeSag ?? (rng.bool(0.35) ? rng.range(0.1, 0.4) : 0), 0.06)),
    pair: preset.pair ?? true,
    strap: preset.strap ?? rng.bool(0.06),
    tint: clamp(preset.tint ?? (rng.bool(0.2) ? rng.range(0.2, 0.8) : 0), 0, 1),
  }
}

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
    collarSpec: genCollarSpec(rng.fork('collar'), collar, c),
    hat,
    hatSpec: genHatSpec(rng.fork('hat'), hat, hair, c),
    hatTilt: rng.gauss(0, 0.13),
    glasses,
    glassesSpec: genGlassesSpec(rng.fork('glasses'), glasses, c),
    earring: rng.bool(clamp(0.3 - id.morph * 0.16, 0.06, 0.5) + c.memorability * 0.08),
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

// Ceilinged around 84% lightness. Above that a skin tone is indistinguishable
// from the paper it is drawn on: the ground lightens it further, the hatching
// has nothing to darken, and the face renders as a blank with features
// floating on it.
const SKIN_TONES: Triple[] = [
  [28, 48, 83], [26, 52, 81], [24, 50, 77], [22, 46, 70],
  [20, 44, 62], [18, 42, 54], [16, 40, 45], [14, 38, 37],
  [12, 36, 30], [30, 44, 84], [34, 38, 82], [10, 30, 26],
  [20, 30, 66], [32, 44, 79], [16, 34, 42],
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
    Math.min(85, skinBase[2] + rng.gauss(0, 2.5) - id.exposure * 3),
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
    body.headScale * 2, body.shoulderSpan * 0.8, body.jaw, body.cheek, body.turn * 0.8,
    face.eyeSize * 6, face.eyeSpacing * 3, face.noseSize, face.mouthW,
    style * 2, hair.curl, hair.crown, hair.sides, body.nib, body.hatchAngle * 0.6,
    body.profile[2]! * 1.5, body.profile[5]! * 2, body.headNx * 0.5,
    face.featureScale * 1.5, face.eyeY * 4, face.mouthY * 3,
    // Pose and framing: read before any trait, so the anti-clone pass has to
    // be able to act on them.
    body.frameScale * 2.5, body.cropDepth * 2, body.tilt * 6,
    body.cxJitter * 0.08, body.cyJitter * 0.08,
    palette.skin[2] / 60, palette.hair[0] / 240, palette.hair[2] / 60,
    palette.garment[0] / 200, palette.garment[2] / 70,
    wardrobe.collar.length / 10, wardrobe.pattern.length / 10,
    // Headwear is a silhouette feature and reads before most of the face, so
    // its shape belongs here — not just which family it came from.
    ...hatFeatures(wardrobe.hatSpec),
    // Eyewear is the loudest graphic on the face, so its shape counts too.
    ...glassesFeatures(wardrobe.glassesSpec),
    // The neckline is the top of the garment silhouette and sits directly
    // under the face, so it reads early.
    ...collarFeatures(wardrobe.collarSpec),
    // The face itself. Two characters can differ on every number above and
    // still be twins from arm's length if they share their eyes.
    ...faceFeatures(face.geom),
  ]
}

/**
 * The parts of a face that change how it reads. Weighted so the eyes dominate:
 * they are what a viewer looks at first and longest, and two faces that differ
 * only in the nose are the same face.
 */
function faceFeatures(fg: FaceGeom): number[] {
  const { eye, brow, nose, mouth, beard } = fg
  return [
    eye.tall * 3, eye.topH * 3, eye.botH * 2.6, eye.widen * 3,
    eye.outerDrop * 2.4, eye.lidTop * 3.4, eye.lidBottom * 2.4,
    eye.fold * 1.2 + eye.sparkle * 0.8,
    brow.arch * 1.6, brow.tilt * 1.6, brow.innerW * 0.8, brow.outerW * 0.8,
    brow.hairy * 0.7 + brow.hook * 0.6, brow.reach * 0.7,
    nose.width * 1.1, nose.tipH * 0.8, nose.bridge * 0.3,
    nose.hook * 0.7 + nose.upturn * 0.7, nose.nostril * 0.4,
    mouth.lift * 1.5, mouth.open * 1.5, mouth.pucker * 0.9,
    mouth.upperLip * 0.5 + mouth.lowerLip * 0.5, mouth.teeth * 0.7, mouth.skew * 0.8,
    beard.moustache * 1.2, beard.chin * 1.2, beard.cheek * 1.2,
    beard.jaw * 0.8, beard.length * 0.9,
  ]
}

/** The parts of a hat that change its silhouette, scaled to the same range. */
function hatFeatures(h: HatSpec): number[] {
  if (h.id === 'none') return [0, 0, 0, 0, 0, 0, 0]
  return [
    h.crownW * 1.4, h.crownH * 2.2, h.crownN * 0.4, h.taper * 1.2,
    h.brim * 1.8, h.brimWrap * 0.7, h.peaks * 0.16 + h.peakH * 1.2,
  ]
}

/** The parts of a pair of glasses that change their shape. */
function glassesFeatures(sp: GlassesSpec): number[] {
  if (sp.id === 'none') return [0, 0, 0, 0]
  return [sp.lensW * 1.6, sp.lensH * 1.6, sp.lensN * 0.35, sp.flick * 1.4 + sp.halfCut]
}

/** The parts of a collar that change its shape. */
function collarFeatures(c: CollarSpec): number[] {
  return [
    c.openWidth * 0.9, c.dropDepth * 0.04, c.vee * 0.8,
    c.standHeight * 0.03 + c.bandDepth * 0.04,
    c.pointReach * 0.7 + c.pointSplay * 0.4,
    (c.bib > 0 ? 0.7 : 0) + (c.straps > 0 ? 0.5 : 0) + (c.flap > 0 ? 0.6 : 0)
      + (c.ruffle > 0 ? 0.6 : 0) + (c.wrap > 0 ? 0.5 : 0),
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
