/**
 * The face.
 *
 * Two rules do most of the work here. First: highlights are *gaps*, not white
 * paint. Because every layer is multiplied, the only way to get a catchlight is
 * to leave the paper alone — so the iris hatch has a pressure function that
 * drops to zero where the light hits. Second: nothing is symmetrical. Both eyes
 * are drawn from the same routine but with independently jittered arguments.
 */

import { adjust, shade, tint, hsl, clamp, type Hsl } from '../../core/color'
import type { BrowStyle, EyeShape, Genome, LidStyle } from '../../core/genome'
import type { Scene } from '../character'
import { radialFalloff, ellipsoidShade } from '../character'
import type { Pencil } from '../pencil'
import { type Pt, arc, quad, blob, withClip, normalAt } from '../shapes'

/* -------------------------------------------------------------------- eyes */

/** How much of the eye each lid covers, per expression. */
function lidCover(style: LidStyle): { top: number; bottom: number; tall: number } {
  switch (style) {
    case 'wide': return { top: 0.02, bottom: 0.04, tall: 1.12 }
    case 'half': return { top: 0.42, bottom: 0.06, tall: 0.95 }
    case 'squint': return { top: 0.34, bottom: 0.3, tall: 0.8 }
    case 'closed': return { top: 1, bottom: 1, tall: 0.9 }
    case 'sparkle': return { top: 0.04, bottom: 0.02, tall: 1.18 }
    case 'wink': return { top: 0.08, bottom: 0.05, tall: 1.05 }
    default: return { top: 0.12, bottom: 0.06, tall: 1 }
  }
}

/**
 * The eye opening.
 *
 * Built from two corners and two lid curves rather than from an ellipse with
 * its top and bottom clamped off. The corners are what carry the character:
 * dropping the outer one gives a droop, lifting it gives an upturn, and moving
 * them together turns a round eye into an almond. Clamping an ellipse can only
 * ever produce one eye shape with more or less of it hidden.
 */
function eyeOutline(
  cx: number, cy: number, rx: number, ry: number, shape: EyeShape, side: -1 | 1,
): Pt[] {
  let topH = ry
  let botH = ry
  let outerDrop = 0
  let innerDrop = 0
  let widen = 1

  switch (shape) {
    case 'almond': topH = ry * 0.86; botH = ry * 0.7; widen = 1.12; break
    case 'narrow': topH = ry * 0.5; botH = ry * 0.42; widen = 1.25; break
    case 'droop': topH = ry * 0.82; botH = ry * 0.72; outerDrop = ry * 0.46; break
    case 'upturn': topH = ry * 0.82; botH = ry * 0.72; outerDrop = -ry * 0.42; innerDrop = ry * 0.14; break
    case 'wide': topH = ry * 1.18; botH = ry * 1.06; break
    case 'dot': topH = ry * 0.56; botH = ry * 0.56; widen = 0.62; break
    case 'hooded': topH = ry * 0.58; botH = ry * 0.9; outerDrop = ry * 0.2; break
    default: break
  }

  const inner = { x: cx - side * rx * widen, y: cy + innerDrop }
  const outer = { x: cx + side * rx * widen, y: cy + outerDrop }
  const top = quad(inner, { x: cx, y: cy - topH * 1.4 }, outer, 11)
  const bottom = quad(outer, { x: cx, y: cy + botH * 1.3 }, inner, 11)
  return [...top, ...bottom.slice(1, -1)]
}

/** Trim an outline to what the lids leave showing. */
function applyLids(pts: Pt[], cy: number, ry: number, top: number, bottom: number): Pt[] {
  const hiY = cy - ry * (1 - top * 2)
  const loY = cy + ry * (1 - bottom * 2)
  return pts.map((p) => ({ x: p.x, y: clamp(p.y, hiY, loY) }))
}

function drawOneEye(
  p: Pencil, g: Genome, cx: number, cy: number, r: number, style: LidStyle,
  iris: Hsl, flip: number, lane: number,
): void {
  const pal = g.palette
  const f = g.face
  const rng = p.rng
  const cover = lidCover(style)
  const rx = r * rng.range(0.95, 1.05)
  const ry = r * cover.tall * rng.range(0.95, 1.05)
  const ink = adjust(pal.ink, -4, 6)

  if (style === 'closed' || (style === 'wink' && flip < 0)) {
    // A closed eye is one confident curve plus a lash or two.
    const lid = quad(
      { x: cx - rx, y: cy },
      { x: cx, y: cy + ry * 0.62 },
      { x: cx + rx, y: cy - ry * 0.06 },
      14,
    )
    p.stroke(lid, { color: ink, alpha: 0.3, width: 1.7, passes: 2, wobble: 0.4, taper: 0.5, lane })
    if (f.lashes) {
      for (let i = 0; i < 3; i++) {
        const t = 0.62 + i * 0.14
        const a = lid[Math.floor(t * (lid.length - 1))]!
        p.stroke([a, { x: a.x + flip * 4 + rng.gauss(0, 1), y: a.y + 3 + i }], {
          color: ink, alpha: 0.26, width: 1.2, passes: 1, taper: 0.7, lane: lane + 5 + i,
        })
      }
    }
    return
  }

  // A child does not construct an eye, they recall the symbol for one: a ring
  // with a dot in it, drawn the same way every time. No sclera ball, no lid
  // shadow, no limbal ring, no crease. This is the axis actually changing what
  // gets drawn rather than how hard it is pressed — which is the only way the
  // two hands become two drawings instead of one at two pressures.
  if (p.hand.construction < 0.5) {
    const ring = arc(cx, cy, rx * 1.05, ry * 1.05, 0, Math.PI * 2, 22)
    p.base(ring, hsl(pal.skin.h + 12, 8, 95), 0.85)
    p.contour(ring, {
      color: ink, alpha: 0.34, width: 2.1, passes: 2, wobble: 0.9, lane: lane + 2,
    })
    const dotR = rx * 0.42
    p.accent(arc(cx + f.gazeX * rx * 0.2, cy + f.gazeY * ry * 0.2, dotR, dotR, 0, Math.PI * 2, 14),
      pal.keyline, 0.8)
    if (f.lashes) {
      for (let i = 0; i < 3; i++) {
        const a = Math.PI * (1.15 + i * 0.16)
        p.stroke(
          [{ x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry },
            { x: cx + Math.cos(a) * rx * 1.7, y: cy + Math.sin(a) * ry * 1.7 }],
          { color: ink, alpha: 0.3, width: 1.5, passes: 1, taper: 0.5, lane: lane + 6 + i },
        )
      }
    }
    return
  }

  const region = applyLids(
    eyeOutline(cx, cy, rx, ry, f.eyeShape, flip as -1 | 1),
    cy, ry, cover.top, cover.bottom,
  )

  // 1. The sclera is a near-white ball, laid opaque. Hatching it at alpha 0.05
  //    made it invisible, and an eye with no white in it has nowhere for the
  //    iris to be dark against — which is why it read as a grey smudge.
  p.base(region, hsl(pal.skin.h + 12, 10, 94), 0.88)

  // 2. The upper lid casts a shadow across the top of that ball. This is the
  //    mark that makes an eye read as a sphere in a socket rather than as a
  //    shape on a surface, and it was absent entirely.
  p.hatch(region, {
    color: shade(pal.skin, 1.5),
    alpha: 0.16,
    spacing: 1.6,
    angle: 0.2,
    layers: 1,
    lane: lane + 8,
    pressure: (_x, y) => clamp(1 - (y - (cy - ry)) / (ry * 1.25), 0, 1) ** 1.2,
  })

  // Iris, offset by gaze and clipped to whatever the lids leave visible.
  const gx = cx + f.gazeX * r * 0.32
  const gy = cy + f.gazeY * r * 0.3
  const ir = r * 0.66
  const irisRegion = arc(gx, gy, ir, ir, 0, Math.PI * 2, 26)
  const hlx = gx - ir * 0.42
  const hly = gy - ir * 0.44
  const hlr = ir * (style === 'sparkle' ? 0.5 : 0.34)

  withClip(p.ctx, [region], () => {
    // 3. The iris: a hard-edged disc, darker at its rim than at its centre.
    p.hatch(irisRegion, {
      color: iris,
      alpha: 0.3,
      spacing: 1.3,
      angle: 1.2,
      layers: 2,
      layerTurn: 52,
      curve: 0.6,
      lane: lane + 14,
      pressure: (x, y) => {
        const d = Math.hypot(x - gx, y - gy) / ir
        const hl = Math.hypot(x - hlx, y - hly) / hlr
        return hl < 1 ? 0 : clamp(0.5 + d * 0.85, 0, 1.4)
      },
    })
    // The limbal ring — a hard dark edge round the iris. Without it the iris
    // bleeds into the sclera and the eye loses its focus.
    p.contour(irisRegion, {
      color: shade(iris, 2.4), alpha: 0.3, width: 1.3, passes: 1, wobble: 0.25, lane: lane + 20,
    })

    // 4. The pupil is opaque black. It is one of the two or three marks in the
    //    whole picture that should be a true dark.
    const pr = ir * f.pupil * 0.56
    const pupil = arc(gx, gy, pr, pr, 0, Math.PI * 2, 18)
    if (pr > 0.6) p.accent(pupil, pal.keyline, 0.8)

    // 5. The catchlight is reserved paper, laid back over the top — a hard,
    //    round, genuinely white mark.
    p.base(arc(hlx, hly, hlr * 0.82, hlr * 0.82, 0, Math.PI * 2, 12), hsl(50, 16, 98), 0.95)
  })

  // Lid lines. The upper lid is always heavier than the lower — that single
  // asymmetry does more for expression than the eye shape does.
  const upper = arc(cx, cy, rx * 1.04, ry * 1.04, Math.PI + 0.18, Math.PI * 2 - 0.18, 16)
  p.stroke(upper, {
    color: pal.keyline,
    alpha: 0.3,
    width: 2,
    passes: 2,
    wobble: 0.3,
    taper: 0.3,
    // Heaviest toward the outer corner, the way a real lash line is.
    alphaAt: (t) => 0.55 + (flip > 0 ? t : 1 - t) * 0.75,
    lane: lane + 26,
  })

  if (p.hand.construction > 0.5) {
    // The crease above the lid, and the tear duct at the inner corner. Small
    // marks, but they are the difference between an eye and a circle.
    p.stroke(
      arc(cx, cy - ry * 0.35, rx * 0.95, ry * 1.05, Math.PI + 0.42, Math.PI * 2 - 0.42, 12),
      { color: shade(pal.skin, 1.8), alpha: 0.14, width: 1.2, passes: 1, taper: 0.75, lane: lane + 28 },
    )
    p.stroke(
      [{ x: cx - flip * rx * 1.05, y: cy + ry * 0.1 },
        { x: cx - flip * rx * 1.3, y: cy + ry * 0.3 }],
      { color: adjust(pal.lip, 8, -14), alpha: 0.22, width: 1.3, passes: 1, taper: 0.7, lane: lane + 29 },
    )
  }
  const lower = arc(cx, cy, rx * 1.02, ry * 1.02, 0.28, Math.PI - 0.28, 12)
  p.stroke(lower, {
    color: ink, alpha: 0.1, width: 1.1, passes: 1, wobble: 0.4, taper: 0.6, lane: lane + 30,
  })

  if (f.eyeShape === 'hooded') {
    // The fold is the point of a hooded eye; without it the shape just reads
    // as a small one.
    p.stroke(
      quad(
        { x: cx - flip * rx * 1.25, y: cy - ry * 0.6 },
        { x: cx, y: cy - ry * 1.5 },
        { x: cx + flip * rx * 1.3, y: cy - ry * 0.3 }, 12,
      ),
      { color: ink, alpha: 0.16, width: 1.4, passes: 1, wobble: 0.5, taper: 0.6, lane: lane + 44 },
    )
  }

  if (f.lashes) {
    for (let i = 0; i < 3; i++) {
      const a = Math.PI * (1.12 + i * 0.13)
      const bx = cx + Math.cos(a) * rx
      const by = cy + Math.sin(a) * ry
      p.stroke([{ x: bx, y: by }, { x: bx + Math.cos(a) * 4.5, y: by + Math.sin(a) * 4.5 }], {
        color: ink, alpha: 0.24, width: 1.2, passes: 1, taper: 0.6, lane: lane + 34 + i,
      })
    }
  }

  if (style === 'sparkle') {
    // A four-point flick just outside the iris.
    const sx = gx + ir * 0.9
    const sy = gy - ir * 0.9
    for (const [dx, dy] of [[1, 0], [0, 1]] as const) {
      p.stroke(
        [{ x: sx - dx * 4, y: sy - dy * 4 }, { x: sx + dx * 4, y: sy + dy * 4 }],
        { color: pal.accent, alpha: 0.3, width: 1.2, passes: 1, taper: 0.9, lane: lane + 40 },
      )
    }
  }
}

function drawEyes(s: Scene): void {
  const { p, g } = s
  const f = g.face
  const rng = p.rng
  for (const side of [-1, 1] as const) {
    // Asymmetry is applied here rather than sampled per eye, so the two eyes
    // differ by a fixed, character-specific amount instead of jittering
    // independently every time the character is drawn.
    // The far eye sits closer to the centre line and reads slightly narrower.
    const turn = turnShift(g)
    const near = Math.sign(g.build.turn || 1) === side
    const cx = g.build.cx + turn + side * f.eyeSpacing * (near ? 1 : 1 - Math.abs(g.build.turn) * 0.18) + rng.gauss(0, 0.4)
    const cy = f.eyeY + side * f.eyeTilt * f.eyeSpacing + (side > 0 ? f.asym.eyeDY : 0)
    const r = f.eyeR * (side > 0 ? 1 + f.asym.eyeDR : 1) * (near ? 1 : 1 - Math.abs(g.build.turn) * 0.12)
    const iris = side < 0 && f.irisAlt ? f.irisAlt : f.iris
    const clouded = f.cloudyEye === side
    drawOneEye(
      p, g, cx, cy, r, f.lid,
      clouded ? hsl(iris.h, 8, Math.max(58, iris.l + 34)) : iris,
      side, 800 + (side + 1) * 60,
    )
  }

  if (f.thirdEye) {
    drawOneEye(
      p, g, g.build.cx + turnShift(g) + rng.gauss(0, 1.5), g.build.cy - g.build.headRy * 0.44,
      f.eyeR * 0.72, 'open', f.iris, 1, 940,
    )
  }
}

/* ------------------------------------------------------------------- brows */

/**
 * A brow as a ribbon: a spine plus a width that varies along it.
 *
 * This is what makes the twelve styles genuinely different shapes rather than
 * the same arc drawn heavier or lighter. A wedge is thick at the inner end and
 * gone by the outer; a comma hooks downward; a bar is a flat slab with blunt
 * ends. Those are different spines and different width functions, not one
 * curve with a thickness parameter.
 */
interface BrowSpec {
  spine: Pt[]
  /** Half-thickness at position `t` along the spine, 0..1. */
  widthAt: (t: number) => number
  /** Drawn as individual hairs rather than as a solid mass. */
  hairy: boolean
  /** Broken into separate marks. */
  broken?: boolean
}

function browSpec(
  style: BrowStyle, cx: number, cy: number, w: number, thick: number, side: -1 | 1, lift: number,
): BrowSpec {
  const inner = { x: cx - side * w, y: cy }
  const outer = { x: cx + side * w, y: cy }
  const T = thick

  switch (style) {
    case 'bar':
      return {
        spine: [{ x: inner.x, y: cy + lift }, { x: outer.x, y: cy - lift * 0.4 }],
        widthAt: () => T * 1.5,
        hairy: false,
      }
    case 'wedge':
      return {
        spine: quad({ x: inner.x, y: cy + lift + 1 }, { x: cx, y: cy - 1 }, { x: outer.x, y: cy - 2 }, 10),
        // Thick at the nose end, tapering to nothing at the temple.
        widthAt: (t) => T * (1.9 - t * 1.7),
        hairy: false,
      }
    case 'comma':
      return {
        spine: [
          ...quad({ x: inner.x, y: cy + 2 }, { x: cx - side * w * 0.2, y: cy - 4 }, { x: cx + side * w * 0.6, y: cy - 2 }, 8),
          ...quad({ x: cx + side * w * 0.6, y: cy - 2 }, { x: outer.x, y: cy + 1 }, { x: cx + side * w * 0.8, y: cy + 5 }, 6).slice(1),
        ],
        widthAt: (t) => T * (1.6 - t * 1.2),
        hairy: false,
      }
    case 'dash':
      return {
        spine: [{ x: inner.x, y: cy + lift }, { x: outer.x, y: cy - lift }],
        widthAt: () => T * 0.9,
        hairy: true,
        broken: true,
      }
    case 'angled':
      return {
        spine: [{ x: inner.x, y: cy + w * 0.32 }, { x: outer.x, y: cy - w * 0.24 }],
        widthAt: (t) => T * (1.5 - t * 0.7),
        hairy: false,
      }
    case 'unibrow':
      return {
        // Runs from the temple all the way past the nose bridge.
        spine: quad({ x: outer.x, y: cy }, { x: cx - side * w * 0.6, y: cy + 2 }, { x: cx - side * w * 2.4, y: cy + 3 }, 12),
        widthAt: (t) => T * (1.3 - t * 0.3),
        hairy: true,
      }
    case 'arched':
      return {
        spine: quad({ x: inner.x, y: cy + 4 + lift }, { x: cx, y: cy - w * 0.42 }, { x: outer.x, y: cy + 3 - lift }, 12),
        widthAt: (t) => T * (1 + Math.sin(t * Math.PI) * 0.3),
        hairy: false,
      }
    case 'straight':
      return {
        spine: [{ x: inner.x, y: cy + lift }, { x: outer.x, y: cy - lift }],
        widthAt: () => T * 0.75,
        hairy: true,
      }
    case 'thin':
      return {
        spine: quad({ x: inner.x, y: cy + 2 }, { x: cx, y: cy - 3 }, { x: outer.x, y: cy + 1 }, 12),
        widthAt: () => T * 0.45,
        hairy: false,
      }
    case 'bushy':
      return {
        spine: quad({ x: inner.x, y: cy + 3 }, { x: cx, y: cy - 4 }, { x: outer.x, y: cy + 1 }, 12),
        widthAt: (t) => T * (2.2 - t * 0.5),
        hairy: true,
      }
    case 'worried':
      return {
        spine: quad(
          { x: inner.x, y: cy - w * 0.22 },
          { x: cx, y: cy + 1 },
          { x: outer.x, y: cy + w * 0.2 }, 12,
        ),
        widthAt: (t) => T * (1.2 - t * 0.4),
        hairy: true,
      }
    default:
      return {
        spine: quad({ x: inner.x, y: cy + 2 + lift }, { x: cx, y: cy - 3.5 }, { x: outer.x, y: cy + 1 - lift }, 12),
        widthAt: (t) => T * (1.1 + Math.sin(t * Math.PI) * 0.25),
        hairy: true,
      }
  }
}

/** Offset a spine into a closed ribbon using its per-position half-width. */
function ribbon(spine: readonly Pt[], widthAt: (t: number) => number): Pt[] {
  const n = spine.length
  const upper: Pt[] = []
  const lower: Pt[] = []
  for (let i = 0; i < n; i++) {
    const t = n > 1 ? i / (n - 1) : 0
    const nm = normalAt(spine, i)
    const half = Math.max(0.35, widthAt(t))
    const pnt = spine[i]!
    upper.push({ x: pnt.x + nm.x * half, y: pnt.y + nm.y * half })
    lower.push({ x: pnt.x - nm.x * half, y: pnt.y - nm.y * half })
  }
  return [...upper, ...lower.reverse()]
}

function drawBrows(s: Scene): void {
  const { p, g } = s
  const f = g.face
  const rng = p.rng
  const col = shade(g.palette.hair, 0.6)
  const w = f.eyeR * 1.25

  // A unibrow is one mark across both eyes, so it is drawn once.
  const sides: (-1 | 1)[] = f.brow === 'unibrow' ? [1] : [-1, 1]

  for (const side of sides) {
    const cx = g.build.cx + turnShift(g) + side * f.eyeSpacing
    const cy = f.eyeY - f.eyeR * (1.4 + f.browLift) + (side > 0 ? f.asym.browDY : 0)
    const lift = f.browAngle * side * 6
    const spec = browSpec(f.brow, cx, cy, w, f.browThick * 1.5, side, lift)
    const lane = 1000 + (side + 1) * 40

    if (spec.hairy) {
      // Individual hairs, laid along the spine and fanning slightly.
      // Short marks lying *within* the ribbon, each covering a fraction of its
      // length. Offsetting a full-length copy of the whole spine once per hair
      // — which is what this did — produces seven to eleven parallel dashed
      // lines the width of the brow, and at the focal point of the face that
      // reads as a barcode rather than as hair.
      const n = spec.spine.length
      const hairs = f.brow === 'bushy' ? 12 : f.brow === 'dash' ? 5 : 8
      for (let i = 0; i < hairs; i++) {
        const t0 = rng.range(0, 0.7)
        const t1 = Math.min(1, t0 + rng.range(0.22, 0.45))
        const i0 = Math.max(0, Math.floor(t0 * (n - 1)))
        const i1 = Math.min(n - 1, Math.ceil(t1 * (n - 1)))
        if (i1 - i0 < 1) continue
        const half = spec.widthAt((t0 + t1) * 0.5)
        const off = rng.range(-half, half)
        // Hairs lie at a slight angle to the ribbon rather than parallel to it.
        const lean = rng.gauss(0, half * 0.18)
        const seg: Pt[] = []
        for (let k = i0; k <= i1; k++) {
          const u = (k - i0) / Math.max(1, i1 - i0)
          const nm = normalAt(spec.spine, k)
          const q = spec.spine[k]!
          const d = off + lean * (u - 0.5) * 2
          seg.push({ x: q.x + nm.x * d + rng.gauss(0, 0.35), y: q.y + nm.y * d + rng.gauss(0, 0.35) })
        }
        p.stroke(seg, {
          color: col, alpha: 0.2, width: 1.3, passes: 1, wobble: 0.35,
          gaps: spec.broken ? 0.28 : 0.05, taper: 0.85, lane: lane + i,
        })
      }
    } else {
      // A solid mass: hatched across the ribbon, with a firm edge.
      const shape = ribbon(spec.spine, spec.widthAt)
      p.hatch(shape, {
        color: col, alpha: 0.19, spacing: 1.5, angle: 1.4, layers: 2, layerTurn: 44,
        curve: 0.8, lane: lane + 20,
      })
      p.contour(shape, {
        color: shade(col, 0.8), alpha: 0.13, width: 1.1, passes: 1, wobble: 0.8,
        optional: true, lane: lane + 24,
      })
    }
  }
}

/* -------------------------------------------------------------------- nose */

function drawNose(s: Scene): void {
  const { p, g } = s
  const f = g.face
  const b = g.build
  const cx = b.cx + turnShift(g) * 1.35 + f.gazeX * 1.6 + f.asym.noseSkew
  const cy = f.noseY
  const w = b.headRx * 0.11 * f.noseSize
  const h = b.headRy * 0.1 * f.noseSize
  // Noses run warmer and a touch redder than the rest of the face.
  const col = adjust(g.palette.skin, -6, 22, -8)
  const ink = adjust(g.palette.ink, 6, 4)

  const bulb = (rx: number, ry: number, oy = 0): Pt[] =>
    blob(cx, cy + oy, rx, ry, p.noise, { wobble: 0.07, lumps: 2, lane: 44, steps: 22 })
  const bulbAt = (x: number, y: number, rx: number, ry: number): Pt[] =>
    blob(x, y, rx, ry, p.noise, { wobble: 0.12, lumps: 2, lane: 45, steps: 16 })

  if (p.hand.construction < 0.5) {
    // The symbol for a nose: a small closed shape and two dots, outlined.
    const shape = bulb(w * 1.2, h * 1.05)
    p.hatch(shape, { color: col, alpha: 0.12, spacing: 2, angle: 0.6, layers: 1, lane: 1124 })
    p.contour(shape, { color: ink, alpha: 0.3, width: 1.8, passes: 2, wobble: 1, lane: 1126 })
    for (const side of [-1, 1] as const) {
      p.stroke(arc(cx + side * w * 0.55, cy + h * 0.3, w * 0.16, h * 0.14, 0, Math.PI * 2, 8), {
        color: ink, alpha: 0.32, width: 1.6, passes: 2, lane: 1130 + side,
      })
    }
    return
  }

  switch (f.nose) {
    case 'beak': {
      const path = [
        { x: cx - w * 0.3, y: cy - h * 2.2 },
        { x: cx + w * 0.5, y: cy - h * 0.4 },
        { x: cx + w * 0.2, y: cy + h },
        { x: cx - w * 0.9, y: cy + h * 0.9 },
      ]
      p.hatch(path, { color: col, alpha: 0.1, spacing: 2, angle: 1, layers: 2, lane: 1100 })
      p.contour(path, { color: ink, alpha: 0.16, width: 1.3, passes: 1, closed: false, optional: true, lane: 1104 })
      break
    }
    case 'long': {
      p.stroke([{ x: cx - w * 0.2, y: cy - h * 2.6 }, { x: cx - w * 0.4, y: cy + h * 0.6 }], {
        color: ink, alpha: 0.14, width: 1.2, passes: 1, taper: 0.7, lane: 1108,
      })
      const tip = bulb(w * 0.8, h * 0.8)
      p.hatch(tip, { color: col, alpha: 0.12, spacing: 1.8, angle: 0.8, layers: 2, lane: 1110 })
      p.contour(tip, { color: ink, alpha: 0.14, width: 1.2, passes: 1, optional: true, lane: 1112 })
      break
    }
    case 'upturned': {
      const path = quad(
        { x: cx - w * 1.2, y: cy - h * 0.2 }, { x: cx - w * 0.2, y: cy + h * 1.5 }, { x: cx + w * 1.1, y: cy - h * 0.6 }, 12,
      )
      p.stroke(path, { color: ink, alpha: 0.2, width: 1.6, passes: 2, wobble: 0.3, taper: 0.4, lane: 1116 })
      p.hatch(bulb(w, h * 0.85, -h * 0.2), { color: col, alpha: 0.1, spacing: 2, angle: 0.6, layers: 1, lane: 1118 })
      break
    }
    case 'broad': {
      const shape = bulb(w * 1.7, h * 1.05)
      p.hatch(shape, {
        color: col, alpha: 0.1, spacing: 2, angle: 0.7, layers: 2, lane: 1120,
        pressure: radialFalloff(cx - w * 0.5, cy - h * 0.4, w * 3, 0.8),
      })
      p.contour(shape, { color: ink, alpha: 0.13, width: 1.2, passes: 1, optional: true, lane: 1122 })
      break
    }
    default: {
      // The reference's nose is a lit ball in a *different, more saturated
      // hue* than the surrounding skin — the chroma peak of the whole picture —
      // with a bare-paper light plane, a crescent core shadow, a soft cast
      // shadow onto the philtrum, and no outline anywhere on it. It was an
      // evenly smudged disc inside a ring.
      const rx = f.nose === 'blob' ? w * 1.45 : w * 1.15
      const ry = f.nose === 'blob' ? h * 1.25 : h
      const shape = bulb(rx, ry)
      const lit = ellipsoidShade(cx, cy, rx, ry, s.lx, s.ly, 1.3)

      // Local colour, kept off the light plane.
      p.hatch(shape, {
        color: g.palette.noseAccent,
        alpha: 0.17,
        spacing: 1.6,
        angle: 0.75,
        layers: 2,
        layerTurn: 44,
        lane: 1124,
        pressure: (x, y) => clamp(0.25 + lit(x, y) * 1.1, 0, 1),
      })
      // The core shadow: a crescent inside the form, not a rim.
      p.hatch(shape, {
        color: shade(g.palette.noseAccent, 1.6),
        alpha: 0.16,
        spacing: 1.8,
        angle: 1.3,
        layers: 1,
        lane: 1125,
        pressure: (x, y) => clamp((lit(x, y) - 0.45) * 2.2, 0, 1),
      })
      // The bridge: two soft planes running up to the brow, no line.
      if (p.hand.construction > 0.5) {
        p.hatch(
          [{ x: cx - rx * 0.75, y: cy - ry * 0.4 }, { x: cx + rx * 0.75, y: cy - ry * 0.4 },
            { x: cx + rx * 0.42, y: cy - ry * 3.2 }, { x: cx - rx * 0.42, y: cy - ry * 3.2 }],
          {
            color: shade(g.palette.skin, 1.1),
            alpha: 0.07,
            spacing: 2.4,
            angle: 1.5,
            layers: 1,
            gaps: 0.4,
            lane: 1127,
            pressure: (x) => clamp((x - cx) / (rx * 1.5) * s.lx > 0 ? 0.9 : 0.25, 0, 1),
          },
        )
        // Cast shadow onto the philtrum.
        p.hatch(
          bulbAt(cx + s.lx * rx * 0.5, cy + ry * 1.15, rx * 0.7, ry * 0.5),
          {
            color: shade(g.palette.skin, 1.5), alpha: 0.11, spacing: 1.8, angle: 0.4,
            layers: 1, gaps: 0.35, lane: 1128,
          },
        )
      }
      // Outlined only by an untrained hand.
      p.contour(shape, {
        color: ink, alpha: 0.13, width: 1.2, passes: 1,
        heavyAngle: Math.PI * 0.55, heavyAmount: 0.5, optional: true, lane: 1126,
      })
    }
  }

  // Nostrils, on all but the daintiest noses.
  if (f.noseSize > 0.92 && f.nose !== 'upturned') {
    for (const side of [-1, 1] as const) {
      p.stroke(arc(cx + side * w * 0.85, cy + h * 0.45, w * 0.28, h * 0.22, 0.4, Math.PI * 1.6, 8), {
        color: shade(g.palette.noseAccent, 2),
        alpha: p.hand.construction > 0.5 ? 0.24 : 0.2,
        width: 1.1, passes: 1, lane: 1130 + side,
      })
    }
  }
}

/* ------------------------------------------------------------------- mouth */

function drawMouth(s: Scene): void {
  const { p, g } = s
  const f = g.face
  const b = g.build
  const cx = b.cx + turnShift(g) * 1.15 + f.gazeX * 1.2
  const cy = f.mouthY
  const w = b.headRx * 0.24 * f.mouthW
  // The mouth line is one of the few marks that should be a real dark, and the
  // lips are the second chroma accent after the nose.
  const ink = p.hand.construction > 0.5 ? g.palette.keyline : adjust(g.palette.ink, 2, 8, -6)
  const lip = g.palette.lip
  const built = p.hand.construction > 0.5

  // A mouth that is level to the pixel reads as a decal. The tilt is part of
  // the character's fixed asymmetry, not per-draw noise.
  const tilt = f.asym.mouthTilt
  const tip = (pts: Pt[]): Pt[] =>
    pts.map((q) => ({ x: q.x, y: q.y + (q.x - cx) * tilt }))

  const line = (pts: Pt[], alpha = 0.26, width = 1.7): void => {
    // The line of the mouth is one of the few marks that should read as
    // graphic rather than as pigment. Two translucent passes made it woolly.
    if (built) p.accentStroke(tip(pts), ink, width * 1.05, Math.min(0.8, alpha * 2.4))
    else p.stroke(tip(pts), { color: ink, alpha, width, passes: 2, wobble: 0.35, taper: 0.45, lane: 1200 })
  }

  switch (f.mouth) {
    case 'grin':
      line(quad({ x: cx - w, y: cy - 2 }, { x: cx, y: cy + w * 0.66 }, { x: cx + w, y: cy - 2 }, 14), 0.28, 1.9)
      for (const side of [-1, 1] as const) {
        p.stroke([{ x: cx + side * w, y: cy - 2 }, { x: cx + side * (w + 2), y: cy - 5 }], {
          color: ink, alpha: 0.2, width: 1.2, passes: 1, taper: 0.6, lane: 1204 + side,
        })
      }
      break
    case 'toothy': {
      const upper = quad({ x: cx - w, y: cy - 1 }, { x: cx, y: cy + w * 0.5 }, { x: cx + w, y: cy - 1 }, 14)
      const region = [...upper, { x: cx + w * 0.8, y: cy - 5 }, { x: cx - w * 0.8, y: cy - 5 }]
      p.hatch(region, { color: shade(lip, 1.6), alpha: 0.14, spacing: 1.8, angle: 1.1, layers: 2, lane: 1208 })
      // Teeth are gaps in the tone, plus a divider or two.
      const teeth = f.toothGap ? 2 : 3
      for (let i = 1; i < teeth; i++) {
        const x = cx - w * 0.55 + (w * 1.1 * i) / teeth
        p.stroke([{ x, y: cy - 4 }, { x: x + 0.5, y: cy + 1 }], {
          color: ink, alpha: f.toothGap && i === 1 ? 0.3 : 0.12, width: f.toothGap && i === 1 ? 2.4 : 1, passes: 1, lane: 1212 + i,
        })
      }
      line(upper, 0.26, 1.8)
      break
    }
    case 'smirk':
      line(quad(
        { x: cx - w * 0.9, y: cy + 2 }, { x: cx + w * 0.1, y: cy + w * 0.45 }, { x: cx + w, y: cy - 5 }, 14,
      ), 0.26, 1.7)
      break
    case 'ohh': {
      const o = arc(cx, cy, w * 0.42, w * 0.5, 0, Math.PI * 2, 18)
      p.hatch(o, { color: shade(lip, 1.8), alpha: 0.16, spacing: 1.6, angle: 0.9, layers: 2, lane: 1216 })
      p.contour(o, { color: ink, alpha: 0.24, width: 1.5, passes: 2, lane: 1218 })
      break
    }
    case 'whistle': {
      const o = arc(cx + w * 0.25, cy, w * 0.3, w * 0.34, 0, Math.PI * 2, 14)
      p.hatch(o, { color: shade(lip, 1.6), alpha: 0.14, spacing: 1.5, angle: 0.6, layers: 1, lane: 1220 })
      p.contour(o, { color: ink, alpha: 0.22, width: 1.4, passes: 1, lane: 1222 })
      break
    }
    case 'pout': {
      const o = arc(cx, cy, w * 0.55, w * 0.34, 0, Math.PI * 2, 16)
      p.hatch(o, { color: lip, alpha: 0.13, spacing: 1.7, angle: 1.2, layers: 2, lane: 1224 })
      line(arc(cx, cy - 1, w * 0.5, w * 0.18, Math.PI * 0.1, Math.PI * 0.9, 10), 0.2, 1.3)
      break
    }
    case 'flat':
      line(quad({ x: cx - w * 0.8, y: cy }, { x: cx, y: cy + 2 }, { x: cx + w * 0.8, y: cy - 1 }, 12), 0.24, 1.6)
      break
    default:
      line(quad({ x: cx - w * 0.9, y: cy - 1 }, { x: cx, y: cy + w * 0.5 }, { x: cx + w * 0.9, y: cy - 1 }, 14))
  }

  // Lip volume needs room. Stacked into ten pixels on a sheet thumbnail it
  // collapses into a smudge that reads as dirt on the paper, so below that it
  // is left as the single confident curve the reference uses.
  if (built && p.detail > 0.7) {
    // Lip volume: the upper lip turns away from the light and sits in shadow,
    // the lower lip catches it. Drawing the mouth as a single arc — which is
    // what it was — is the schematic a child uses.
    const upperLip: Pt[] = [
      ...tip(quad({ x: cx - w * 0.95, y: cy }, { x: cx, y: cy - w * 0.34 }, { x: cx + w * 0.95, y: cy }, 12)),
      ...tip(quad({ x: cx + w * 0.95, y: cy }, { x: cx, y: cy + w * 0.06 }, { x: cx - w * 0.95, y: cy }, 8)).slice(1, -1),
    ]
    p.hatch(upperLip, {
      color: shade(lip, 1.2), alpha: 0.15, spacing: 1.6, angle: 1.2, layers: 1, lane: 1232,
    })
    const lowerLip: Pt[] = [
      ...tip(quad({ x: cx - w * 0.8, y: cy + w * 0.06 }, { x: cx, y: cy + w * 0.1 }, { x: cx + w * 0.8, y: cy + w * 0.06 }, 10)),
      ...tip(quad({ x: cx + w * 0.8, y: cy + w * 0.06 }, { x: cx, y: cy + w * 0.46 }, { x: cx - w * 0.8, y: cy + w * 0.06 }, 10)).slice(1, -1),
    ]
    p.hatch(lowerLip, {
      color: tint(lip, 0.5), alpha: 0.11, spacing: 1.8, angle: 0.6, layers: 1, lane: 1234,
      // Left lighter where the light lands on the roll of the lip.
      pressure: (_x, y) => clamp((y - cy) / (w * 0.4), 0, 1),
    })
    // The corners are the darkest part of a mouth, and they anchor it.
    for (const side of [-1, 1] as const) {
      p.stroke(
        [{ x: cx + side * w * 0.72, y: cy + side * tilt * w * 0.7 },
          { x: cx + side * w * 0.98, y: cy + side * tilt * w * 0.95 + 1 }],
        { color: ink, alpha: 0.3, width: 1.6, passes: 1, taper: 0.5, lane: 1236 + side },
      )
    }
  }

  // A hint of shadow beneath the lower lip grounds the mouth on the face.
  p.stroke(arc(cx, cy + w * 0.62, w * 0.5, w * 0.2, Math.PI * 0.15, Math.PI * 0.85, 8), {
    color: shade(g.palette.skin, 1.3), alpha: 0.1, width: 2, passes: 1, taper: 0.8, lane: 1230,
  })
}

/* -------------------------------------------------------------------- ears */

export function drawEars(s: Scene): void {
  const { p, g } = s
  const f = g.face
  const b = g.build
  // Hair that falls past the ears hides them anyway.
  if (g.hair.sides > 0.85 && !g.hair.bald) return

  for (const side of [-1, 1] as const) {
    const grow = f.bigEar === side ? 1.5 : 1
    const rx = b.headRx * 0.115 * f.earSize * grow
    const ry = b.headRy * 0.165 * f.earSize * grow
    const near = Math.sign(b.turn || 1) === side
    const cx = b.cx + side * b.headRx * (near ? 0.9 + Math.abs(b.turn) * 0.05 : 0.9 - Math.abs(b.turn) * 0.14)
    const cy = f.eyeY + b.headRy * 0.06 + (side > 0 ? f.asym.earDY : 0)
    const region = blob(cx, cy, rx, ry, p.noise, {
      wobble: 0.1, lumps: 2, lane: 55 + side, steps: 20,
      shape: (a) => 1 + 0.18 * Math.cos(a) * side,
    })
    p.hatch(region, {
      color: g.palette.skin, alpha: 0.11, spacing: 2.2, angle: 1.1, layers: 2, lane: 1300 + side * 10,
    })
    p.hatch(region, {
      color: shade(g.palette.skin, 1.2), alpha: 0.1, spacing: 2.4, angle: 0.8, layers: 1, lane: 1304 + side * 10,
      pressure: radialFalloff(cx + side * rx * 0.2, cy + ry * 0.3, rx * 2, 1.2),
    })
    p.contour(region, { color: g.palette.ink, alpha: 0.11, width: 1.1, passes: 1, optional: true, lane: 1308 + side * 10 })
    // Inner fold.
    p.stroke(arc(cx + side * rx * 0.1, cy, rx * 0.45, ry * 0.5, Math.PI * 0.6, Math.PI * 1.7, 10), {
      color: shade(g.palette.skin, 1.4), alpha: 0.14, width: 1.1, passes: 1, taper: 0.6, lane: 1312 + side * 10,
    })
  }
}

/* -------------------------------------------------------- skin decorations */

function drawCheeks(s: Scene): void {
  const { p, g } = s
  const f = g.face
  const b = g.build
  if (f.blush > 0) {
    for (const side of [-1, 1] as const) {
      const cx = b.cx + side * b.headRx * 0.58
      const cy = f.noseY + b.headRy * 0.02
      const r = b.headRx * (0.2 + f.blush * 0.1)
      const region = arc(cx, cy, r, r * 0.7, 0, Math.PI * 2, 20)
      p.hatch(region, {
        color: g.palette.blush,
        alpha: 0.05 + f.blush * 0.05,
        spacing: 2.4,
        angle: -0.5 + side * 0.2,
        layers: 2,
        layerTurn: 50,
        curve: 2.4,
        taper: 0.85,
        gaps: 0.3,
        lane: 1400 + side * 10,
        pressure: radialFalloff(cx, cy, r * 1.05, 1.1),
      })
    }
  }

  if (f.freckles > 0) {
    const cx = b.cx
    const cy = f.noseY - b.headRy * 0.02
    const spread = b.headRx * (0.62 + f.freckles * 0.2)
    const region = arc(cx, cy, spread, b.headRy * 0.16 * (0.8 + f.freckles * 0.5), 0, Math.PI * 2, 18)
    p.fleck(region, shade(g.palette.blush, 1.1), Math.round(14 * f.freckles), 0.75)
  }

  if (f.mole) {
    const x = b.cx + f.mole.x * b.headRx * 0.8
    const y = b.cy + f.mole.y * b.headRy * 0.7
    p.stroke(arc(x, y, 1.1, 1.1, 0, Math.PI * 2, 8), {
      color: shade(g.palette.skin, 2.6), alpha: 0.4, width: 1.6, passes: 2, lane: 1420,
    })
  }

  if (f.smudge) {
    const x = b.cx + b.headRx * 0.5 * p.rng.sign()
    const y = f.noseY + b.headRy * 0.16
    const region = blob(x, y, 7, 4.5, p.noise, { wobble: 0.3, lumps: 3, lane: 66, steps: 16 })
    p.hatch(region, {
      color: hsl(230, 22, 42), alpha: 0.09, spacing: 2, angle: 0.4, layers: 2, gaps: 0.4, lane: 1424,
    })
  }
}

function drawFacialHair(s: Scene): void {
  const { p, g } = s
  const f = g.face
  const b = g.build
  if (f.facialHair === 'none') return
  const col = shade(g.palette.hair, 0.5)
  const chinY = b.cy + b.headRy * 0.72
  const rng = p.rng

  switch (f.facialHair) {
    case 'stubble': {
      const region = blob(b.cx, b.cy + b.headRy * 0.5, b.headRx * 0.78, b.headRy * 0.42, p.noise, {
        wobble: 0.08, lumps: 2, lane: 77, steps: 24,
      })
      withClip(p.ctx, [s.head], () => p.fleck(region, col, 90, 0.5))
      break
    }
    case 'moustache': {
      const y = f.mouthY - b.headRy * 0.1
      const w = b.headRx * 0.38
      for (const side of [-1, 1] as const) {
        const path = quad(
          { x: b.cx, y: y - 1 },
          { x: b.cx + side * w * 0.7, y: y + 3 },
          { x: b.cx + side * w, y: y - 3 },
          10,
        )
        for (let i = 0; i < 6; i++) {
          p.stroke(path.map((q) => ({ x: q.x, y: q.y + (i - 3) * 0.9 })), {
            color: col, alpha: 0.16, width: 1.4, passes: 1, wobble: 0.5, taper: 0.7, lane: 1500 + i + side * 10,
          })
        }
      }
      break
    }
    case 'goatee': {
      const region = blob(b.cx, chinY, b.headRx * 0.22, b.headRy * 0.16, p.noise, {
        wobble: 0.14, lumps: 3, lane: 78, steps: 18,
      })
      p.hatch(region, { color: col, alpha: 0.14, spacing: 1.8, angle: 1.4, layers: 2, lane: 1510 })
      p.contour(region, { color: shade(col, 1.2), alpha: 0.1, width: 1.1, passes: 1, wobble: 1.4, lane: 1512 })
      break
    }
    case 'muttonchops': {
      for (const side of [-1, 1] as const) {
        const region = blob(
          b.cx + side * b.headRx * 0.76, b.cy + b.headRy * 0.42,
          b.headRx * 0.16, b.headRy * 0.3, p.noise,
          { wobble: 0.16, lumps: 3, lane: 79 + side, steps: 18 },
        )
        s.addOccluder('head', region)
        p.hatch(region, { color: col, alpha: 0.13, spacing: 2, angle: 1.3, layers: 2, lane: 1520 + side * 6 })
        p.contour(region, { color: shade(col, 1.2), alpha: 0.09, width: 1.1, passes: 1, wobble: 1.6, lane: 1524 })
      }
      break
    }
    case 'fluff': {
      for (let i = 0; i < 26; i++) {
        const a = rng.range(0.25, Math.PI - 0.25)
        const x = b.cx + Math.cos(a) * b.headRx * 0.82
        const y = b.cy + Math.sin(a) * b.headRy * 0.82
        p.stroke([{ x, y }, { x: x + Math.cos(a) * 5, y: y + Math.sin(a) * 5 }], {
          color: col, alpha: 0.12, width: 1, passes: 1, taper: 0.8, lane: 1530 + i,
        })
      }
      break
    }
    default: {
      // Full beard: a mass hugging the jaw, drawn as strands, not as a shape.
      const region = blob(b.cx, b.cy + b.headRy * 0.62, b.headRx * 0.86, b.headRy * 0.52, p.noise, {
        wobble: 0.1, lumps: 3.5, lane: 80, steps: 30,
        shape: (a) => (Math.sin(a) > 0 ? 1.08 : 0.7),
      })
      s.addOccluder('head', region)
      p.hatch(region, { color: col, alpha: 0.1, spacing: 2, angle: 1.45, layers: 2, layerTurn: 18, lane: 1540 })
      p.hatch(region, {
        color: shade(col, 1.6), alpha: 0.07, spacing: 2.6, angle: 1.2, layers: 1, lane: 1544,
        pressure: (_x, y) => clamp((y - b.cy) / (b.headRy * 0.9), 0, 1),
      })
      p.contour(region, { color: shade(col, 1.4), alpha: 0.09, width: 1.2, passes: 1, wobble: 2, wobbleFreq: 6, lane: 1548 })
      break
    }
  }
}

function drawBandaid(s: Scene): void {
  const { p, g } = s
  if (!g.extras.bandaid) return
  const b = g.build
  const x = b.cx + b.headRx * 0.34
  const y = g.face.noseY - b.headRy * 0.08
  const a = -0.35
  const w = b.headRx * 0.3
  const h = b.headRy * 0.075
  const region = [
    { x: x - Math.cos(a) * w, y: y - Math.sin(a) * w - h },
    { x: x + Math.cos(a) * w, y: y + Math.sin(a) * w - h },
    { x: x + Math.cos(a) * w, y: y + Math.sin(a) * w + h },
    { x: x - Math.cos(a) * w, y: y - Math.sin(a) * w + h },
  ]
  p.hatch(region, { color: tint(g.palette.skin, 1.4), alpha: 0.12, spacing: 1.8, angle: a + 1.5, layers: 2, lane: 1600 })
  p.contour(region, { color: g.palette.ink, alpha: 0.14, width: 1.1, passes: 1, lane: 1602 })
  p.fleck(region, shade(g.palette.skin, 0.6), 10, 0.5)
}

/**
 * Age. Crow's feet and a nasolabial hint, both drawn as one or two light marks
 * — any more and a fifty-year-old turns eighty.
 */
function drawAgeLines(s: Scene): void {
  const { p, g } = s
  const f = g.face
  if (f.lines < 0.12) return
  const b = g.build
  const col = shade(g.palette.skin, 1.3)
  const alpha = 0.06 + f.lines * 0.1

  for (const side of [-1, 1] as const) {
    const ex = b.cx + side * (f.eyeSpacing + f.eyeR * 1.15)
    const ey = f.eyeY + f.eyeR * 0.2
    const crows = f.lines > 0.5 ? 3 : 2
    for (let i = 0; i < crows; i++) {
      const a = -0.25 + i * 0.3
      p.stroke(
        [{ x: ex, y: ey }, { x: ex + side * Math.cos(a) * (3 + f.lines * 4), y: ey + Math.sin(a) * (3 + f.lines * 3) }],
        { color: col, alpha, width: 1, passes: 1, taper: 0.8, lane: 1450 + side * 10 + i },
      )
    }
    // Nasolabial fold.
    p.stroke(
      quad(
        { x: b.cx + side * b.headRx * 0.2, y: f.noseY + b.headRy * 0.04 },
        { x: b.cx + side * b.headRx * 0.42, y: f.mouthY - b.headRy * 0.04 },
        { x: b.cx + side * b.headRx * 0.34, y: f.mouthY + b.headRy * 0.05 },
        10,
      ),
      { color: col, alpha: alpha * 0.85, width: 1.1, passes: 1, taper: 0.75, lane: 1460 + side * 10 },
    )
  }
}

function drawScar(s: Scene): void {
  const { p, g } = s
  const sc = g.face.scar
  if (!sc) return
  const b = g.build
  const x = b.cx + sc.x * b.headRx * 0.7
  const y = b.cy + sc.y * b.headRy * 0.6
  const dx = Math.cos(sc.angle) * sc.len
  const dy = Math.sin(sc.angle) * sc.len
  const col = adjust(g.palette.blush, -8, 6)
  p.stroke([{ x: x - dx, y: y - dy }, { x: x + dx, y: y + dy }], {
    color: col, alpha: 0.22, width: 1.4, passes: 2, wobble: 0.5, taper: 0.6, lane: 1470,
  })
  // Cross-ticks only on a long scar — a short one is just a mark.
  if (sc.len > b.headRx * 0.22) {
    for (let i = -1; i <= 1; i += 2) {
      const px = x + dx * i * 0.45
      const py = y + dy * i * 0.45
      p.stroke([{ x: px - dy * 0.25, y: py + dx * 0.25 }, { x: px + dy * 0.25, y: py - dx * 0.25 }], {
        color: col, alpha: 0.16, width: 1.1, passes: 1, taper: 0.7, lane: 1472 + i,
      })
    }
  }
}

/** Horizontal shift every facial feature shares, from the head's turn. */
export function turnShift(g: Genome): number {
  return g.build.turn * g.build.headRx * 0.16
}

export function drawFace(s: Scene): void {
  drawCheeks(s)
  drawBrows(s)
  drawEyes(s)
  drawNose(s)
  drawMouth(s)
  drawFacialHair(s)
  drawAgeLines(s)
  drawScar(s)
  drawBandaid(s)
}
