import type { Hsl } from './color'

/**
 * Who is holding the pencil.
 *
 * The generator can vary a character's every trait and still produce a sheet
 * that reads as one drawing, because the *hand* is constant. This axis is that
 * hand: not what is drawn, but how it is drawn.
 *
 * The two ends are not "worse" and "better". A child's drawing has its own
 * discipline — bold contours, flat colour, features as symbols, proportions
 * pushed for what matters rather than for what is accurate. A trained hand
 * models form, constructs features from underlying anatomy, controls value,
 * and spends its detail budget where the eye goes. Both are coloured pencil on
 * paper; they differ in everything else.
 */

export type DrawStyle = 'child' | 'adult' | 'doodle'

export interface StyleProfile {
  id: DrawStyle
  name: string
  blurb: string

  /* ------------------------------------------------------------ the hand */

  /** Multiplier on how far a mark wanders from its intended path. */
  wobble: number
  /** Multiplier on how often the pencil lifts mid-stroke. */
  gaps: number
  /** How wide a hatch line is relative to the gap beside it. */
  nib: number
  /** Multiplier on outline weight. */
  contourAlpha: number
  contourWidth: number
  /** How much a mark fades at its ends. A trained hand tapers deliberately. */
  taper: number
  /** Per-character spread of hatch direction. */
  angleSpread: number

  /* ------------------------------------------------------------- the eye */

  /** 0 = flat local colour, 1 = fully modelled form. */
  modelling: number
  /** Multiplier on how dark the darks go. */
  valueRange: number
  /**
   * Detail hierarchy: how much more worked the face is than the periphery.
   * A child draws everything at one intensity; a trained hand does not.
   */
  hierarchy: number

  /* ----------------------------------------------------- the construction */

  /**
   * 0 = features are symbols (a circle eye, a dot nose), 1 = features are
   * constructed from their underlying anatomy — lid crease, tear duct, nasal
   * bridge, lip volume.
   */
  construction: number
  /** Multiplier on how far proportions are pushed past the anatomical norm. */
  exaggeration: number

  /* ---------------------------------------------------------- the palette */

  /** Multiplier on chroma. Untrained colour runs hot and unmixed. */
  saturation: number

  /* ------------------------------------------------------ the composition */

  /**
   * What is on the page. 'bust' is head, neck and shoulders cropped by the
   * frame; 'head' is a head alone, floating, with nothing under it.
   */
  composition: 'bust' | 'head'
  /**
   * Multiplier on facial asymmetry.
   *
   * A trained hand draws a face level and then breaks it deliberately; a
   * doodle puts one eye higher and larger than the other because that is where
   * the pen went. Real faces are asymmetric, so this is never below 1.
   */
  asym: number
  /**
   * How far this hand ages its paper: [hue shift, saturation multiplier,
   * lightness delta]. Pen on a warm old page is a different object from
   * coloured pencil on a fresh white sheet.
   */
  paperTint: readonly [number, number, number]
  /**
   * How much the drawing is a pen line rather than pigment.
   *
   * At 0 the contour is a soft cousin of the local colour and the form is
   * carried by hatching. At 1 the contour is a dark ink line carrying the whole
   * drawing, and colour is a thin flat note behind it — which is a different
   * medium, not a harder pencil.
   */
  ink: number
  /**
   * The background. 'panel' is the large rounded square the figure sits on;
   * 'patch' is a small shape behind the head — a circle, a square, a scribble,
   * or nothing at all.
   */
  backdrop: 'panel' | 'patch'
}

export const STYLES: Record<DrawStyle, StyleProfile> = {
  child: {
    id: 'child',
    name: 'Child',
    blurb: 'bold outlines, flat colour, features as symbols',
    wobble: 1.45,
    gaps: 1.35,
    nib: 0.9,
    contourAlpha: 1.35,
    contourWidth: 1.25,
    taper: 0.6,
    angleSpread: 1.4,
    modelling: 0.35,
    valueRange: 0.7,
    hierarchy: 0.2,
    construction: 0.1,
    exaggeration: 1.25,
    saturation: 1.3,
    composition: 'bust',
    asym: 1.25,
    paperTint: [0, 1, 0],
    // Both ends of this axis are coloured pencil. A bold child's outline is
    // still pigment, not pen, so neither end sits anywhere but zero here.
    ink: 0,
    backdrop: 'panel',
  },
  adult: {
    id: 'adult',
    name: 'Illustrator',
    blurb: 'modelled form, constructed features, controlled value',
    wobble: 0.45,
    gaps: 0.4,
    nib: 0.78,
    contourAlpha: 0.8,
    contourWidth: 0.85,
    taper: 1.25,
    angleSpread: 0.55,
    modelling: 1,
    valueRange: 1.3,
    hierarchy: 1,
    construction: 1,
    exaggeration: 0.75,
    saturation: 0.85,
    composition: 'bust',
    asym: 1,
    paperTint: [0, 1, 0],
    ink: 0,
    backdrop: 'panel',
  },

  /**
   * A third hand entirely, and the reason it is a separate entry rather than a
   * point on the slider: it is not a child or an adult drawing the same
   * picture, it is a different picture. A head alone with nothing under it,
   * built from one wandering ink line, on a small patch of colour — the line
   * carries everything and the colour is an afterthought behind it.
   */
  doodle: {
    id: 'doodle',
    name: 'Doodle',
    blurb: 'one wobbling ink line, a head alone on a patch of colour',
    wobble: 2.1,
    gaps: 0.55,
    nib: 0.72,
    contourAlpha: 3.6,
    contourWidth: 0.9,
    taper: 0.35,
    angleSpread: 1.6,
    // Almost no modelling: the line does the work, not the tone.
    modelling: 0.12,
    valueRange: 0.55,
    hierarchy: 0.15,
    // Features are constructed rather than symbolic — a doodle's eye is a
    // specific wrong shape, not a circle.
    construction: 0.62,
    exaggeration: 2.4,
    saturation: 0.7,
    composition: 'head',
    // Hard: one eye higher and bigger than the other is most of what makes
    // these read as drawn rather than constructed.
    asym: 3.4,
    // A warm, aged page.
    paperTint: [-4, 2.6, -5.5],
    ink: 1,
    backdrop: 'patch',
  },
}

export const STYLE_IDS = Object.keys(STYLES) as DrawStyle[]

export function styleById(id: string): StyleProfile {
  return STYLES[id as DrawStyle] ?? STYLES.adult
}

/**
 * Blend between the two ends, so the control can be a slider rather than a
 * switch — a sheet drawn "mostly by an adult, with a bit of a child's nerve"
 * is a legitimate and useful place to sit.
 */
export function mixStyles(a: StyleProfile, b: StyleProfile, t: number): StyleProfile {
  const l = (x: number, y: number): number => x + (y - x) * t
  return {
    id: t < 0.5 ? a.id : b.id,
    name: t < 0.5 ? a.name : b.name,
    blurb: t < 0.5 ? a.blurb : b.blurb,
    wobble: l(a.wobble, b.wobble),
    gaps: l(a.gaps, b.gaps),
    nib: l(a.nib, b.nib),
    contourAlpha: l(a.contourAlpha, b.contourAlpha),
    contourWidth: l(a.contourWidth, b.contourWidth),
    taper: l(a.taper, b.taper),
    angleSpread: l(a.angleSpread, b.angleSpread),
    modelling: l(a.modelling, b.modelling),
    valueRange: l(a.valueRange, b.valueRange),
    hierarchy: l(a.hierarchy, b.hierarchy),
    construction: l(a.construction, b.construction),
    exaggeration: l(a.exaggeration, b.exaggeration),
    saturation: l(a.saturation, b.saturation),
    composition: t < 0.5 ? a.composition : b.composition,
    asym: l(a.asym, b.asym),
    paperTint: [
      l(a.paperTint[0], b.paperTint[0]),
      l(a.paperTint[1], b.paperTint[1]),
      l(a.paperTint[2], b.paperTint[2]),
    ],
    ink: l(a.ink, b.ink),
    backdrop: t < 0.5 ? a.backdrop : b.backdrop,
  }
}

/** Resolve a 0..1 slider into a concrete profile. */
export function styleAt(t: number): StyleProfile {
  return mixStyles(STYLES.child, STYLES.adult, Math.min(1, Math.max(0, t)))
}

/**
 * Resolve a control value into a profile.
 *
 * The child-to-illustrator axis is a slider between two ends of one medium, so
 * it takes a number. A hand that draws a different picture entirely cannot sit
 * on that slider, so it is named instead.
 */
export function resolveStyle(value: string): StyleProfile {
  const named = STYLES[value as DrawStyle]
  if (named) return named
  return styleAt(Number(value))
}

/** Apply a hand's paper ageing to the mood's stock. */
export function agePaper(paper: Hsl, style: StyleProfile): Hsl {
  const [dh, ms, dl] = style.paperTint
  return {
    h: paper.h + dh,
    s: Math.max(0, paper.s * ms),
    l: Math.max(70, Math.min(100, paper.l + dl)),
  }
}
