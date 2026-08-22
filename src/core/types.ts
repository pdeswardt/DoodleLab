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
/**
 * The neckline as parameters. Ten hardcoded collar drawings meant every
 * button-up on a sheet had the same points at the same angle, and the only
 * difference between two of them was the colour.
 *
 * A collar is not one shape but a set of independent parts — an opening, a
 * band, folded points, lapels, a placket, straps, a bib, a flap, a ruffle, a
 * wrap — each of which is present or absent and continuously sized. The
 * families are regions of that space: a button-up is points plus a placket, a
 * turtleneck is a tall ribbed band, overalls are straps plus a bib.
 */
export interface CollarSpec {
  id: CollarStyle
  /** Half-width of the opening, x neck half-width. */
  openWidth: number
  /** How far the opening drops below the neck line, in art units. */
  dropDepth: number
  /** 0 = a round scoop, 1 = a straight V. */
  vee: number
  /** Thickness of the band following the opening. 0 = a raw edge. */
  bandDepth: number
  /** How far the band stands above the neck line. A turtleneck is tall here. */
  standHeight: number
  /** Ribbing lines drawn on a standing band. */
  ribs: number
  /** Reach of the folded points either side, x neck half-width. 0 = none. */
  pointReach: number
  /** How far those points fall, in art units. */
  pointDrop: number
  /** How far they splay outward against down, 0..1. */
  pointSplay: number
  /** Lapels folded back from the points. 0 = none. */
  lapel: number
  /** A placket down the front. 0 = none. */
  placket: number
  /** Straps over the shoulders, as a width. 0 = none. */
  straps: number
  /** A bib panel across the chest. 0 = none, otherwise its top edge in art units. */
  bib: number
  /** Half-width of that bib, x neck half-width. */
  bibWidth: number
  /** A square flap falling behind the shoulders. 0 = none. */
  flap: number
  /** Scalloped ruffle along the neckline. 0 = none. */
  ruffle: number
  ruffleCount: number
  /** Asymmetric crossed panels. 0 = symmetric. */
  wrap: number
  /** Drawstrings hanging from the band. 0 = none. */
  strings: number
}

/**
 * Eyewear as parameters, for the same reason headwear is. Four fixed lens
 * outlines meant every pair of round glasses on a sheet was the *same* pair.
 * Round, square, half-moon and cat-eye are all one superellipse with a
 * different exponent, aspect and outer-corner flick.
 */
export interface GlassesSpec {
  id: GlassesStyle
  /** Lens half-width, x eye radius. */
  lensW: number
  /** Lens half-height, x eye radius. */
  lensH: number
  /** Superellipse exponent: 2 = round, 4 = rectangular, below 2 = pinched. */
  lensN: number
  /** Cat-eye flick at the outer top corner, x eye radius. */
  flick: number
  /** Cut the lens off above this height, 0 = whole lens, 1 = half-moon. */
  halfCut: number
  /** Tilt of each lens, in radians. */
  lensTilt: number
  /** Frame thickness in art units. */
  frameW: number
  /** How far past the eye the lens centres sit, x eye radius. */
  spread: number
  /** Bridge height relative to the lens centre, x eye radius. */
  bridgeY: number
  /** Downward sag of the bridge, x eye radius. A keyhole against a flat bar. */
  bridgeSag: number
  /** false = a monocle. */
  pair: boolean
  /** A strap round the head instead of arms. */
  strap: boolean
  /** How much the glass is tinted, 0 = clear. */
  tint: number
}

export type HatTrim =
  | 'none' | 'bobble' | 'feather' | 'pin' | 'stud' | 'knot' | 'tassel' | 'jewels'

/**
 * Headwear as parameters rather than as a fixed list of drawings — the same
 * treatment `HairSpec` already gets.
 *
 * Eight hardcoded hat drawings meant every beanie on a sheet was the same
 * beanie in a different colour. Here the style id only *biases* the numbers
 * below; the shape itself is built from them, and every one is jittered per
 * character. A cap is a low crown with a one-sided brim, a sunhat is a small
 * crown with a wide all-round brim, a coronet is a shallow band with tall
 * points — they are regions of one parameter space, not separate drawings.
 */
export interface HatSpec {
  id: HatStyle
  /** Crown half-width, x head half-width. */
  crownW: number
  /** Crown height, x head half-height. */
  crownH: number
  /** How far down the skull the crown sits, x head half-height. */
  seat: number
  /** Superellipse exponent: 2 = dome, 4 = boxy, below 2 = pointed. */
  crownN: number
  /** Width at the top relative to the base: below 1 tapers, above 1 flares. */
  taper: number
  /** Sideways lean of the crown mass, x head half-width. */
  lean: number
  /** Silhouette irregularity — soft cloth against stiff felt. */
  slouch: number
  lumps: number
  /** Brim reach past the crown, x head half-width. 0 = no brim. */
  brim: number
  /** 1 = brim all round, 0 = a peak on one side only. */
  brimWrap: number
  /** Brim thickness, x head half-height. */
  brimDrop: number
  /** Positive droops, negative curls up. */
  brimCurl: number
  /** Band height as a fraction of crown height. 0 = none. */
  band: number
  /** Where the band sits up the crown; 0 = at the base. */
  bandY: number
  /** Points rising from the crown. 0 = none. */
  peaks: number
  /** Height of those points, x head half-height. */
  peakH: number
  /** 0 = round scallops, 1 = needle points. */
  peakSharp: number
  /** Turn-up cuff at the base, x head half-height. 0 = none. */
  cuff: number
  /** Seams drawn down the crown. */
  seams: number
  /** Which side a one-sided brim points. Independent of the hat's tilt. */
  brimSide: -1 | 1
  /** Brim outline exponent: 2 = a round disc, 4+ = a squared-off plank. */
  brimN: number
  /** Tilt of the brim as a whole, in radians — worn up, level or pulled down. */
  brimAngle: number
  /** Crease pressed into the top of the crown, x crown height. */
  dent: number
  /** The one decorative extra. */
  trim: HatTrim
  trimScale: number
  /** Where round the hat the trim sits, in radians. */
  trimAngle: number
}

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
  /**
   * The ink family.
   *
   * One outline colour for the whole drawing is the mud that made everything
   * read as equally important. A trained hand uses several, and the difference
   * between them *is* the hierarchy: a near-black keyline on the two or three
   * marks that must land hardest, a warm dark for the silhouette, a saturated
   * hairline for the mouth, and a soft one for everything meant to recede.
   */
  /** Near-black, slightly cool. Pupils, glasses, the deepest hair core. Use sparingly. */
  keyline: Hsl
  /** Warm dark of the local colour — the head silhouette and other real edges. */
  contourInk: Hsl
  /** Saturated red-violet for the mouth line. */
  lip: Hsl
  /** The nose's own hue: the picture's chroma peak, not a warmed skin tone. */
  noseAccent: Hsl
  /** The soft ink. Marks that should sit back. */
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
  /** How low the bust is cut off by the frame. */
  cropDepth: number
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
  collarSpec: CollarSpec
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
  glassesSpec: GlassesSpec
  hat: HatStyle
  hatSpec: HatSpec
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
