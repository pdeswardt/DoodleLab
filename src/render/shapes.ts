/**
 * Path geometry.
 *
 * Nothing here is drawn directly — these build point lists that the pencil
 * engine then deposits pigment along. Keeping geometry and mark-making apart is
 * what lets the same silhouette be outlined, hatched, clipped against or
 * offset without duplicating the maths.
 */

import type { Noise } from '../core/noise'

export interface Pt {
  x: number
  y: number
}

export const pt = (x: number, y: number): Pt => ({ x, y })

export function lerpPt(a: Pt, b: Pt, t: number): Pt {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
}

export function dist(a: Pt, b: Pt): number {
  return Math.hypot(b.x - a.x, b.y - a.y)
}

export interface Bounds {
  x: number
  y: number
  w: number
  h: number
  cx: number
  cy: number
}

export function bounds(pts: readonly Pt[]): Bounds {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const p of pts) {
    if (p.x < minX) minX = p.x
    if (p.y < minY) minY = p.y
    if (p.x > maxX) maxX = p.x
    if (p.y > maxY) maxY = p.y
  }
  return {
    x: minX, y: minY,
    w: maxX - minX, h: maxY - minY,
    cx: (minX + maxX) / 2, cy: (minY + maxY) / 2,
  }
}

/**
 * A superellipse. `n = 2` is an ellipse, `n > 2` squares off toward a rounded
 * rectangle, `n < 2` pinches toward a diamond. Head shapes, background washes
 * and pockets are all one exponent apart from each other.
 */
export function superellipse(
  cx: number, cy: number, rx: number, ry: number, n = 2, steps = 64,
): Pt[] {
  const out: Pt[] = []
  const inv = 2 / n
  for (let i = 0; i < steps; i++) {
    const t = (i / steps) * Math.PI * 2
    const ct = Math.cos(t)
    const st = Math.sin(t)
    out.push({
      x: cx + rx * Math.sign(ct) * Math.abs(ct) ** inv,
      y: cy + ry * Math.sign(st) * Math.abs(st) ** inv,
    })
  }
  return out
}

export interface BlobOptions {
  /** Superellipse exponent — see `superellipse`. */
  n?: number
  steps?: number
  /** Radial displacement as a fraction of radius. */
  wobble?: number
  /** How many bumps around the circumference. */
  lumps?: number
  /** Which noise lane to sample, so two blobs never wobble identically. */
  lane?: number
  /** Per-angle radius scale, e.g. to widen a jaw or flatten a crown. */
  shape?: (angle: number) => number
}

/**
 * The workhorse silhouette: a superellipse whose radius is modulated by noise,
 * so no two heads, hair masses or washes share an outline.
 */
export function blob(
  cx: number, cy: number, rx: number, ry: number,
  noise: Noise, o: BlobOptions = {},
): Pt[] {
  const steps = o.steps ?? 56
  const wobble = o.wobble ?? 0.05
  const lumps = o.lumps ?? 3
  const lane = o.lane ?? 0
  const n = o.n ?? 2
  const inv = 2 / n
  const out: Pt[] = []
  for (let i = 0; i < steps; i++) {
    const t = (i / steps) * Math.PI * 2
    const ct = Math.cos(t)
    const st = Math.sin(t)
    // Sample noise on a circle so the displacement is seamless at the wrap.
    const nx = Math.cos(t) * lumps + lane * 13.7
    const ny = Math.sin(t) * lumps + lane * 7.3
    const wob = 1 + noise.at(nx, ny) * wobble
    const shape = o.shape ? o.shape(t) : 1
    out.push({
      x: cx + rx * wob * shape * Math.sign(ct) * Math.abs(ct) ** inv,
      y: cy + ry * wob * shape * Math.sign(st) * Math.abs(st) ** inv,
    })
  }
  return out
}

/** Points along an arc — eyelids, smiles, brim curves, shoulder lines. */
export function arc(
  cx: number, cy: number, rx: number, ry: number,
  a0: number, a1: number, steps = 14,
): Pt[] {
  const out: Pt[] = []
  for (let i = 0; i <= steps; i++) {
    const a = a0 + ((a1 - a0) * i) / steps
    out.push({ x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry })
  }
  return out
}

/** Quadratic bezier sampled to points, for hand-placed curves. */
export function quad(a: Pt, ctrl: Pt, b: Pt, steps = 12): Pt[] {
  const out: Pt[] = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const u = 1 - t
    out.push({
      x: u * u * a.x + 2 * u * t * ctrl.x + t * t * b.x,
      y: u * u * a.y + 2 * u * t * ctrl.y + t * t * b.y,
    })
  }
  return out
}

/** Scale a polygon about its own centre — quick inset for inner shading. */
export function inset(pts: readonly Pt[], factor: number, about?: Pt): Pt[] {
  const c = about ?? centroid(pts)
  return pts.map((p) => ({
    x: c.x + (p.x - c.x) * factor,
    y: c.y + (p.y - c.y) * factor,
  }))
}

export function centroid(pts: readonly Pt[]): Pt {
  let x = 0, y = 0
  for (const p of pts) { x += p.x; y += p.y }
  return { x: x / pts.length, y: y / pts.length }
}

export function translate(pts: readonly Pt[], dx: number, dy: number): Pt[] {
  return pts.map((p) => ({ x: p.x + dx, y: p.y + dy }))
}

export function rotate(pts: readonly Pt[], angle: number, about: Pt): Pt[] {
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  return pts.map((p) => {
    const dx = p.x - about.x
    const dy = p.y - about.y
    return { x: about.x + dx * c - dy * s, y: about.y + dx * s + dy * c }
  })
}

/**
 * Resample a polyline to roughly even spacing. Pigment deposition assumes even
 * steps — without this, tight curves get dark and long straights get thin.
 */
export function resample(pts: readonly Pt[], spacing: number): Pt[] {
  if (pts.length < 2) return [...pts]
  const out: Pt[] = [pts[0]!]
  let carry = 0
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!
    const b = pts[i]!
    const seg = dist(a, b)
    if (seg <= 1e-6) continue
    let travelled = spacing - carry
    while (travelled <= seg) {
      out.push(lerpPt(a, b, travelled / seg))
      travelled += spacing
    }
    carry = seg - (travelled - spacing)
  }
  const last = pts[pts.length - 1]!
  if (dist(out[out.length - 1]!, last) > spacing * 0.3) out.push(last)
  return out
}

/** Outward unit normal at index `i` of a polyline. */
export function normalAt(pts: readonly Pt[], i: number): Pt {
  const a = pts[Math.max(0, i - 1)]!
  const b = pts[Math.min(pts.length - 1, i + 1)]!
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.hypot(dx, dy) || 1
  return { x: -dy / len, y: dx / len }
}

/** Lay a smooth Catmull-Rom path onto the context (no stroke or fill). */
export function tracePath(
  ctx: CanvasRenderingContext2D, pts: readonly Pt[], closed = true,
): void {
  if (pts.length < 2) return
  const n = pts.length
  const at = (i: number): Pt =>
    closed ? pts[((i % n) + n) % n]! : pts[Math.min(n - 1, Math.max(0, i))]!

  ctx.beginPath()
  ctx.moveTo(at(0).x, at(0).y)
  const last = closed ? n : n - 1
  for (let i = 0; i < last; i++) {
    const p0 = at(i - 1)
    const p1 = at(i)
    const p2 = at(i + 1)
    const p3 = at(i + 2)
    ctx.bezierCurveTo(
      p1.x + (p2.x - p0.x) / 6, p1.y + (p2.y - p0.y) / 6,
      p2.x - (p3.x - p1.x) / 6, p2.y - (p3.y - p1.y) / 6,
      p2.x, p2.y,
    )
  }
  if (closed) ctx.closePath()
}

/**
 * Where an infinite line enters and leaves a polygon.
 *
 * Returns the parameters along `(px,py) + t*(dx,dy)` at which the line crosses
 * an edge, sorted. For a simple polygon these pair up into inside spans, which
 * is what lets a hatch fill draw only the parts of each line that land inside
 * the shape — no clip mask required. Clipping every hatch line instead is
 * correct but ruinously slow: the mask is re-applied per draw call, and a
 * sheet contains hundreds of thousands of them.
 */
export function lineCrossings(
  poly: readonly Pt[], px: number, py: number, dx: number, dy: number,
): number[] {
  const out: number[] = []
  const n = poly.length
  for (let i = 0; i < n; i++) {
    const a = poly[i]!
    const b = poly[(i + 1) % n]!
    const ex = b.x - a.x
    const ey = b.y - a.y
    const det = ex * dy - dx * ey
    if (Math.abs(det) < 1e-9) continue
    const wx = a.x - px
    const wy = a.y - py
    const u = (dx * wy - dy * wx) / det
    if (u < 0 || u > 1) continue
    out.push((ex * wy - wx * ey) / det)
  }
  out.sort((m, q) => m - q)
  return out
}

/** Inside spans of a line through a polygon, as [enter, exit] pairs. */
export function insideSpans(
  poly: readonly Pt[], px: number, py: number, dx: number, dy: number,
): [number, number][] {
  const ts = lineCrossings(poly, px, py, dx, dy)
  const spans: [number, number][] = []
  for (let i = 0; i + 1 < ts.length; i += 2) {
    if (ts[i + 1]! - ts[i]! > 0.4) spans.push([ts[i]!, ts[i + 1]!])
  }
  return spans
}

/** Intersect two sorted span lists. */
export function intersectSpans(
  a: readonly [number, number][], b: readonly [number, number][],
): [number, number][] {
  const out: [number, number][] = []
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    const lo = Math.max(a[i]![0], b[j]![0])
    const hi = Math.min(a[i]![1], b[j]![1])
    if (hi - lo > 0.4) out.push([lo, hi])
    if (a[i]![1] < b[j]![1]) i++
    else j++
  }
  return out
}

/** Run `fn` with the context clipped to the intersection of every region. */
export function withClip(
  ctx: CanvasRenderingContext2D, regions: readonly (readonly Pt[])[], fn: () => void,
): void {
  ctx.save()
  for (const region of regions) {
    tracePath(ctx, region, true)
    ctx.clip()
  }
  fn()
  ctx.restore()
}
