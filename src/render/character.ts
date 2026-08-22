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
import { adjust, shade, tint, clamp, hsl, type Hsl } from '../core/color'
import { ART, type Genome } from '../core/genome'
import { Pencil, applyGrain, makePaper } from './pencil'
import { blob, quad, arc, inset, tracePath, type Pt } from './shapes'
import { drawHairBack, drawHairFront } from './features/hair'
import { drawFace, drawEars } from './features/face'
import { drawGarment } from './features/garment'
import { drawExtrasBehind, drawExtrasFront, drawQuirk } from './features/extras'
import { drawCaption } from './caption'

export interface Scene {
  p: Pencil
  g: Genome
  /** The sheet's paper tone — the colour an opaque form is blocked in with. */
  paper: Hsl
  /** Head silhouette, the region most features are clipped or anchored to. */
  head: Pt[]
  torso: Pt[]
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

export function headOutline(g: Genome, noise: Noise): Pt[] {
  const b = g.build
  return blob(b.cx, b.cy, b.headRx, b.headRy, noise, {
    n: b.headN,
    wobble: 0.035,
    lumps: 2.2,
    lane: 1,
    steps: 60,
    // Jaw widens the lower half, crown narrows or broadens the top, cheeks
    // push out at the sides. Together these make six head shapes feel like
    // dozens.
    shape: (t) => {
      const s = Math.sin(t) // +1 at the chin, -1 at the crown
      const c = Math.abs(Math.cos(t))
      const jaw = s > 0 ? 1 + (b.jaw - 1) * s ** 1.4 : 1
      const crown = s < 0 ? 1 + (b.crown - 1) * (-s) ** 1.6 : 1
      const cheek = 1 + (b.cheek - 1) * 0.16 * c * (0.5 + 0.5 * s)
      const chin = s > 0.72 ? 1 - (1 - 1 / b.chin) * 0.5 : 1
      return jaw * crown * cheek * chin
    },
  })
}

export function torsoOutline(g: Genome): Pt[] {
  const b = g.build
  // The figure is cropped by the frame, exactly as the reference is cropped
  // mid-chest. The bottom edge sits below the visible area so it never draws
  // as a line.
  const bottom = ART.h - 44
  const sy = b.shoulderY
  const sw = b.shoulderW
  const tipY = sy + sw * b.slope * 0.34 + 12
  const nw = b.neckW * 1.12
  const ny = b.neckY - 4

  const pts: Pt[] = []
  pts.push({ x: b.cx - nw, y: ny })
  pts.push(...quad(
    { x: b.cx - nw, y: ny },
    { x: b.cx - sw * 0.46, y: sy + 5 },
    { x: b.cx - sw * 0.94, y: tipY },
    10,
  ).slice(1))
  pts.push(...quad(
    { x: b.cx - sw * 0.94, y: tipY },
    { x: b.cx - sw * 1.06, y: tipY + 26 },
    { x: b.cx - sw * 1.02, y: bottom },
    8,
  ).slice(1))
  pts.push({ x: b.cx + sw * 1.02, y: bottom })
  pts.push(...quad(
    { x: b.cx + sw * 1.02, y: bottom },
    { x: b.cx + sw * 1.06, y: tipY + 26 },
    { x: b.cx + sw * 0.94, y: tipY },
    8,
  ).slice(1))
  pts.push(...quad(
    { x: b.cx + sw * 0.94, y: tipY },
    { x: b.cx + sw * 0.46, y: sy + 5 },
    { x: b.cx + nw, y: ny },
    10,
  ).slice(1))
  return pts
}

/**
 * The two side edges of the torso as open paths.
 *
 * Contouring the whole torso polygon would draw a line across the bottom of
 * the frame, which reads as a table edge rather than as a crop.
 */
export function torsoSideEdges(g: Genome): [Pt[], Pt[]] {
  const b = g.build
  const bottom = ART.h - 44
  const sy = b.shoulderY
  const sw = b.shoulderW
  const tipY = sy + sw * b.slope * 0.34 + 12
  const nw = b.neckW * 1.12
  const ny = b.neckY - 4
  const side = (s: number): Pt[] => [
    ...quad({ x: b.cx + s * nw, y: ny }, { x: b.cx + s * sw * 0.46, y: sy + 5 }, { x: b.cx + s * sw * 0.94, y: tipY }, 10),
    ...quad({ x: b.cx + s * sw * 0.94, y: tipY }, { x: b.cx + s * sw * 1.06, y: tipY + 26 }, { x: b.cx + s * sw * 1.02, y: bottom }, 8).slice(1),
  ]
  return [side(-1), side(1)]
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
function drawWash(s: Scene): void {
  const { p, g } = s
  const w = g.wash
  const pal = g.palette

  const region = blob(w.cx, w.cy, w.rx, w.ry, p.noise, {
    n: w.n,
    wobble: w.wobble,
    lumps: w.lumps,
    lane: 5,
    steps: 52,
  })

  // Two broad passes at different angles read as a hand scrubbing the pencil
  // sideways across the paper.
  p.wash(region, {
    color: pal.wash,
    alpha: 0.105,
    angle: 0.34 + w.tilt,
    layers: 2,
    layerTurn: 64,
    softness: 1.15,
    lane: 21,
  })

  if (w.twoTone) {
    // A second hue pooled toward one corner keeps the haze from being flat.
    const corner = inset(region, 0.72, {
      x: w.cx + w.rx * 0.34 * Math.cos(w.tilt * 3),
      y: w.cy + w.ry * 0.3,
    })
    p.wash(corner, {
      color: pal.washAlt,
      alpha: 0.1,
      angle: -0.5 + w.tilt,
      layers: 1,
      softness: 1.3,
      lane: 33,
    })
  }

  // Feather the boundary: short marks straddling the edge, so the wash fades
  // into the paper instead of stopping at a line.
  const edgeRng = p.rng
  const feathers = Math.round(44 * clamp(p.detail, 0.5, 1.2))
  for (let i = 0; i < feathers; i++) {
    const t = (i / feathers) * Math.PI * 2 + edgeRng.gauss(0, 0.06)
    const idx = Math.floor(((t / (Math.PI * 2)) * region.length) % region.length)
    const a = region[(idx + region.length) % region.length]!
    const dir = { x: a.x - w.cx, y: a.y - w.cy }
    const len = Math.hypot(dir.x, dir.y) || 1
    const ux = dir.x / len
    const uy = dir.y / len
    const reach = edgeRng.range(-9, 7)
    p.stroke(
      [
        { x: a.x - ux * 10, y: a.y - uy * 10 },
        { x: a.x + ux * reach, y: a.y + uy * reach },
      ],
      {
        color: edgeRng.bool(0.5) ? pal.wash : pal.washAlt,
        alpha: 0.09,
        width: edgeRng.range(4, 9),
        passes: 1,
        wobble: 1.4,
        gaps: 0.4,
        taper: 0.9,
        lane: 40 + i,
      },
    )
  }

  // Optional motes: specks of the accent colour floating in the haze.
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
  p.base(neck, tint(pal.skin, 1.7), 0.97)

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

  // 0. A pale ground in the skin's own hue. This both stops the hair and the
  //    wash showing through the face and gives the hatching something warmer
  //    than bare paper to sit on.
  p.base(head, tint(pal.skin, 1.7), 0.97)

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
    alpha: 0.08,
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
    alpha: 0.075,
    width: 1.4,
    spacing: 3.1,
    angle: 0.9,
    layers: 1,
    curve: 2,
    lane: 108,
    pressure: (x, y) => clamp((s.headShade(x, y) - 0.55) * 2.4, 0, 1),
  })

  // 4. Warm bounce under the chin and along the lit cheek.
  p.hatch(head, {
    color: tint(adjust(pal.skin, 0, 12, -6), 0.5),
    alpha: 0.05,
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

  // 5. Outline, heaviest where the form turns away.
  p.contour(head, {
    color: adjust(pal.ink, 6, -4),
    alpha: 0.2,
    width: 1.55,
    passes: 2,
    wobble: 0.6,
    heavyAngle: Math.atan2(-s.ly, -s.lx),
    heavyAmount: 0.55,
    lane: 116,
  })
}

/* ---------------------------------------------------------------- entrypoint */

export interface DrawOptions {
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
  const rng = new Rng(`${g.seed}::draw::${g.index}`)
  const noise = new Noise(rng.fork('noise'))
  const p = new Pencil(ctx, rng, noise, detail)

  const head = headOutline(g, noise)
  const torso = torsoOutline(g)
  const lx = Math.cos(g.lightAngle)
  const ly = Math.sin(g.lightAngle)

  const s: Scene = {
    p, g, head, torso, lx, ly,
    paper: o.paperTone ?? hsl(42, 32, 96),
    headShade: ellipsoidShade(g.build.cx, g.build.cy - g.build.headRy * 0.08, g.build.headRx, g.build.headRy, lx, ly),
  }

  ctx.save()
  // Multiply is how layered pigment actually behaves: each pass can only
  // darken what is beneath it.
  ctx.globalCompositeOperation = 'multiply'

  // A slight whole-figure tilt, as if the page were turned a little.
  ctx.translate(g.build.cx, g.build.cy)
  ctx.rotate(g.build.tilt)
  ctx.translate(-g.build.cx, -g.build.cy)

  // Depth order, back to front. Hair sits behind the head but in *front* of the
  // shoulders, which is what lets long hair fall over a collar.
  drawWash(s)
  drawExtrasBehind(s)
  drawNeck(s)
  drawGarment(s)
  drawHairBack(s)
  // Ears go under the head so the skull overlaps them, which is what stops the
  // join reading as two shapes butted together.
  drawEars(s)
  drawHead(s)
  drawFace(s)
  drawHairFront(s)
  drawExtrasFront(s)
  drawQuirk(s)

  ctx.restore()

  if (o.caption) drawCaption(ctx, g, p)

  // A final tooth pass over the finished cell. Every render path lays paper
  // down first, so the canvas is opaque here and `multiply` behaves.
  applyGrain(ctx, ART.w, ART.h, 0.5, g.index)
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
