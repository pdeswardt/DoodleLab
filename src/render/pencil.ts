/**
 * The pencil engine.
 *
 * Everything visible in PencilFolk is deposited by the four methods on this
 * class. The look comes from a small set of rules borrowed from how a real
 * coloured pencil behaves on toothy paper:
 *
 *  1. A "line" is never one line. It is two or three passes, each offset a
 *     fraction of a millimetre, each broken into short chunks with gaps.
 *  2. Pressure varies along a mark. Ends are lighter, because the hand lifts.
 *  3. Tone is built by hatching, not by filling. Flat fills read as vector art
 *     instantly; layered strokes at slightly different angles do not.
 *  4. Pigment sits on the peaks of the paper and skips the valleys, so every
 *     layer is filtered through the same grain field.
 *  5. Shadows shift hue as they darken — see `shade` in core/color.
 */

import type { Rng } from '../core/rng'
import { Rng as RngImpl } from '../core/rng'
import type { Noise } from '../core/noise'
import { Noise as NoiseImpl } from '../core/noise'
import { type Hsl, css, adjust, clamp } from '../core/color'
import { STYLES, type StyleProfile } from '../core/style'
import {
  type Pt, resample, normalAt, bounds, centroid, withClip, tracePath,
  insideSpans, intersectSpans, contains, blob,
} from './shapes'

export interface StrokeOptions {
  color: Hsl
  /** Base alpha for one pass. Layers build up, so keep this low. */
  alpha?: number
  width?: number
  /** How many offset passes to lay down. */
  passes?: number
  /** Standard deviation of the per-pass perpendicular offset. */
  spread?: number
  /** Amplitude of the noise wobble applied along the mark. */
  wobble?: number
  wobbleFreq?: number
  /** Probability that the pencil lifts between chunks. */
  gaps?: number
  /** Resample spacing — smaller is smoother and slower. */
  step?: number
  /** 0 = even pressure end to end, 1 = ends fade right out. */
  taper?: number
  /** Noise lane, so two marks in the same place don't wobble identically. */
  lane?: number
  /** Extra per-chunk alpha multiplier, indexed by position along the mark. */
  alphaAt?: (t: number) => number
  /** Degrees of random hue drift per chunk — pigment is never perfectly even. */
  hueJitter?: number
}

export interface HatchOptions {
  color: Hsl
  alpha?: number
  /** Gap between hatch lines, in art units. */
  spacing?: number
  /** Direction of the first layer, in radians. */
  angle?: number
  width?: number
  /** 1 = single direction, 2-3 = cross-hatching. */
  layers?: number
  /** Degrees the angle turns between layers. */
  layerTurn?: number
  /** Per-position multiplier in 0..1 — this is where form shading comes from. */
  pressure?: (x: number, y: number) => number
  /** Bow of each hatch line; a straight hatch looks machine-made. */
  curve?: number
  gaps?: number
  taper?: number
  lane?: number
  hueJitter?: number
  /** Additional regions to intersect the clip with. */
  clipTo?: readonly (readonly Pt[])[]
}

export interface ContourOptions extends Omit<StrokeOptions, 'alphaAt'> {
  /**
   * Marks that only an untrained hand would draw: the outline around a nose,
   * an ear, a cheek, a fold. Dropped when the line budget is tight.
   */
  optional?: boolean
  /** Fade the outline wherever it falls inside this region — it is covered. */
  hiddenIn?: readonly Pt[]
  /** Direction (radians) in which the outline should press hardest. */
  heavyAngle?: number
  /** How much heavier, 0..1. */
  heavyAmount?: number
  closed?: boolean
}

export class Pencil {
  readonly ctx: CanvasRenderingContext2D
  readonly rng: Rng
  readonly noise: Noise
  /**
   * Detail multiplier. Around 0.55 for sheet thumbnails, 1.0-1.4 for the
   * inspector and exports. Scales stroke density, not stroke size, so a
   * thumbnail and its hi-res twin are recognisably the same drawing.
   */
  detail: number

  /**
   * Global pigment gain.
   *
   * Every alpha in the drawing routines is expressed as "one light pass", and
   * this is the single number that says how hard the pencil is being pressed.
   * Keeping it in one place means the whole sheet can be tuned without
   * touching two hundred literals.
   */
  gain: number

  /** gain, compensated for detail — see `press`. */
  private pressure: number

  /**
   * Per-character drawing style.
   *
   * One artist filling a sheet still varies: some figures are pressed harder,
   * some hatched at a different angle, some drawn with a looser wrist. Without
   * these three the population can vary in every trait and still look like 256
   * renders of one drawing.
   */
  angleBias = 0
  wobbleScale = 1
  finish = 1
  /**
   * How blunt the pencil is: the width of a hatch line as a fraction of the gap
   * to its neighbour. Near 1 the marks fuse into flat tone as if drawn with a
   * worn-down point; lower and each stroke stays legible as a stroke.
   */
  nib = 0.82
  /** How often the hand lifts. Higher is a sketchier, more broken line. */
  gapScale = 1

  /**
   * How much of the drawing gets an outline at all.
   *
   * Outlining every shape you draw is the single loudest signature of an
   * untrained hand. At the trained end only real edges are lined — the head
   * silhouette, the glasses — and the nose, ears, cheeks and folds are defined
   * by value and hue instead. Marks passed `optional: true` are dropped below
   * the threshold.
   */
  lineCoverage = 1

  /**
   * Mark budget for the region being drawn, relative to the face.
   *
   * The face should carry most of the marks. Left at 1 everywhere, the coat —
   * with its pattern, pocket, buttons, patches and folds — ends up with more
   * discrete marks on it than the head, and the eye goes to the shirt.
   */
  density = 1

  /** The hand currently holding the pencil. */
  hand: StyleProfile = STYLES.adult

  private styleCache = new Map<number, string>()

  constructor(ctx: CanvasRenderingContext2D, rng: Rng, noise: Noise, detail = 1, gain = 1.62) {
    this.ctx = ctx
    this.rng = rng
    this.noise = noise
    this.detail = detail
    this.gain = gain
    // Lower detail means fewer, wider-spaced marks. Without compensation a
    // thumbnail would simply be a paler version of the same drawing; scaling
    // alpha by the inverse of density keeps the *value* constant and only the
    // texture coarser, which is what happens when you draw the same subject
    // smaller.
    this.pressure = gain / clamp(detail, 0.42, 1.3) ** 0.55
  }

  /** Current effective pressure multiplier. */
  press(): number {
    return this.pressure
  }

  /**
   * Adopt a drawing style. Everything the profile governs at the mark-making
   * level is applied here, in one place, rather than being consulted at each
   * call site.
   */
  useStyle(st: StyleProfile, hand?: {
    pressure: number
    lineWobble: number
    hatchAngle: number
    finish: number
    nib: number
    looseness: number
  }): void {
    this.hand = st
    // The style and the individual compose; they do not overwrite each other.
    // Applying the profile and then assigning the per-character values on top
    // silently discarded the style's wobble, gap and nib spread on every
    // single draw — which is most of what separated the two ends of the axis.
    const h = hand
    this.wobbleScale = st.wobble * (h ? h.lineWobble : 1)
    this.gapScale = st.gaps * (h ? h.looseness : 1)
    // The character's nib is a deviation from the style's, not a replacement.
    this.nib = st.nib * (h ? h.nib / 0.84 : 1)
    this.angleBias = (h ? h.hatchAngle : 0) * st.angleSpread
    this.finish = (h ? h.finish : 1)
    this.lineCoverage = st.construction < 0.5 ? 1 : 0.25 + (1 - st.construction) * 0.6
    this.gain *= st.valueRange * (h ? h.pressure : 1)
    this.pressure *= st.valueRange * (h ? h.pressure : 1)
  }

  /** Memoised `hsla()` strings — colour churn is otherwise the top allocator. */
  private style(c: Hsl, alpha: number): string {
    const a = clamp(alpha, 0, 1)
    const key =
      ((c.h * 2) | 0) * 16777216 + ((c.s * 1.2) | 0) * 131072 +
      ((c.l * 1.2) | 0) * 1024 + ((a * 200) | 0)
    let s = this.styleCache.get(key)
    if (s === undefined) {
      s = css(c, a)
      if (this.styleCache.size > 6000) this.styleCache.clear()
      this.styleCache.set(key, s)
    }
    return s
  }

  /**
   * Lay one pencil mark along a polyline.
   *
   * The spine is resampled to even spacing, displaced by low-frequency noise
   * (so the mark drifts the way a hand drifts), then walked in short chunks
   * with independent width and pressure, separated by occasional lifts.
   */
  stroke(pts: readonly Pt[], o: StrokeOptions): void {
    if (pts.length < 2) return
    const ctx = this.ctx
    const rng = this.rng
    const d = this.detail

    const step = (o.step ?? 2.6) / clamp(d, 0.4, 1.6)
    const spine = resample(pts, step)
    const n = spine.length
    if (n < 2) return

    const passes = Math.max(1, Math.round((o.passes ?? 2) * clamp(d, 0.62, 1.25)))
    const alpha = o.alpha ?? 0.12
    const width = o.width ?? 1.1
    const spread = o.spread ?? 0.55
    const wobble = (o.wobble ?? 0.8) * this.wobbleScale
    const wobbleFreq = o.wobbleFreq ?? 2.4
    const gaps = clamp((o.gaps ?? 0.14) * this.gapScale, 0, 0.85)
    const taper = clamp((o.taper ?? 0.45) * this.hand.taper, 0, 1)
    const lane = o.lane ?? 0
    const hueJitter = o.hueJitter ?? 2.5

    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    const disp: Pt[] = new Array(n)

    for (let p = 0; p < passes; p++) {
      const passOffset = rng.gauss(0, spread)
      const passLane = lane + p * 3.17
      const inv = 1 / (n - 1)

      for (let i = 0; i < n; i++) {
        const t = i * inv
        const nm = normalAt(spine, i)
        const w = this.noise.at1(t * wobbleFreq + p * 5.71, passLane) * wobble + passOffset
        const s = spine[i]!
        disp[i] = { x: s.x + nm.x * w, y: s.y + nm.y * w }
      }

      // Longer chunks on smooth thumbnails, shorter and more broken up close.
      const minChunk = Math.max(2, Math.round(4 / d))
      const maxChunk = Math.max(minChunk + 2, Math.round(14 / d))

      let i = 0
      while (i < n - 1) {
        const end = Math.min(n - 1, i + rng.int(minChunk, maxChunk))
        const tm = ((i + end) * 0.5) * inv

        // Pressure envelope: light at the ends where the hand lifts.
        const env = 1 - taper * (1 - Math.sin(Math.PI * clamp(tm, 0, 1)) ** 0.4)
        let a = alpha * env * rng.range(0.72, 1.24) * this.pressure
        if (o.alphaAt) a *= o.alphaAt(tm)

        if (a > 0.004) {
          const col = hueJitter > 0 ? adjust(o.color, 0, 0, rng.gauss(0, hueJitter)) : o.color
          ctx.strokeStyle = this.style(col, a)
          ctx.lineWidth = width * rng.range(0.76, 1.3)
          ctx.beginPath()
          ctx.moveTo(disp[i]!.x, disp[i]!.y)
          for (let j = i + 1; j <= end; j++) ctx.lineTo(disp[j]!.x, disp[j]!.y)
          ctx.stroke()
        }

        // Overlap slightly by default; occasionally lift the pencil instead.
        i = rng.bool(gaps) ? end + rng.int(1, 3) : end
      }
    }
  }

  /**
   * Fill a region with tone by hatching it.
   *
   * `pressure` is the important argument: it is the form-shading function.
   * A face is hatched with a pressure field that rises away from the light, and
   * that single callback is what turns a flat oval into a head.
   */
  hatch(region: readonly Pt[], o: HatchOptions): void {
    const rng = this.rng
    const d = clamp(this.detail, 0.45, 1.6)
    const b = bounds(region)
    if (b.w <= 0.5 || b.h <= 0.5) return

    const layers = Math.max(1, o.layers ?? 2)
    // Global density. Coloured pencil at this scale should read as tone, and
    // tone needs the lines close enough to touch; anything sparser reads as
    // hatching-as-decoration. Width tracks spacing, so coverage stays constant
    // and only the texture gets finer.
    const baseSpacing = (o.spacing ?? 2.6) * 0.6 / (d * this.density)
    const baseAngle = (o.angle ?? -0.62) + this.angleBias
    const layerTurn = ((o.layerTurn ?? 26) * Math.PI) / 180
    // A pen drawing carries almost none of its form in tone, so the hatching
    // all but disappears at the ink end and the paper does the work.
    const alpha = (o.alpha ?? 0.085) * (1 - this.hand.ink * 0.68)
    // A hatch line should be about as wide as the gap to its neighbour. Any
    // narrower and the fill reads as a set of lines; any wider and the grain
    // between them is lost. This single relationship is most of the difference
    // between "scribbled" and "shaded".
    const width = o.width ?? baseSpacing * this.nib
    const curve = o.curve ?? 1.6
    const lane = o.lane ?? 0
    const diag = Math.hypot(b.w, b.h) * 0.5 + 4
    const hueJitter = o.hueJitter ?? 3
    const gapChance = clamp((o.gaps ?? 0.2) * this.gapScale, 0, 0.85)

    const ctx = this.ctx
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    const extra = o.clipTo ?? []

    for (let L = 0; L < layers; L++) {
      const a = baseAngle + L * layerTurn
      const dx = Math.cos(a)
      const dy = Math.sin(a)
      const nx = -dy
      const ny = dx
      // Later layers sit further apart and lighter, so cross-hatching adds
      // texture without doubling the density.
      const spacing = baseSpacing * (1 + L * 0.42)
      const layerAlpha = alpha * (L === 0 ? 1 : 0.6 / L)
      const count = Math.ceil((diag * 2) / spacing)

      // Lines are accumulated into a small number of pressure buckets and
      // stroked as one path each. Issuing a separate draw call per line is
      // what actually costs — a sheet contains hundreds of thousands of them —
      // and bucketing by pressure is not a compromise but a better model:
      // within a bucket the lines share a weight, and darker buckets get a
      // slightly wider, slightly warmer mark, which is how a pencil behaves
      // when you lean on it.
      const BUCKETS = 12
      const paths: (Path2D | null)[] = new Array(BUCKETS).fill(null)

      for (let i = 0; i <= count; i++) {
        const lineLane = lane + i * 0.37 + L * 11
        const off = -diag + i * spacing + rng.gauss(0, spacing * 0.2)
        const mx = b.cx + nx * off
        const my = b.cy + ny * off

        // Only the parts of this line that fall inside the shape get drawn.
        let spans = insideSpans(region, mx, my, dx, dy)
        if (spans.length === 0) continue
        for (const other of extra) {
          spans = intersectSpans(spans, insideSpans(other, mx, my, dx, dy))
          if (spans.length === 0) break
        }
        if (spans.length === 0) continue

        for (const span of spans) {
          const pr = o.pressure
            ? o.pressure(mx + dx * (span[0] + span[1]) * 0.5, my + dy * (span[0] + span[1]) * 0.5)
            : 1
          if (pr <= 0.03) continue

          const weight = pr * rng.range(0.7, 1.3)
          const bucket = Math.min(BUCKETS - 1, Math.max(0, Math.round(weight * (BUCKETS - 1) / 1.3)))
          let path = paths[bucket]
          if (!path) { path = new Path2D(); paths[bucket] = path }

          const half = (span[1] - span[0]) * 0.5
          const mid = (span[0] + span[1]) * 0.5
          const bow = rng.gauss(0, curve)
          // Segment count is the real cost of a hatch fill: stroking a
          // polyline means building its outline geometry, which scales with
          // points rather than with pixels. Three segments is enough to carry
          // a bow and a wander; more is invisible at this length.
          const segs = Math.max(2, Math.min(3, Math.round(half * 0.35)))
          const step = (span[1] - span[0]) / segs
          const wob = 0.55 * this.wobbleScale

          // Trim an end at random: a hand does not start and stop on the mark.
          const from = segs > 2 && rng.bool(0.4) ? 1 : 0
          const to = segs > 2 && rng.bool(0.4) ? segs - 1 : segs
          // An occasional lift in the middle.
          const lift = segs > 3 && rng.bool(gapChance)
            ? rng.int(from + 1, Math.max(from + 1, to - 1))
            : -1

          let penDown = false
          for (let k = from; k <= to; k++) {
            const sPos = span[0] + step * k
            const bend = half > 0.001 ? bow * (1 - ((sPos - mid) / half) ** 2) : 0
            const wander = this.noise.at1(k * 0.6 + lineLane, L * 3.1) * wob
            const shift = bend + wander
            const px = mx + dx * sPos + nx * shift
            const py = my + dy * sPos + ny * shift
            if (k === lift) { penDown = false; continue }
            if (!penDown) { path.moveTo(px, py); penDown = true } else path.lineTo(px, py)
          }
        }
      }

      for (let bkt = 0; bkt < BUCKETS; bkt++) {
        const path = paths[bkt]
        if (!path) continue
        const weight = (bkt / (BUCKETS - 1)) * 1.3
        const alphaHere = layerAlpha * weight * this.pressure
        if (alphaHere <= 0.004) continue
        const col = hueJitter > 0
          ? adjust(o.color, 0, weight * 3 - 2, (bkt - BUCKETS / 2) * hueJitter * 0.35)
          : o.color
        ctx.strokeStyle = this.style(col, alphaHere)
        // Lean harder, leave a wider mark.
        ctx.lineWidth = width * (0.82 + weight * 0.34)
        ctx.stroke(path)
      }
    }
  }

  /**
   * Draw the edge of a form. Real contour lines are not uniform: they press
   * hardest where the form turns away from the light, which is what
   * `heavyAngle` controls.
   */
  contour(pts: readonly Pt[], o: ContourOptions): void {
    if (pts.length < 3) return
    if (o.optional && this.lineCoverage < 0.55) return
    const closed = o.closed ?? true
    const loop = closed ? [...pts, pts[0]!] : [...pts]

    let hidden: ((t: number) => number) | undefined
    if (o.hiddenIn && o.hiddenIn.length > 2) {
      const cover = o.hiddenIn
      const mask = loop.map((q) => (contains(cover, q.x, q.y) ? 0.12 : 1))
      hidden = (t: number) => mask[Math.round(clamp(t, 0, 1) * (mask.length - 1))]!
    }

    let alphaAt: ((t: number) => number) | undefined
    if (o.heavyAmount && o.heavyAmount > 0) {
      const c = centroid(pts)
      const heavy = o.heavyAngle ?? Math.PI * 0.5
      const amount = o.heavyAmount
      const weights = loop.map((p) => {
        const ang = Math.atan2(p.y - c.y, p.x - c.x)
        return clamp(1 + amount * Math.cos(ang - heavy), 1 - amount, 1 + amount)
      })
      alphaAt = (t: number) =>
        weights[Math.round(clamp(t, 0, 1) * (weights.length - 1))]! * (hidden ? hidden(t) : 1)
    } else if (hidden) {
      alphaAt = hidden
    }

    this.stroke(loop, {
      alpha: 0.17 * this.finish * this.hand.contourAlpha,
      width: 1.25 * this.hand.contourWidth,
      passes: 2,
      spread: 0.5,
      wobble: 0.7,
      wobbleFreq: 3.4,
      gaps: 0.12,
      taper: 0.12,
      step: 2.4,
      ...o,
      // Pulled toward ink last, after the caller's own options, so a hand that
      // draws in pen converts every contour in the picture at once rather than
      // needing each call site to know about it.
      color: this.inkify(o.color),
      alphaAt,
    })
  }

  /**
   * Pull a colour toward pen-black by however much this hand is a pen.
   *
   * Coloured pencil outlines in a cousin of the local colour, which is what
   * keeps a drawing from going muddy. A pen has one colour and the line is the
   * whole drawing, so at the ink end of the axis every contour converges on it.
   */
  inkify(c: Hsl): Hsl {
    const k = this.hand.ink
    if (k <= 0.01) return c
    return {
      h: c.h,
      s: c.s + (16 - c.s) * k,
      l: c.l + (14 - c.l) * k,
    }
  }

  /**
   * The background panel: a scrubbed, hatched field of pale colour.
   *
   * Taken from the reference rather than from guesswork. Four things there
   * that earlier versions all missed:
   *
   *  - It is a large **rounded square** covering most of the frame, which the
   *    whole figure sits on — not a halo around the head. There is white paper
   *    margin all around it, and that margin is part of the composition.
   *  - The interior is nearly **flat and very pale**. It is the *edge* that
   *    carries the panel: a denser band of visible strokes in the last fifth
   *    before the boundary, which is what reads as a deliberate backdrop
   *    against the white margin.
   *  - It is **multi-hued** — cool overall, with a warm cream patch to one
   *    side and a pale green to the other, each fading out at its own edges
   *    rather than meeting at a seam.
   *  - The marks are **parallel**, not scattered. Scattering short strokes at
   *    random positions clumps and leaves holes, which is why every previous
   *    attempt read as blotches; laying proper crossed hatch over the whole
   *    panel is what makes it a wash.
   */
  washPanel(
    cx: number, cy: number, rx: number, ry: number, n: number,
    tints: readonly Hsl[],
    o: { alpha?: number; spacing?: number; wobble?: number } = {},
  ): void {
    const rng = this.rng
    const alpha = (o.alpha ?? 0.05) * this.hand.saturation
    const spacing = o.spacing ?? 3.6
    const inv = 2 / Math.max(2, n)

    // The panel outline. Hatched to, not drawn — the boundary is where the
    // strokes stop, which is how a scrubbed edge is made.
    const panel = blob(cx, cy, rx, ry, this.noise, {
      n, steps: 96, wobble: o.wobble ?? 0.035, lumps: 2.4, lane: 41,
    })

    // Superellipse radius: 1 at the boundary, 0 at the centre.
    const radius = (x: number, y: number): number => {
      const ux = (x - cx) / rx
      const uy = (y - cy) / ry
      return (Math.abs(ux) ** (2 / inv) + Math.abs(uy) ** (2 / inv)) ** (inv / 2)
    }

    // Even across the middle, heavier in the last third. The cloud term keeps
    // it from being a machine gradient.
    const field = (x: number, y: number): number => {
      const r = radius(x, y)
      const edge = 0.55 + 0.85 * clamp((r - 0.6) / 0.4, 0, 1)
      const cloud = 0.7 + this.noise.at(x * 0.011 + 5.5, y * 0.011) * 0.55
      return clamp(edge * cloud, 0, 1.5)
    }

    const cool = tints[0]!
    const warm = tints[1] ?? cool
    const alt = tints[2] ?? cool

    // The panel is scrubbed in as overlapping *bands*, not as full-height
    // ruled lines. A hatch line that runs the whole height of the panel reads
    // as a ruled stripe however much it wobbles; the reference's marks are
    // short, overlap, and change direction from one part of the panel to the
    // next, because a hand scrubs a patch at a time and moves on.
    const band = (
      x0: number, y0: number, x1: number, y1: number,
      angle: number, a: number, sp: number, lane: number,
    ): void => {
      this.hatch(panel, {
        color: cool,
        alpha: a,
        spacing: sp,
        angle,
        layers: 1,
        clipTo: [[
          { x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 },
        ]],
        pressure: field,
        curve: 2.6,
        gaps: 0.4,
        hueJitter: 7,
        lane,
      })
    }

    // Three overlapping horizontal bands scrubbed vertically, then two
    // vertical bands scrubbed across. The crossing is what turns lines into a
    // wash; the overlap is what hides the joins.
    const top = cy - ry * 1.05
    const bot = cy + ry * 1.05
    const left = cx - rx * 1.05
    const right = cx + rx * 1.05
    const rows = 3
    for (let i = 0; i < rows; i++) {
      const t0 = top + ((bot - top) * i) / rows - ry * 0.12
      const t1 = top + ((bot - top) * (i + 1)) / rows + ry * 0.12
      band(left, t0, right, t1, Math.PI / 2 + rng.gauss(0, 0.11), alpha, spacing, 700 + i * 13)
    }
    for (let i = 0; i < 2; i++) {
      const s0 = left + ((right - left) * i) / 2 - rx * 0.14
      const s1 = left + ((right - left) * (i + 1)) / 2 + rx * 0.14
      band(s0, top, s1, bot, rng.gauss(0, 0.13), alpha * 0.6, spacing * 1.6, 940 + i * 17)
    }
    // A half-offset set of rows on top, so the band joins do not line up and
    // read as seams across the panel.
    for (let i = 0; i < rows; i++) {
      const t0 = top + ((bot - top) * (i + 0.5)) / rows - ry * 0.1
      const t1 = top + ((bot - top) * (i + 1.5)) / rows + ry * 0.1
      band(left, t0, right, t1, Math.PI / 2 + rng.gauss(0, 0.14), alpha * 0.5, spacing * 1.9, 1180 + i * 23)
    }

    // Soft colour patches inside the panel. Each fades to nothing at its own
    // rim, so it sits in the wash rather than being pasted over it.
    const patch = (tint: Hsl, fx: number, fy: number, fr: number, lane: number): void => {
      const px = cx + rx * fx
      const py = cy + ry * fy
      const pr = rx * fr
      const qr = ry * fr * rng.range(0.75, 1.25)
      const region = blob(px, py, pr, qr, this.noise, {
        n: 2, steps: 40, wobble: 0.24, lumps: 2.6, lane,
      })
      this.hatch(region, {
        color: tint,
        alpha: alpha * 1.5,
        spacing: spacing * 1.1,
        angle: rng.range(-Math.PI, Math.PI),
        layers: 1,
        clipTo: [panel],
        pressure: (x, y) => {
          const t = Math.hypot((x - px) / pr, (y - py) / qr)
          return clamp(1 - t, 0, 1) ** 1.3 * (0.7 + this.noise.at(x * 0.02, y * 0.02) * 0.4)
        },
        curve: 2.8,
        gaps: 0.5,
        hueJitter: 7,
        lane: lane * 3,
      })
    }

    // Warm to one side, cool-green to the other, as the reference has it —
    // mirrored at random so the sheet does not repeat one layout 256 times.
    const side = rng.bool(0.5) ? -1 : 1
    patch(warm, side * rng.range(0.42, 0.62), rng.range(-0.1, 0.24), rng.range(0.3, 0.44), 63)
    patch(alt, -side * rng.range(0.36, 0.6), rng.range(-0.3, 0.12), rng.range(0.26, 0.4), 87)
  }

  /**
   * Lay an opaque ground inside a shape before hatching it.
   *
   * Two jobs at once. Pigment layers are translucent, so without a ground the
   * hair behind a head and the wash behind a figure show straight through the
   * face. And a coloured-pencil drawing is not built on bare paper anyway — you
   * put down a pale wash of the local colour first and build the darks on top
   * of it. Passing a light version of the form's own hue does both, and avoids
   * the pale cut-out look that a flat paper fill gives.
   */
  base(region: readonly Pt[], ground: Hsl, alpha = 0.97, smooth = true): void {
    const ctx = this.ctx
    // A pen drawing is not a filled drawing: the colour is a thin note behind
    // the line, not the substance of the form.
    alpha *= 1 - this.hand.ink * 0.7
    ctx.save()
    ctx.globalCompositeOperation = 'source-over'
    tracePath(ctx, region, true, smooth)
    ctx.fillStyle = this.style(ground, alpha)
    ctx.fill()
    ctx.restore()
  }

  /**
   * A dark accent: near-opaque pigment, laid hard.
   *
   * The drawing had no mechanism capable of producing a genuine dark. Every
   * mark was translucent at alpha 0.05-0.30, so the whole picture lived inside
   * a mid-grey band with no blacks and no whites, which is most of why it read
   * as a child's drawing. This is the fourth mark type alongside stroke, hatch
   * and contour, and it is meant for perhaps two percent of the picture: the
   * pupils, the glasses, the deepest core of the hair, the line of the mouth.
   *
   * Used widely it would look like felt-tip, so it is deliberately awkward to
   * reach for.
   */
  accent(region: readonly Pt[], color: Hsl, alpha = 0.92): void {
    const ctx = this.ctx
    ctx.save()
    ctx.globalCompositeOperation = 'source-over'
    tracePath(ctx, region, true)
    ctx.fillStyle = this.opaque(color, alpha)
    ctx.fill()
    ctx.restore()
    // A little tooth over the top so it still reads as pigment, not as ink.
    this.hatch(region, {
      color: adjust(color, -6, 4),
      alpha: 0.3,
      spacing: 1.4,
      angle: 0.7,
      layers: 1,
      gaps: 0.1,
      lane: 8800,
    })
  }

  /**
   * A near-opaque ring: the area between an outer and an inner outline, filled
   * with the even-odd rule. What a spectacle frame actually is.
   */
  accentRing(outer: readonly Pt[], inner: readonly Pt[], color: Hsl, alpha = 0.9): void {
    const ctx = this.ctx
    ctx.save()
    ctx.globalCompositeOperation = 'source-over'
    // Built as one Path2D with two subpaths: `tracePath` starts a fresh path
    // each call, so tracing twice onto the context would discard the first.
    const ring = new Path2D()
    for (const loop of [outer, inner]) {
      ring.moveTo(loop[0]!.x, loop[0]!.y)
      for (let i = 1; i < loop.length; i++) ring.lineTo(loop[i]!.x, loop[i]!.y)
      ring.closePath()
    }
    ctx.fillStyle = this.opaque(color, alpha)
    ctx.fill(ring, 'evenodd')
    ctx.restore()
  }

  /**
   * A near-opaque line. The companion to `accent` for marks that are strokes
   * rather than shapes — the line of a mouth, the arm of a pair of glasses.
   */
  accentStroke(pts: readonly Pt[], color: Hsl, width: number, alpha = 0.85): void {
    const ctx = this.ctx
    ctx.save()
    ctx.globalCompositeOperation = 'source-over'
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = this.opaque(color, alpha)
    ctx.lineWidth = width
    const spine = resample(pts, 3)
    ctx.beginPath()
    ctx.moveTo(spine[0]!.x, spine[0]!.y)
    for (let i = 1; i < spine.length; i++) {
      const q = spine[i]!
      const w = this.noise.at1(i * 0.5, 9) * 0.5 * this.wobbleScale
      ctx.lineTo(q.x + w, q.y + w * 0.4)
    }
    ctx.stroke()
    ctx.restore()
  }

  /** Uncached colour lookup, for the rare opaque fills. */
  private opaque(c: Hsl, alpha: number): string {
    return css(c, clamp(alpha, 0, 1))
  }

  /** Scattered pigment specks — used sparingly, for freckles and confetti. */
  fleck(region: readonly Pt[], color: Hsl, count: number, radius = 0.9): void {
    const b = bounds(region)
    const ctx = this.ctx
    withClip(ctx, [region], () => {
      const n = Math.max(1, Math.round(count * clamp(this.detail, 0.5, 1.3)))
      for (let i = 0; i < n; i++) {
        const x = b.x + this.rng.next() * b.w
        const y = b.y + this.rng.next() * b.h
        const r = radius * this.rng.range(0.6, 1.4)
        ctx.fillStyle = this.style(color, this.rng.range(0.25, 0.6) * Math.min(1.6, this.pressure))
        ctx.beginPath()
        ctx.ellipse(x, y, r, r * this.rng.range(0.7, 1.3), this.rng.next() * 3.14, 0, 6.283)
        ctx.fill()
      }
    })
  }
}

/* ------------------------------------------------------------------ paper */

let grainTileCache: HTMLCanvasElement | null = null
let darkGrainCache: HTMLCanvasElement | null = null
/** Patterns are per-context, and rebuilding one per cell is not free. */
const patternCache = new WeakMap<CanvasRenderingContext2D, CanvasPattern>()

function cachedPattern(
  ctx: CanvasRenderingContext2D, tile: HTMLCanvasElement,
): CanvasPattern | null {
  const hit = patternCache.get(ctx)
  if (hit) return hit
  const made = ctx.createPattern(tile, 'repeat')
  if (made) patternCache.set(ctx, made)
  return made
}

/**
 * The paper tooth. One tile is generated at startup and multiplied over every
 * pigment layer, which is what stops flat areas from looking like flat areas.
 */
export function grainTile(size = 512): HTMLCanvasElement {
  if (grainTileCache) return grainTileCache
  const c = document.createElement('canvas')
  c.width = c.height = size
  const ctx = c.getContext('2d')!
  const img = ctx.createImageData(size, size)
  const noise = new NoiseImpl(new RngImpl('pencilfolk::tooth'))
  const data = img.data
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Two scales: fine tooth plus a slower undulation of the sheet. The fine
      // term runs at close to one grain per device pixel, which is what makes
      // the texture read as paper rather than as a soft haze.
      const fine = noise.at(x * 2.1, y * 2.1)
      const finer = noise.at(x * 4.3 + 91, y * 4.3 + 17)
      const coarse = noise.fbm(x * 0.09, y * 0.09, 2)
      const v = 234 + fine * 22 + finer * 10 + coarse * 11
      const i = (y * size + x) * 4
      data[i] = data[i + 1] = data[i + 2] = clamp(v, 0, 255)
      data[i + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  grainTileCache = c
  return c
}

/**
 * A transparent, dark version of the tooth.
 *
 * Needed because `multiply` does nothing over transparent pixels: on a cell
 * canvas with no opaque backdrop, a multiply pass simply *paints* the tile,
 * hazing the whole frame. This tile is composited with `source-atop` instead,
 * so it can only darken pigment that is already there.
 */
export function darkGrainTile(size = 512): HTMLCanvasElement {
  if (darkGrainCache) return darkGrainCache
  const c = document.createElement('canvas')
  c.width = c.height = size
  const ctx = c.getContext('2d')!
  const img = ctx.createImageData(size, size)
  const noise = new NoiseImpl(new RngImpl('pencilfolk::tooth-dark'))
  const data = img.data
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const fine = noise.at(x * 2.1, y * 2.1)
      const finer = noise.at(x * 4.3 + 91, y * 4.3 + 17)
      const coarse = noise.fbm(x * 0.09, y * 0.09, 2)
      const a = clamp(56 + fine * 52 + finer * 24 + coarse * 24, 0, 255)
      const i = (y * size + x) * 4
      data[i] = 74
      data[i + 1] = 62
      data[i + 2] = 50
      data[i + 3] = a
    }
  }
  ctx.putImageData(img, 0, 0)
  darkGrainCache = c
  return c
}

/**
 * Break up pigment that has already been laid down, without touching the paper
 * around it.
 */
export function grainPigment(
  ctx: CanvasRenderingContext2D, w: number, h: number, strength = 0.4, offset = 0,
): void {
  const tile = darkGrainTile()
  ctx.save()
  const scale = ctx.getTransform().a || 1
  ctx.globalCompositeOperation = 'source-atop'
  ctx.globalAlpha = strength
  const pattern = ctx.createPattern(tile, 'repeat')
  if (pattern) {
    ctx.scale(1 / scale, 1 / scale)
    // Offset the tile per cell so the sheet does not show 256 identical grains,
    // then fill exactly the canvas. Padding the rect by a tile instead would
    // rasterise ten times the visible area — on a 16x16 sheet that alone cost
    // more than every pencil mark on the page put together.
    const ox = (offset * 97) % 512
    const oy = (offset * 61) % 512
    ctx.translate(-ox, -oy)
    ctx.fillStyle = pattern
    ctx.fillRect(ox, oy, w * scale, h * scale)
  }
  ctx.restore()
}

/**
 * Multiply the tooth over whatever has been drawn so far.
 *
 * The pattern is laid down at *device* resolution rather than in the drawing's
 * own units. The context is normally scaled — a thumbnail draws 240 art units
 * into 208 pixels, the inspector draws them into 480 — and painting the tile in
 * art units would stretch one grain across two or three pixels at high zoom,
 * turning crisp paper into a soft haze. Undoing the scale first keeps one grain
 * to one pixel at every size.
 */
export function applyGrain(
  ctx: CanvasRenderingContext2D, w: number, h: number, strength = 0.55, offset = 0,
): void {
  const tile = grainTile()
  ctx.save()
  const scale = ctx.getTransform().a || 1
  ctx.globalCompositeOperation = 'multiply'
  ctx.globalAlpha = strength
  const pattern = cachedPattern(ctx, tile)
  if (pattern) {
    ctx.scale(1 / scale, 1 / scale)
    // Offset the tile per cell so the sheet does not show 256 identical grains,
    // then fill exactly the canvas. Padding the rect by a tile instead would
    // rasterise ten times the visible area — on a 16x16 sheet that alone cost
    // more than every pencil mark on the page put together.
    const ox = (offset * 97) % 512
    const oy = (offset * 61) % 512
    ctx.translate(-ox, -oy)
    ctx.fillStyle = pattern
    ctx.fillRect(ox, oy, w * scale, h * scale)
  }
  ctx.restore()
}

/**
 * Build a sheet of paper: base tone, soft mottling from upscaled noise, tooth,
 * and a few visible fibres. Used both as the CSS backdrop for the sheet and as
 * the base layer of any export.
 */
export function makePaper(w: number, h: number, tone: Hsl, seed: string): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(w))
  c.height = Math.max(1, Math.round(h))
  const ctx = c.getContext('2d')!
  const rng = new RngImpl(`${seed}::paper`)
  const noise = new NoiseImpl(rng.fork('mottle'))

  ctx.fillStyle = css(tone)
  ctx.fillRect(0, 0, c.width, c.height)

  // Mottling: render at a sixth scale and let the browser's own smoothing do
  // the blur for us. Far cheaper than blurring a full-size buffer.
  const lw = Math.max(2, Math.ceil(c.width / 6))
  const lh = Math.max(2, Math.ceil(c.height / 6))
  const small = document.createElement('canvas')
  small.width = lw
  small.height = lh
  const sctx = small.getContext('2d')!
  const img = sctx.createImageData(lw, lh)
  for (let y = 0; y < lh; y++) {
    for (let x = 0; x < lw; x++) {
      const n = noise.fbm(x * 0.09, y * 0.09, 3)
      const i = (y * lw + x) * 4
      const v = clamp(128 + n * 26, 0, 255)
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v
      img.data[i + 3] = 46
    }
  }
  sctx.putImageData(img, 0, 0)
  ctx.save()
  ctx.globalCompositeOperation = 'overlay'
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(small, 0, 0, c.width, c.height)
  ctx.restore()

  // Light. The tooth is a texture on the paper, not a tint over it — at 0.5 it
  // knocked the brightest achievable pixel down to ~236, and since every
  // pigment layer multiplies, nothing in the picture could ever be whiter than
  // that. The reference is nearly half bare paper.
  // The tooth subtracts from white; it must not sit on top of it as a floor.
  // At 0.16 the brightest achievable pixel was 243, so nothing in the picture
  // could ever be paper-white — and the reference is 46% paper-white.
  applyGrain(ctx, c.width, c.height, 0.09)

  // A handful of fibres pressed into the pulp.
  ctx.save()
  ctx.globalCompositeOperation = 'multiply'
  const fibres = Math.round((c.width * c.height) / 26000)
  for (let i = 0; i < fibres; i++) {
    const x = rng.next() * c.width
    const y = rng.next() * c.height
    const len = rng.range(6, 34)
    const ang = rng.next() * Math.PI * 2
    ctx.strokeStyle = css(adjust(tone, rng.range(-9, -3), 4), rng.range(0.1, 0.28))
    ctx.lineWidth = rng.range(0.4, 1)
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.quadraticCurveTo(
      x + Math.cos(ang) * len * 0.5 + rng.gauss(0, 3),
      y + Math.sin(ang) * len * 0.5 + rng.gauss(0, 3),
      x + Math.cos(ang) * len,
      y + Math.sin(ang) * len,
    )
    ctx.stroke()
  }
  ctx.restore()

  return c
}
