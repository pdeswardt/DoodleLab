/**
 * Everything worn, carried or accompanying.
 *
 * Split into three passes by depth: `behind` (the hood), `front` (headwear,
 * eyewear, jewellery) and `quirk` (the signature props). Quirk props are drawn
 * last and scale with their intensity — the same pencil behind the ear can be a
 * detail you notice second or the first thing you see.
 */

import { adjust, shade, tint, hsl, clamp, ground, type Hsl } from '../../core/color'
import type { Genome, GlassesSpec } from '../../core/genome'
import { ART } from '../../core/types'
import type { Scene } from '../character'
import { ellipsoidShade } from '../character'
import type { Pencil } from '../pencil'
import { type Pt, arc, quad, blob, withClip, centroid } from '../shapes'
import { drawHood } from './garment'

/* ------------------------------------------------------------------- hats */

/**
 * Headwear, built from `HatSpec` rather than chosen from a list of drawings.
 *
 * Every dimension here comes from the spec, which is rolled per character —
 * crown width, height, exponent, taper, lean, brim reach and wrap, band, cuff,
 * seams, points and trim. The style id only decided which region of that space
 * the numbers were drawn from. Nothing below branches on it.
 */
function drawHat(s: Scene): void {
  const { p, g } = s
  const h = g.extras.hatSpec
  if (g.extras.hat === 'none') return
  const b = g.build
  const col = g.extras.hatColor
  const ink = adjust(g.palette.ink, 4, -4)
  const tilt = g.extras.hatTilt
  // Two kinds of headwear, and they behave differently. Something you put *on*
  // your head rides up over the hair; something you wear *round* it does not,
  // and lifting a headband or a coronet clear of a bun left it hanging in the
  // air above the head.
  const sitsOn = h.crownH > 0.3 || h.brim > 0.06
  // How tall the hair actually stands, buns and mohawks included. Measuring
  // only the crown left a sunhat sitting on the skull with the top bun
  // sticking out through it.
  const standing = g.hair.crown
    + (g.hair.bun === 'top' || g.hair.bun === 'double' ? 0.6 : 0)
    + (g.hair.mohawk ? 0.9 : 0)
  const lift = sitsOn
    ? Math.min(b.headRy * 0.5, b.headRy * (0.06 + standing * 0.42))
    : 0
  // Headwear sits on the skull, and the turn has moved it. Anchoring to the
  // nominal centre left hats floating beside the head.
  const hc = s.headCentre
  const topY = hc.y - b.headRy - lift
  const shading = ellipsoidShade(hc.x, topY + 14, b.headRx * 1.1, b.headRy * 0.7, s.lx, s.ly, 1.2)

  const cw = b.headRx * h.crownW
  // Deep enough to reach from where it is seated back up over the hair, or the
  // hat is a brim with a pancake on it floating clear of the head, with the
  // bun poking out underneath. `topY` already carries the lift, so the depth
  // is measured from the seat only — adding the lift again here pushed the
  // whole hat a second lift clear of the head and off the top of the frame.
  const ch = Math.min(
    // However tall the roll and the hair make it, a crown taller than this
    // stops being headwear and becomes the whole picture.
    b.headRy * 0.62,
    Math.max(b.headRy * h.crownH, sitsOn ? b.headRy * h.seat * 1.05 : 0),
  )
  // The line the crown sits on, and the line it rises from — pushed back down
  // if a tall hat on tall hair would otherwise run off the top of the picture.
  const wantSeatY = topY + b.headRy * h.seat
  // How far the brim reaches sideways, capped so the widest ones stay on the
  // page rather than running off both edges of the frame.
  const brimR = h.brim > 0.02
    ? b.headRx * Math.min(ART.w * 0.42 / b.headRx, h.crownW * 0.98 + h.brim)
    : 0
  const reachUp = Math.max(
    ch + (h.peaks > 0 ? b.headRy * h.peakH : 0),
    // A tilted brim reaches higher than the crown does, and it is measured
    // across the brim's own half-width, which is far wider than the crown's.
    h.brim > 0.02 ? b.headRy * h.brimDrop * 1.3 + Math.abs(h.brimAngle) * brimR : 0,
  )
  // The margin has to clear the slouch wobble too, or the crown ends up
  // touching the top edge of the frame.
  const margin = 14 + h.slouch * ch
  const seatY = wantSeatY + Math.max(0, margin - (wantSeatY - reachUp))
  // Which way a one-sided brim points is its own roll, not a consequence of
  // how the hat is tilted — tying the two made half the caps on a sheet the
  // mirror image of the other half and nothing else.
  const dir = h.brimSide

  const body = (region: Pt[], alpha = 0.12, smooth = true): void => {
    s.addOccluder('extras', region)
    // Headwear is opaque cloth. Without a base the hair reads straight through
    // it and the hat looks like a ghost. Opaque *within its own layer* too:
    // occlusion removes what is behind the extras layer, but the crown, the
    // brim and the band all live in that layer, and translucent pigment let
    // each show through the others.
    p.base(region, ground(col), 0.96, smooth)
    p.hatch(region, {
      color: col, alpha, spacing: 2.4, angle: 0.7 + tilt, layers: 2, layerTurn: 26,
      lane: 3000, pressure: (x, y) => 0.45 + shading(x, y) * 0.8,
    })
    p.contour(region, { color: ink, alpha: 0.14, width: 1.35, passes: 2, wobble: 0.7, optional: true, lane: 3004 })
  }

  /* ------------------------------------------------------------ the crown */

  // Walked as an arc from the left seat, over the top, to the right seat. The
  // superellipse exponent gives the profile, `taper` narrows or flares it with
  // height, `lean` pushes the mass to one side, and `peaks` cuts points into
  // the top edge — which is how a coronet is the same shape as a beanie with
  // different numbers rather than a different drawing.
  const sharpPeaks = h.peaks > 0 && h.peakSharp > 0.45
  const steps = h.peaks > 0 ? Math.max(48, h.peaks * 14) : 44
  const inv = 2 / h.crownN
  const crown: Pt[] = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const ang = Math.PI + t * Math.PI
    const ct = Math.cos(ang)
    const st = Math.sin(ang)
    const sx = Math.sign(ct) * Math.abs(ct) ** inv
    // Negative over the top of the arc; `up` runs 0 at the seat to 1 at the peak.
    const sy = Math.sign(st) * Math.abs(st) ** inv
    const up = -sy
    let x = hc.x + sx * cw * (1 + (h.taper - 1) * up) + h.lean * cw * up + tilt * ch * up * 0.5
    let y = seatY - up * ch
    if (h.peaks > 0) {
      const phase = t * h.peaks
      const f = phase - Math.floor(phase)
      const tri = 1 - Math.abs(f * 2 - 1)
      y -= b.headRy * h.peakH * tri ** (0.6 + h.peakSharp * 2.4)
    }
    if (h.dent > 0.02) {
      // A crease pressed into the top of the crown. Two hats of the same
      // height read as different hats when one of them is dented and the
      // other is not.
      const near = Math.exp(-(((x - hc.x) / (cw * 0.42)) ** 2))
      y += h.dent * ch * near * up
    }
    // Soft cloth wanders; stiff felt does not.
    const wob = p.noise.at1(t * h.lumps * 4 + 17.3, 3) * h.slouch
    x += wob * cw * 0.5
    y += wob * ch * 0.4
    crown.push({ x, y })
  }
  // Close along the seat, dipping at the temples because the band wraps a
  // round head — a straight closing edge reads as a paper strip lying on top.
  for (let i = steps; i >= 0; i--) {
    const t = i / steps
    const ct = Math.cos(Math.PI + t * Math.PI)
    const u = Math.sign(ct) * Math.abs(ct) ** inv
    // Deep enough to read as cloth wrapping a round head — but never deeper
    // than the hat is tall, or a headband curves down over the eyebrows
    // instead of sitting across the forehead.
    const dip = Math.min(ch * 1.15, u * u * b.headRy * 0.34 * h.crownW)
    crown.push({ x: hc.x + u * cw, y: seatY + dip })
  }

  /* ------------------------------------------------------------- the brim */

  let brimRegion: Pt[] | null = null
  if (h.brim > 0.02) {
    const peakDir = dir > 0 ? 0 : Math.PI
    const pts: Pt[] = []
    const n = 52
    const maxR = brimR / b.headRx
    const binv = 2 / h.brimN
    const ba = Math.cos(h.brimAngle)
    const bb = Math.sin(h.brimAngle)
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2
      // Full reach on the peak side, falling to `brimWrap` behind — one number
      // covering everything from a cap's single peak to a sunhat's full disc.
      const front = Math.max(0, Math.cos(a - peakDir))
      const r = Math.min(
        maxR,
        h.crownW * 0.98 + h.brim * (h.brimWrap + (1 - h.brimWrap) * front),
      )
      const wob = p.noise.at1(i * 0.5 + 41.7, 5) * h.slouch * 0.6
      // The outline's own exponent: a round disc at 2, a squared-off plank
      // above 4. A brim is as much a shape as the crown is.
      const ca = Math.cos(a)
      const sa = Math.sin(a)
      const sx = Math.sign(ca) * Math.abs(ca) ** binv
      const sy = Math.sign(sa) * Math.abs(sa) ** binv
      const px = sx * b.headRx * (r + wob)
      // The droop: the near edge of the brim falls, the far edge rises.
      const py = sy * b.headRy * (h.brimDrop + h.brimCurl * 0.25 * sa) + b.headRy * 0.04
      // Worn up, level, or pulled down over the eyes.
      pts.push({ x: hc.x + px * ba - py * bb, y: seatY + px * bb + py * ba })
    }
    brimRegion = pts
  }

  // The brim goes down first so the crown overlaps it, which is what stops the
  // join reading as two shapes butted together.
  if (brimRegion) {
    s.addOccluder('extras', brimRegion)
    p.base(brimRegion, ground(col), 0.96)
    p.hatch(brimRegion, {
      color: shade(col, 0.78), alpha: 0.13, spacing: 2.3, angle: 0.25 + tilt,
      layers: 2, layerTurn: 38, lane: 3022,
      pressure: (_x, y) => clamp(0.32 + Math.abs(y - seatY) / Math.max(4, b.headRy * h.brimDrop), 0, 1.1),
    })
    p.contour(brimRegion, { color: ink, alpha: 0.14, width: 1.35, passes: 2, wobble: 1, lane: 3024 })
  }

  s.hatRegion = crown
  body(crown, 0.12, !sharpPeaks)

  if (h.dent > 0.06) {
    p.stroke([
      { x: hc.x - cw * 0.34, y: seatY - ch * (1 - h.dent * 0.85) },
      { x: hc.x + h.lean * cw * 0.4, y: seatY - ch * (1 - h.dent) },
      { x: hc.x + cw * 0.34, y: seatY - ch * (1 - h.dent * 0.85) },
    ], { color: shade(col, 0.55), alpha: 0.16, width: 1.3, passes: 1, wobble: 0.8, taper: 0.7, lane: 3060 })
  }

  /* ------------------------------------------------- cuff, band and seams */

  // A turn-up cuff is a knitted-hat feature; under a brim it is just a second
  // band of cloth doing nothing.
  if (h.cuff > 0.02 && h.brim < 0.06) {
    const cy0 = seatY - b.headRy * h.cuff
    const cuff: Pt[] = [
      { x: hc.x - cw * 1.01, y: cy0 },
      { x: hc.x + cw * 1.01, y: cy0 },
      { x: hc.x + cw * 0.99, y: seatY + b.headRy * 0.1 },
      { x: hc.x - cw * 0.99, y: seatY + b.headRy * 0.1 },
    ]
    p.base(cuff, ground(col, 1.1), 0.96)
    p.hatch(cuff, { color: tint(col, 0.8), alpha: 0.14, spacing: 2, angle: 1.5, layers: 2, lane: 3008 })
    p.contour(cuff, { color: ink, alpha: 0.14, width: 1.3, passes: 1, lane: 3010 })
  }

  if (h.band > 0.02) {
    // The band is a ring round the crown, so from the front it bows *down*,
    // and it has to stay inside the crown it is wrapping. Arcing it upward
    // over a shallow hat drew a handle standing clear of the shape.
    const by = seatY - ch * clamp(h.bandY, 0, 0.55) - b.headRy * 0.02
    p.stroke(
      arc(hc.x, by, cw * 0.95, Math.min(b.headRy * 0.1, ch * 0.3), 0.2, Math.PI - 0.2, 16),
      {
        color: g.palette.accent, alpha: 0.22,
        width: clamp(ch * h.band, 3, ch * 0.5), passes: 1, wobble: 0.5, lane: 3026,
      },
    )
  }

  for (let i = 0; i < h.seams; i++) {
    const u = ((i + 1) / (h.seams + 1)) * 2 - 1
    const x0 = hc.x + u * cw * 0.9
    p.stroke([
      { x: hc.x + u * cw * h.taper * 0.55 + h.lean * cw, y: seatY - ch * 0.94 },
      { x: x0, y: seatY - ch * 0.05 },
    ], { color: shade(col, 0.6), alpha: 0.13, width: 1.1, passes: 1, wobble: 0.8, taper: 0.7, lane: 3040 + i })
  }

  /* -------------------------------------------------------------- the trim */

  // One decorative extra, placed by angle round the crown, sized by its own
  // scale. Rolled independently of the family, so a bobble can turn up on a
  // sunhat and a feather on a beanie.
  const ta = h.trimAngle
  const tx = hc.x + Math.cos(ta) * cw * 0.82 + h.lean * cw * 0.4
  const ty = seatY - ch * (0.5 + 0.5 * Math.max(0, -Math.sin(ta)))
  const ts = h.trimScale
  switch (h.trim) {
    case 'bobble': {
      const bob = arc(hc.x + h.lean * cw + tilt * 18, seatY - ch - 4 * ts, 7 * ts, 6.4 * ts, 0, Math.PI * 2, 16)
      p.hatch(bob, { color: g.palette.accent, alpha: 0.14, spacing: 2, angle: 0.4, layers: 2, lane: 3012 })
      p.contour(bob, { color: ink, alpha: 0.13, width: 1.2, passes: 1, wobble: 1.8, lane: 3014 })
      break
    }
    case 'feather': {
      const len = ch * 1.5 * ts
      const spine = quad(
        { x: tx, y: ty },
        { x: tx + dir * len * 0.5, y: ty - len * 0.8 },
        { x: tx + dir * len * 1.15, y: ty - len * 0.5 }, 12,
      )
      p.stroke(spine, { color: g.palette.accent, alpha: 0.26, width: 2.4 * ts, passes: 2, wobble: 0.7, taper: 0.85, lane: 3042 })
      for (let i = 2; i < spine.length - 1; i += 2) {
        const q = spine[i]!
        p.stroke([q, { x: q.x - dir * 4 * ts, y: q.y + 5 * ts }], {
          color: g.palette.accent, alpha: 0.16, width: 1, passes: 1, taper: 0.8, lane: 3044 + i,
        })
      }
      break
    }
    case 'pin': {
      const pin = [
        { x: tx, y: ty - 5 * ts }, { x: tx + 4 * ts, y: ty },
        { x: tx, y: ty + 5 * ts }, { x: tx - 4 * ts, y: ty },
      ]
      p.base(pin, ground(g.palette.accent), 0.9, false)
      p.contour(pin, { color: ink, alpha: 0.2, width: 1.2, passes: 1, lane: 3046 })
      break
    }
    case 'stud':
      p.stroke(arc(tx, ty, 3 * ts, 3 * ts, 0, Math.PI * 2, 10), {
        color: g.palette.accent, alpha: 0.34, width: 2.4, passes: 2, lane: 3048,
      })
      break
    case 'knot': {
      const kx = hc.x + dir * cw * 0.95
      const ky = seatY - ch * 0.12
      const knot = arc(kx, ky, 6 * ts, 5 * ts, 0, Math.PI * 2, 12)
      p.hatch(knot, { color: col, alpha: 0.14, spacing: 2, angle: 0.9, layers: 1, lane: 3032 })
      p.contour(knot, { color: ink, alpha: 0.13, width: 1.2, passes: 1, wobble: 1.4, lane: 3034 })
      // Two tails falling from it.
      for (const sgn of [-1, 1]) {
        p.stroke(quad(
          { x: kx, y: ky },
          { x: kx + dir * 6 * ts, y: ky + 10 * ts + sgn * 3 },
          { x: kx + dir * (10 + sgn * 5) * ts, y: ky + 18 * ts }, 8,
        ), { color: col, alpha: 0.2, width: 3 * ts, passes: 1, wobble: 0.9, taper: 0.8, lane: 3050 + sgn })
      }
      break
    }
    case 'tassel': {
      const kx = hc.x + dir * cw * 0.9
      const ky = seatY - ch * 0.4
      for (let i = 0; i < 5; i++) {
        const off = (i - 2) * 1.7 * ts
        p.stroke([{ x: kx, y: ky }, { x: kx + off + dir * 3, y: ky + 16 * ts }], {
          color: g.palette.accent, alpha: 0.2, width: 1.4, passes: 1, wobble: 1.2, taper: 0.7, lane: 3054 + i,
        })
      }
      break
    }
    case 'jewels': {
      const n = Math.max(2, Math.min(5, h.peaks > 0 ? h.peaks - 2 : 3))
      for (let i = 0; i < n; i++) {
        const u = n === 1 ? 0 : (i / (n - 1)) * 2 - 1
        const jx = hc.x + u * cw * 0.62
        p.stroke(arc(jx, seatY - ch * 0.35 + u * u * b.headRy * 0.08, 2.6 * ts, 2.6 * ts, 0, Math.PI * 2, 9), {
          color: g.palette.accent, alpha: 0.32, width: 2, passes: 2, lane: 3036 + i,
        })
      }
      break
    }
    default:
      break
  }
}

/* ---------------------------------------------------------------- eyewear */

/**
 * One lens outline, built from the spec.
 *
 * Round, square, half-moon, cat-eye and goggle are the same superellipse at
 * different exponents and aspects, with an optional flick at the outer top
 * corner and an optional cut across the top. They were five fixed point lists,
 * which is why every pair of round glasses on a sheet was the same pair.
 */
function lensRegion(sp: GlassesSpec, cx: number, cy: number, r: number, side: -1 | 1): Pt[] {
  const inv = 2 / sp.lensN
  const steps = 26
  const out: Pt[] = []
  const cutY = -sp.lensH * r * (1 - sp.halfCut)
  const ct = Math.cos(sp.lensTilt)
  const st = Math.sin(sp.lensTilt)
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2
    const ca = Math.cos(a)
    const sa = Math.sin(a)
    const sx = Math.sign(ca) * Math.abs(ca) ** inv
    const sy = Math.sign(sa) * Math.abs(sa) ** inv
    let x = sx * sp.lensW * r
    let y = sy * sp.lensH * r
    if (sp.flick > 0.01) {
      // Lifted at the outer top corner only, which is the whole of a cat-eye.
      const up = Math.max(0, -sy)
      const outward = Math.max(0, sx * side)
      const k = up * outward ** 1.4
      y -= sp.flick * r * k
      x += side * sp.flick * r * 0.7 * k
    }
    // The half-moon: everything above the cut line is flattened onto it.
    if (sp.halfCut > 0.02 && y < cutY) y = cutY
    out.push({ x: cx + x * ct - y * st, y: cy + x * st + y * ct })
  }
  return out
}

function drawGlasses(s: Scene): void {
  const { p, g } = s
  const sp = g.extras.glassesSpec
  if (g.extras.glasses === 'none') return
  const f = g.face
  const b = g.build
  // Glasses are one of only two things the reference outlines at all, and they
  // are nearly black. They earn the keyline.
  const ink = g.palette.keyline
  const r = f.eyeR

  const sides: (-1 | 1)[] = sp.pair ? [-1, 1] : [g.face.gazeX >= 0 ? 1 : -1]
  const half = f.eyeSpacing + sp.spread * r
  for (const side of sides) {
    const cx = b.cx + side * half
    const cy = f.eyeY + (side > 0 ? f.asym.eyeDY : 0)
    const region = lensRegion(sp, cx, cy, r, side)
    // A lens is glass: a couple of faint strokes, never a fill.
    p.hatch(region, {
      color: hsl(200, 18, 76), alpha: 0.035 + sp.tint * 0.09, spacing: 3.4,
      angle: -0.7, layers: 1, gaps: 0.4, lane: 3100,
    })
    // A fat, closed, near-black frame is the single loudest graphic in the
    // reference. Two translucent passes produced a woolly grey double-line
    // instead, so the frame is now laid as an opaque band: the lens outline
    // offset outward and inward, filled as one ring.
    const frameW = sp.frameW * (p.hand.construction > 0.5 ? 1 : 0.8)
    const c0 = centroid(region)
    const offsetBy = (k: number): Pt[] => region.map((q) => {
      const dx = q.x - c0.x
      const dy = q.y - c0.y
      const len = Math.hypot(dx, dy) || 1
      return { x: q.x + (dx / len) * k, y: q.y + (dy / len) * k }
    })
    p.accentRing(offsetBy(frameW), offsetBy(-frameW), ink, 0.86)
    // Highlight streak — a gap left in the tone plus one bright stroke.
    p.stroke([{ x: cx - r * 0.7, y: cy + r * 0.35 }, { x: cx - r * 0.1, y: cy - r * 0.55 }], {
      color: hsl(200, 20, 92), alpha: 0.2, width: 1.6, passes: 1, taper: 0.8, lane: 3108 + side,
    })
  }

  if (!sp.pair) {
    const side = sides[0]!
    const cx = b.cx + side * half
    p.stroke(
      quad({ x: cx + side * r * sp.lensW, y: f.eyeY + r * 0.6 },
        { x: cx + side * r * 2.4, y: f.eyeY + r * 3 },
        { x: b.cx + side * b.neckW * 1.2, y: b.neckY + 12 }, 14),
      { color: ink, alpha: 0.16, width: 1.1, passes: 1, wobble: 1, lane: 3112 },
    )
    return
  }

  // The bridge. Its height and sag are what separate a flat bar from a
  // keyhole, and both are per-character.
  const bx = half - r * sp.lensW * 0.92
  const by = f.eyeY + r * sp.bridgeY
  const bridge = sp.bridgeSag > 0.02
    ? quad({ x: b.cx - bx, y: by }, { x: b.cx, y: by + r * sp.bridgeSag * 2 }, { x: b.cx + bx, y: by }, 10)
    : [{ x: b.cx - bx, y: by }, { x: b.cx + bx, y: by }]
  const bridgeW = Math.max(1.2, sp.frameW * 0.95)
  p.stroke(bridge, { color: ink, alpha: 0.34, width: bridgeW, passes: 1, wobble: 0.3, lane: 3116 })
  p.accentStroke(bridge, ink, bridgeW * 1.2, 0.8)

  if (sp.strap) {
    // A strap round the head instead of arms. It passes *behind* the skull, so
    // what shows is a short band either side running out to the silhouette —
    // arcing it across the front drew a chinstrap over the cheeks.
    for (const side of [-1, 1] as const) {
      p.stroke(
        [{ x: b.cx + side * (half + r * sp.lensW * 0.9), y: f.eyeY - r * 0.15 },
          { x: b.cx + side * b.headRx * 1.03, y: f.eyeY - r * 0.4 }],
        {
          color: shade(g.palette.garmentAlt, 1.2), alpha: 0.24,
          width: sp.frameW * 1.6, passes: 1, wobble: 0.5, lane: 3122 + side,
        },
      )
    }
  } else {
    // Arms, disappearing behind the head.
    for (const side of [-1, 1] as const) {
      p.stroke(
        [{ x: b.cx + side * (half + r * sp.lensW), y: f.eyeY - r * 0.3 },
          { x: b.cx + side * b.headRx * 1.02, y: f.eyeY - r * 0.1 }],
        { color: ink, alpha: 0.18, width: Math.max(1, sp.frameW * 0.7), passes: 1, taper: 0.5, lane: 3120 + side },
      )
    }
  }
}

/* -------------------------------------------------------------- jewellery */

function drawJewellery(s: Scene): void {
  const { p, g } = s
  const b = g.build
  const f = g.face

  if (g.extras.earring) {
    const side = p.rng.sign()
    const x = b.cx + side * b.headRx * 0.97
    const y = f.eyeY + b.headRy * 0.2
    p.stroke(arc(x, y, 2.6, 3, 0, Math.PI * 2, 10), {
      color: g.palette.accent, alpha: 0.34, width: 1.8, passes: 2, lane: 3200,
    })
  }

  if (g.extras.necklace) {
    p.stroke(
      quad({ x: b.cx - b.neckW * 1.05, y: b.neckY - 4 },
        { x: b.cx, y: b.neckY + 14 },
        { x: b.cx + b.neckW * 1.05, y: b.neckY - 4 }, 14),
      { color: g.palette.accent, alpha: 0.24, width: 1.4, passes: 2, wobble: 0.4, lane: 3204 },
    )
  }

  if (g.extras.pin) {
    // A small charm, worn where a thumb can reach it.
    const x = b.cx - b.neckW * 1.3
    const y = b.neckY + 20
    p.stroke(arc(x, y, 3.2, 3.6, 0, Math.PI * 2, 10), {
      color: g.palette.accent, alpha: 0.32, width: 1.8, passes: 2, wobble: 0.5, lane: 3208,
    })
    p.stroke([{ x, y: y - 3.6 }, { x: x + 1, y: y - 8 }], {
      color: adjust(g.palette.ink, 10), alpha: 0.2, width: 1.1, passes: 1, lane: 3210,
    })
  }
}

/* ------------------------------------------------------------ quirk props */

type QuirkDrawer = (s: Scene, k: number) => void

/** A pencil, tucked where a working person actually tucks one. */
function pencilAt(p: Pencil, g: Genome, side: -1 | 1, k: number, lane: number): void {
  const b = g.build
  const x = b.cx + side * b.headRx * 0.96
  const y = g.face.eyeY + b.headRy * 0.02
  const len = 16 + k * 8
  const a = side > 0 ? -0.5 : Math.PI + 0.5
  const tipX = x + Math.cos(a) * len
  const tipY = y + Math.sin(a) * len
  const nx = -Math.sin(a) * 2.1
  const ny = Math.cos(a) * 2.1
  const body: Pt[] = [
    { x: x + nx, y: y + ny }, { x: tipX + nx * 0.4, y: tipY + ny * 0.4 },
    { x: tipX - nx * 0.4, y: tipY - ny * 0.4 }, { x: x - nx, y: y - ny },
  ]
  p.hatch(body, { color: hsl(45, 62, 55), alpha: 0.16, spacing: 1.8, angle: a + 1.5, layers: 2, lane })
  p.contour(body, { color: adjust(g.palette.ink, 4), alpha: 0.2, width: 1.2, passes: 1, lane: lane + 2 })
  // Sharpened end.
  p.stroke([{ x: tipX, y: tipY }, { x: tipX + Math.cos(a) * 4, y: tipY + Math.sin(a) * 4 }], {
    color: hsl(28, 30, 34), alpha: 0.3, width: 2, passes: 1, taper: 0.6, lane: lane + 4,
  })
}

/**
 * Shift a prop's own colour per character.
 *
 * The props carried literal `hsl()` values, so every flower on a sheet had the
 * same yellow centre and every snail the same shell. A quirk exists to make a
 * character memorable; two identical ones undo that.
 */
function propCol(p: Pencil, h: number, sat: number, l: number): Hsl {
  return hsl(
    h + p.rng.gauss(0, 10),
    clamp(sat + p.rng.gauss(0, 9), 8, 92),
    clamp(l + p.rng.gauss(0, 7), 12, 92),
  )
}

const QUIRK_DRAWERS: Record<string, QuirkDrawer> = {
  pencil: (s, k) => pencilAt(s.p, s.g, s.p.rng.sign() as -1 | 1, k, 3300),
  'two-pencils': (s, k) => {
    pencilAt(s.p, s.g, -1, k, 3300)
    pencilAt(s.p, s.g, 1, k, 3320)
  },

  flower: (s, k) => {
    const { p, g } = s
    const b = g.build
    const rng = p.rng
    const side = rng.sign()
    const x = b.cx + side * b.headRx * rng.range(0.86, 1.02)
    const y = g.face.eyeY - b.headRy * rng.range(0.02, 0.3)
    const r = (3.4 + k * 3) * rng.range(0.8, 1.25)
    // Petal count, shape and twist are the flower. Six identical round petals
    // on every one of them was the same drawing at different sizes.
    const petals = rng.int(4, 9)
    const petalRx = r * rng.range(0.46, 0.8)
    const petalRy = petalRx * rng.range(0.55, 1.15)
    const twist = rng.range(0, Math.PI * 2)
    const reach = r * rng.range(0.75, 1.2)
    for (let i = 0; i < petals; i++) {
      const a = twist + (i / petals) * Math.PI * 2
      const petal = arc(x + Math.cos(a) * reach, y + Math.sin(a) * reach, petalRx, petalRy, 0, Math.PI * 2, 10)
      p.hatch(petal, { color: g.palette.accent, alpha: 0.13, spacing: 1.8, angle: a, layers: 1, lane: 3340 + i })
      p.contour(petal, { color: shade(g.palette.accent, 1.4), alpha: 0.12, width: 1, passes: 1, lane: 3346 + i })
    }
    const eye = r * rng.range(0.34, 0.66)
    p.stroke(arc(x, y, eye, eye, 0, Math.PI * 2, 8), {
      color: propCol(p, 48, 70, 56), alpha: 0.3, width: 2, passes: 2, lane: 3352,
    })
  },

  leaf: (s, k) => {
    const { p, g } = s
    const b = g.build
    const rng = p.rng
    const side = rng.sign()
    const x = b.cx + side * b.headRx * rng.range(0.4, 0.72)
    const y = b.cy - b.headRy * (0.85 + g.hair.crown * 0.3) * rng.range(0.94, 1.06)
    const len = (8 + k * 8) * rng.range(0.75, 1.3)
    const a = rng.range(-1.1, -0.2) * side
    // How far out the widest point sits, and how broad it is, is the
    // difference between a willow leaf and a lily pad.
    const belly = rng.range(0.35, 0.72)
    const wide = rng.range(0.3, 0.75)
    const lp: Pt[] = [
      { x, y },
      { x: x + Math.cos(a - wide) * len * belly, y: y + Math.sin(a - wide) * len * belly },
      { x: x + Math.cos(a) * len, y: y + Math.sin(a) * len },
      { x: x + Math.cos(a + wide) * len * belly, y: y + Math.sin(a + wide) * len * belly },
    ]
    const col = propCol(p, 105, 40, 48)
    p.hatch(lp, { color: col, alpha: 0.15, spacing: 1.8, angle: a, layers: 2, lane: 3360 })
    p.contour(lp, { color: shade(col, 1.6), alpha: 0.16, width: 1.1, passes: 1, lane: 3364 })
  },

  sprout: (s, k) => {
    const { p, g } = s
    const b = g.build
    const rng = p.rng
    const x = b.cx + rng.gauss(0, 6)
    const y = b.cy - b.headRy * (1 + g.hair.crown * 0.5)
    const h = (8 + k * 16) * rng.range(0.7, 1.35)
    const lean = rng.gauss(0, 4)
    const stem = propCol(p, 110, 42, 42)
    p.stroke(quad({ x, y }, { x: x + lean, y: y - h * 0.6 }, { x: x + lean * 0.4, y: y - h }, 10), {
      color: stem, alpha: 0.26, width: 1.6, passes: 2, wobble: 0.4, lane: 3370,
    })
    // One leaf or two, at their own size and droop — a fixed symmetric pair
    // made every sprout the same sprout.
    const pair = rng.bool(0.72)
    const lw = rng.range(4.5, 9)
    const droop = rng.range(-5, 3)
    const col = propCol(p, 112, 44, 50)
    for (const sd of (pair ? [-1, 1] : [rng.sign()]) as readonly (-1 | 1)[]) {
      const lx = x + lean * 0.4 + sd
      const ly = y - h + 2
      const leaf = [
        { x: lx, y: ly },
        { x: lx + sd * lw * 0.66, y: ly - 4 + droop },
        { x: lx + sd * lw, y: ly + 1 + droop },
        { x: lx + sd * lw * 0.44, y: ly + 3 },
      ]
      p.hatch(leaf, { color: col, alpha: 0.16, spacing: 1.6, angle: 0.4, layers: 1, lane: 3374 + sd })
      p.contour(leaf, { color: shade(col, 1.6), alpha: 0.15, width: 1, passes: 1, lane: 3378 + sd })
    }
  },

  snail: (s, k) => {
    const { p, g } = s
    const b = g.build
    const rng = p.rng
    const side = rng.sign()
    const x = b.cx + side * b.shoulderW * rng.range(0.62, 0.82)
    const y = b.shoulderY + rng.range(8, 26)
    const r = (5 + k * 4) * rng.range(0.8, 1.25)
    // How many turns the shell has, and how fast it closes, is the snail.
    const turns = rng.range(2.4, 5.4)
    const close = rng.range(0.7, 0.93)
    const tilt = rng.gauss(0, 0.5)
    const shell = propCol(p, 32, 44, 44)
    const spiral: Pt[] = []
    const steps = Math.round(10 * turns)
    for (let i = 0; i <= steps; i++) {
      const t = i / steps
      const a = tilt + t * Math.PI * turns
      const rr = r * (1 - t * close)
      spiral.push({ x: x + Math.cos(a) * rr, y: y - r * 0.2 + Math.sin(a) * rr })
    }
    p.stroke(spiral, { color: shell, alpha: 0.24, width: 1.4, passes: 2, wobble: 0.3, lane: 3390 })
    const foot = rng.range(1.2, 2.1)
    const bodyPts = [
      { x: x - r * foot, y: y + r * 0.7 }, { x: x + r * 0.9, y: y + r * 0.6 },
      { x: x + r * 0.6, y: y + r }, { x: x - r * (foot + 0.2), y: y + r * 1.05 },
    ]
    const flesh = propCol(p, 38, 26, 66)
    p.hatch(bodyPts, { color: flesh, alpha: 0.14, spacing: 1.6, angle: 0.2, layers: 1, lane: 3394 })
    p.contour(bodyPts, { color: shade(flesh, 1.7), alpha: 0.16, width: 1.1, passes: 1, lane: 3396 })
    const horn = rng.range(0.3, 1)
    const spread = rng.range(0.2, 0.9)
    for (const dx of [-spread * 0.5, -spread]) {
      p.stroke([{ x: x - r * foot, y: y + r * 0.7 }, { x: x - r * (foot - dx), y: y - r * horn }], {
        color: shade(flesh, 1.7), alpha: 0.2, width: 1, passes: 1, taper: 0.5, lane: 3398,
      })
    }
  },

  bird: (s, k) => {
    const { p, g } = s
    const b = g.build
    const rng = p.rng
    const side = rng.sign()
    const x = b.cx + side * b.shoulderW * rng.range(0.64, 0.84)
    const y = b.shoulderY + rng.range(0, 14)
    const r = (5 + k * 4) * rng.range(0.8, 1.3)
    // Body aspect, neck length and head size separate a wren from a pigeon.
    const plump = rng.range(0.85, 1.4)
    const neck = rng.range(1.7, 2.5)
    const headR = r * rng.range(0.5, 0.78)
    const bodyPts = blob(x, y - r, r * 1.1 * plump, r * 1.25 / plump ** 0.5, p.noise, {
      wobble: 0.1, lumps: 2, lane: 141, steps: 18,
    })
    p.hatch(bodyPts, { color: g.palette.accent, alpha: 0.15, spacing: 1.7, angle: 0.9, layers: 2, lane: 3400 })
    p.contour(bodyPts, { color: shade(g.palette.accent, 1.6), alpha: 0.16, width: 1.1, passes: 1, lane: 3404 })
    const hx = x - side * r * rng.range(0.3, 0.75)
    const hy = y - r * neck
    const head = arc(hx, hy, headR, headR, 0, Math.PI * 2, 12)
    p.hatch(head, { color: g.palette.accent, alpha: 0.15, spacing: 1.5, angle: 0.5, layers: 1, lane: 3406 })
    p.contour(head, { color: shade(g.palette.accent, 1.6), alpha: 0.15, width: 1, passes: 1, lane: 3408 })
    const beak = r * rng.range(0.4, 1)
    p.stroke([{ x: hx - side * headR, y: hy }, { x: hx - side * (headR + beak), y: hy + rng.gauss(0, 1.2) }], {
      color: propCol(p, 38, 68, 52), alpha: 0.3, width: 1.6, passes: 1, taper: 0.4, lane: 3410,
    })
  },

  moth: (s, k) => {
    const { p, g } = s
    const b = g.build
    const rng = p.rng
    const x = b.cx + rng.gauss(0, 1) + rng.sign() * b.headRx * rng.range(1.1, 1.45)
    const y = b.cy - b.headRy * rng.range(0.3, 0.9)
    const r = (4 + k * 3.5) * rng.range(0.8, 1.3)
    const span = rng.range(0.5, 1.1)
    const wingRy = r * rng.range(0.5, 0.95)
    const swept = rng.range(0.1, 0.8)
    const col = propCol(p, 38, 18, 64)
    for (const side of [-1, 1] as const) {
      const wing = blob(x + side * r * span, y, r, wingRy, p.noise, {
        wobble: 0.14, lumps: 2, lane: 142 + side, steps: 16,
      })
      p.hatch(wing, { color: col, alpha: 0.12, spacing: 1.6, angle: swept * side, layers: 1, lane: 3420 + side })
      p.contour(wing, { color: shade(col, 1.8), alpha: 0.14, width: 1, passes: 1, lane: 3424 + side })
    }
    p.stroke([{ x, y: y - r * 0.5 }, { x, y: y + r * rng.range(0.4, 1.1) }], {
      color: shade(col, 2), alpha: 0.24, width: 1.6, passes: 1, lane: 3428,
    })
  },

  bubble: (s, k) => {
    const { p, g } = s
    const b = g.build
    const rng = p.rng
    const n = rng.int(1, 3)
    const col = propCol(p, 195, 34, 68)
    for (let i = 0; i < n; i++) {
      const x = b.cx + rng.sign() * b.headRx * rng.range(1.02, 1.55)
      const y = b.cy - b.headRy * rng.range(0.1, 0.9)
      const r = (5 + k * 7) * rng.range(0.5, 1.2) * (i === 0 ? 1 : 0.6)
      p.stroke(arc(x, y, r, r * rng.range(0.85, 1.15), 0, Math.PI * 2, 24), {
        color: col, alpha: 0.2, width: 1.2, passes: 2, wobble: 0.3, gaps: 0.3, lane: 3440 + i * 3,
      })
      const ha = rng.range(0.9, 1.6) * Math.PI
      p.stroke(arc(x, y, r * 0.62, r * 0.62, ha, ha + rng.range(0.3, 0.7), 8), {
        color: tint(col, 1.5), alpha: 0.3, width: 1.6, passes: 1, taper: 0.8, lane: 3444 + i * 3,
      })
    }
  },

  steam: (s, k) => {
    const { p, g } = s
    const b = g.build
    const rng = p.rng
    const side = rng.sign()
    const x = b.cx + side * b.shoulderW * rng.range(0.75, 0.95)
    const y = b.shoulderY + rng.range(36, 58)
    const h = (30 + k * 30) * rng.range(0.7, 1.3)
    // Wisp count, how tightly each curls and how far it drifts sideways —
    // three identical sine waves read as a graph, not as steam.
    const wisps = rng.int(2, 5)
    const freq = rng.range(3, 7)
    const drift = rng.range(2, 9)
    const col = propCol(p, 200, 12, 74)
    for (let i = 0; i < wisps; i++) {
      const phase = rng.range(0, Math.PI * 2)
      const pts: Pt[] = []
      for (let j = 0; j <= 10; j++) {
        const t = j / 10
        pts.push({ x: x + Math.sin(t * freq + phase) * (4 + t * drift), y: y - t * h * rng.range(0.98, 1.02) })
      }
      p.stroke(pts, {
        color: col, alpha: 0.11, width: rng.range(1.8, 3.2), passes: 1,
        wobble: 1, gaps: 0.34, taper: 0.9, lane: 3460 + i,
      })
    }
  },

  star: (s, k) => {
    const { p, g } = s
    const b = g.build
    const rng = p.rng
    const count = 1 + Math.round(k * 2)
    // Arm count and length asymmetry, rolled once so the cluster is one hand's
    // stars rather than a stamp repeated.
    const arms = rng.int(4, 8)
    const twist = rng.range(0, Math.PI)
    const asym = rng.range(0, 0.45)
    for (let i = 0; i < count; i++) {
      const a = -Math.PI * rng.range(0.2, 0.9)
      const d = b.headRx * rng.range(1.15, 1.5)
      const x = b.cx + Math.cos(a) * d
      const y = b.cy + Math.sin(a) * d
      const r = (3.5 + k * 3) * rng.range(0.7, 1.3)
      for (let arm = 0; arm < arms; arm++) {
        const aa = twist + (arm / arms) * Math.PI * 2
        const len = r * (1 - asym * (arm % 2))
        p.stroke(
          [{ x: x - Math.cos(aa) * len, y: y - Math.sin(aa) * len },
            { x: x + Math.cos(aa) * len, y: y + Math.sin(aa) * len }],
          { color: g.palette.accent, alpha: 0.26, width: 1.4, passes: 1, taper: 0.9, lane: 3480 + i * 8 + arm },
        )
      }
    }
  },

  halo: (s, k) => {
    const { p, g } = s
    const b = g.build
    const rng = p.rng
    const y = b.cy - b.headRy * (1.2 + g.hair.crown * 0.5) * rng.range(0.92, 1.12)
    // How far it is tipped toward the viewer is the whole read of a halo.
    const ring = arc(
      b.cx + k * 6 + rng.gauss(0, 4), y,
      b.headRx * rng.range(0.48, 0.78), b.headRx * rng.range(0.08, 0.3),
      0, Math.PI * 2, 26,
    )
    p.stroke(ring, {
      color: propCol(p, 48, 68, 58), alpha: 0.24, width: rng.range(1.6, 3),
      passes: 2, wobble: 0.4, gaps: 0.2, lane: 3500,
    })
  },

  antenna: (s, k) => {
    const { p, g } = s
    const b = g.build
    const x = b.cx + p.rng.gauss(0, 6)
    const y = b.cy - b.headRy * (1 + g.hair.crown * 0.5)
    const h = 14 + k * 16
    p.stroke(quad({ x, y }, { x: x + 5, y: y - h * 0.6 }, { x: x - 2, y: y - h }, 10), {
      color: adjust(g.palette.ink, 10), alpha: 0.24, width: 1.4, passes: 2, wobble: 0.4, lane: 3510,
    })
    const knob = arc(x - 2, y - h - 2.5, 3, 3, 0, Math.PI * 2, 10)
    p.hatch(knob, { color: g.palette.accent, alpha: 0.2, spacing: 1.4, angle: 0.5, layers: 1, lane: 3512 })
    p.contour(knob, { color: shade(g.palette.accent, 1.5), alpha: 0.18, width: 1, passes: 1, lane: 3514 })
  },

  thread: (s, k) => {
    const { p, g } = s
    const b = g.build
    const side = p.rng.sign()
    const x = b.cx + side * b.shoulderW * 0.6
    const y = b.shoulderY + 52
    const len = 12 + k * 22
    const pts: Pt[] = []
    for (let i = 0; i <= 10; i++) {
      const t = i / 10
      pts.push({ x: x + Math.sin(t * 7) * 3 * t, y: y + t * len })
    }
    p.stroke(pts, {
      color: tint(g.palette.garmentAlt, 1.4), alpha: 0.24, width: 1.1, passes: 1,
      wobble: 0.5, taper: 0.7, lane: 3520,
    })
  },

  'ear-defenders': (s, k) => {
    const { p, g } = s
    const b = g.build
    const col = g.palette.accent
    const ink = adjust(g.palette.ink, 4)
    // Band over the crown — unless a hat is already there, in which case the
    // band goes behind the head instead and only the stubs beside the cups
    // show. Arcing it over a hat drew a handle standing off the top of it.
    if (s.hatRegion) {
      for (const side of [-1, 1] as const) {
        p.stroke([
          { x: b.cx + side * b.headRx * 1.0, y: g.face.eyeY - b.headRy * 0.06 },
          { x: b.cx + side * b.headRx * 1.06, y: g.face.eyeY - b.headRy * 0.26 },
        ], { color: col, alpha: 0.24, width: 5 + k * 2, passes: 2, wobble: 0.4, lane: 3540 + side })
      }
    } else {
      const band = arc(b.cx, b.cy - b.headRy * (0.5 + g.hair.crown * 0.4), b.headRx * 1.05, b.headRy * 0.95, Math.PI + 0.3, Math.PI * 2 - 0.3, 18)
      p.stroke(band, { color: col, alpha: 0.24, width: 5 + k * 2, passes: 2, wobble: 0.4, lane: 3540 })
      p.stroke(band, { color: shade(col, 1.5), alpha: 0.14, width: 1.2, passes: 1, lane: 3542 })
    }
    for (const side of [-1, 1] as const) {
      const cup = blob(b.cx + side * b.headRx * 1.0, g.face.eyeY + b.headRy * 0.08, 9 + k * 3, 12 + k * 3, p.noise, {
        n: 2.5, wobble: 0.08, lumps: 2, lane: 150 + side, steps: 20,
      })
      p.hatch(cup, { color: col, alpha: 0.16, spacing: 2, angle: 1.2, layers: 2, lane: 3544 + side * 4 })
      p.contour(cup, { color: ink, alpha: 0.18, width: 1.4, passes: 2, lane: 3548 + side * 4 })
    }
  },

  'goggles-up': (s, k) => {
    const { p, g } = s
    const b = g.build
    // Pushed up onto the forehead — unless a hat is already there, in which
    // case they sit just below its brim. Drawn at the crown under a hat, the
    // lenses were occluded away and left the strap arcing over the hat on its
    // own, like a handle.
    const y = s.hatRegion
      ? g.face.eyeY - b.headRy * 0.24
      : b.cy - b.headRy * 0.52
    const ink = adjust(g.palette.ink, -4, 6)
    const r = g.face.eyeR * (1.1 + k * 0.3)
    for (const side of [-1, 1] as const) {
      const lens = arc(b.cx + side * g.face.eyeSpacing * 0.95, y, r * 1.25, r, 0, Math.PI * 2, 20)
      p.hatch(lens, { color: hsl(38, 40, 62), alpha: 0.09, spacing: 2.4, angle: -0.6, layers: 1, lane: 3560 })
      p.contour(lens, { color: ink, alpha: 0.24, width: 2.2, passes: 2, lane: 3562 + side })
    }
    p.stroke(
      arc(b.cx, y, b.headRx * 1.04, b.headRy * 0.62, Math.PI + 0.25, Math.PI * 2 - 0.25, 14),
      { color: shade(g.palette.garmentAlt, 1.2), alpha: 0.2, width: 4, passes: 1, wobble: 0.5, lane: 3566 },
    )
  },

  'monocle-chain': (s, k) => {
    const { p, g } = s
    const b = g.build
    const side = 1
    const cx = b.cx + side * g.face.eyeSpacing
    const r = g.face.eyeR * 1.25
    const ink = adjust(g.palette.ink, -6, 8)
    const lens = arc(cx, g.face.eyeY, r, r, 0, Math.PI * 2, 20)
    p.contour(lens, { color: ink, alpha: 0.28, width: 2 + k, passes: 2, lane: 3580 })
    p.stroke(
      quad({ x: cx + r, y: g.face.eyeY + r * 0.5 },
        { x: cx + r * 2.2, y: g.face.eyeY + r * 3 },
        { x: b.cx + b.neckW * 1.3, y: b.neckY + 16 }, 14),
      { color: hsl(45, 55, 48), alpha: 0.2, width: 1.2, passes: 1, wobble: 1.2, gaps: 0.3, lane: 3584 },
    )
  },

  badges: (s, k) => {
    const { p, g } = s
    const b = g.build
    const n = 2 + Math.round(k * 4)
    const side = p.rng.sign()
    for (let i = 0; i < n; i++) {
      const x = b.cx + side * b.shoulderW * 0.5 + p.rng.gauss(0, 9)
      const y = b.shoulderY + 44 + p.rng.gauss(0, 12)
      const r = 3 + p.rng.range(0, 2)
      const col = i % 2 === 0 ? g.palette.accent : g.palette.garmentAlt
      const badge = arc(x, y, r, r, 0, Math.PI * 2, 12)
      p.hatch(badge, { color: col, alpha: 0.16, spacing: 1.4, angle: i, layers: 1, lane: 3600 + i * 3 })
      p.contour(badge, { color: adjust(g.palette.ink, 6), alpha: 0.16, width: 1, passes: 1, lane: 3602 + i * 3 })
    }
  },

  'old-tie': (s, k) => {
    const { p, g } = s
    const b = g.build
    const col = shade(g.palette.accent, 0.6)
    const knot: Pt[] = [
      { x: b.cx - 5, y: b.neckY + 8 }, { x: b.cx + 5, y: b.neckY + 8 },
      { x: b.cx + 4, y: b.neckY + 18 }, { x: b.cx - 4, y: b.neckY + 18 },
    ]
    const blade: Pt[] = [
      { x: b.cx - 4, y: b.neckY + 18 }, { x: b.cx + 4, y: b.neckY + 18 },
      { x: b.cx + 7, y: b.neckY + 60 + k * 20 }, { x: b.cx, y: b.neckY + 72 + k * 22 },
      { x: b.cx - 7, y: b.neckY + 60 + k * 20 },
    ]
    for (const [i, region] of [knot, blade].entries()) {
      p.hatch(region, { color: col, alpha: 0.14, spacing: 2, angle: 1.3, layers: 2, lane: 3620 + i * 6 })
      p.contour(region, { color: adjust(g.palette.ink, 4), alpha: 0.15, width: 1.2, passes: 1, lane: 3624 + i * 6 })
    }
  },

  'collar-up': (s, k) => {
    const { p, g } = s
    const b = g.build
    for (const side of [-1, 1] as const) {
      const flap: Pt[] = [
        { x: b.cx + side * b.neckW * 0.9, y: b.neckY + 6 },
        { x: b.cx + side * b.neckW * 1.7, y: b.neckY - 14 - k * 8 },
        { x: b.cx + side * b.neckW * 1.9, y: b.neckY + 12 },
        { x: b.cx + side * b.neckW * 1.1, y: b.neckY + 20 },
      ]
      p.hatch(flap, { color: g.palette.garmentAlt, alpha: 0.13, spacing: 2.2, angle: 1.1, layers: 2, lane: 3640 + side * 6 })
      p.contour(flap, { color: adjust(g.palette.ink, 4), alpha: 0.15, width: 1.3, passes: 1, lane: 3644 + side * 6 })
    }
  },
}

/* ------------------------------------------------------------------ passes */

export function drawExtrasBehind(s: Scene): void {
  drawHood(s)
}

export function drawExtrasFront(s: Scene): void {
  drawHat(s)
  drawGlasses(s)
  drawJewellery(s)
}

/**
 * The signature props.
 *
 * Drawn last, in intensity order, so that on the rare character with more than
 * one the loudest sits on top.
 */
export function drawQuirk(s: Scene): void {
  const ordered = [...s.g.quirks].sort((a, b) => a.intensity - b.intensity)
  for (const q of ordered) {
    const draw = QUIRK_DRAWERS[q.id]
    if (draw) {
      withClip(s.p.ctx, [], () => draw(s, q.intensity))
    }
  }
}
