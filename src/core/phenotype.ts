/**
 * Expression: DNA -> drawable character.
 *
 * The genotype is abstract (latent traits, probabilities, history). This turns
 * it into the concrete numbers the pencil engine draws with: pixel radii, art-
 * unit coordinates, actual colours. It is also where the quirk layer finally
 * bites — a trait quirk rewrites the phenotype here rather than being handled
 * by the renderer.
 */

import { Rng } from './rng'
import { hsl, adjust, mix, clamp, type Hsl, type Mood } from './color'
import { STYLES, type StyleProfile } from './style'
import { archetypeById } from './archetypes'
import type { CharacterDNA, Triple } from './dna'
import { hairHeight } from './dna'
import { hasQuirk, type AppliedQuirk } from './quirks'
import type { WordBag, WordPool } from './words'
import {
  ART, type Build, type Condition, type Face, type Garment, type Genome,
  type HairSpec, type HeadShape, type Palette, type Wash,
} from './types'

const toHsl = (t: Triple): Hsl => hsl(t[0], t[1], t[2])

const HEAD_SHAPES: Record<HeadShape, { n: number; ratio: number }> = {
  round: { n: 2.05, ratio: 1.06 },
  pear: { n: 2.2, ratio: 1.04 },
  square: { n: 2.7, ratio: 1 },
  egg: { n: 2.1, ratio: 1.16 },
  acorn: { n: 2.35, ratio: 1.02 },
  moon: { n: 1.9, ratio: 0.94 },
}

function expressPalette(dna: CharacterDNA, hand: StyleProfile): Palette {
  const p = dna.palette
  // Untrained colour runs hot and unmixed; a trained hand keeps a chroma
  // ladder with one loud accent and everything else held down.
  const chroma = (c: Hsl, extra = 1): Hsl => hsl(c.h, c.s * hand.saturation * extra, c.l)
  const skin = chroma(toHsl(p.skin))
  const garment = chroma(toHsl(p.garment))
  return {
    skin,
    blush: hsl(skin.h - 9, Math.min(70, skin.s + 26), Math.max(38, skin.l - 6)),
    hair: chroma(toHsl(p.hair)),
    garment,
    garmentAlt: chroma(toHsl(p.garmentAlt)),
    // The accent keeps its chroma at both ends — it is the one loud note.
    accent: toHsl(p.accent),
    wash: chroma(toHsl(p.wash), 0.85),
    washAlt: chroma(toHsl(p.washAlt), 0.85),
    // The ink family. Outlines stay cousins of the local colour rather than
    // going black — but there are now several of them, pitched at different
    // depths, because a single ink drawing every edge is what made the coat
    // pocket read as loudly as the eye.
    keyline: hsl(mix(skin, garment, 0.5).h + 8, 26, 13),
    contourInk: adjust(mix(skin, garment, 0.4), -52, 10),
    lip: hsl(skin.h - 14, 54, 38),
    // The chroma peak of the whole picture, and deliberately its own hue.
    noseAccent: hsl(skin.h - 6, Math.min(78, skin.s + 40), Math.max(46, skin.l - 4)),
    ink: adjust(mix(skin, garment, 0.4), -40, 2),
    grime: toHsl(p.grime),
  }
}

/**
 * Pass values below `knee` through unchanged, then compress everything above
 * it so the result approaches `cap` without ever reaching it.
 */
function softCap(v: number, knee: number, cap: number): number {
  if (v <= knee) return v
  const room = cap - knee
  return knee + room * (1 - Math.exp(-(v - knee) / room))
}

function expressBuild(dna: CharacterDNA, hand: StyleProfile): Build {
  const b = dna.body
  const shape = HEAD_SHAPES[b.shape]
  // An untrained hand draws the head too big, because the head is what matters.
  const headRx = 52 * b.headScale * (0.94 + hand.exaggeration * 0.08)
  const headRy = headRx * shape.ratio * b.headRatio * 0.98
  const cx = ART.w / 2 + b.cxJitter
  const cy = 104 + b.cyJitter
  return {
    cx, cy, headRx, headRy,
    // The family's own vertical exponent, pulled toward the shape enum's so
    // that both still have a say rather than one overriding the other.
    headN: b.headNy * 0.72 + shape.n * 0.28,
    headNx: b.headNx,
    shape: b.shape,
    family: b.family,
    profile: b.profile,
    headAsym: b.headAsym,
    facet: b.facet,
    shoulderStyle: b.shoulderStyle,
    shoulderRise: b.shoulderRise,
    shoulderSpec: b.shoulderSpec,
    jaw: b.jaw,
    crown: b.crown,
    cheek: b.cheek,
    chin: b.chin,
    tilt: b.tilt,
    turn: b.turn,
    frameScale: b.frameScale,
    cropDepth: b.cropDepth,
    pressure: b.pressure,
    lineWobble: b.lineWobble,
    hatchAngle: b.hatchAngle,
    finish: b.finish,
    nib: b.nib,
    looseness: b.looseness,
    neckW: headRx * b.neck,
    // The neckline has to clear the chin, or collars ride up over the mouth.
    neckY: cy + headRy * 1.02,
    shoulderY: cy + headRy * 1.32,
    // Soft-knee the shoulder width. The reference sits the whole figure on
    // the background panel with paper margin outside it, and a wide build
    // times a large head ran the shoulders clean off the frame, covering the
    // panel entirely. Narrow builds pass through untouched; only the widest
    // are compressed, so the variation survives but the figure stays on the
    // panel.
    shoulderW: softCap(headRx * b.shoulderSpan, 70, 95),
    slope: b.slope,
  }
}

function expressFace(dna: CharacterDNA, build: Build, hand: StyleProfile): Face {
  const f = dna.face
  const a = f.asym
  // ...and the features too, especially the eyes.
  const fs = f.featureScale * (0.92 + hand.exaggeration * 0.1)
  return {
    eyeShape: f.eyeShape,
    // Copied, not shared: quirks rewrite the phenotype in place and must not
    // reach back into the genotype they were expressed from.
    geom: {
      eye: { ...f.geom.eye },
      brow: { ...f.geom.brow },
      nose: { ...f.geom.nose },
      mouth: { ...f.geom.mouth },
      beard: { ...f.geom.beard },
    },
    featureScale: fs,
    eyeSpacing: build.headRx * f.eyeSpacing,
    eyeY: build.cy + build.headRy * f.eyeY,
    eyeR: build.headRx * f.eyeSize * fs * (0.9 + hand.exaggeration * 0.13),
    eyeTilt: f.eyeTilt,
    lid: f.lid,
    lashes: f.lashes,
    iris: toHsl(f.iris),
    irisAlt: null,
    pupil: f.pupil,
    gazeX: f.gazeX,
    gazeY: f.gazeY,
    brow: f.brow,
    browThick: f.browThick,
    browLift: f.browLift,
    browAngle: f.browAngle,
    nose: f.nose,
    noseSize: f.noseSize * fs,
    noseY: build.cy + build.headRy * f.noseY,
    mouth: f.mouth,
    mouthW: f.mouthW * fs,
    mouthY: build.cy + build.headRy * f.mouthY,
    earSize: f.earSize * fs,
    earTilt: f.earTilt,
    facialHair: f.facialHair,
    freckles: f.freckles,
    blush: f.blush,
    lines: f.lines,
    smudge: false,
    mole: null,
    thirdEye: false,
    toothGap: false,
    bigEar: 0,
    crookedNose: 0,
    cloudyEye: 0,
    scar: null,
    asym: { ...a },
  }
}

function expressHair(dna: CharacterDNA): HairSpec {
  const h = dna.hair
  return {
    id: h.style,
    back: h.back,
    crown: h.crown,
    sides: h.sides,
    tufts: h.tufts,
    tuftLen: h.tuftLen,
    fringe: h.fringe,
    curl: h.curl,
    bun: h.bun,
    tail: h.tail,
    braids: h.braids,
    mohawk: h.mohawk,
    bald: h.bald,
    part: h.part,
    height: hairHeight(h),
  }
}

/**
 * Trait quirks rewrite the phenotype. Prop quirks are left alone here — the
 * renderer reads them straight off `genome.quirks`.
 */
function applyQuirks(
  quirks: AppliedQuirk[], rng: Rng, face: Face, hair: HairSpec,
  garment: Garment, condition: Condition, palette: Palette, build: Build,
): void {
  for (const q of quirks) {
    const k = q.intensity
    switch (q.id) {
      case 'asym-brows':
        face.asym.browDY += rng.sign() * (1.5 + k * 5)
        break
      case 'crooked-nose':
        face.crookedNose = k * rng.sign()
        face.asym.noseSkew += face.crookedNose * 2.5
        break
      case 'toothgap':
        face.toothGap = true
        if (face.mouth !== 'grin' && face.mouth !== 'toothy') face.mouth = 'toothy'
        // The id no longer decides whether teeth get drawn, the geometry does,
        // so the mouth has to actually be open for the gap to be in anything.
        face.geom.mouth.open = Math.max(face.geom.mouth.open, 0.34)
        face.geom.mouth.teeth = Math.max(face.geom.mouth.teeth, 0.6)
        break
      case 'big-ear':
        face.bigEar = rng.sign() as -1 | 1
        face.earSize *= 1 + k * 0.35
        break
      case 'cloudy-eye':
        face.cloudyEye = rng.sign() as -1 | 1
        break
      case 'scar':
        face.scar = {
          x: rng.range(-0.7, 0.7),
          y: rng.range(-0.25, 0.45),
          angle: rng.range(-1.1, 1.1),
          len: build.headRx * (0.12 + k * 0.3),
        }
        break
      case 'heterochromia':
        face.irisAlt = hsl(face.iris.h + rng.sign() * (70 + k * 120), face.iris.s + 10, face.iris.l + rng.range(-6, 16))
        break
      case 'freckle-storm':
        face.freckles = 0.9 + k * 1.2
        break
      case 'mole':
        face.mole = { x: rng.range(-0.55, 0.55), y: rng.range(0.2, 0.6) }
        break
      case 'blush-storm':
        face.blush = 0.8 + k * 0.9
        break
      case 'cowlick':
        hair.tufts += 1 + Math.round(k * 3)
        hair.tuftLen *= 1 + k * 0.8
        break
      case 'third-eye':
        face.thirdEye = true
        break
      case 'ink-smudge':
        face.smudge = true
        break
      case 'bandaid':
        // Handled as an extra, but recorded here so the face knows to keep the
        // bridge of the nose clear.
        break
      case 'patched':
        condition.patches += 1 + Math.round(k * 3)
        break
      case 'mismatch':
        garment.mismatch = hsl(
          palette.garment.h + rng.sign() * (60 + k * 120),
          palette.garment.s * rng.range(0.7, 1.2),
          palette.garment.l + rng.range(-12, 12),
        )
        break
      case 'missing-button': {
        const n = Math.max(1, Math.round(k * 2))
        for (let i = 0; i < n && garment.buttons > 0; i++) {
          garment.missingButtons.push(rng.int(0, garment.buttons - 1))
        }
        break
      }
      case 'charm':
        garment.scarf = garment.scarf
        break
      default:
        break
    }
  }
}

/** Which word pool this character's loudest trait puts them in. */
function choosePool(dna: CharacterDNA, face: Face, quirks: AppliedQuirk[], rng: Rng): WordPool {
  const arch = archetypeById(dna.archetype)
  const loud = quirks.find((q) => q.tier === 'strong' || q.tier === 'extreme')
  if (loud) {
    if (loud.id === 'third-eye' || loud.id === 'antenna') return 'odd'
    if (loud.id === 'sprout' || loud.id === 'leaf' || loud.id === 'flower') return 'green'
    if (loud.id === 'halo' || loud.id === 'star') return 'bright'
    if (loud.id === 'monocle-chain' || loud.id === 'badges' || loud.id === 'old-tie') return 'grand'
  }
  if ((face.lid === 'half' || face.lid === 'closed') && rng.bool(0.5)) return 'sleepy'
  if (face.lid === 'sparkle' && rng.bool(0.45)) return 'bright'
  if (dna.hair.style === 'wild' && rng.bool(0.35)) return 'wild'
  if (dna.identity.age > 62 && rng.bool(0.25)) return 'sturdy'
  return arch.pool
}

export interface ExpressOptions {
  mood: Mood
  words: WordBag
  /**
   * The sheet's key light, in radians.
   *
   * One artist lights a whole set from one direction. Randomising it per
   * character costs the sheet its cohesion and buys nothing a viewer can name —
   * they cannot tell you the light moved, only that the page looks incoherent.
   */
  lightAngle?: number
  /**
   * Whose hand is drawing.
   *
   * Three of the style profile's fields — chroma, proportion exaggeration and
   * how much form modelling is applied — have to act here rather than at
   * mark-making time, because they change *what is drawn*, not how a mark is
   * laid. Left unconsumed, the whole axis collapsed to a pressure multiply and
   * the two ends differed by 3% of pixels.
   */
  hand?: StyleProfile
}

/** Turn one genotype into one drawable character. */
export function express(dna: CharacterDNA, o: ExpressOptions): Genome {
  const rng = new Rng(`${dna.masterSeed}#${dna.index}:express`)
  const arch = archetypeById(dna.archetype)
  const hand = o.hand ?? STYLES.adult
  const palette = expressPalette(dna, hand)
  const build = expressBuild(dna, hand)
  const face = expressFace(dna, build, hand)
  const hair = expressHair(dna)

  const garment: Garment = {
    collar: dna.wardrobe.collar,
    collarSpec: dna.wardrobe.collarSpec,
    pattern: dna.wardrobe.pattern,
    patternScale: dna.wardrobe.patternScale,
    patternAngle: dna.wardrobe.patternAngle,
    buttons: dna.wardrobe.buttons,
    missingButtons: [],
    pocket: dna.wardrobe.pocket,
    lapel: dna.wardrobe.lapel,
    scarf: dna.wardrobe.scarf,
    scarfColor: palette.accent,
    mismatch: null,
  }

  const condition: Condition = {
    grime: dna.condition.grime,
    wear: dna.condition.wear,
    damage: dna.condition.damage,
    patches: dna.condition.patches,
    stains: dna.condition.stains.map((s) => ({
      x: build.cx + s.x * build.shoulderW,
      y: build.shoulderY + s.y * 96,
      r: s.r,
    })),
    tired: dna.condition.tired,
  }

  const extras = {
    glasses: dna.wardrobe.glasses,
    glassesSpec: dna.wardrobe.glassesSpec,
    hat: dna.wardrobe.hat,
    hatSpec: dna.wardrobe.hatSpec,
    hatTilt: dna.wardrobe.hatTilt,
    hatColor: rng.bool(0.5) ? palette.garmentAlt : palette.accent,
    earring: dna.wardrobe.earring,
    necklace: dna.wardrobe.necklace,
    bandaid: !!hasQuirk(dna.quirks, 'bandaid'),
    pin: !!hasQuirk(dna.quirks, 'charm'),
  }

  applyQuirks(dna.quirks, rng.fork('quirk-apply'), face, hair, garment, condition, palette, build)

  // A long shift shows on the face before it shows anywhere else.
  if (condition.tired > 0.55) face.lines = Math.max(face.lines, (condition.tired - 0.55) * 0.6)

  const wr = rng.fork('wash')
  const wash: Wash = {
    // A panel the whole figure sits on, roughly three quarters of the frame,
    // not a halo around the head — see the reference. The white margin outside
    // it is part of the composition.
    cx: ART.w / 2 + wr.gauss(0, 5),
    cy: ART.h * 0.44 + wr.gauss(0, 7),
    rx: ART.w * wr.range(0.40, 0.45),
    ry: ART.h * wr.range(0.40, 0.45),
    // Well above 2, so it is a rounded square rather than an ellipse.
    n: wr.range(3.2, 5.4),
    wobble: wr.range(0.05, 0.14),
    lumps: wr.range(1.6, 3.4),
    motes: wr.bool(0.3 + dna.controls.memorability * 0.3) ? wr.int(3, 9) : 0,
    tilt: wr.gauss(0, 0.09),
    twoTone: wr.bool(0.45),
  }

  const pool = choosePool(dna, face, dna.quirks, rng.fork('pool'))
  // The word offset comes from the fingerprint, so a character keeps the same
  // preferred word across sheets even as the bag resolves collisions.
  const word = o.words.take(pool, parseInt(dna.fingerprint.slice(0, 6), 16) % 997)

  return {
    seed: dna.masterSeed,
    index: dna.index,
    moodId: o.mood.id,
    archetype: dna.archetype,
    archetypeName: arch.name,
    role: dna.roleName,
    word,
    wordPool: pool,
    palette, build, hair, face, garment, extras, condition,
    quirks: dna.quirks,
    wash,
    // Near-constant across the sheet; the jitter is the hand, not the lamp.
    lightAngle: (o.lightAngle ?? -Math.PI * 0.72) + rng.gauss(0, 0.05),
    variation: dna.controls.variationStrength,
    memorability: dna.controls.memorability,
    dna,
  }
}

/** Human-readable summary for the inspector. */
export function describe(g: Genome): [string, string][] {
  const id = g.dna.identity
  const f = g.face
  const rows: [string, string][] = [
    ['Who', `${g.archetypeName} — ${g.role}`],
    ['Age', `${id.age}${id.yearsInRole > 0 ? `, ${id.yearsInRole} yr${id.yearsInRole === 1 ? '' : 's'} at it` : ''}`],
    ['Build', `${describeAxis(id.frame, 'slight', 'broad')} frame, ${describeAxis(id.mass, 'lean', 'heavyset')}`],
    ['Head', `${g.build.shape}${g.build.jaw > 1.12 ? ', strong jaw' : g.build.jaw < 0.9 ? ', tapered jaw' : ''}`],
    ['Hair', `${g.hair.id}${g.hair.curl > 0.7 ? ', tightly curled' : g.hair.curl < 0.2 ? ', straight' : ''}${g.dna.hair.density < 0.5 ? ', thinning' : ''}`],
    ['Eyes', `${f.lid}${f.lashes ? ', lashed' : ''}${f.irisAlt ? ', mismatched' : ''}`],
    ['Nose & mouth', `${f.nose}, ${f.mouth}`],
    ['Wearing', `${g.garment.collar}${g.garment.pattern !== 'none' ? `, ${g.garment.pattern}` : ''}${g.extras.hat !== 'none' ? `, ${g.extras.hat}` : ''}`],
    ['Condition', describeCondition(g.condition)],
  ]
  if (f.facialHair !== 'none') rows.push(['Facial hair', f.facialHair])
  if (g.extras.glasses !== 'none') rows.push(['Glasses', g.extras.glasses])
  return rows
}

function describeAxis(v: number, low: string, high: string): string {
  if (v < -0.4) return `very ${low}`
  if (v < -0.12) return low
  if (v > 0.4) return `very ${high}`
  if (v > 0.12) return high
  return 'average'
}

function describeCondition(c: Condition): string {
  const bits: string[] = []
  bits.push(c.grime < 0.25 ? 'clean' : c.grime < 0.55 ? 'a day’s dust' : 'thoroughly grubby')
  if (c.wear > 0.6) bits.push('well worn')
  if (c.patches > 0) bits.push(`${c.patches} patch${c.patches === 1 ? '' : 'es'}`)
  if (c.tired > 0.7) bits.push('end of a long shift')
  return bits.join(', ')
}

export { clamp }
