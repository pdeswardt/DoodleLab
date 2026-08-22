/**
 * Colour model and palette harmony.
 *
 * Everything is HSL, because the operations that matter for coloured pencil are
 * "same pigment, pressed harder" (lightness down, saturation up a touch) and
 * "the shadow drifts toward its neighbours on the wheel" (hue shift). Both are
 * one-liners in HSL and awkward in RGB.
 */

export interface Hsl {
  h: number // 0..360, wraps
  s: number // 0..100
  l: number // 0..100
}

export const hsl = (h: number, s: number, l: number): Hsl => ({
  h: ((h % 360) + 360) % 360,
  s: clamp(s, 0, 100),
  l: clamp(l, 0, 100),
})

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v
}

export function css(c: Hsl, alpha = 1): string {
  return `hsla(${c.h.toFixed(1)}, ${c.s.toFixed(1)}%, ${c.l.toFixed(1)}%, ${alpha.toFixed(3)})`
}

/** Adjust a colour: `dl` lightness, `ds` saturation, `dh` hue, all additive. */
export function adjust(c: Hsl, dl: number, ds = 0, dh = 0): Hsl {
  return hsl(c.h + dh, c.s + ds, c.l + dl)
}

/**
 * Pencil shadow. Real pigment darkens *and* cools, and the hue creeps toward
 * the nearest strong neighbour rather than simply going grey — so a shadow on
 * warm skin heads for red-violet, not for black.
 */
export function shade(c: Hsl, amount = 1): Hsl {
  const cool = c.h > 20 && c.h < 200 ? -14 : 10
  return hsl(c.h + cool * amount * 0.6, c.s + 8 * amount, c.l - 13 * amount)
}

/** Pencil highlight: lighter, a little desaturated, warmed slightly. */
export function tint(c: Hsl, amount = 1): Hsl {
  return hsl(c.h + 4 * amount, c.s - 6 * amount, c.l + 12 * amount)
}

/**
 * The pale ground a form is blocked in with before it is hatched.
 *
 * Not simply `tint`: a fixed lightening pushes an already-pale skin tone to
 * bare paper, and the hatching on top is then too weak to bring it back — the
 * face samples at 237,234,226 and reads as a blank. This lightens toward a
 * ceiling instead, so dark forms get a real ground and light ones barely move.
 */
export function ground(c: Hsl, amount = 1): Hsl {
  const headroom = Math.max(0, 92 - c.l)
  return hsl(c.h + 3 * amount, c.s - 7 * amount, c.l + headroom * 0.42 * amount)
}

export function mix(a: Hsl, b: Hsl, t: number): Hsl {
  // Interpolate hue the short way around the wheel.
  let dh = b.h - a.h
  if (dh > 180) dh -= 360
  if (dh < -180) dh += 360
  return hsl(a.h + dh * t, a.s + (b.s - a.s) * t, a.l + (b.l - a.l) * t)
}

/** Relative luminance, good enough to decide light-on-dark contrast. */
export function luminance(c: Hsl): number {
  return c.l / 100
}

/**
 * A "mood" biases every hue decision on a sheet so the 256 characters read as
 * one set rather than 256 unrelated doodles. Each mood names the hue bands its
 * clothing, washes and props may use.
 */
export interface Mood {
  id: string
  name: string
  blurb: string
  /** Hue bands garments and props draw from. */
  hues: [number, number][]
  /** Saturation window for clothing. */
  sat: [number, number]
  /** Lightness window for clothing. */
  light: [number, number]
  /** Multiplier on background-wash saturation. */
  washSat: number
  /** Paper tone for this mood. */
  paper: Hsl
}

export const MOODS: Mood[] = [
  {
    id: 'meadow',
    name: 'Meadow',
    blurb: 'sun-warmed greens, cornflower, buttermilk',
    hues: [[70, 150], [190, 225], [35, 55]],
    sat: [22, 52],
    light: [42, 72],
    washSat: 1,
    paper: hsl(42, 26, 98),
  },
  {
    id: 'harbour',
    name: 'Harbour',
    blurb: 'salt blues, rope beige, weathered teal',
    hues: [[185, 235], [30, 48], [155, 185]],
    sat: [18, 46],
    light: [38, 68],
    washSat: 0.9,
    paper: hsl(38, 20, 98),
  },
  {
    id: 'orchard',
    name: 'Orchard',
    blurb: 'russet, plum, late-afternoon gold',
    hues: [[8, 40], [330, 355], [42, 60]],
    sat: [28, 58],
    light: [38, 66],
    washSat: 1.05,
    paper: hsl(36, 30, 97),
  },
  {
    id: 'confetti',
    name: 'Confetti',
    blurb: 'everything at once, turned up',
    hues: [[0, 360]],
    sat: [38, 70],
    light: [46, 74],
    washSat: 1.25,
    paper: hsl(48, 24, 98),
  },
  {
    id: 'dusk',
    name: 'Dusk',
    blurb: 'ink blues, mauve, one warm lamp',
    hues: [[215, 285], [300, 330], [22, 38]],
    sat: [20, 48],
    light: [32, 60],
    washSat: 0.95,
    paper: hsl(30, 16, 97),
  },
  {
    id: 'bakery',
    name: 'Bakery',
    blurb: 'strawberry, pistachio, powdered sugar',
    hues: [[340, 360], [0, 20], [95, 145], [45, 60]],
    sat: [30, 60],
    light: [52, 78],
    washSat: 1.1,
    paper: hsl(44, 30, 98),
  },
]

export function moodById(id: string): Mood {
  return MOODS.find((m) => m.id === id) ?? MOODS[0]!
}
