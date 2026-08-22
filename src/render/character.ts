/**
 * Composition: turns a genome into a drawing.
 *
 * Draw order matters more than any single routine here. It follows how the
 * picture would actually be built on paper — the hazy wash first, then the
 * masses that sit furthest back, then the head, then everything that sits on
 * top of the face, and finally the outline pass that pulls it together.
 */

import { Rng } from '../core/rng'
import { Noise } from '../core/noise'
import { adjust, shade, tint, clamp, hsl, type Hsl, ground } from '../core/color'
import { ART, type Genome } from '../core/genome'
import { Pencil, applyGrain, makePaper } from './pencil'
import { LayerStack } from './layers'
import { STYLES, type StyleProfile } from '../core/style'
import { quad, arc, blob, tracePath, centroid, type Pt } from './shapes'
import { drawHairBack, drawHairFront } from './features/hair'
import { drawFace, drawEars } from './features/face'
import { drawGarment } from './features/garment'
import { drawExtrasBehind, drawExtrasFront, drawQuirk } from './features/extras'
import { drawCaption } from './caption'

export interface Scene {
  p: Pencil
  g: Genome
  /**
   * The head's actual centre after the turn has deformed and displaced it.
   *
   * Hair masses are derived from the head outline and scaled about a centre;
   * scaling them about the nominal `build.cx` while the skull itself had moved
   * slid every hairstyle sideways off its own head.
   */
  headCentre: Pt
  /** The sheet's paper tone — the colour an opaque form is blocked in with. */
  paper: Hsl
  /** Head silhouette, the region most features are clipped or anchored to. */
  head: Pt[]
  torso: Pt[]
  /**
   * The hair mass drawn behind the head, if any.
   *
   * The head's own silhouette must not be outlined where this covers it: a
   * closed keyline round the whole skull, drawn over the back hair, reads as a
   * face stuck onto a hair blob rather than as a head with hair behind it.
   */
  hairBehind: Pt[] | null
  /** The hair drawn in front of the face, for occlusion and cast shadow. */
  hairFrontRegion: Pt[] | null
  /** Headwear, likewise. */
  hatRegion: Pt[] | null
  /**
   * Register a region as an occluder for its layer.
   *
   * Anything drawn into a layer that extends beyond that layer's main
   * silhouette has to say so, or it keeps none of its opacity and gains no
   * occlusion — a beard hanging below the jaw had the shirt showing straight
   * through it, and hat brims had the face showing through them.
   */
  addOccluder: (layer: string, region: readonly Pt[]) => void
  /** Unit vector pointing toward the light. */
  lx: number
  ly: number
  /** Form-shading field for the head, reused by hair, hats and glasses. */
  headShade: (x: number, y: number) => number
}

/**
 * A form-shading field over an ellipse: 0 in the light, 1 in the core shadow,
 * easing off again at the very edge to leave a sliver of reflected light. This
 * one function is what makes flat hatching read as a three-dimensional form.
 */
export function ellipsoidShade(
  cx: number, cy: number, rx: number, ry: number, lx: number, ly: number, gain = 1.15,
): (x: number, y: number) => number {
  return (x, y) => {
    const nx = (x - cx) / rx
    const ny = (y - cy) / ry
    const d = Math.hypot(nx, ny)
    if (d < 1e-4) return 0
    const dot = (nx * lx + ny * ly) / d
    let s = clamp((-dot + 0.22) * gain, 0, 1)
    // Nothing shades in the lit centre of the form.
    s *= clamp((d - 0.12) / 0.88, 0, 1) ** 0.75
    // Reflected light: the very rim lifts back up.
    if (d > 0.9) s *= 1 - (d - 0.9) * 2.4
    return clamp(s, 0, 1)
  }
}

/** Radial falloff, for blush, hat shadow and anything else that pools. */
export function radialFalloff(
  cx: number, cy: number, r: number, power = 1.6,
): (x: number, y: number) => number {
  return (x, y) => clamp(1 - Math.hypot(x - cx, y - cy) / r, 0, 1) ** power
}

/* -------------------------------------------------------------- silhouettes */

/**
 * Sample a head's half-width profile at a given height.
 *
 * The six control values sit at heights -1 (crown), -0.6, -0.2, 0.2, 0.6 and
 * +1 (chin), and are interpolated with a Catmull-Rom spline so the silhouette
 * stays smooth between them.
 */
const PROFILE_POS = [-1, -0.6, -0.2, 0.2, 0.6, 1]

export function sampleProfile(ctrl: readonly number[], h: number): number {
  const x = clamp(h, -1, 1)
  let i = 0
  while (i < PROFILE_POS.length - 2 && x > PROFILE_POS[i + 1]!) i++
  const t = (x - PROFILE_POS[i]!) / (PROFILE_POS[i + 1]! - PROFILE_POS[i]!)
  const p0 = ctrl[Math.max(0, i - 1)]!
  const p1 = ctrl[i]!
  const p2 = ctrl[i + 1]!
  const p3 = ctrl[Math.min(ctrl.length - 1, i + 2)]!
  return 0.5 * (
    2 * p1 +
    (-p0 + p2) * t +
    (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t +
    (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t
  )
}

/**
 * The head silhouette.
 *
 * Built from the family's width-versus-height profile rather than from an
 * ellipse with modifiers. Height comes from a superellipse term (so a blocky
 * skull gets a flat crown), width from the profile at that height, and the two
 * are independent — which is what lets a heart-shaped face, a jowly one and a
 * long narrow one be genuinely different shapes instead of the same egg.
 */
export function headOutline(g: Genome, noise: Noise, push = 1): Pt[] {
  const b = g.build
  const steps = b.facet ? 26 : 46
  // How far the hand pushes a skull past its anatomical proportions. A trained
  // hand barely does; a doodle is mostly this, and it is the difference
  // between ten head families and ten variations on an oval.
  const invY = 2 / b.headN
  const invX = 2 / b.headNx
  const out: Pt[] = []

  for (let i = 0; i < steps; i++) {
    const t = (i / steps) * Math.PI * 2
    const ct = Math.cos(t)
    const st = Math.sin(t)

    // Height first: +1 is the chin, -1 the crown.
    const hy = Math.sign(st) * Math.abs(st) ** invY
    // Then the half-width the profile allows at that height.
    const w = 1 + (sampleProfile(b.profile, hy) - 1) * push
    const wx = Math.sign(ct) * Math.abs(ct) ** invX
    // Lopsidedness, and a little wobble so no outline is machine-perfect.
    const lean = 1 + b.headAsym * ct * push
    const wob = 1 + noise.at(Math.cos(t) * 2.2 + 13, Math.sin(t) * 2.2 + 7) * 0.028

    // The turn deforms the skull itself. Previously it only shifted the
    // features a few pixels across a silhouette that stayed perfectly
    // symmetrical, which is why every one of 256 heads read as the same
    // frontal oval before any trait registered. The near side bulges past the
    // eye line, the far side compresses, and the whole mass shifts opposite
    // the turn — which is what actually says "three-quarter view".
    const near = ct * Math.sign(b.turn || 1)
    const squash = 1 - Math.abs(b.turn) * 0.16 * Math.max(0, -near)
    const bulge = 1 + Math.abs(b.turn) * 0.09 * Math.max(0, near)
    const shift = -b.turn * b.headRx * 0.05

    out.push({
      x: b.cx + shift + b.headRx * w * wx * lean * wob * squash * bulge,
      y: b.cy + b.headRy * hy * wob,
    })
  }
  return out
}

/**
 * Where the figure is cropped by the frame.
 *
 * Per character: every bust being sheared at the same line was one of the
 * things a viewer read before any trait registered.
 */
export function hemFor(g: Genome): number {
  return ART.h - 44 + (g.build.cropDepth - 1) * 70
}

/**
 * One shoulder, from the neck out to the tip and down to the crop.
 *
 * `side` is -1 or 1. Every number here comes from `ShoulderSpec`. It used to
 * come from four literals invented in this function while three fields of the
 * genome's own shoulder table went unread — so the control point that decides
 * the entire personality of a shoulder line travelled across 13% of shoulder
 * width over a whole population, and every bust was the same line at a
 * different span.
 */
function shoulderEdge(g: Genome, side: -1 | 1): Pt[] {
  const b = g.build
  const sp = b.shoulderSpec
  const sw = b.shoulderW
  const rise = b.shoulderRise[side < 0 ? 0 : 1] * b.headRy
  // The trapezius: where the neck-to-shoulder ramp starts. A high one is the
  // difference between a swimmer and a scholar, and it was not expressible.
  const sy = b.shoulderY + rise - b.headRy * sp.trapRise
  const tipX = b.cx + side * sw * 0.94
  const tipY = sy + sw * sp.tipDrop * 0.34 + 10
  const nw = b.neckW * 1.12
  const ny = b.neckY - 4
  const neck = { x: b.cx + side * nw, y: ny }

  // The control point, placed along the neck-to-tip run rather than at a fixed
  // fraction of shoulder width. `trapCurve` decides which side of the straight
  // line it falls: below it the ramp is concave and the shoulder slopes, above
  // it the ramp is convex and the shoulder squares off.
  const runX = tipX - neck.x
  const runY = tipY - neck.y
  const ctrl = {
    x: neck.x + runX * sp.ctrlX - runY * (sp.trapCurve - 0.5) * 0.22 * side,
    y: sy - b.headRy * sp.ctrlY + runX * (sp.trapCurve - 0.5) * 0.16 * side,
  }

  // The side edge below the tip, tapering or flaring toward the crop with a
  // bow across it — a barrelled torso against a straight one.
  const hem = hemFor(g)
  const footX = b.cx + side * sw * 0.93 * sp.sideTaper
  const bowX = b.cx + side * sw * (0.94 + sp.sideBow)

  return [
    ...quad(neck, ctrl, { x: tipX, y: tipY }, 12),
    // The turn at the tip: a sharp corner on a square shoulder, a generous
    // sweep on a round one.
    ...quad(
      { x: tipX, y: tipY },
      { x: b.cx + side * sw * (0.95 + sp.tipTurn * 0.09), y: tipY + sp.tipReach },
      { x: bowX, y: tipY + sp.tipReach + (hem - tipY - sp.tipReach) * 0.45 },
      10,
    ).slice(1),
    ...quad(
      { x: bowX, y: tipY + sp.tipReach + (hem - tipY - sp.tipReach) * 0.45 },
      { x: bowX, y: hem - (hem - tipY) * 0.2 },
      { x: footX, y: hem },
      8,
    ).slice(1),
  ]
}

export function torsoOutline(g: Genome): Pt[] {
  const left = shoulderEdge(g, -1)
  const right = shoulderEdge(g, 1)
  return [...left, ...right.slice().reverse()]
}

/**
 * The two side edges of the torso as open paths.
 *
 * Contouring the whole torso polygon would draw a line across the bottom of
 * the frame, which reads as a table edge rather than as a crop.
 */
export function torsoSideEdges(g: Genome): [Pt[], Pt[]] {
  return [shoulderEdge(g, -1), shoulderEdge(g, 1)]
}

function neckOutline(g: Genome): Pt[] {
  const b = g.build
  const top = b.cy + b.headRy * 0.55
  const bottom = b.shoulderY + 14
  const w = b.neckW
  return [
    { x: b.cx - w, y: top },
    { x: b.cx - w * 1.06, y: (top + bottom) / 2 },
    { x: b.cx - w * 1.18, y: bottom },
    { x: b.cx + w * 1.18, y: bottom },
    { x: b.cx + w * 1.06, y: (top + bottom) / 2 },
    { x: b.cx + w, y: top },
  ]
}

/* ------------------------------------------------------------------- layers */

/**
 * The background wash.
 *
 * In the reference this is the thing that gives each portrait depth: a soft,
 * off-square haze of colour behind the figure, edges feathered, paper showing
 * through. It is drawn with very wide, very faint side-of-pencil marks and then
 * deliberately broken up at the edges so it never looks like a filled shape.
 */
/**
 * The backdrop, when the hand draws a head alone.
 *
 * Not the panel: a small shape behind the head, roughly the size of the head
 * itself — a filled circle, a soft blob, a hard-edged rectangle, a ring drawn
 * as an outline, a scribbled halo, or nothing at all. Which of those, and how
 * far it sits off centre, is the strongest thing separating one of these
 * drawings from the next, because there is so little else on the page.
 */
function drawPatch(s: Scene): void {
  const { p, g } = s
  const b = g.build
  const pal = g.palette
  const rng = p.rng.fork('patch')
  const kind = rng.weighted<'none' | 'disc' | 'blob' | 'rect' | 'ring' | 'scribble'>([
    ['none', 1.6], ['disc', 2.6], ['blob', 2], ['rect', 1.2], ['ring', 1], ['scribble', 1.6],
  ])
  if (kind === 'none') return

  const cx = b.cx + rng.gauss(0, b.headRx * 0.18)
  const cy = b.cy + rng.gauss(0, b.headRy * 0.14)
  const rx = b.headRx * rng.range(1.02, 1.5)
  const ry = b.headRy * rng.range(0.95, 1.45)
  const col = rng.bool(0.5) ? pal.wash : rng.bool(0.5) ? pal.washAlt : pal.garment
  const tone = hsl(col.h + rng.gauss(0, 10), clamp(col.s * rng.range(0.5, 1.1), 6, 46), clamp(col.l, 58, 88))

  if (kind === 'ring') {
    // Just the outline, drawn round once by hand.
    p.stroke(arc(cx, cy, rx, ry, 0, Math.PI * 2.04, 40), {
      color: tone, alpha: 0.4, width: rng.range(1.6, 3.4),
      passes: 1, wobble: 1.6, gaps: 0.1, lane: 720,
    })
    return
  }

  if (kind === 'scribble') {
    // A halo of short radiating marks, denser at the edge — the way a pen
    // fills a circle when it is not trying to be a fill.
    const n = rng.int(60, 150)
    for (let i = 0; i < n; i++) {
      const a = rng.next() * Math.PI * 2
      const t = 0.62 + rng.next() * 0.5
      const len = rng.range(3, 12)
      const dx = Math.cos(a)
      const dy = Math.sin(a)
      p.stroke([
        { x: cx + dx * rx * t, y: cy + dy * ry * t },
        { x: cx + dx * (rx * t + len), y: cy + dy * (ry * t + len) },
      ], { color: tone, alpha: 0.16, width: rng.range(0.9, 2), passes: 1, wobble: 1.2, taper: 0.7, lane: 730 + i })
    }
    return
  }

  const region = kind === 'rect'
    ? [
      { x: cx - rx, y: cy - ry }, { x: cx + rx, y: cy - ry },
      { x: cx + rx, y: cy + ry }, { x: cx - rx, y: cy + ry },
    ]
    : blob(cx, cy, rx, ry, p.noise, {
      n: kind === 'disc' ? 2 : rng.range(1.7, 2.6),
      wobble: kind === 'disc' ? 0.035 : rng.range(0.08, 0.22),
      lumps: rng.range(1.8, 4),
      lane: 44,
      steps: 44,
    })
  p.base(region, ground(tone), rng.range(0.5, 0.86), kind !== 'rect')
  p.hatch(region, {
    color: tone, alpha: 0.07, spacing: rng.range(2.2, 4),
    angle: rng.range(-Math.PI, Math.PI), layers: 1, gaps: 0.3, lane: 760,
  })
}

function drawWash(s: Scene): void {
  const { p, g } = s
  const w = g.wash
  const pal = g.palette

  // The background panel, as the reference does it: a big rounded square the
  // whole figure sits on, with white paper margin all round it, scrubbed in
  // with hatching that follows the panel's edges. See `washPanel`.
  //
  // A warm note is mixed in alongside the two cool ones, because the reference
  // is not one tint — it runs cool across the top and warms toward one side.
  // Low enough in lightness to actually register once it is hatched at a few
  // per cent alpha — a 93%-light tint over paper is invisible. Taken off the
  // character's own accent rather than a literal, which put the same warm note
  // behind all 256 figures, and drifted per character so two panels sharing a
  // palette are still not the same panel.
  const wr = p.rng.fork('wash-tone')
  const warm = hsl(
    pal.accent.h + wr.gauss(0, 14),
    clamp(pal.accent.s * wr.range(0.3, 0.6), 12, 52),
    clamp(84 + wr.gauss(0, 5), 74, 92),
  )
  p.washPanel(w.cx, w.cy, w.rx, w.ry, w.n, [pal.wash, warm, pal.washAlt], {
    // Kept inside a narrow band: the panel is a backdrop, and at a third
    // denser it stops being one and starts competing with the figure.
    alpha: 0.05 + w.lumps * 0.004,
    spacing: 3.5 + w.tilt * 2.6,
    wobble: w.wobble * 0.35,
  })

  // Optional motes: specks of the accent colour floating in the haze.
  const edgeRng = p.rng
  if (w.motes > 0) {
    for (let i = 0; i < w.motes; i++) {
      const a = edgeRng.next() * Math.PI * 2
      const r = Math.sqrt(edgeRng.next())
      const x = w.cx + Math.cos(a) * w.rx * r * 0.92
      const y = w.cy + Math.sin(a) * w.ry * r * 0.92
      const size = edgeRng.range(1.2, 3.2)
      p.stroke(arc(x, y, size, size, 0, Math.PI * 2, 7), {
        color: pal.accent,
        alpha: 0.12,
        width: 1.6,
        passes: 1,
        wobble: 0.5,
        gaps: 0.3,
        lane: 60 + i,
      })
    }
  }
}

function drawNeck(s: Scene): void {
  const { p, g } = s
  const pal = g.palette
  const neck = neckOutline(g)
  p.base(neck, ground(pal.skin), 0.68)

  p.hatch(neck, {
    color: pal.skin,
    alpha: 0.1,
    spacing: 2.6,
    angle: 1.35,
    layers: 2,
    layerTurn: 22,
    lane: 70,
  })
  // The head casts a hard-edged shadow across the top of the neck — the single
  // most useful shadow on the whole figure for selling depth.
  p.hatch(neck, {
    color: shade(pal.skin, 1.35),
    alpha: 0.13,
    spacing: 2.4,
    angle: 1.1,
    layers: 2,
    layerTurn: 30,
    lane: 72,
    pressure: (x, y) => {
      const fall = clamp(1 - (y - (g.build.cy + g.build.headRy * 0.52)) / (g.build.headRy * 0.55), 0, 1)
      const side = clamp(1 - Math.abs(x - g.build.cx) / (g.build.neckW * 1.4), 0, 1)
      return fall ** 1.3 * (0.5 + 0.5 * side)
    },
  })
  p.contour(neck, {
    color: adjust(pal.ink, 8, -6),
    alpha: 0.15,
    width: 1,
    passes: 1,
    closed: false,
    lane: 74,
  })
}

function drawHead(s: Scene): void {
  const { p, g, head } = s
  const pal = g.palette
  const b = g.build

  // 0. A pale ground in the skin's own hue — a wash of local colour to build
  //    the darks on, which is how the medium is actually worked. It no longer
  //    has to be opaque: occlusion has already removed the hair and the
  //    background from inside this silhouette, so the plate that made a face
  //    read as a sticker is gone.
  p.base(head, ground(pal.skin), 0.72)

  // 1. Local colour. Two layers at a shallow angle difference give the paper
  //    something to hold without reading as texture in its own right.
  p.hatch(head, {
    color: adjust(pal.skin, 0, 7),
    alpha: 0.075,
    spacing: 2.5,
    angle: -0.55,
    layers: 2,
    // A wide turn between layers: two nearly parallel passes read as stripes,
    // two crossing ones read as tone.
    layerTurn: 62,
    curve: 2.2,
    lane: 100,
  })

  // 2. Form shadow.
  p.hatch(head, {
    color: shade(pal.skin, 1),
    alpha: 0.1 * p.hand.modelling,
    spacing: 2.4,
    angle: -0.5,
    layers: 2,
    layerTurn: 58,
    curve: 2.6,
    lane: 104,
    pressure: s.headShade,
  })

  // 3. Deeper accent in the core shadow only, at a third angle. Restricting
  //    the darkest layer to a small area is what keeps the drawing airy.
  p.hatch(head, {
    color: shade(pal.skin, 2.1),
    alpha: 0.075 * p.hand.modelling,
    width: 1.4,
    spacing: 3.1,
    angle: 0.9,
    layers: 1,
    curve: 2,
    lane: 108,
    pressure: (x, y) => clamp((s.headShade(x, y) - 0.55) * 2.4, 0, 1),
  })

  // 4. Warm bounce under the chin and along the lit cheek. The subtlest of the
  //    four layers, so it is skipped at thumbnail density where it would cost
  //    a quarter of the head's render time and show almost nothing.
  if (p.detail > 0.75) p.hatch(head, {
    color: tint(adjust(pal.skin, 0, 12, -6), 0.5),
    alpha: 0.05 * p.hand.modelling,
    spacing: 3.4,
    angle: -1.1,
    layers: 1,
    lane: 112,
    pressure: (x, y) => {
      const lit = 1 - s.headShade(x, y)
      const low = clamp((y - b.cy) / (b.headRy * 0.9), 0, 1)
      return clamp(lit * low * 1.3, 0, 1)
    },
  })

  // 5. Outline, heaviest where the form turns away. The one mark in the
  //    drawing allowed to be this heavy.
  p.contour(head, {
    color: pal.contourInk,
    alpha: 0.24,
    width: 1.8,
    passes: 2,
    wobble: 0.6,
    heavyAngle: Math.atan2(-s.ly, -s.lx),
    heavyAmount: 0.55,
    lane: 116,
  })
}

/* ---------------------------------------------------------------- entrypoint */

export interface DrawOptions {
  /** Whose hand is drawing. Defaults to the trained end. */
  style?: StyleProfile
  /** 0.5 for sheet thumbnails, 1.0-1.4 for inspector and export. */
  detail?: number
  /** Draw the one-word caption below the figure. */
  caption?: boolean
  /** Lay down paper first (single-character exports); off for sheet cells. */
  paper?: boolean
  paperTone?: Hsl
}

/**
 * Draw one character into `ctx`, which is assumed to already be scaled so that
 * one art unit equals one context unit (see `ART`).
 */
export function drawCharacter(
  ctx: CanvasRenderingContext2D, g: Genome, o: DrawOptions = {},
): void {
  const detail = o.detail ?? 1
  const style = o.style ?? STYLES.adult
  const rng = new Rng(`${g.seed}::draw::${g.index}`)
  const noise = new Noise(rng.fork('noise'))

  // A head alone, or a head on a bust. The whole composition changes, not
  // just the mark-making: there is no neck, no garment and no caption under a
  // floating head, and the head has to sit in the middle of the cell rather
  // than in the top third where a bust puts it.
  const headOnly = style.composition === 'head'
  // Floored at 1: a trained hand pushes proportions *less*, but shrinking the
  // profile deviations would make its heads more alike, not more accurate.
  const head = headOutline(g, noise, Math.max(1, style.exaggeration))
  const torso = torsoOutline(g)
  const lx = Math.cos(g.lightAngle)
  const ly = Math.sin(g.lightAngle)

  // Each part group gets its own buffer. Nothing is painted over anything;
  // nearer parts erase themselves out of the buffers behind, so every mark
  // ends up sitting on bare paper.
  const scale = Math.abs(ctx.getTransform().a) || 1
  const stack = new LayerStack(
    ['wash', 'body', 'hairBack', 'head', 'hairFront', 'extras'],
    ART.w, ART.h, scale,
  )

  const pencilFor = (name: string): Pencil => {
    const lp = new Pencil(stack.ctx(name), rng, noise, detail)
    // Style and individual compose in one place, so neither can clobber the
    // other: the sheet has one hand, and each character deviates from it.
    lp.useStyle(style, g.build)
    return lp
  }
  const pens = {
    wash: pencilFor('wash'),
    body: pencilFor('body'),
    hairBack: pencilFor('hairBack'),
    head: pencilFor('head'),
    hairFront: pencilFor('hairFront'),
    extras: pencilFor('extras'),
  }

  // The whole-figure tilt and framing have to be applied inside every buffer,
  // since each is its own coordinate space.
  // With no body under it the head is free to sit centred and be drawn larger.
  // Centred, and only slightly larger — the head has to fit with its hair and
  // whatever is on top of it, and at 1.4 the crowns and hats ran off the cell.
  const lift = headOnly ? ART.h * 0.46 - g.build.cy : 0
  const zoom = g.build.frameScale * (headOnly ? 1.12 : 1)
  for (const name of ['wash', 'body', 'hairBack', 'head', 'hairFront', 'extras']) {
    const lctx = stack.ctx(name)
    lctx.translate(g.build.cx, g.build.cy + lift)
    lctx.rotate(g.build.tilt)
    lctx.scale(zoom, zoom)
    lctx.translate(-g.build.cx, -g.build.cy)
  }

  const extraOccluders: { layer: string; region: Pt[] }[] = []

  const s: Scene = {
    p: pens.wash, g, head, torso, lx, ly,
    headCentre: centroid(head),
    hairBehind: null,
    hairFrontRegion: null,
    hatRegion: null,
    addOccluder: (layer, region) => {
      if (region.length > 2) extraOccluders.push({ layer, region: [...region] })
    },
    paper: o.paperTone ?? hsl(42, 20, 99),
    headShade: ellipsoidShade(g.build.cx, g.build.cy - g.build.headRy * 0.08, g.build.headRx, g.build.headRy, lx, ly),
  }

  // Depth order, back to front. Hair sits behind the head but in *front* of the
  // shoulders, which is what lets long hair fall over a collar.
  s.p = pens.wash
  if (style.backdrop === 'patch') drawPatch(s)
  else drawWash(s)

  s.p = pens.body
  if (!headOnly) {
    drawExtrasBehind(s)
    drawNeck(s)
  // Mark budget: the face carries the drawing. Left flat, the coat's pattern,
  // pocket, buttons, patches and folds add up to more discrete marks than the
  // head has, and the eye goes to the shirt.
    s.p.density = 1 - style.hierarchy * 0.42
    drawGarment(s)
    s.p.density = 1
  }

  s.p = pens.hairBack
  drawHairBack(s)

  s.p = pens.head
  // Ears go under the head so the skull overlaps them, which is what stops the
  // join reading as two shapes butted together.
  drawEars(s)
  drawHead(s)
  drawFace(s)

  s.p = pens.hairFront
  s.p.density = 1 - style.hierarchy * 0.2
  drawHairFront(s)
  s.p.density = 1

  s.p = pens.extras
  drawExtrasFront(s)
  drawQuirk(s)

  // Occlusion. Each region is removed from everything behind it, so the head
  // is not a plate laid over the hair — the hair simply is not there where the
  // head is.
  if (!headOnly) stack.occlude('body', torso)
  if (s.hairBehind) stack.occlude('hairBack', s.hairBehind)
  stack.occlude('head', head)
  if (s.hairFrontRegion) stack.occlude('hairFront', s.hairFrontRegion)
  if (s.hatRegion) stack.occlude('extras', s.hatRegion)
  for (const extra of extraOccluders) stack.occlude(extra.layer, extra.region)

  // Cast shadow, now that the drawing knows what is in front of what. Offsets
  // follow the sheet's key light; these are the marks that put the head on the
  // body instead of in front of it.
  const dropX = -lx * g.build.headRx * 0.1
  const dropY = -ly * g.build.headRy * 0.1
  const soft = Math.max(2, g.build.headRx * 0.12 * scale)
  const strength = 0.16 * style.modelling
  if (!headOnly) {
    stack.castShadow('body', head, dropX, Math.abs(dropY) + g.build.headRy * 0.06, soft, strength)
  }
  if (s.hairFrontRegion) {
    stack.castShadow('head', s.hairFrontRegion, dropX * 0.5, g.build.headRy * 0.045, soft * 0.7, strength * 0.9)
  }
  if (s.hatRegion) {
    stack.castShadow('head', s.hatRegion, dropX * 0.5, g.build.headRy * 0.05, soft * 0.8, strength * 1.1)
  }

  stack.flush(ctx, ART.w, ART.h)

  if (o.caption && !headOnly) drawCaption(ctx, g, pens.head)

  // A final tooth pass over the finished cell. Every render path lays paper
  // down first, so the canvas is opaque here and `multiply` behaves.
  applyGrain(ctx, ART.w, ART.h, 0.07, g.index)
}

/** Convenience wrapper used by exports and the inspector. */
export function renderToCanvas(
  g: Genome, width: number, o: DrawOptions = {},
): HTMLCanvasElement {
  const scale = width / ART.w
  const c = document.createElement('canvas')
  c.width = Math.round(ART.w * scale)
  c.height = Math.round(ART.h * scale)
  const ctx = c.getContext('2d')!
  if (o.paper && o.paperTone) {
    ctx.drawImage(makePaper(c.width, c.height, o.paperTone, `${g.seed}-${g.index}`), 0, 0)
  }
  ctx.scale(scale, scale)
  drawCharacter(ctx, g, o)
  return c
}

/** Trace helper re-exported for feature modules that need a raw clip. */
export { tracePath }
