/**
 * Hair.
 *
 * Hair is drawn as flow, not as a shape that happens to be brown. Every mass is
 * filled with strands radiating from a whorl near the crown, which is what
 * makes a bun read as gathered and a mohawk read as swept up. Straight hatching
 * is used only for the deepest shadow, where direction stops being legible.
 */

import { adjust, shade, tint, clamp } from '../../core/color'
import type { Genome, HairSpec } from '../../core/genome'
import type { Scene } from '../character'
import { ellipsoidShade } from '../character'
import type { Pencil } from '../pencil'
import { type Pt, withClip, blob, arc, lerpPt, bounds } from '../shapes'

const paperOf = (s: Scene) => s.paper

/** The y below which the fringe stops and forehead begins. */
function hairlineY(g: Genome): number {
  const b = g.build
  const y = b.cy - b.headRy * (0.7 - g.hair.fringe * 0.56)
  // However heavy the fringe, it stops above the brows. Without this clamp a
  // full fringe plus side locks closes over the face entirely.
  return Math.min(y, g.face.eyeY - g.face.eyeR * 2.1)
}

/**
 * One strand: an arc that drifts as it grows, with an optional coil for curly
 * hair. Strands are drawn long and clipped by the mass, so the silhouette does
 * the shaping and the strands only supply direction.
 */
function strandPath(
  ox: number, oy: number, angle: number, len: number,
  curl: number, bend: number, phase: number, steps = 12,
): Pt[] {
  const pts: Pt[] = []
  let x = ox
  let y = oy
  let a = angle
  const step = len / steps
  for (let i = 0; i <= steps; i++) {
    pts.push({ x, y })
    const t = i / steps
    a += bend / steps + Math.sin(t * Math.PI * 2 * (1 + curl * 3.4) + phase) * curl * 0.42
    x += Math.cos(a) * step
    y += Math.sin(a) * step
  }
  return pts
}

interface MassOptions {
  /** Where the strands originate. */
  whorl: Pt
  /** Angular window the strands fan across. */
  from: number
  to: number
  count: number
  len: number
  curl: number
  bend: number
  lane: number
  /** Fraction of strands drawn in the highlight colour. */
  sheen?: number
}

/**
 * Fill a hair mass: local colour in flowing strands, a shadow pass, a sheen
 * band, and a broken outline.
 */
function fillMass(
  p: Pencil, g: Genome, region: Pt[], o: MassOptions,
  lightX: number, lightY: number, s0: Scene,
): void {
  const pal = g.palette
  const rng = p.rng
  const b = bounds(region)
  const count = Math.max(6, Math.round(o.count * clamp(p.detail, 0.45, 1.3)))
  const form = ellipsoidShade(b.cx, b.cy, b.w * 0.55, b.h * 0.55, lightX, lightY, 1.3)

  p.base(region, paperOf(s0), 0.8)

  withClip(p.ctx, [region], () => {
    // Block the mass in first. Strands alone leave a silhouette full of holes,
    // which is what makes procedural hair read as wire rather than hair.
    p.hatch(region, {
      color: pal.hair,
      alpha: 0.2,
      spacing: 2.2,
      angle: Math.atan2(b.cy - o.whorl.y, b.cx - o.whorl.x) + 1.5,
      layers: 3,
      layerTurn: 20,
      curve: 2.4,
      lane: o.lane + 700,
      pressure: (x, y) => 0.55 + form(x, y) * 0.7,
    })

    // Base pass.
    for (let i = 0; i < count; i++) {
      const t = i / Math.max(1, count - 1)
      const a = o.from + (o.to - o.from) * t + rng.gauss(0, 0.07)
      const start = {
        x: o.whorl.x + rng.gauss(0, 3.5),
        y: o.whorl.y + rng.gauss(0, 3.5),
      }
      const pts = strandPath(
        start.x, start.y, a, o.len * rng.range(0.75, 1.25),
        o.curl, o.bend + rng.gauss(0, 0.12), rng.next() * 6.28,
      )
      const mid = pts[Math.floor(pts.length / 2)]!
      const dark = form(mid.x, mid.y)
      p.stroke(pts, {
        color: dark > 0.45 ? shade(pal.hair, 1 + dark) : pal.hair,
        alpha: 0.15 + dark * 0.1,
        width: 1.9,
        passes: 1,
        wobble: 0.7,
        wobbleFreq: 3,
        gaps: 0.22,
        taper: 0.6,
        step: 3,
        hueJitter: 4,
        lane: o.lane + i,
      })
    }

    // Sheen: a narrow band of lighter strands, offset toward the light. Hair
    // without a highlight reads as a hat.
    const sheenCount = Math.round(count * (o.sheen ?? 0.16))
    for (let i = 0; i < sheenCount; i++) {
      const t = rng.around(0.42, 0.3)
      const a = o.from + (o.to - o.from) * t + rng.gauss(0, 0.05)
      const start = {
        x: o.whorl.x + lightX * 5 + rng.gauss(0, 3),
        y: o.whorl.y + lightY * 5 + rng.gauss(0, 3),
      }
      const pts = strandPath(start.x, start.y, a, o.len * rng.range(0.4, 0.8), o.curl, o.bend, rng.next() * 6.28, 8)
      p.stroke(pts, {
        color: tint(pal.hair, 1.5),
        alpha: 0.1,
        width: 2.4,
        passes: 1,
        wobble: 0.6,
        gaps: 0.3,
        taper: 0.75,
        step: 3.4,
        lane: o.lane + 500 + i,
      })
    }

    // Deep shadow where the mass turns away — straight hatch, since direction
    // is no longer readable down there.
    p.hatch(region, {
      color: shade(pal.hair, 2),
      alpha: 0.09,
      spacing: 3,
      angle: 1.1,
      layers: 1,
      lane: o.lane + 900,
      pressure: (x, y) => clamp((form(x, y) - 0.5) * 2.2, 0, 1),
    })
  })

  p.contour(region, {
    color: adjust(shade(pal.hair, 1.6), 0, 0),
    alpha: 0.2,
    width: 1.4,
    passes: 1,
    wobble: 1 + o.curl * 1.6,
    wobbleFreq: 3 + o.curl * 5,
    gaps: 0.26,
    lane: o.lane + 950,
  })
}

/**
 * The mass behind the head.
 *
 * Its width tracks how *long* the hair is, not just how much of it there is —
 * a bun and a waist-length fall have similar volume but only one of them
 * frames the face. Getting this wrong turns every character into a hood.
 */
function backRegion(s: Scene): Pt[] {
  const { g, p } = s
  const h = g.hair
  const b = g.build
  const fall = Math.max(0, h.sides - 0.35)
  const drop = b.headRy * (0.12 + fall * 1.1)
  return blob(
    b.cx, b.cy - b.headRy * 0.12 + drop * 0.3,
    b.headRx * (1 + h.back * 0.1 + fall * 0.18),
    b.headRy * (1 + h.back * 0.14) + drop * 0.42,
    p.noise,
    {
      n: 2.05 + h.curl * 0.5,
      wobble: 0.04 + h.curl * 0.09,
      lumps: 2 + h.curl * 4,
      lane: 11,
      steps: 54,
    },
  )
}

/** The cap sitting on the skull, from the hairline up and out. */
function capRegion(s: Scene): Pt[] {
  const { g, p } = s
  const h = g.hair
  const b = g.build
  const cut = hairlineY(g)
  const puff = 0.05 + h.crown * 0.34

  const kept = s.head.filter((pt) => pt.y <= cut)
  if (kept.length < 4) return []

  const swollen = kept.map((pt) => {
    const up = clamp((b.cy - pt.y) / b.headRy, 0, 1)
    const lump = 1 + h.curl * 0.09 * p.noise.at(pt.x * 0.09, pt.y * 0.09)
    const f = (1 + puff * up ** 0.75) * lump
    return { x: b.cx + (pt.x - b.cx) * f, y: b.cy + (pt.y - b.cy) * f }
  })

  // Close along the hairline with a scalloped edge — a straight hairline is
  // the fastest way to make hair look pasted on.
  const a = swollen[swollen.length - 1]!
  const z = swollen[0]!
  const steps = 16
  const line: Pt[] = []
  for (let i = 1; i < steps; i++) {
    const t = i / steps
    const q = lerpPt(a, z, t)
    const scallop =
      Math.sin(t * Math.PI * (2 + Math.round(h.curl * 4))) * (1.2 + h.curl * 2.4) +
      p.noise.at1(t * 5, 3) * 1.8
    // Sides of the fringe hang lower than its middle.
    const sag = Math.sin(t * Math.PI) * -h.fringe * b.headRy * 0.1
    line.push({ x: q.x, y: q.y + scallop + sag })
  }
  return [...swollen, ...line]
}

export function drawHairBack(s: Scene): void {
  const { p, g } = s
  const h = g.hair
  if (h.bald && h.back < 0.05) return

  if (h.back > 0.06) {
    const region = backRegion(s)
    fillMass(p, g, region, {
      whorl: { x: g.build.cx + h.part * g.build.headRx * 0.4, y: g.build.cy - g.build.headRy * 0.82 },
      from: 0.25,
      to: Math.PI - 0.25,
      count: 30,
      len: g.build.headRy * (1.1 + h.sides * 0.9),
      curl: h.curl * 0.7,
      bend: 0.5,
      lane: 200,
      sheen: 0.12,
    }, s.lx, s.ly, s)
  }

  drawTail(s)
  drawBraids(s)
  if (h.bun === 'back') drawBun(s, { x: g.build.cx, y: g.build.cy + g.build.headRy * 0.1 }, g.build.headRx * 0.4)
}

export function drawHairFront(s: Scene): void {
  const { p, g } = s
  const h = g.hair

  if (h.bald) {
    // Not nothing: a faint fuzz around the sides and a lit crown.
    drawSideFuzz(s)
    return
  }

  if (h.mohawk) {
    drawMohawk(s)
  } else {
    const cap = capRegion(s)
    if (cap.length > 3) {
      fillMass(p, g, cap, {
        whorl: {
          x: g.build.cx + h.part * g.build.headRx * 0.55,
          y: g.build.cy - g.build.headRy * (0.95 + h.crown * 0.3),
        },
        from: 0.15,
        to: Math.PI - 0.15,
        count: 26,
        len: g.build.headRy * (0.8 + h.crown * 0.7),
        curl: h.curl,
        bend: 0.55,
        lane: 260,
        sheen: 0.2,
      }, s.lx, s.ly, s)
    }
  }

  drawSideLocks(s)
  drawTufts(s)
  if (h.bun === 'top' || h.bun === 'double') {
    const r = g.build.headRx * (0.3 + h.crown * 0.16)
    if (h.bun === 'double') {
      drawBun(s, { x: g.build.cx - g.build.headRx * 0.6, y: g.build.cy - g.build.headRy * 0.92 }, r * 0.8)
      drawBun(s, { x: g.build.cx + g.build.headRx * 0.6, y: g.build.cy - g.build.headRy * 0.92 }, r * 0.8)
    } else {
      drawBun(s, { x: g.build.cx + h.part * 10, y: g.build.cy - g.build.headRy * (1.06 + h.crown * 0.35) }, r)
    }
  }
}

function drawBun(s: Scene, at: Pt, r: number): void {
  const { p, g } = s
  const region = blob(at.x, at.y, r, r * 0.92, p.noise, {
    wobble: 0.09 + g.hair.curl * 0.06,
    lumps: 3.4,
    lane: 17,
    steps: 34,
  })
  // Strands wrap around a bun rather than radiating from it.
  fillMass(p, g, region, {
    whorl: { x: at.x, y: at.y },
    from: -Math.PI,
    to: Math.PI,
    count: 16,
    len: r * 2.2,
    curl: 0.55 + g.hair.curl * 0.4,
    bend: 1.5,
    lane: 320,
    sheen: 0.22,
  }, s.lx, s.ly, s)
}

function drawTail(s: Scene): void {
  const { p, g } = s
  const h = g.hair
  if (h.tail === 'none') return
  const b = g.build
  const side = h.part >= 0 ? 1 : -1

  const tails: { x: number; y: number; dir: number; len: number }[] = []
  if (h.tail === 'twin') {
    tails.push({ x: b.cx - b.headRx * 0.92, y: b.cy - b.headRy * 0.1, dir: Math.PI * 0.78, len: b.headRy * 1.05 })
    tails.push({ x: b.cx + b.headRx * 0.92, y: b.cy - b.headRy * 0.1, dir: Math.PI * 0.22, len: b.headRy * 1.05 })
  } else {
    const y = h.tail === 'high' ? b.cy - b.headRy * 0.7 : b.cy + b.headRy * 0.25
    tails.push({ x: b.cx + side * b.headRx * 0.75, y, dir: side > 0 ? 0.45 : Math.PI - 0.45, len: b.headRy * 1.5 })
  }

  for (const [i, t] of tails.entries()) {
    const tipX = t.x + Math.cos(t.dir) * t.len
    const tipY = t.y + Math.sin(t.dir) * t.len
    const mid = { x: (t.x + tipX) / 2, y: (t.y + tipY) / 2 }
    const region = blob(mid.x, mid.y, t.len * 0.34, t.len * 0.52, p.noise, {
      wobble: 0.1 + h.curl * 0.1,
      lumps: 3,
      lane: 23 + i,
      steps: 32,
      shape: (a) => 1 + 0.25 * Math.sin(a),
    })
    fillMass(p, g, region, {
      whorl: { x: t.x, y: t.y },
      from: t.dir - 0.5,
      to: t.dir + 0.5,
      count: 14,
      len: t.len * 1.2,
      curl: h.curl * 0.8,
      bend: 0.3,
      lane: 360 + i * 40,
      sheen: 0.18,
    }, s.lx, s.ly, s)

    // The tie.
    const tie = arc(t.x, t.y, 6, 4, 0, Math.PI * 2, 10)
    p.stroke(tie, {
      color: g.palette.accent,
      alpha: 0.3,
      width: 2,
      passes: 2,
      wobble: 0.5,
      lane: 400 + i,
    })
  }
}

function drawBraids(s: Scene): void {
  const { p, g } = s
  const n = g.hair.braids
  if (n <= 0) return
  const b = g.build
  for (let k = 0; k < n; k++) {
    const side = k % 2 === 0 ? -1 : 1
    const x0 = b.cx + side * b.headRx * 0.86
    const y0 = b.cy + b.headRy * 0.18
    const len = b.headRy * (0.9 + g.hair.sides * 0.5)
    const knots = 4
    for (let i = 0; i < knots; i++) {
      const t = i / knots
      const cx = x0 + side * 3 * Math.sin(t * 6)
      const cy = y0 + len * t
      const r = 6 * (1 - t * 0.45)
      const region = blob(cx, cy, r, r * 0.8, p.noise, { wobble: 0.12, lumps: 2, lane: 30 + i + k * 5, steps: 20 })
      fillMass(p, g, region, {
        whorl: { x: cx, y: cy },
        from: -0.6, to: 0.6, count: 6, len: r * 3, curl: 0.4, bend: 0.8,
        lane: 440 + k * 30 + i * 4, sheen: 0.1,
      }, s.lx, s.ly, s)
    }
    // The ribbon at the end.
    p.stroke(arc(x0, y0 + len, 4.5, 3, 0, Math.PI * 2, 9), {
      color: g.palette.accent, alpha: 0.32, width: 1.8, passes: 2, lane: 470 + k,
    })
  }
}

function drawMohawk(s: Scene): void {
  const { p, g } = s
  const b = g.build
  const h = g.hair
  const height = b.headRy * (0.5 + h.crown * 0.9)
  const spikes = 5 + Math.round(h.curl * 3)
  const pts: Pt[] = []
  const halfW = b.headRx * 0.34

  for (let i = 0; i <= spikes; i++) {
    const t = i / spikes
    const x = b.cx - halfW + t * halfW * 2
    const tipY = b.cy - b.headRy - height * (0.65 + 0.45 * Math.sin(t * Math.PI))
    pts.push({ x: x - 4, y: b.cy - b.headRy * 0.85 })
    pts.push({ x, y: tipY + p.rng.gauss(0, 4) })
  }
  pts.push({ x: b.cx + halfW, y: b.cy - b.headRy * 0.6 })
  pts.push({ x: b.cx - halfW, y: b.cy - b.headRy * 0.6 })

  fillMass(p, g, pts, {
    whorl: { x: b.cx, y: b.cy - b.headRy * 0.7 },
    from: -Math.PI * 0.9,
    to: -Math.PI * 0.1,
    count: 22,
    len: height * 1.4,
    curl: h.curl * 0.5,
    bend: 0,
    lane: 500,
    sheen: 0.25,
  }, s.lx, s.ly, s)
}

function drawSideLocks(s: Scene): void {
  const { p, g } = s
  const h = g.hair
  if (h.sides < 0.28 || h.bald) return
  const b = g.build
  const cut = hairlineY(g)
  for (const side of [-1, 1] as const) {
    const topX = b.cx + side * b.headRx * 1.0
    // Locks hang beside the face, not across it.
    const drop = b.headRy * Math.min(h.sides, 1.05) * 0.85
    // A soft mass, not a cut-out flap: angular side locks were reading as
    // folded paper stuck to the temples.
    const region = blob(
      topX + side * 1, cut + drop * 0.5,
      5 + h.sides * 2.6, drop * 0.56, p.noise,
      { wobble: 0.14 + h.curl * 0.12, lumps: 2.4 + h.curl * 3, lane: 60 + side, steps: 24,
        shape: (a) => 1 + 0.2 * Math.sin(a) },
    )
    fillMass(p, g, region, {
      whorl: { x: topX - side * 4, y: cut - 8 },
      from: Math.PI * 0.35,
      to: Math.PI * 0.65,
      count: 10,
      len: drop * 1.3,
      curl: h.curl,
      bend: side * 0.25,
      lane: 540 + (side + 1) * 25,
      sheen: 0.14,
    }, s.lx, s.ly, s)
  }
}

function drawTufts(s: Scene): void {
  const { p, g } = s
  const h = g.hair
  const n = Math.min(7, h.tufts)
  if (n <= 0) return
  const b = g.build
  const rng = p.rng
  for (let i = 0; i < n; i++) {
    const a = -Math.PI * 0.92 + rng.next() * Math.PI * 0.84
    const ox = b.cx + Math.cos(a) * b.headRx * (0.9 + h.crown * 0.3)
    const oy = b.cy + Math.sin(a) * b.headRy * (0.9 + h.crown * 0.3)
    const pts = strandPath(
      ox, oy, a + rng.gauss(0, 0.3), h.tuftLen * rng.range(0.45, 0.85),
      h.curl * 1.2, rng.gauss(0, 0.4), rng.next() * 6.28, 9,
    )
    p.stroke(pts, {
      color: p.rng.bool(0.25) ? tint(g.palette.hair, 1.2) : g.palette.hair,
      alpha: 0.16,
      width: 1.3,
      passes: 1,
      wobble: 0.8,
      gaps: 0.15,
      taper: 0.85,
      step: 2.6,
      lane: 600 + i,
    })
  }
}

function drawSideFuzz(s: Scene): void {
  const { p, g } = s
  const b = g.build
  const rng = p.rng
  for (let i = 0; i < 16; i++) {
    const a = rng.bool(0.5) ? rng.range(Math.PI * 0.75, Math.PI * 1.05) : rng.range(-0.05, 0.25)
    const ox = b.cx + Math.cos(a) * b.headRx * 0.98
    const oy = b.cy + Math.sin(a) * b.headRy * 0.98
    p.stroke(strandPath(ox, oy, a, 6 * rng.range(0.6, 1.4), 0.5, 0.3, rng.next() * 6, 5), {
      color: shade(g.palette.hair, 0.4),
      alpha: 0.12,
      width: 1,
      passes: 1,
      taper: 0.9,
      lane: 640 + i,
    })
  }
}

/** Exposed so hats know where to sit. */
export function hairTop(g: Genome, h: HairSpec = g.hair): number {
  return g.build.cy - g.build.headRy * (1 + h.crown * 0.45)
}
