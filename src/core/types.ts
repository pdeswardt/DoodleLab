/**
 * Phenotype types — the drawable expression of a character.
 *
 * Kept deliberately separate from the DNA (see `dna.ts`). The DNA holds latent
 * traits, history and probabilities; this holds the concrete numbers the pencil
 * engine consumes. One is the genotype, the other is what you actually see.
 */

import type { Hsl } from './color'
import type { WordPool } from './words'
import type { AppliedQuirk } from './quirks'
import type { CharacterDNA } from './dna'

/* ------------------------------------------------------------ vocabularies */

export type LidStyle = 'open' | 'wide' | 'half' | 'closed' | 'wink' | 'sparkle' | 'squint'
export type NoseStyle = 'button' | 'beak' | 'upturned' | 'broad' | 'long' | 'blob'
export type MouthStyle = 'smile' | 'grin' | 'smirk' | 'ohh' | 'flat' | 'toothy' | 'pout' | 'whistle'
export type BrowStyle =
  | 'soft' | 'bushy' | 'thin' | 'arched' | 'straight' | 'worried'
  | 'bar' | 'wedge' | 'comma' | 'dash' | 'unibrow' | 'angled'

/** Eye outlines are built from corner positions, not from a clamped ellipse. */
export type EyeShape =
  | 'round' | 'almond' | 'narrow' | 'droop' | 'upturn' | 'wide' | 'dot' | 'hooded'

/**
 * Head silhouette families.
 *
 * Not modifiers on one oval — each is its own width-versus-height profile, so a
 * heart-shaped face and a jowly one are different constructions rather than the
 * same egg with different numbers.
 */
export type HeadFamily =
  | 'oval' | 'heart' | 'blocky' | 'pear' | 'long'
  | 'bulb' | 'angular' | 'lopsided' | 'chinny' | 'wide'

/** How the shoulders are built. The single biggest silhouette cue in a bust. */
export type ShoulderStyle =
  | 'sloped' | 'square' | 'round' | 'hunched' | 'narrow' | 'uneven'
export type CollarStyle =
  | 'buttonup' | 'crew' | 'turtleneck' | 'vneck' | 'overalls'
  | 'apron' | 'robe' | 'hoodie' | 'sailor' | 'ruffle'
export type PatternStyle = 'none' | 'plaid' | 'stripe' | 'dot' | 'knit' | 'check' | 'zigzag' | 'speck'
export type GlassesStyle = 'none' | 'round' | 'square' | 'halfmoon' | 'monocle' | 'goggles' | 'cateye'
export type HatStyle =
  | 'none' | 'beanie' | 'beret' | 'cap' | 'sunhat' | 'band' | 'crown' | 'kerchief' | 'boat'
export type FacialHairStyle =
  | 'none' | 'stubble' | 'moustache' | 'goatee' | 'beard' | 'muttonchops' | 'fluff'
export type HeadShape = 'round' | 'pear' | 'square' | 'egg' | 'acorn' | 'moon'

/**
 * Hair as parameters rather than as a fixed list of drawings. A "style" is a
 * preset of these numbers which variation then perturbs, so two characters
 * sharing a style id still do not share hair.
 */
export interface HairSpec {
  id: string
  /** Mass behind the head, as a fraction of head radius. 0 = none. */
  back: number
  /** How far the crown rises above the skull. */
  crown: number
  /** How far the sides fall past the ears. */
  sides: number
  tufts: number
  tuftLen: number
  /** Forehead coverage, 0..1. */
  fringe: number
  /** 0 = poker straight, 1 = tight coils. */
  curl: number
  bun: 'none' | 'top' | 'back' | 'double'
  tail: 'none' | 'low' | 'high' | 'twin'
  braids: number
  mohawk: boolean
  bald: boolean
  /** Parting position, -1 (far left) .. 1 (far right). */
  part: number
  /** How tall the silhouette stands — used by hat compatibility rules. */
  height: number
}

export interface Palette {
  skin: Hsl
  blush: Hsl
  hair: Hsl
  garment: Hsl
  garmentAlt: Hsl
  accent: Hsl
  wash: Hsl
  washAlt: Hsl
  /** Outline colour. Never black — a deep, desaturated cousin of the local hue. */
  ink: Hsl
  /** Grime colour, derived from the environment the character works in. */
  grime: Hsl
}

export interface Build {
  cx: number
  cy: number
  headRx: number
  headRy: number
  /** Superellipse exponent: >2 squares the skull off, <2 pinches it. */
  headN: number
  /** Horizontal superellipse exponent — high values flatten the sides. */
  headNx: number
  shape: HeadShape
  family: HeadFamily
  /** Half-width multipliers at crown, upper temple, temple, cheek, jaw, chin. */
  profile: number[]
  /** Lopsidedness: one side of the skull wider than the other. */
  headAsym: number
  /** Draw the outline with fewer, harder samples — a faceted skull. */
  facet: boolean
  shoulderStyle: ShoulderStyle
  /** Per-side shoulder height offsets. */
  shoulderRise: [number, number]
  shoulderRound: number
  jaw: number
  crown: number
  cheek: number
  chin: number
  tilt: number
  /** Suggestion of a three-quarter turn, -1 (their right) .. 1. */
  turn: number
  /** How large this figure is drawn within its frame. */
  frameScale: number
  /** Per-character drawing style — pressure, wrist looseness, hatch direction. */
  pressure: number
  lineWobble: number
  hatchAngle: number
  finish: number
  nib: number
  looseness: number
  neckW: number
  neckY: number
  shoulderY: number
  shoulderW: number
  slope: number
}

/** Subtle left/right differences. Never large enough to read as deformity. */
export interface Asymmetry {
  eyeDY: number
  eyeDR: number
  browDY: number
  earDY: number
  noseSkew: number
  mouthTilt: number
}

export interface Face {
  eyeShape: EyeShape
  /** Scales every feature together — small features on a big face, or the reverse. */
  featureScale: number
  eyeSpacing: number
  eyeY: number
  eyeR: number
  eyeTilt: number
  lid: LidStyle
  lashes: boolean
  iris: Hsl
  irisAlt: Hsl | null
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
  /** Age lines: crow's feet and nasolabial folds, 0..1. */
  lines: number
  smudge: boolean
  mole: { x: number; y: number } | null
  thirdEye: boolean
  toothGap: boolean
  bigEar: 0 | -1 | 1
  crookedNose: number
  cloudyEye: 0 | -1 | 1
  scar: { x: number; y: number; angle: number; len: number } | null
  asym: Asymmetry
}

export interface Garment {
  collar: CollarStyle
  pattern: PatternStyle
  patternScale: number
  patternAngle: number
  buttons: number
  /** Indices of buttons that have gone missing. */
  missingButtons: number[]
  pocket: boolean
  lapel: boolean
  scarf: boolean
  scarfColor: Hsl
  /** Mismatched second colour, from a clothing quirk. */
  mismatch: Hsl | null
}

export interface Extras {
  glasses: GlassesStyle
  hat: HatStyle
  hatTilt: number
  hatColor: Hsl
  earring: boolean
  necklace: boolean
  bandaid: boolean
  /** A charm, badge or token pinned to the collar. */
  pin: boolean
}

/** Structured wear, placed where wear physically happens. */
export interface Condition {
  /** 0 = spotless, 1 = filthy. */
  grime: number
  /** 0 = new, 1 = threadbare. Concentrated on edges and contact points. */
  wear: number
  /** Visible damage: tears and frays. */
  damage: number
  /** Sewn-on repairs. */
  patches: number
  stains: { x: number; y: number; r: number }[]
  /** Face smudge from a long shift. */
  tired: number
}

export interface Wash {
  cx: number
  cy: number
  rx: number
  ry: number
  n: number
  wobble: number
  lumps: number
  motes: number
  tilt: number
  twoTone: boolean
}

/** Everything the renderer needs, and nothing it does not. */
export interface Genome {
  seed: string
  index: number
  moodId: string
  archetype: string
  archetypeName: string
  role: string
  word: string
  wordPool: WordPool
  palette: Palette
  build: Build
  hair: HairSpec
  face: Face
  garment: Garment
  extras: Extras
  condition: Condition
  quirks: AppliedQuirk[]
  wash: Wash
  lightAngle: number
  /** How far this individual sits from the population mean, 0..1. */
  variation: number
  memorability: number
  /** The genotype this was expressed from — kept for the inspector and export. */
  dna: CharacterDNA
}

/** Composition constants — the art-unit box every character is drawn inside. */
export const ART = { w: 240, h: 300, captionY: 276 } as const
