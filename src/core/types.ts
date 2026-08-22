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
/**
 * The shoulders as parameters.
 *
 * Six literal control-point sets, of which the renderer read three fields and
 * invented the rest from its own constants — so the control point that decides
 * the whole personality of a shoulder line moved across 13% of shoulder width
 * over an entire population. Every bust on a sheet was the same shoulder at a
 * different span, which a viewer reads before any trait registers.
 */
export interface ShoulderSpec {
  id: ShoulderStyle
  /** Span multiplier on the base shoulder width. */
  width: number
  /** How far the tip falls below the shoulder line, x shoulder half-width. */
  tipDrop: number
  /** Where the control point sits along the neck-to-tip run, 0..1. */
  ctrlX: number
  /**
   * Control point height against the shoulder line, x head half-height.
   * Negative lifts it toward the ears, which is what a hunch actually is.
   */
  ctrlY: number
  /** How high the neck-to-shoulder ramp starts — the trapezius. */
  trapRise: number
  /** 0 = a concave ramp, 1 = a convex one. The real sloped-to-square axis. */
  trapCurve: number
  /** 0 = a sharp corner at the tip, 1 = a generous turn. */
  tipTurn: number
  /** How far that turn reaches down, in art units. */
  tipReach: number
  /** Below 1 the torso narrows toward the crop, above 1 it flares. */
  sideTaper: number
  /** Bow of the side edge: a barrelled torso against a straight one. */
  sideBow: number
  /** Per-side lift. An uneven pair is its own style, but everyone has some. */
  riseL: number
  riseR: number
}

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
 * The face as parameters.
 *
 * Every one of these used to be a `switch` on a style id inside the renderer:
 * seven lid presets, eight eye outlines, eleven hand-drawn brow spines, six
 * noses, eight mouths, seven beards. Two characters landing on the same id got
 * literally the same drawing, and on a 16x16 sheet that is what the repetition
 * was — not the colour, the geometry.
 *
 * The ids survive as *biases* on the ranges these numbers are drawn from (see
 * `EYE_FAMILIES` and friends in `dna.ts`). The renderer reads the numbers and
 * branches on no id at all, so a "round" eye and an "almond" one are two draws
 * from one continuous space rather than two drawings.
 */
export interface EyeGeom {
  /** How much of the opening the upper lid covers, 0..1. 1 with `lidBottom` = shut. */
  lidTop: number
  lidBottom: number
  /** Vertical scale of the whole opening. */
  tall: number
  /** Height of the upper and lower lid curves, x eye radius. */
  topH: number
  botH: number
  /** Corner-to-corner width, x eye radius. */
  widen: number
  /** Outer corner offset, x eye radius. Positive droops, negative flicks up. */
  outerDrop: number
  /** Inner corner offset, x eye radius. */
  innerDrop: number
  /** Hooded fold above the lid. 0 = none. */
  fold: number
  /** Catchlight size and the four-point flick beside it. 0 = neither. */
  sparkle: number
  /** Which eye is shut regardless of the lids. 0 = both open. */
  winkSide: number
}

/**
 * A brow as one spine plus a width that varies along it.
 *
 * The eleven literal spines are gone: an arch height, a tilt, a belly position
 * and two end widths reach all of them and everything between. A unibrow is
 * not a twelfth shape, it is a large `reach` — both brows extended far enough
 * inboard that they meet over the bridge.
 */
export interface BrowGeom {
  /** Rise of the middle above the chord, x brow half-length. Negative sags. */
  arch: number
  /** Outer end raised against the inner, x brow half-length. Negative = worried. */
  tilt: number
  /** Where the arch peaks along the length, 0 = inner end, 1 = outer. */
  belly: number
  /** Half-thickness at each end, x brow thickness. */
  innerW: number
  outerW: number
  /** Comma tail hooking down past the outer end, x brow half-length. 0 = none. */
  hook: number
  /** Extension inboard past the inner end, x brow half-length. */
  reach: number
  /** Drawn as separate hairs rather than as a solid mass, 0..1. */
  hairy: number
  /** How far the marks break up, 0 = continuous. */
  broken: number
  /** How many hairs the mass is made of, 0..1. */
  density: number
}

/**
 * A nose. Every part of it is a length or a fraction, including how much of it
 * is drawn as line rather than as shadow — which is the difference between a
 * cartoon nose and a rendered one, and used to be a hardcoded property of the
 * style id.
 */
export interface NoseGeom {
  /** Half-width of the tip, x the nose's base width. */
  width: number
  /** Height of the tip, x the nose's base height. */
  tipH: number
  /** How far the tip hangs below the nose line, x base height. Negative lifts it. */
  tipDrop: number
  /** Length of the bridge above the tip, x base height. 0 = no bridge at all. */
  bridge: number
  /** Forward curl of the profile, 0 = straight. */
  hook: number
  /** Upward curl of the underside, 0 = flat. */
  upturn: number
  /** Nostril size, x tip width. 0 = none drawn. */
  nostril: number
  /** How strongly the form is outlined, 0..1. */
  contour: number
  /** How strongly it is modelled with shadow instead, 0..1. */
  shadow: number
}

/**
 * A mouth. One seam curve with a lens of opening around it — the closed and
 * open mouths are the same construction with `open` at zero or not, rather
 * than a smile branch and an "ohh" branch.
 */
export interface MouthGeom {
  /** Corner height against the middle. Positive smiles, negative frowns. */
  lift: number
  /** Height of the opening, x mouth half-width. 0 = closed. */
  open: number
  /** Lip thickness, x mouth half-width. */
  upperLip: number
  lowerLip: number
  /** How much of the opening the teeth fill, 0..1. */
  teeth: number
  /** How far the corners are drawn in toward the middle, 0..1. */
  pucker: number
  /** Left/right asymmetry. A smirk is a large one. */
  skew: number
}

/**
 * Facial hair as four masses and a texture rather than as seven drawings.
 *
 * A goatee is chin mass with no cheek mass, muttonchops are cheek mass with no
 * chin, a full beard is both plus jaw coverage, and stubble is all of them at
 * zero length. The rate at which facial hair is rolled at all is decided in
 * `genFace` and is not touched here.
 */
export interface BeardGeom {
  /** Mass under the nose, x head half-width. 0 = none. */
  moustache: number
  /** Mass on the chin. */
  chin: number
  /** Mass on the cheeks and sideburns. */
  cheek: number
  /** How far the mass runs along the jaw between the two, 0..1. */
  jaw: number
  /** How thick the growth is, 0..1. */
  density: number
  /** Hair length, 0 = stubble, 1 = long strands. */
  length: number
}

export interface FaceGeom {
  eye: EyeGeom
  brow: BrowGeom
  nose: NoseGeom
  mouth: MouthGeom
  beard: BeardGeom
}

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
  shoulderSpec: ShoulderSpec
  /** Per-side shoulder height offsets. */
  shoulderRise: [number, number]
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
  /** The numbers the renderer actually draws from. The ids above only biased them. */
  geom: FaceGeom
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
