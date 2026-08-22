/**
 * Clothing.
 *
 * The garment is where a character's palette actually lives — it is the largest
 * flat area, so it carries the mood of the whole sheet. Patterns are drawn
 * clipped to the torso and are always *under* the collar and fastenings, in the
 * same order a real drawing would build them up.
 */

import { adjust, shade, tint, clamp, ground } from '../../core/color'
import type { Genome, PatternStyle } from '../../core/genome'
import { hasQuirk } from '../../core/quirks'
import type { Scene } from '../character'
import { ellipsoidShade, torsoSideEdges, hemFor } from '../character'
import type { Pencil } from '../pencil'
import { type Pt, arc, quad, blob, withClip, bounds } from '../shapes'

function drawPattern(p: Pencil, g: Genome, region: Pt[], kind: PatternStyle): void {
  if (kind === 'none') return
  const pal = g.palette
  const b = bounds(region)
  const scale = g.garment.patternScale
  const ang = g.garment.patternAngle
  const dark = shade(pal.garment, 1.4)
  const alt = pal.garmentAlt

  withClip(p.ctx, [region], () => {
    switch (kind) {
      case 'stripe': {
        const gap = 13 * scale
        for (let y = b.y; y < b.y + b.h; y += gap) {
          const band: Pt[] = [
            { x: b.x - 4, y: y + ang * 20 },
            { x: b.x + b.w + 4, y: y - ang * 20 },
            { x: b.x + b.w + 4, y: y - ang * 20 + gap * 0.45 },
            { x: b.x - 4, y: y + ang * 20 + gap * 0.45 },
          ]
          p.hatch(band, {
            color: alt, alpha: 0.075, spacing: 2.4, angle: 0.2 + ang, layers: 1,
            gaps: 0.25, lane: 1700 + y,
          })
        }
        break
      }
      case 'plaid': {
        const gap = 20 * scale
        for (let y = b.y; y < b.y + b.h; y += gap) {
          p.stroke([{ x: b.x - 4, y: y + ang * 18 }, { x: b.x + b.w + 4, y: y - ang * 18 }], {
            color: alt, alpha: 0.085, width: 4.5, passes: 1, wobble: 0.8, gaps: 0.2, taper: 0.15, lane: 1720 + y,
          })
          p.stroke([{ x: b.x - 4, y: y + gap * 0.42 + ang * 18 }, { x: b.x + b.w + 4, y: y + gap * 0.42 - ang * 18 }], {
            color: dark, alpha: 0.08, width: 1.4, passes: 1, wobble: 0.6, gaps: 0.3, lane: 1722 + y,
          })
        }
        for (let x = b.x; x < b.x + b.w; x += gap) {
          p.stroke([{ x: x - ang * 18, y: b.y - 4 }, { x: x + ang * 18, y: b.y + b.h + 4 }], {
            color: alt, alpha: 0.08, width: 4.5, passes: 1, wobble: 0.8, gaps: 0.2, taper: 0.15, lane: 1740 + x,
          })
          p.stroke([{ x: x + gap * 0.42 - ang * 18, y: b.y - 4 }, { x: x + gap * 0.42 + ang * 18, y: b.y + b.h + 4 }], {
            color: dark, alpha: 0.07, width: 1.4, passes: 1, wobble: 0.6, gaps: 0.3, lane: 1742 + x,
          })
        }
        break
      }
      case 'check': {
        const gap = 15 * scale
        for (let y = b.y, r = 0; y < b.y + b.h; y += gap, r++) {
          for (let x = b.x, c = 0; x < b.x + b.w; x += gap, c++) {
            if ((r + c) % 2) continue
            p.hatch(
              [{ x, y }, { x: x + gap, y }, { x: x + gap, y: y + gap }, { x, y: y + gap }],
              { color: alt, alpha: 0.08, spacing: 2.6, angle: 0.6 + ang, layers: 1, gaps: 0.3, lane: 1760 + x + y },
            )
          }
        }
        break
      }
      case 'dot': {
        const gap = 17 * scale
        for (let y = b.y, r = 0; y < b.y + b.h; y += gap, r++) {
          for (let x = b.x + (r % 2) * gap * 0.5; x < b.x + b.w; x += gap) {
            const rad = 2.4 * scale
            p.stroke(arc(x, y, rad, rad, 0, Math.PI * 2, 9), {
              color: alt, alpha: 0.14, width: 2.2, passes: 1, wobble: 0.5, gaps: 0.15, lane: 1780 + x + y,
            })
          }
        }
        break
      }
      case 'knit': {
        const gap = 9 * scale
        for (let y = b.y; y < b.y + b.h; y += gap) {
          for (let x = b.x; x < b.x + b.w; x += gap * 1.1) {
            p.stroke(
              [{ x, y: y + gap * 0.5 }, { x: x + gap * 0.28, y }, { x: x + gap * 0.56, y: y + gap * 0.5 }],
              { color: dark, alpha: 0.07, width: 1.2, passes: 1, wobble: 0.3, taper: 0.5, lane: 1800 + x + y },
            )
          }
        }
        break
      }
      case 'zigzag': {
        const gap = 16 * scale
        for (let y = b.y; y < b.y + b.h; y += gap) {
          const pts: Pt[] = []
          for (let x = b.x - 4, k = 0; x < b.x + b.w + 4; x += gap * 0.5, k++) {
            pts.push({ x, y: y + (k % 2 ? gap * 0.34 : 0) })
          }
          p.stroke(pts, {
            color: alt, alpha: 0.095, width: 2.4, passes: 1, wobble: 0.5, gaps: 0.2, taper: 0.2, lane: 1820 + y,
          })
        }
        break
      }
      case 'speck':
        p.fleck(region, dark, Math.round(120 * scale), 0.8)
        p.fleck(region, alt, Math.round(60 * scale), 1)
        break
      default:
        break
    }
  })
}

/** The neckline opening — everything the collar is cut around. */
/**
 * The neckline, built from `CollarSpec`.
 *
 * Ten hardcoded drawings meant every button-up had the same points at the
 * same angle and every turtleneck the same seven ribs. A collar here is a set
 * of independent parts — an opening, a band, points, lapels, a placket,
 * straps, a bib, a flap, a ruffle, a wrap — each present or absent and
 * continuously sized. Nothing below branches on the family.
 */
function drawCollar(s: Scene): void {
  const { p, g } = s
  const b = g.build
  const c = g.garment.collarSpec
  const hemY = hemFor(g) - 2
  const pal = g.palette
  const alt = pal.garmentAlt
  const ink = adjust(pal.ink, 4, -4)
  const shoulderTip = b.shoulderY + b.shoulderW * b.slope * 0.34 + 12
  const top = b.neckY + 2
  const half = b.neckW * c.openWidth

  // The opening: a round scoop at one end of `vee`, a straight V at the other.
  const openAt = (u: number): number => {
    const round = Math.cos((u * Math.PI) / 2)
    const point = 1 - Math.abs(u)
    return c.dropDepth * (round * (1 - c.vee) + point * c.vee)
  }
  const edge = (widen: number, drop: number, sink: number): Pt[] => {
    const out: Pt[] = []
    for (let i = 0; i <= 14; i++) {
      const u = (i / 14) * 2 - 1
      out.push({ x: b.cx + u * half * widen, y: top + sink + openAt(u) * drop })
    }
    return out
  }

  // A flap falls behind everything else.
  if (c.flap > 0.02) {
    const reach = b.shoulderW * (0.44 + c.flap * 0.26)
    const flap: Pt[] = [
      { x: b.cx - reach, y: b.shoulderY + 6 },
      { x: b.cx - half * 0.75, y: top },
      { x: b.cx + half * 0.75, y: top },
      { x: b.cx + reach, y: b.shoulderY + 6 },
      { x: b.cx + reach * 0.65, y: Math.min(hemY, b.shoulderY + 20 + c.flap * 34) },
      { x: b.cx - reach * 0.65, y: Math.min(hemY, b.shoulderY + 20 + c.flap * 34) },
    ]
    p.hatch(flap, { color: alt, alpha: 0.12, spacing: 2.4, angle: 1.1, layers: 2, lane: 2000 })
    // Braid lines set in from the edge.
    for (let i = 0; i < 2; i++) {
      p.contour(
        flap.map((q) => ({ x: b.cx + (q.x - b.cx) * (0.92 - i * 0.06), y: q.y + i * 3 + 2 })),
        { color: tint(alt, 1.8), alpha: 0.16, width: 1.4, passes: 1, lane: 2004 + i },
      )
    }
    p.contour(flap, { color: ink, alpha: 0.13, width: 1.2, passes: 1, lane: 2008 })
  }

  // A bib across the chest, and the straps that hold it up.
  if (c.bib > 0.5) {
    const bw = b.neckW * c.bibWidth
    const bibTop = b.neckY + c.bib
    if (bibTop < hemY - 6) {
      const bib: Pt[] = [
        { x: b.cx - bw, y: bibTop },
        { x: b.cx + bw, y: bibTop },
        { x: b.cx + bw * 1.08, y: hemY },
        { x: b.cx - bw * 1.08, y: hemY },
      ]
      p.hatch(bib, { color: tint(alt, 0.85), alpha: 0.11, spacing: 2.5, angle: 1.42, layers: 2, layerTurn: 14, lane: 1958 })
      p.contour(bib, { color: ink, alpha: 0.12, width: 1.2, passes: 1, lane: 1960 })
      if (c.straps < 0.5) {
        // No shoulder straps, so it hangs from the neck instead.
        for (const side of [-1, 1] as const) {
          p.stroke(quad(
            { x: b.cx + side * bw * 0.94, y: bibTop },
            { x: b.cx + side * b.neckW * 1.3, y: b.neckY - 2 },
            { x: b.cx + side * b.neckW * 0.9, y: b.neckY - 12 }, 10,
          ), { color: ink, alpha: 0.13, width: 2, passes: 1, wobble: 0.5, lane: 1974 + side })
        }
      }
    }
  }
  if (c.straps > 0.5) {
    for (const side of [-1, 1] as const) {
      const w = c.straps
      const strap: Pt[] = [
        { x: b.cx + side * (b.neckW * 0.5), y: hemY - 8 },
        { x: b.cx + side * b.shoulderW * 0.52, y: shoulderTip + 4 },
        { x: b.cx + side * (b.shoulderW * 0.52 + w * 1.6), y: shoulderTip + 8 },
        { x: b.cx + side * (b.neckW * 0.5 + w * 1.4), y: hemY - 6 },
      ]
      p.hatch(strap, { color: alt, alpha: 0.14, spacing: 2.2, angle: 1.2, layers: 2, lane: 1950 + side * 8 })
      p.contour(strap, { color: ink, alpha: 0.14, width: 1.2, passes: 1, lane: 1954 + side * 8 })
    }
  }

  // Crossed panels — one wrap direction for both sides, or they meet in an X.
  if (c.wrap > 0.02) {
    for (const side of [-1, 1] as const) {
      const panel: Pt[] = [
        { x: b.cx + side * half * 0.95, y: b.neckY - 2 },
        { x: b.cx + side * b.neckW * 0.1, y: hemY - 26 * c.wrap },
        { x: b.cx + side * b.neckW * 0.1, y: hemY },
        { x: b.cx + side * b.shoulderW * 0.9, y: hemY },
        { x: b.cx + side * b.shoulderW * 0.8, y: b.neckY + 14 },
      ]
      p.hatch(panel, {
        color: side < 0 ? alt : shade(alt, 0.6),
        alpha: 0.11, spacing: 2.4, angle: 1.2, layers: 2, lane: 1980 + side * 8,
      })
      p.contour(panel, { color: ink, alpha: 0.12, width: 1.2, passes: 1, lane: 1984 + side * 8 })
    }
  }

  // The band: a strip following the opening, optionally standing above the
  // neck line. A turtleneck is this and nothing else.
  if (c.bandDepth > 0.5) {
    const band = [
      ...edge(1, 1, -c.standHeight),
      ...edge(1.06, 1, -c.standHeight + c.bandDepth + c.standHeight).reverse(),
    ]
    p.hatch(band, {
      color: alt, alpha: 0.13, spacing: 2.2, angle: c.standHeight > 10 ? 1.5 : 0.9,
      layers: 2, layerTurn: 12, lane: 1920,
    })
    for (let i = 0; i < c.ribs; i++) {
      const u = c.ribs === 1 ? 0 : (i / (c.ribs - 1)) * 2 - 1
      const x = b.cx + u * half * 0.92
      p.stroke([
        { x, y: top - c.standHeight + 2 },
        { x: x + 1, y: top + c.bandDepth + openAt(u) * 0.6 },
      ], { color: shade(alt, 1.3), alpha: 0.09, width: 1.1, passes: 1, taper: 0.5, lane: 1934 + i })
    }
    p.contour(band, { color: ink, alpha: 0.13, width: 1.2, passes: 1, optional: true, lane: 1922 })
  }

  // Folded points either side of the opening.
  if (c.pointReach > 0.05) {
    for (const side of [-1, 1] as const) {
      const reach = b.neckW * c.pointReach
      const tipX = b.cx + side * reach * (0.7 + c.pointSplay * 0.6)
      const tipY = top + c.pointDrop * (1 - c.pointSplay * 0.45)
      const region: Pt[] = [
        { x: b.cx + side * b.neckW * 0.2, y: top },
        { x: b.cx + side * reach, y: top - 1 },
        { x: tipX, y: tipY },
        { x: b.cx + side * b.neckW * 0.12, y: top + c.pointDrop * 0.6 },
      ]
      p.hatch(region, { color: alt, alpha: 0.12, spacing: 2.4, angle: 1.1, layers: 2, lane: 1900 + side * 8 })
      p.contour(region, { color: ink, alpha: 0.15, width: 1.3, passes: 1, lane: 1904 + side * 8 })
      if (c.lapel > 0.02) {
        p.stroke(
          [{ x: b.cx + side * reach * 0.94, y: top + 4 },
            { x: b.cx + side * b.neckW * 0.6, y: hemY - 24 * c.lapel }],
          { color: ink, alpha: 0.1, width: 1.1, passes: 1, wobble: 0.7, lane: 1912 + side },
        )
      }
    }
  }

  if (c.placket > 0.02) {
    p.stroke([{ x: b.cx + 3, y: top + 10 }, { x: b.cx + 5, y: hemY }], {
      color: ink, alpha: 0.12 * c.placket, width: 1.2, passes: 1, wobble: 0.6, lane: 1908,
    })
  }

  if (c.strings > 0.02) {
    for (const side of [-1, 1] as const) {
      p.stroke(
        [{ x: b.cx + side * 8, y: top + c.bandDepth + 8 },
          { x: b.cx + side * 11, y: hemY - 30 * c.strings }],
        { color: tint(alt, 1.6), alpha: 0.2, width: 1.6, passes: 1, wobble: 1, lane: 1994 + side },
      )
    }
  }

  // Scallops along the neckline.
  if (c.ruffle > 0.5) {
    const n = Math.max(3, c.ruffleCount)
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1)
      const u = t * 2 - 1
      const x = b.cx + u * half * 1.05
      const y = top + 6 + openAt(u) * 0.5
      const r = c.ruffle * (0.7 + Math.sin(t * Math.PI) * 0.5)
      const petal = arc(x, y, r, r * 0.85, 0, Math.PI * 2, 14)
      p.hatch(petal, { color: alt, alpha: 0.1, spacing: 2.2, angle: 0.5 + i, layers: 1, lane: 2010 + i })
      p.contour(petal, { color: ink, alpha: 0.12, width: 1.1, passes: 1, lane: 2014 + i })
    }
  }
}

function drawFastenings(s: Scene): void {
  const { p, g } = s
  const b = g.build
  const pal = g.palette
  // One hand-painted button is a quirk; the odd missing one is a different
  // quirk, and leaves loose threads rather than nothing at all.
  const painted = hasQuirk(g.quirks, 'painted-button')
  const paintedIndex = painted ? Math.abs(Math.round(painted.intensity * 3)) % Math.max(1, g.garment.buttons) : -1

  for (let i = 0; i < g.garment.buttons; i++) {
    const y = b.neckY + 34 + i * 20
    const x = b.cx + 4 + p.rng.gauss(0, 0.8)

    if (g.garment.missingButtons.includes(i)) {
      // What is left behind: two short threads and a slightly paler patch.
      for (let k = 0; k < 3; k++) {
        p.stroke(
          [{ x: x - 1, y: y - 1 }, { x: x + p.rng.gauss(0, 2.6), y: y + p.rng.range(2, 5) }],
          { color: tint(pal.garment, 1.4), alpha: 0.2, width: 1, passes: 1, taper: 0.85, lane: 2090 + i * 4 + k },
        )
      }
      continue
    }

    p.stroke(arc(x, y, 2.6, 2.6, 0, Math.PI * 2, 10), {
      color: i === paintedIndex ? shade(pal.accent, -0.8) : pal.accent,
      alpha: i === paintedIndex ? 0.36 : 0.28,
      width: 2.2, passes: 2, wobble: 0.3, lane: 2100 + i,
    })
  }

  // A pocket rectangle is a hard, closed, high-contrast shape — at low mark
  // budget it out-reads the face, which is exactly the inversion the hierarchy
  // term exists to prevent.
  if (g.garment.pocket && p.density > 0.75) {
    const side = p.rng.sign()
    const x = b.cx + side * b.shoulderW * 0.52
    const y = b.shoulderY + 62
    const w = 14
    const h = 16
    const pocket: Pt[] = [
      { x: x - w, y }, { x: x + w, y: y - 1 },
      { x: x + w * 0.86, y: y + h }, { x: x - w * 0.86, y: y + h },
    ]
    p.contour(pocket, { color: adjust(pal.ink, 6), alpha: 0.13, width: 1.2, passes: 1, optional: true, lane: 2110 })
    p.hatch(pocket, {
      color: shade(pal.garment, 0.7), alpha: 0.05, spacing: 3, angle: 1.3, layers: 1, lane: 2112,
    })
  }
}

function drawScarf(s: Scene): void {
  const { p, g } = s
  if (!g.garment.scarf) return
  const b = g.build
  const col = g.garment.scarfColor
  const wrap = blob(b.cx, b.neckY + 10, b.neckW * 1.9, 13, p.noise, {
    wobble: 0.12, lumps: 3, lane: 91, steps: 26,
  })
  s.addOccluder('body', wrap)
  p.hatch(wrap, { color: col, alpha: 0.13, spacing: 2.2, angle: 0.3, layers: 2, layerTurn: 30, lane: 2200 })
  p.contour(wrap, { color: shade(col, 1.5), alpha: 0.14, width: 1.3, passes: 1, lane: 2204 })

  // One tail, thrown to a random side.
  const side = p.rng.sign()
  const tail: Pt[] = [
    { x: b.cx + side * b.neckW * 1.2, y: b.neckY + 14 },
    { x: b.cx + side * b.neckW * 1.9, y: b.neckY + 44 },
    { x: b.cx + side * b.neckW * 1.5, y: b.neckY + 72 },
    { x: b.cx + side * b.neckW * 0.85, y: b.neckY + 66 },
    { x: b.cx + side * b.neckW * 0.7, y: b.neckY + 20 },
  ]
  p.hatch(tail, { color: col, alpha: 0.11, spacing: 2.4, angle: 1.3, layers: 2, lane: 2208 })
  p.contour(tail, { color: shade(col, 1.5), alpha: 0.12, width: 1.2, passes: 1, lane: 2212 })
  // Fringe at the end.
  for (let i = 0; i < 5; i++) {
    const x = b.cx + side * b.neckW * (0.85 + i * 0.09)
    p.stroke([{ x, y: b.neckY + 66 }, { x: x + p.rng.gauss(0, 1.5), y: b.neckY + 74 }], {
      color: col, alpha: 0.18, width: 1.2, passes: 1, taper: 0.7, lane: 2216 + i,
    })
  }
}

/** The hood of a hoodie, which sits behind the head. */
export function drawHood(s: Scene): void {
  const { p, g } = s
  if (g.garment.collar !== 'hoodie') return
  const b = g.build
  const region = blob(b.cx, b.cy + b.headRy * 0.35, b.headRx * 1.32, b.headRy * 1.15, p.noise, {
    n: 2.3, wobble: 0.07, lumps: 2.4, lane: 93, steps: 40,
  })
  p.hatch(region, {
    color: g.palette.garmentAlt, alpha: 0.1, spacing: 2.6, angle: 1.2, layers: 2, lane: 2300,
    pressure: ellipsoidShade(b.cx, b.cy, b.headRx * 1.3, b.headRy * 1.2, s.lx, s.ly, 0.9),
  })
  p.contour(region, { color: g.palette.ink, alpha: 0.11, width: 1.3, passes: 1, lane: 2304 })
}

/**
 * Condition.
 *
 * Wear is placed where wear happens: collar edges, shoulder tops, pocket
 * mouths. Grime accumulates low and toward the front, because that is where a
 * person leans and wipes their hands. Nothing here is a uniform noise overlay —
 * that is the difference between a worn garment and a dirty JPEG.
 */
function drawCondition(s: Scene): void {
  const { p, g, torso } = s
  const c = g.condition
  const pal = g.palette
  const b = g.build
  const rng = p.rng

  // 1. Edge wear: the fabric goes pale where it is rubbed, along contours.
  if (c.wear > 0.15) {
    const edges: Pt[][] = [
      // Shoulder tops.
      [{ x: b.cx - b.shoulderW * 0.95, y: b.shoulderY + b.shoulderW * b.slope * 0.34 + 12 },
        { x: b.cx - b.shoulderW * 0.5, y: b.shoulderY - 2 }],
      [{ x: b.cx + b.shoulderW * 0.5, y: b.shoulderY - 2 },
        { x: b.cx + b.shoulderW * 0.95, y: b.shoulderY + b.shoulderW * b.slope * 0.34 + 12 }],
      // Collar edge.
      [{ x: b.cx - b.neckW * 1.5, y: b.neckY + 6 }, { x: b.cx + b.neckW * 1.5, y: b.neckY + 6 }],
    ]
    for (const [i, edge] of edges.entries()) {
      const n = Math.round(3 + c.wear * 7)
      for (let k = 0; k < n; k++) {
        const t0 = rng.next()
        const t1 = clamp(t0 + rng.range(0.05, 0.3), 0, 1)
        const a = edge[0]!
        const z = edge[1]!
        p.stroke(
          [
            { x: a.x + (z.x - a.x) * t0, y: a.y + (z.y - a.y) * t0 + rng.gauss(0, 1.5) },
            { x: a.x + (z.x - a.x) * t1, y: a.y + (z.y - a.y) * t1 + rng.gauss(0, 1.5) },
          ],
          {
            color: tint(pal.garment, 1.6 + c.wear),
            alpha: 0.05 + c.wear * 0.09,
            width: 2.4, passes: 1, wobble: 0.9, gaps: 0.35, taper: 0.8,
            lane: 2500 + i * 20 + k,
          },
        )
      }
    }
  }

  // 2. Grime, pooled low and forward.
  if (c.grime > 0.12) {
    p.hatch(torso, {
      color: pal.grime,
      alpha: 0.03 + c.grime * 0.055,
      spacing: 3.4,
      angle: 1.15,
      layers: 2,
      layerTurn: 44,
      curve: 3,
      gaps: 0.42,
      taper: 0.7,
      lane: 2540,
      pressure: (x, y) => {
        const low = clamp((y - b.shoulderY - 10) / 90, 0, 1)
        const front = clamp(1 - Math.abs(x - b.cx) / (b.shoulderW * 1.1), 0, 1)
        return clamp((low * 0.75 + 0.25) * (0.45 + front * 0.75), 0, 1)
      },
    })
  }

  // 3. Individual stains, log-normal in size.
  const stains = p.density > 0.75 ? c.stains : c.stains.slice(0, 1)
  for (const [i, st] of stains.entries()) {
    const region = blob(st.x, st.y, st.r, st.r * 0.78, p.noise, {
      wobble: 0.28, lumps: 3.2, lane: 120 + i, steps: 18,
    })
    withClip(p.ctx, [torso], () => {
      p.hatch(region, {
        color: pal.grime,
        alpha: 0.07,
        spacing: 2.2,
        angle: rng.range(0, 3),
        layers: 2,
        gaps: 0.34,
        lane: 2560 + i * 8,
        pressure: (x, y) => clamp(1 - Math.hypot(x - st.x, y - st.y) / st.r, 0, 1) ** 0.7,
      })
    })
  }

  // 4. Repairs. A patch is a rectangle of the wrong cloth with visible stitches.
  const patchBudget = p.density > 0.75 ? 4 : 1
  for (let i = 0; i < Math.min(patchBudget, c.patches); i++) {
    const px = b.cx + rng.gauss(0, b.shoulderW * 0.55)
    const py = b.shoulderY + rng.range(24, 96)
    const w = rng.range(8, 15)
    const h = rng.range(7, 13)
    const patch: Pt[] = [
      { x: px - w, y: py - h }, { x: px + w, y: py - h * 0.85 },
      { x: px + w * 0.92, y: py + h }, { x: px - w * 0.95, y: py + h * 0.9 },
    ]
    withClip(p.ctx, [torso], () => {
      p.hatch(patch, {
        color: shade(pal.garmentAlt, 0.6), alpha: 0.12, spacing: 2.4,
        angle: rng.range(0, 3), layers: 2, lane: 2600 + i * 10,
      })
      p.contour(patch, { color: pal.ink, alpha: 0.11, width: 1.1, passes: 1, lane: 2604 + i * 10 })
      // Stitches.
      for (let k = 0; k < 8; k++) {
        const t = k / 7
        const sx = px - w + t * w * 2
        p.stroke([{ x: sx, y: py - h - 1 }, { x: sx + 1, y: py - h + 2.5 }], {
          color: pal.ink, alpha: 0.14, width: 1, passes: 1, lane: 2608 + i * 10 + k,
        })
      }
    })
  }

  // 5. Damage: a frayed hem or a small tear, only when it is earned.
  if (c.damage > 0.55) {
    const side = rng.sign()
    const x = b.cx + side * b.shoulderW * rng.range(0.5, 0.9)
    const y = b.shoulderY + rng.range(40, 90)
    const len = 5 + c.damage * 9
    p.stroke([{ x, y }, { x: x + rng.gauss(0, 3), y: y + len }], {
      color: shade(pal.garment, 2), alpha: 0.2, width: 1.3, passes: 2, wobble: 1.4, lane: 2650,
    })
    for (let k = 0; k < 4; k++) {
      p.stroke(
        [{ x: x + rng.gauss(0, 2), y: y + len * rng.range(0.3, 1) },
          { x: x + rng.gauss(0, 4), y: y + len * rng.range(1, 1.4) }],
        { color: tint(pal.garment, 1.3), alpha: 0.14, width: 1, passes: 1, taper: 0.85, lane: 2654 + k },
      )
    }
  }
}

/** One panel of cloth that never matched — a clothing quirk. */
function drawMismatch(s: Scene): void {
  const { p, g, torso } = s
  const col = g.garment.mismatch
  if (!col) return
  const b = g.build
  const side = g.build.tilt >= 0 ? 1 : -1
  const panel: Pt[] = [
    { x: b.cx + side * b.shoulderW * 0.2, y: b.shoulderY + 4 },
    { x: b.cx + side * b.shoulderW * 1.05, y: b.shoulderY + 16 },
    { x: b.cx + side * b.shoulderW * 1.05, y: b.shoulderY + 110 },
    { x: b.cx + side * b.shoulderW * 0.26, y: b.shoulderY + 110 },
  ]
  withClip(p.ctx, [torso], () => {
    p.hatch(panel, { color: col, alpha: 0.11, spacing: 2.6, angle: 1.25, layers: 2, lane: 2700 })
    p.stroke(
      [{ x: b.cx + side * b.shoulderW * 0.22, y: b.shoulderY + 4 },
        { x: b.cx + side * b.shoulderW * 0.28, y: b.shoulderY + 110 }],
      { color: shade(col, 1.4), alpha: 0.14, width: 1.2, passes: 1, wobble: 0.8, lane: 2704 },
    )
  })
}

export function drawGarment(s: Scene): void {
  const { p, g, torso } = s
  const pal = g.palette
  const b = g.build

  p.base(torso, ground(pal.garment, 1.15), 0.72)

  // Local colour, hatched along the drape of the fabric. The direction varies
  // per character — a whole sheet hatched at one angle reads as a print, not
  // as a set of drawings.
  const drape = 1.3 + g.garment.patternAngle * 1.4
  p.hatch(torso, {
    color: adjust(pal.garment, 0, 8),
    alpha: 0.08,
    spacing: 2.7,
    angle: drape,
    layers: 2,
    layerTurn: 22,
    curve: 3,
    lane: 2400,
  })

  drawPattern(p, g, torso, g.garment.pattern)
  drawMismatch(s)

  // Form: the torso is a cylinder, and the shoulders are two smaller ones.
  const body = ellipsoidShade(b.cx, b.shoulderY + 70, b.shoulderW * 1.05, 110, s.lx, s.ly, 1)
  p.hatch(torso, {
    color: shade(pal.garment, 1.15),
    alpha: 0.1 * p.hand.modelling,
    spacing: 2.6,
    angle: drape - 0.1,
    layers: 1,
    lane: 2404,
    pressure: (x, y) => {
      const shoulder = clamp(1 - (y - b.shoulderY) / 60, 0, 1)
      return clamp(body(x, y) * (0.7 + 0.5 * shoulder), 0, 1)
    },
  })

  // Fold lines under each arm and across the chest.
  for (const side of [-1, 1] as const) {
    p.stroke(
      quad(
        { x: b.cx + side * b.shoulderW * 0.86, y: b.shoulderY + 24 },
        { x: b.cx + side * b.shoulderW * 0.55, y: b.shoulderY + 54 },
        { x: b.cx + side * b.shoulderW * 0.62, y: b.shoulderY + 100 },
        10,
      ),
      { color: shade(pal.garment, 1.6), alpha: 0.09, width: 1.3, passes: 1, wobble: 0.7, taper: 0.6, lane: 2408 + side },
    )
  }

  drawCollar(s)
  drawFastenings(s)
  drawScarf(s)
  drawCondition(s)

  // Only the shoulders and sides are outlined; the figure is cropped by the
  // frame, so there is no bottom edge to draw.
  const [leftEdge, rightEdge] = torsoSideEdges(g)
  for (const [i, edge] of [leftEdge, rightEdge].entries()) {
    p.contour(edge, {
      color: adjust(pal.ink, 4, -2),
      alpha: 0.13,
      width: 1.2,
      passes: 2,
      wobble: 0.7,
      closed: false,
      taper: 0.25,
      lane: 2420 + i * 40,
    })
  }
}
