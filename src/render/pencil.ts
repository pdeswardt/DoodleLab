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
import {
  type Pt, resample, normalAt, bounds, centroid, withClip, tracePath,
  insideSpans, intersectSpans,
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
    const taper = o.taper ?? 0.45
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
    const baseSpacing = (o.spacing ?? 2.6) * 0.6 / d
    const baseAngle = (o.angle ?? -0.62) + this.angleBias
    const layerTurn = ((o.layerTurn ?? 26) * Math.PI) / 180
    const alpha = o.alpha ?? 0.085
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
    const closed = o.closed ?? true
    const loop = closed ? [...pts, pts[0]!] : [...pts]

    let alphaAt: ((t: number) => number) | undefined
    if (o.heavyAmount && o.heavyAmount > 0) {
      const c = centroid(pts)
      const heavy = o.heavyAngle ?? Math.PI * 0.5
      const amount = o.heavyAmount
      const weights = loop.map((p) => {
        const ang = Math.atan2(p.y - c.y, p.x - c.x)
        return clamp(1 + amount * Math.cos(ang - heavy), 1 - amount, 1 + amount)
      })
      alphaAt = (t: number) => weights[Math.round(clamp(t, 0, 1) * (weights.length - 1))]!
    }

    this.stroke(loop, {
      alpha: 0.17 * this.finish,
      width: 1.25,
      passes: 2,
      spread: 0.5,
      wobble: 0.7,
      wobbleFreq: 3.4,
      gaps: 0.12,
      taper: 0.12,
      step: 2.4,
      ...o,
      alphaAt,
    })
  }

  /**
   * Broad, side-of-the-pencil coverage. This is what the background wash is
   * made of: very wide, very faint marks that read as a haze rather than as
   * individual strokes.
   */
  wash(region: readonly Pt[], o: HatchOptions & { softness?: number }): void {
    const softness = o.softness ?? 1
    this.hatch(region, {
      // Wash marks are ten times the width of a hatch line, so the density
      // factor that tightens hatching would make this ruinously expensive for
      // no visible gain — the marks already overlap heavily.
      spacing: 12 * softness,
      width: 9 * softness,
      alpha: 0.045,
      layers: 2,
      layerTurn: 58,
      curve: 5,
      gaps: 0.28,
      taper: 0.8,
      hueJitter: 5,
      ...o,
    })
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
    ctx.save()
    ctx.globalCompositeOperation = 'source-over'
    tracePath(ctx, region, true, smooth)
    ctx.fillStyle = this.style(ground, alpha)
    ctx.fill()
    ctx.restore()
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

  applyGrain(ctx, c.width, c.height, 0.5)

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
