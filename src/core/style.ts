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

export type DrawStyle = 'child' | 'adult'

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
  }
}

/** Resolve a 0..1 slider into a concrete profile. */
export function styleAt(t: number): StyleProfile {
  return mixStyles(STYLES.child, STYLES.adult, Math.min(1, Math.max(0, t)))
}
