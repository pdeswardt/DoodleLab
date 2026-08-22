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
import type { BrowGeom, EyeGeom, Genome } from '../../core/genome'
import type { Scene } from '../character'
import { radialFalloff, ellipsoidShade } from '../character'
import type { Pencil } from '../pencil'
import { type Pt, arc, quad, blob, bounds, withClip, normalAt } from '../shapes'

/* -------------------------------------------------------------------- eyes */

/**
 * The eye opening.
 *
 * Built from two corners and two lid curves rather than from an ellipse with
 * its top and bottom clamped off. The corners are what carry the character:
 * dropping the outer one gives a droop, lifting it gives an upturn, and moving
 * them together turns a round eye into an almond. Clamping an ellipse can only
 * ever produce one eye shape with more or less of it hidden.
 *
 * Which of those it is, is `e` — there is no shape id here any more.
 */
function eyeOutline(
  cx: number, cy: number, rx: number, ry: number, e: EyeGeom, side: -1 | 1,
): Pt[] {
  const inner = { x: cx - side * rx * e.widen, y: cy + ry * e.innerDrop }
  const outer = { x: cx + side * rx * e.widen, y: cy + ry * e.outerDrop }
  const top = quad(inner, { x: cx, y: cy - ry * e.topH * 1.4 }, outer, 11)
  const bottom = quad(outer, { x: cx, y: cy + ry * e.botH * 1.3 }, inner, 11)
  return [...top, ...bottom.slice(1, -1)]
}

/** Trim an outline to what the lids leave showing. */
function applyLids(pts: Pt[], cy: number, ry: number, top: number, bottom: number): Pt[] {
  const hiY = cy - ry * (1 - top * 2)
  const loY = cy + ry * (1 - bottom * 2)
  return pts.map((p) => ({ x: p.x, y: clamp(p.y, hiY, loY) }))
}

function drawOneEye(
  p: Pencil, g: Genome, cx: number, cy: number, r: number, e: EyeGeom,
  iris: Hsl, flip: number, lane: number,
): void {
  const pal = g.palette
  const f = g.face
  const rng = p.rng
  const rx = r * rng.range(0.95, 1.05)
  const ry = r * e.tall * rng.range(0.95, 1.05)
  // Pulled toward pen-black by however much this hand is a pen, the same way
  // contours are. Feature lines drawn straight from the pencil ink left the
  // face soft under an eyewear frame that was not.
  const ink = p.inkify(adjust(pal.ink, -4, 6))

  // Shut when both lids are all the way down, or when this is the winking
  // side. A blink is the far end of the lid range, not a separate drawing.
  const shut = e.winkSide === flip ? 1 : Math.min(e.lidTop, e.lidBottom)
  if (shut > 0.8) {
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
    eyeOutline(cx, cy, rx, ry, e, flip as -1 | 1),
    cy, ry, e.lidTop, e.lidBottom,
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
  const hlr = ir * (0.34 + e.sparkle * 0.18)

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
    if (pr > 0.6) p.accent(pupil, pal.keyline, 0.8 * (0.55 + p.hand.graphic * 0.45))

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

  if (e.fold > 0.05) {
    // The fold is the point of a hooded eye; without it the shape just reads
    // as a small one. It rides the same number that made the lid low.
    p.stroke(
      quad(
        { x: cx - flip * rx * 1.25, y: cy - ry * (0.35 + e.fold * 0.3) },
        { x: cx, y: cy - ry * (0.9 + e.fold * 0.7) },
        { x: cx + flip * rx * 1.3, y: cy - ry * (0.1 + e.fold * 0.24) }, 12,
      ),
      {
        color: ink, alpha: 0.08 + e.fold * 0.1, width: 1.4, passes: 1,
        wobble: 0.5, taper: 0.6, lane: lane + 44,
      },
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

  if (e.sparkle > 0.4) {
    // A four-point flick just outside the iris.
    const sx = gx + ir * 0.9
    const sy = gy - ir * 0.9
    const len = 2.4 + e.sparkle * 2.2
    for (const [dx, dy] of [[1, 0], [0, 1]] as const) {
      p.stroke(
        [{ x: sx - dx * len, y: sy - dy * len }, { x: sx + dx * len, y: sy + dy * len }],
        { color: pal.accent, alpha: 0.3, width: 1.2, passes: 1, taper: 0.9, lane: lane + 40 },
      )
    }
  }
}

function drawEyes(s: Scene): void {
  const { p, g } = s
  const f = g.face
  const rng = p.rng
  // How far this hand lets the two halves of a face disagree. A trained hand
  // draws them level and breaks the symmetry deliberately; a doodle puts one
  // eye higher and larger than the other because that is where the pen went,
  // and that single fact is most of what makes it read as drawn.
  const k = p.hand.asym
  const wonk = p.rng.fork('wonk')
  for (const side of [-1, 1] as const) {
    // Asymmetry is applied here rather than sampled per eye, so the two eyes
    // differ by a fixed, character-specific amount instead of jittering
    // independently every time the character is drawn.
    // The far eye sits closer to the centre line and reads slightly narrower.
    const turn = turnShift(g)
    const near = Math.sign(g.build.turn || 1) === side
    const cx = g.build.cx + turn + side * f.eyeSpacing * (near ? 1 : 1 - Math.abs(g.build.turn) * 0.18)
      + rng.gauss(0, 0.4) + wonk.gauss(0, (k - 1) * 1.6)
    const cy = f.eyeY + side * f.eyeTilt * f.eyeSpacing + (side > 0 ? f.asym.eyeDY * k : 0)
      + wonk.gauss(0, (k - 1) * 1.4)
    const r = f.eyeR * (side > 0 ? 1 + f.asym.eyeDR * k : 1)
      * (near ? 1 : 1 - Math.abs(g.build.turn) * 0.12)
      * (1 + wonk.gauss(0, (k - 1) * 0.09))
    const iris = side < 0 && f.irisAlt ? f.irisAlt : f.iris
    const clouded = f.cloudyEye === side
    // The two eyes are not the same shape either — one rounder, one narrower,
    // one lid heavier. Drawing a single geom twice is what kept every face
    // looking constructed rather than drawn.
    const e = f.geom.eye
    const geom = k <= 1.01 ? e : {
      ...e,
      topH: e.topH * (1 + wonk.gauss(0, (k - 1) * 0.14)),
      botH: e.botH * (1 + wonk.gauss(0, (k - 1) * 0.14)),
      widen: e.widen * (1 + wonk.gauss(0, (k - 1) * 0.1)),
      outerDrop: e.outerDrop + wonk.gauss(0, (k - 1) * 0.12),
      lidTop: clamp(e.lidTop + wonk.gauss(0, (k - 1) * 0.07), 0, 1),
    }
    drawOneEye(
      p, g, cx, cy, r, geom,
      clouded ? hsl(iris.h, 8, Math.max(58, iris.l + 34)) : iris,
      side, 800 + (side + 1) * 60,
    )
  }

  if (f.thirdEye) {
    // The extra eye is always open and never the one that winks — a third eye
    // that blinks in sympathy with the other two reads as a smudge.
    const e = f.geom.eye
    drawOneEye(
      p, g, g.build.cx + turnShift(g) + rng.gauss(0, 1.5), g.build.cy - g.build.headRy * 0.44,
      f.eyeR * 0.72,
      { ...e, winkSide: 0, lidTop: Math.min(e.lidTop, 0.18), lidBottom: Math.min(e.lidBottom, 0.1) },
      f.iris, 1, 940,
    )
  }
}

/* ------------------------------------------------------------------- brows */

/**
 * A brow as a ribbon: a spine plus a width that varies along it.
 *
 * There used to be eleven literal spines in here, one per style id, which is
 * why two "bushy" brows on a sheet were the same brow. They are one curve now:
 * an arch height, an inner-to-outer tilt, where along the length the arch
 * peaks, a width at each end, an optional comma tail and an optional reach
 * inboard toward the bridge. A unibrow is not a twelfth case, it is that reach
 * taken far enough that the two brows meet.
 */
interface BrowRibbon {
  spine: Pt[]
  /** Half-thickness at position `t` along the spine, 0..1. */
  widthAt: (t: number) => number
}

function browRibbon(
  bg: BrowGeom, cx: number, cy: number, w: number, thick: number,
  side: -1 | 1, lift: number, reachCap: number,
): BrowRibbon {
  const innerX = cx - side * w
  const outerX = cx + side * w
  const innerY = cy + bg.tilt * w + lift
  const outerY = cy - bg.tilt * w - lift * 0.4

  // Place the quadratic's control point so the arch peaks at `belly` rather
  // than always at the midpoint — solving for it is what lets the same two
  // endpoints give a brow that lifts near the nose and one that lifts near the
  // temple. Bounded away from the ends because the solve divides by b(1-b).
  const b = clamp(bg.belly, 0.24, 0.76)
  const px = innerX + (outerX - innerX) * b
  const py = innerY + (outerY - innerY) * b - bg.arch * w
  const k = 2 * b * (1 - b)
  const ctrl = {
    x: (px - (1 - b) ** 2 * innerX - b * b * outerX) / k,
    y: (py - (1 - b) ** 2 * innerY - b * b * outerY) / k,
  }
  let spine = quad({ x: innerX, y: innerY }, ctrl, { x: outerX, y: outerY }, 12)

  // Inboard extension. Capped at the centre line so two large reaches meet
  // over the bridge instead of crossing past each other into the far socket.
  const reach = Math.min(bg.reach * w, reachCap)
  if (reach > 0.6) {
    const tip = { x: innerX - side * reach, y: innerY + reach * 0.2 }
    const lead = quad(tip, { x: innerX - side * reach * 0.5, y: innerY + reach * 0.05 },
      { x: innerX, y: innerY }, 6)
    spine = [...lead.slice(0, -1), ...spine]
  }
  if (bg.hook > 0.05) {
    const tail = quad(
      { x: outerX, y: outerY },
      { x: outerX + side * bg.hook * w * 0.8, y: outerY + bg.hook * w * 0.2 },
      { x: outerX + side * bg.hook * w * 0.6, y: outerY + bg.hook * w * 0.95 },
      6,
    )
    spine = [...spine, ...tail.slice(1)]
  }

  return {
    spine,
    widthAt: (t) => thick * (bg.innerW + (bg.outerW - bg.innerW) * t),
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
  const bg = f.geom.brow
  const rng = p.rng
  const col = p.inkify(shade(g.palette.hair, 0.6))
  const w = f.eyeR * 1.25
  // Both brows are always drawn. A unibrow is the pair reaching far enough in
  // to touch, so the far end of the reach range needs the far brow to exist.
  const reachCap = Math.max(0, f.eyeSpacing - w)

  for (const side of [-1, 1] as const) {
    const cx = g.build.cx + turnShift(g) + side * f.eyeSpacing
    const cy = f.eyeY - f.eyeR * (1.4 + f.browLift) + (side > 0 ? f.asym.browDY * p.hand.asym : 0)
    const lift = f.browAngle * side * 6
    const spec = browRibbon(bg, cx, cy, w, f.browThick * 1.5, side, lift, reachCap)
    const lane = 1000 + (side + 1) * 40
    const shape = ribbon(spec.spine, spec.widthAt)

    // Hairiness is a blend, not a switch: a brow can be a soft mass with a few
    // stray hairs over it, which neither of the two old branches could draw.
    if (bg.hairy < 0.92) {
      p.hatch(shape, {
        color: col, alpha: 0.19 * (1 - bg.hairy * 0.85), spacing: 1.5, angle: 1.4,
        layers: 2, layerTurn: 44, curve: 0.8, lane: lane + 20,
      })
      p.contour(shape, {
        color: shade(col, 0.8), alpha: 0.13 * (1 - bg.hairy), width: 1.1, passes: 1,
        wobble: 0.8, optional: true, lane: lane + 24,
      })
    }

    if (bg.hairy > 0.06) {
      // Individual hairs, laid along the spine and fanning slightly.
      // Short marks lying *within* the ribbon, each covering a fraction of its
      // length. Offsetting a full-length copy of the whole spine once per hair
      // — which is what this did — produces seven to eleven parallel dashed
      // lines the width of the brow, and at the focal point of the face that
      // reads as a barcode rather than as hair.
      const n = spec.spine.length
      const hairs = Math.round(3 + bg.density * 10)
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
          color: col, alpha: 0.2 * (0.45 + bg.hairy * 0.55), width: 1.3, passes: 1,
          wobble: 0.35, gaps: 0.05 + bg.broken, taper: 0.85, lane: lane + i,
        })
      }
    }
  }
}

/* -------------------------------------------------------------------- nose */

function drawNose(s: Scene): void {
  const { p, g } = s
  const f = g.face
  const b = g.build
  const ng = f.geom.nose
  const cx = b.cx + turnShift(g) * 1.35 + f.gazeX * 1.6 + f.asym.noseSkew * p.hand.asym
  const cy = f.noseY
  const uw = b.headRx * 0.11 * f.noseSize
  const uh = b.headRy * 0.1 * f.noseSize
  // Noses run warmer and a touch redder than the rest of the face.
  const col = adjust(g.palette.skin, -6, 22, -8)
  const ink = p.inkify(adjust(g.palette.ink, 6, 4))

  const rx = uw * 1.15 * ng.width
  const ry = uh * ng.tipH
  const tipY = cy + uh * ng.tipDrop
  // A hook curls toward whichever way the head is turned, so the profile and
  // the pose agree instead of the nose always pointing the same way.
  const fwd = b.turn >= 0 ? 1 : -1
  const hookA = fwd > 0 ? 0.7 : Math.PI - 0.7

  const bulb = (sx: number, sy: number, brx: number, bry: number, lane: number): Pt[] =>
    blob(sx, sy, brx, bry, p.noise, {
      wobble: 0.07, lumps: 2, lane, steps: 22,
      // The hook swells the lower front of the form and the upturn pares the
      // underside away. Drawn as a separate outline they read as two noses.
      shape: (a) => 1
        + ng.hook * 0.3 * Math.max(0, Math.cos(a - hookA)) ** 2
        - ng.upturn * 0.2 * Math.max(0, Math.sin(a)) ** 2,
    })

  const shape = bulb(cx, tipY, rx, ry, 44)

  if (p.hand.construction < 0.5) {
    // The symbol for a nose: a small closed shape and two dots, outlined.
    p.hatch(shape, { color: col, alpha: 0.12, spacing: 2, angle: 0.6, layers: 1, lane: 1124 })
    p.contour(shape, { color: ink, alpha: 0.3, width: 1.8, passes: 2, wobble: 1, lane: 1126 })
    for (const side of [-1, 1] as const) {
      p.stroke(arc(cx + side * rx * 0.55, tipY + ry * 0.3, rx * 0.16, ry * 0.14, 0, Math.PI * 2, 8), {
        color: ink, alpha: 0.32, width: 1.6, passes: 2, lane: 1130 + side,
      })
    }
    return
  }

  // The reference's nose is a lit ball in a *different, more saturated hue*
  // than the surrounding skin — the chroma peak of the whole picture — with a
  // bare-paper light plane, a crescent core shadow, a soft cast shadow onto
  // the philtrum, and no outline anywhere on it. It was an evenly smudged disc
  // inside a ring. How much of that survives against a plain drawn line is
  // `contour` against `shadow`, which used to be a property of the style id:
  // a beak was always a line and a button was always a ball.
  const lit = ellipsoidShade(cx, tipY, rx, ry, s.lx, s.ly, 1.3)
  p.hatch(shape, {
    color: g.palette.noseAccent,
    alpha: 0.12 + ng.shadow * 0.07,
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
    alpha: 0.06 + 0.11 * ng.shadow,
    spacing: 1.8,
    angle: 1.3,
    layers: 1,
    lane: 1125,
    pressure: (x, y) => clamp((lit(x, y) - 0.45) * 2.2, 0, 1),
  })

  const bridgeTop = tipY - uh * ng.bridge
  if (ng.bridge > 0.2 && p.hand.construction > 0.5) {
    // The bridge: two soft planes running up to the brow, no line.
    p.hatch(
      [{ x: cx - rx * 0.75, y: tipY - ry * 0.4 }, { x: cx + rx * 0.75, y: tipY - ry * 0.4 },
        { x: cx + rx * 0.42, y: bridgeTop }, { x: cx - rx * 0.42, y: bridgeTop }],
      {
        color: shade(g.palette.skin, 1.1),
        alpha: 0.07 * ng.shadow,
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
      blob(cx + s.lx * rx * 0.5, tipY + ry * 1.15, rx * 0.7, ry * 0.5, p.noise,
        { wobble: 0.12, lumps: 2, lane: 45, steps: 16 }),
      {
        color: shade(g.palette.skin, 1.5), alpha: 0.11 * ng.shadow, spacing: 1.8, angle: 0.4,
        layers: 1, gaps: 0.35, lane: 1128,
      },
    )
  }

  // The profile. One line from the brow down the ridge to the tip, bowing
  // forward with the hook — this is the whole of what made a beak a beak.
  // Only a long ridge earns it: drawn on every nose it is a vertical rule down
  // the middle of every face on the sheet.
  if (ng.bridge > 2.1 && ng.contour > 0.45) {
    p.stroke(
      quad(
        { x: cx - fwd * rx * 0.28, y: bridgeTop },
        { x: cx + fwd * rx * (0.1 + ng.hook * 0.85), y: tipY - ry * 0.5 },
        { x: cx + fwd * rx * (0.05 + ng.hook * 0.4), y: tipY + ry * 0.45 },
        12,
      ),
      {
        color: ink, alpha: 0.06 + ng.contour * 0.14, width: 1.3, passes: 1,
        wobble: 0.3, taper: 0.6, lane: 1108,
      },
    )
  }

  // The underside. Flat on most noses and a genuine upward curve on an
  // upturned one, which is the only mark that reads that shape at thumbnail.
  if (ng.upturn > 0.05) {
    p.stroke(
      quad(
        { x: cx - rx * 0.9, y: tipY + ry * 0.1 },
        { x: cx - rx * 0.15, y: tipY + ry * (1.1 - ng.upturn * 2.2) },
        { x: cx + rx * 0.9, y: tipY - ry * 0.3 },
        12,
      ),
      {
        color: ink, alpha: 0.05 + ng.upturn * 0.13, width: 1.3, passes: 2,
        wobble: 0.3, taper: 0.5, lane: 1116,
      },
    )
  }

  // Outlined only by an untrained hand — a lined nose is the loudest tell of
  // one, so `contour` sets how heavy that line is, never whether a trained
  // hand draws it at all.
  p.contour(shape, {
    color: ink, alpha: 0.04 + ng.contour * 0.12, width: 1.2, passes: 1,
    heavyAngle: Math.PI * 0.55, heavyAmount: 0.5, optional: true, lane: 1126,
  })

  // Nostrils. Absent entirely on a dainty nose, which is a bigger difference
  // between two faces than any amount of nostril is.
  if (ng.nostril > 0.05) {
    for (const side of [-1, 1] as const) {
      p.stroke(
        arc(cx + side * rx * 0.72, tipY + ry * 0.42,
          rx * 0.24 * ng.nostril, ry * 0.2 * ng.nostril, 0.4, Math.PI * 1.6, 8),
        {
          color: shade(g.palette.noseAccent, 2),
          alpha: (p.hand.construction > 0.5 ? 0.24 : 0.2) * clamp(ng.nostril, 0.4, 1.2),
          width: 1.1, passes: 1, lane: 1130 + side,
        },
      )
    }
  }
}

/* ------------------------------------------------------------------- mouth */

function drawMouth(s: Scene): void {
  const { p, g } = s
  const f = g.face
  const b = g.build
  const m = f.geom.mouth
  const cx = b.cx + turnShift(g) * 1.15 + f.gazeX * 1.2
  const cy = f.mouthY
  const w = b.headRx * 0.24 * f.mouthW
  // The mouth line is one of the few marks that should be a real dark, and the
  // lips are the second chroma accent after the nose.
  const ink = p.inkify(
    p.hand.construction > 0.5 ? g.palette.keyline : adjust(g.palette.ink, 2, 8, -6),
  )
  const lip = g.palette.lip
  const built = p.hand.construction > 0.5

  // A mouth that is level to the pixel reads as a decal. The tilt is part of
  // the character's fixed asymmetry, not per-draw noise.
  const tilt = f.asym.mouthTilt * p.hand.asym
  const tip = (pts: Pt[]): Pt[] =>
    pts.map((q) => ({ x: q.x, y: q.y + (q.x - cx) * tilt }))

  const line = (pts: Pt[], alpha = 0.26, width = 1.7): void => {
    // The line of the mouth is one of the few marks that should read as
    // graphic rather than as pigment. Two translucent passes made it woolly.
    if (built) p.accentStroke(tip(pts), ink, width * 1.05, Math.min(0.8, alpha * 2.4) * (0.5 + p.hand.graphic * 0.5))
    else p.stroke(tip(pts), { color: ink, alpha, width, passes: 2, wobble: 0.35, taper: 0.45, lane: 1200 })
  }

  // One construction for every mouth: two corners, a seam between them, and a
  // lens of opening around that seam. A closed smile is the lens at zero
  // height; an "ohh" is a puckered pair of corners with a tall one. The eight
  // hardcoded mouths were eight unrelated drawings, so a grin and a toothy
  // grin shared nothing and two smiles shared everything.
  const half = w * (0.92 - m.pucker * 0.62)
  const corner = m.lift * w * 0.18
  const left = { x: cx - half, y: cy - corner - m.skew * w * 0.1 }
  const right = { x: cx + half, y: cy - corner + m.skew * w * 0.1 }
  const seamX = cx + m.skew * w * 0.18
  const seamY = cy + m.lift * w * 0.4
  const upper = quad(left, { x: seamX, y: seamY - m.open * w * 0.55 }, right, 14)
  const lower = quad(right, { x: seamX, y: seamY + m.open * w * 0.6 }, left, 12)

  if (m.open > 0.06) {
    const cavity = tip([...upper, ...lower.slice(1, -1)])
    p.hatch(cavity, {
      color: shade(lip, 1.8), alpha: 0.1 + m.open * 0.08, spacing: 1.7, angle: 1.1,
      layers: 2, lane: 1208,
    })
    p.contour(cavity, {
      color: ink, alpha: 0.08 + m.open * 0.16, width: 1.4, passes: 1, lane: 1218,
    })

    if (m.teeth > 0.05) {
      // Teeth are a band of paper across the top of the opening, not a row of
      // drawn shapes — at sheet size drawn teeth are a grey smear.
      const depth = m.open * w * 0.6 * m.teeth
      const band = tip([...upper, ...upper.map((q) => ({ x: q.x, y: q.y + depth })).reverse()])
      p.base(band, hsl(48, 10, 96), 0.5 + m.teeth * 0.35)
      // The gap is a quirk, so it has to survive whatever the teeth are doing.
      const teeth = Math.max(2, Math.round(1 + m.teeth * 3) + (f.toothGap ? 1 : 0))
      for (let i = 1; i < teeth; i++) {
        const x = cx - half * 0.6 + (half * 1.2 * i) / teeth
        const gap = f.toothGap && i === 1
        p.stroke(tip([{ x, y: seamY - depth * 0.9 }, { x: x + 0.5, y: seamY + 1 }]), {
          color: ink, alpha: gap ? 0.3 : 0.12, width: gap ? 2.4 : 1, passes: 1, lane: 1212 + i,
        })
      }
    }
  }

  line(upper, 0.26 + m.open * 0.04, 1.7 + m.lift * 0.2)

  // Corner flicks — what made a grin a grin. Length follows the lift, so they
  // vanish on a flat mouth instead of being switched off by an id.
  if (m.lift > 0.35) {
    for (const side of [-1, 1] as const) {
      const end = side < 0 ? left : right
      p.stroke(tip([end, { x: end.x + side * w * 0.16, y: end.y - m.lift * w * 0.22 }]), {
        color: ink, alpha: 0.14 + m.lift * 0.08, width: 1.2, passes: 1, taper: 0.6,
        lane: 1204 + side,
      })
    }
  }

  // Lip volume needs room. Stacked into ten pixels on a sheet thumbnail it
  // collapses into a smudge that reads as dirt on the paper, so below that it
  // is left as the single confident curve the reference uses.
  if (built && p.detail > 0.7) {
    // Lip volume: the upper lip turns away from the light and sits in shadow,
    // the lower lip catches it. Drawing the mouth as a single arc — which is
    // what it was — is the schematic a child uses.
    const up = m.upperLip * w
    const upperLip: Pt[] = [
      ...tip(quad({ x: left.x, y: left.y }, { x: seamX, y: seamY - up * 0.34 - m.open * w * 0.55 }, { x: right.x, y: right.y }, 12)),
      ...tip(upper).slice(1, -1).reverse(),
    ]
    p.hatch(upperLip, {
      color: shade(lip, 1.2), alpha: 0.1 + m.upperLip * 0.06, spacing: 1.6, angle: 1.2,
      layers: 1, lane: 1232,
    })
    const down = m.lowerLip * w
    const lowerLip: Pt[] = [
      ...tip(lower),
      ...tip(quad({ x: left.x, y: left.y }, { x: seamX, y: seamY + m.open * w * 0.6 + down * 0.42 }, { x: right.x, y: right.y }, 10)).slice(1, -1),
    ]
    p.hatch(lowerLip, {
      color: tint(lip, 0.5), alpha: 0.08 + m.lowerLip * 0.05, spacing: 1.8, angle: 0.6,
      layers: 1, lane: 1234,
      // Left lighter where the light lands on the roll of the lip.
      pressure: (_x, y) => clamp((y - cy) / (w * 0.4), 0, 1),
    })
    // The corners are the darkest part of a mouth, and they anchor it.
    for (const side of [-1, 1] as const) {
      const end = side < 0 ? left : right
      p.stroke(
        tip([{ x: end.x - side * half * 0.24, y: end.y }, { x: end.x, y: end.y + 1 }]),
        { color: ink, alpha: 0.3, width: 1.6, passes: 1, taper: 0.5, lane: 1236 + side },
      )
    }
  }

  // A hint of shadow beneath the lower lip grounds the mouth on the face.
  p.stroke(arc(cx, seamY + m.open * w * 0.6 + w * (0.2 + m.lowerLip * 0.3), w * 0.5, w * 0.2,
    Math.PI * 0.15, Math.PI * 0.85, 8), {
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

  // Ear geometry per character rather than one shape scaled: how far it stands
  // off the skull, how round it is, how low the lobe hangs, whether the lobe is
  // attached at all. `earTilt` has been generated and plumbed through to this
  // function for as long as it has existed and was read by nothing.
  const er = p.rng.fork('ears')
  const stand = er.range(0.86, 1.05) + (p.hand.asym - 1) * 0.05
  const round = er.range(0.8, 1.35)
  const lobe = er.range(0, 1)
  const attached = er.bool(0.45)
  for (const side of [-1, 1] as const) {
    const grow = f.bigEar === side ? 1.5 : 1
    const rx = b.headRx * 0.115 * f.earSize * grow * round * (1 + (p.hand.asym - 1) * 0.18)
    const ry = b.headRy * 0.165 * f.earSize * grow / round ** 0.4 * (1 + (p.hand.asym - 1) * 0.12)
    const near = Math.sign(b.turn || 1) === side
    const cx = b.cx + side * b.headRx * stand
      * (near ? 1 + Math.abs(b.turn) * 0.06 : 1 - Math.abs(b.turn) * 0.16)
    const cy = f.eyeY + b.headRy * 0.06 + (side > 0 ? f.asym.earDY * p.hand.asym : 0)
      + b.headRy * f.earTilt * 0.06
    const region = blob(cx, cy, rx, ry, p.noise, {
      wobble: 0.1, lumps: 2, lane: 55 + side, steps: 20,
      // A hand that draws in pen makes ears as little loops standing clear of
      // the head, not as flattened ovals hugging it.
      shape: (a) => 1 + (0.18 + p.hand.ink * 0.24) * Math.cos(a) * side
        + lobe * 0.16 * Math.max(0, Math.sin(a)),
    })
    p.hatch(region, {
      color: g.palette.skin, alpha: 0.11, spacing: 2.2, angle: 1.1, layers: 2, lane: 1300 + side * 10,
    })
    p.hatch(region, {
      color: shade(g.palette.skin, 1.2), alpha: 0.1, spacing: 2.4, angle: 0.8, layers: 1, lane: 1304 + side * 10,
      pressure: radialFalloff(cx + side * rx * 0.2, cy + ry * 0.3, rx * 2, 1.2),
    })
    p.contour(region, { color: g.palette.ink, alpha: 0.11, width: 1.1, passes: 1, optional: true, lane: 1308 + side * 10 })
    // Inner fold. A detached lobe gets a second short mark under it, which is
    // most of the difference between the two kinds of ear.
    p.stroke(arc(cx + side * rx * 0.1, cy, rx * 0.45, ry * 0.5, Math.PI * 0.6, Math.PI * 1.7, 10), {
      color: shade(g.palette.skin, 1.4), alpha: 0.14, width: 1.1, passes: 1, taper: 0.6, lane: 1312 + side * 10,
    })
    if (!attached && lobe > 0.4) {
      p.stroke(arc(cx, cy + ry * 0.52, rx * 0.6, ry * 0.32, 0.3, Math.PI - 0.3, 8), {
        color: shade(g.palette.skin, 1.5), alpha: 0.12, width: 1, passes: 1, taper: 0.7, lane: 1316 + side * 10,
      })
    }
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

/**
 * Facial hair as four masses and a texture.
 *
 * Seven hardcoded drawings meant every goatee was the same goatee. A goatee is
 * chin mass with no cheek mass, muttonchops are cheek mass with no chin, a
 * full beard is both plus the jaw between them, and stubble is all of them at
 * zero length — so the same routine draws all seven and everything between.
 * Whether a character has facial hair at all is still decided in `genFace`,
 * and this does not touch that rate.
 */
function drawFacialHair(s: Scene): void {
  const { p, g } = s
  const f = g.face
  const b = g.build
  const bg = f.geom.beard
  const rng = p.rng
  const col = shade(g.palette.hair, 0.5)
  const len = clamp(bg.length, 0, 1)
  // How much of the growth reads as a mass rather than as loose grain. Short
  // and sparse is stubble; long and thick is a slab hanging off the jaw.
  const solid = bg.density * (0.25 + len * 0.75)

  const mass = (region: Pt[], lane: number): void => {
    // Only a real mass occludes. Registering stubble as an occluder punched
    // the shirt out from under a face that had nothing on it but grain.
    if (solid > 0.4) s.addOccluder('head', region)
    p.hatch(region, {
      color: col, alpha: 0.04 + 0.1 * solid, spacing: 2, angle: 1.45,
      layers: 2, layerTurn: 18, lane,
    })
    p.hatch(region, {
      color: shade(col, 1.6), alpha: 0.06 * solid, spacing: 2.6, angle: 1.2, layers: 1,
      lane: lane + 4,
      pressure: (_x, y) => clamp((y - b.cy) / (b.headRy * 0.9), 0, 1),
    })
    p.contour(region, {
      color: shade(col, 1.4), alpha: 0.02 + 0.09 * solid, width: 1.2, passes: 1,
      wobble: 2, wobbleFreq: 6, optional: solid < 0.3, lane: lane + 8,
    })

    // Grain where it is short, strands where it is long. Both scale with
    // density, so a sparse beard is see-through rather than a smaller one, and
    // both scale with the area they cover — a fixed count spread over a
    // sideburn is a solid block, and over a full jaw it is a dusting.
    const bb = bounds(region)
    const area = (bb.w * bb.h) / (b.headRx * b.headRy)
    const grains = Math.round(70 * area * bg.density * (1 - len))
    if (grains > 4) withClip(p.ctx, [s.head], () => p.fleck(region, col, grains, 0.5))

    const strands = Math.round(len * bg.density * 20 * area)
    const mid = { x: b.cx, y: b.cy + b.headRy * 0.6 }
    for (let i = 0; i < strands; i++) {
      const q = region[rng.int(0, region.length - 1)]!
      const dx = q.x - mid.x
      const dy = q.y - mid.y
      const d = Math.hypot(dx, dy) || 1
      // Strands that point back up into the face read as a smudge on the cheek.
      if (dy / d < -0.25) continue
      const reach = 3 + len * 7
      p.stroke([q, { x: q.x + (dx / d) * reach, y: q.y + (dy / d) * reach }], {
        color: col, alpha: 0.1 + solid * 0.08, width: 1, passes: 1, taper: 0.8,
        lane: lane + 12 + i,
      })
    }
  }

  // Cheeks and sideburns.
  if (bg.cheek > 0.06) {
    for (const side of [-1, 1] as const) {
      mass(
        blob(
          b.cx + side * b.headRx * 0.74, b.cy + b.headRy * (0.34 + bg.cheek * 0.1),
          b.headRx * (0.09 + bg.cheek * 0.11), b.headRy * (0.12 + bg.cheek * 0.24), p.noise,
          { wobble: 0.16, lumps: 3, lane: 79 + side, steps: 20 },
        ),
        1520 + side * 40,
      )
    }
  }

  // Chin and jaw, as one mass — a beard is not a goatee with sideburns bolted
  // on, it is the same lump grown wide enough to reach them.
  if (bg.chin + bg.jaw > 0.12) {
    mass(
      blob(
        b.cx, b.cy + b.headRy * (0.74 - bg.jaw * 0.14 - bg.chin * 0.04),
        b.headRx * (0.1 + bg.chin * 0.16 + bg.jaw * 0.52),
        b.headRy * (0.06 + bg.chin * 0.16 + bg.jaw * 0.28), p.noise,
        {
          wobble: 0.1, lumps: 3.5, lane: 80, steps: 30,
          shape: (a) => (Math.sin(a) > 0 ? 1.06 : 0.72),
        },
      ),
      1600,
    )
  }

  // The moustache is its own mark: strokes swept out from the philtrum, not a
  // blob, because at this size a blob under the nose reads as a second nose.
  if (bg.moustache > 0.06) {
    const mo = bg.moustache
    const y = f.mouthY - b.headRy * (0.07 + mo * 0.04)
    const mw = b.headRx * (0.16 + mo * 0.22)
    const rows = Math.round(3 + mo * 4)
    for (const side of [-1, 1] as const) {
      const path = quad(
        { x: b.cx, y: y - 1 },
        { x: b.cx + side * mw * 0.7, y: y + 3 },
        { x: b.cx + side * mw, y: y - 1 - mo * 3 },
        10,
      )
      for (let i = 0; i < rows; i++) {
        const off = (i - (rows - 1) / 2) * 0.9 * (0.6 + mo * 0.8)
        p.stroke(path.map((q) => ({ x: q.x, y: q.y + off })), {
          color: col, alpha: 0.1 + bg.density * 0.09, width: 1.4, passes: 1,
          wobble: 0.5, gaps: 0.3 * (1 - len), taper: 0.7, lane: 1500 + i + side * 10,
        })
      }
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
