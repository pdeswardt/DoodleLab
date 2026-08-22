/**
 * Clothing.
 *
 * The garment is where a character's palette actually lives — it is the largest
 * flat area, so it carries the mood of the whole sheet. Patterns are drawn
 * clipped to the torso and are always *under* the collar and fastenings, in the
 * same order a real drawing would build them up.
 */

import { adjust, shade, tint, clamp } from '../../core/color'
import type { Genome, PatternStyle } from '../../core/genome'
import { hasQuirk } from '../../core/quirks'
import type { Scene } from '../character'
import { ellipsoidShade, torsoSideEdges } from '../character'
import { ART } from '../../core/genome'
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
function necklinePath(g: Genome, depth: number, width: number): Pt[] {
  const b = g.build
  const top = b.neckY + 2
  return [
    { x: b.cx - b.neckW * width, y: top },
    ...quad(
      { x: b.cx - b.neckW * width, y: top },
      { x: b.cx, y: top + depth },
      { x: b.cx + b.neckW * width, y: top },
      12,
    ).slice(1),
  ]
}

/** Bottom of the visible figure — collars and bibs must not run past it. */
const hemY = ART.h - 46

function drawCollar(s: Scene): void {
  const { p, g } = s
  const b = g.build
  const pal = g.palette
  const alt = pal.garmentAlt
  const ink = adjust(pal.ink, 4, -4)
  const shoulderTip = b.shoulderY + b.shoulderW * b.slope * 0.34 + 12

  switch (g.garment.collar) {
    case 'buttonup': {
      // Two folded points either side of a placket.
      for (const side of [-1, 1] as const) {
        const region: Pt[] = [
          { x: b.cx + side * b.neckW * 0.2, y: b.neckY + 2 },
          { x: b.cx + side * b.neckW * 1.5, y: b.neckY + 1 },
          { x: b.cx + side * b.neckW * 1.15, y: b.neckY + 22 },
          { x: b.cx + side * b.neckW * 0.12, y: b.neckY + 14 },
        ]
        p.hatch(region, { color: alt, alpha: 0.12, spacing: 2.4, angle: 1.1, layers: 2, lane: 1900 + side * 8 })
        p.contour(region, { color: ink, alpha: 0.15, width: 1.3, passes: 1, lane: 1904 + side * 8 })
      }
      // Placket.
      p.stroke([{ x: b.cx + 3, y: b.neckY + 12 }, { x: b.cx + 5, y: hemY }], {
        color: ink, alpha: 0.12, width: 1.2, passes: 1, wobble: 0.6, lane: 1908,
      })
      if (g.garment.lapel) {
        for (const side of [-1, 1] as const) {
          p.stroke(
            [{ x: b.cx + side * b.neckW * 1.4, y: b.neckY + 6 }, { x: b.cx + side * b.neckW * 0.6, y: hemY - 24 }],
            { color: ink, alpha: 0.1, width: 1.1, passes: 1, wobble: 0.7, lane: 1912 + side },
          )
        }
      }
      break
    }
    case 'crew': {
      const band = [
        ...necklinePath(g, 16, 1.5),
        ...necklinePath(g, 24, 1.62).reverse(),
      ]
      p.hatch(band, { color: alt, alpha: 0.14, spacing: 2.2, angle: 0.9, layers: 2, lane: 1920 })
      p.contour(band, { color: ink, alpha: 0.13, width: 1.2, passes: 1, lane: 1922 })
      break
    }
    case 'turtleneck': {
      // Rolled, not rectangular: the top edge curves under the jaw.
      const region = [
        ...quad(
          { x: b.cx - b.neckW * 1.4, y: b.neckY - 12 },
          { x: b.cx, y: b.neckY - 24 },
          { x: b.cx + b.neckW * 1.4, y: b.neckY - 12 }, 12,
        ),
        ...quad(
          { x: b.cx + b.neckW * 1.52, y: b.neckY + 18 },
          { x: b.cx, y: b.neckY + 28 },
          { x: b.cx - b.neckW * 1.52, y: b.neckY + 18 }, 12,
        ),
      ]
      p.hatch(region, { color: alt, alpha: 0.13, spacing: 2.2, angle: 1.5, layers: 2, layerTurn: 12, lane: 1930 })
      // Ribbing.
      for (let i = -3; i <= 3; i++) {
        const x = b.cx + i * b.neckW * 0.42
        p.stroke([{ x, y: b.neckY - 14 }, { x: x + 1, y: b.neckY + 18 }], {
          color: shade(alt, 1.3), alpha: 0.09, width: 1.1, passes: 1, taper: 0.5, lane: 1934 + i,
        })
      }
      p.contour(region, { color: ink, alpha: 0.14, width: 1.3, passes: 1, lane: 1938 })
      break
    }
    case 'vneck': {
      const region = [
        { x: b.cx - b.neckW * 1.5, y: b.neckY },
        { x: b.cx, y: b.neckY + 34 },
        { x: b.cx + b.neckW * 1.5, y: b.neckY },
        { x: b.cx + b.neckW * 1.7, y: b.neckY + 8 },
        { x: b.cx, y: b.neckY + 44 },
        { x: b.cx - b.neckW * 1.7, y: b.neckY + 8 },
      ]
      p.hatch(region, { color: alt, alpha: 0.13, spacing: 2.2, angle: 0.7, layers: 2, lane: 1940 })
      p.contour(region, { color: ink, alpha: 0.13, width: 1.2, passes: 1, lane: 1942 })
      break
    }
    case 'overalls': {
      for (const side of [-1, 1] as const) {
        const strap: Pt[] = [
          { x: b.cx + side * b.neckW * 0.5, y: hemY - 8 },
          { x: b.cx + side * b.shoulderW * 0.52, y: shoulderTip + 4 },
          { x: b.cx + side * b.shoulderW * 0.72, y: shoulderTip + 8 },
          { x: b.cx + side * b.neckW * 1.1, y: hemY - 6 },
        ]
        p.hatch(strap, { color: alt, alpha: 0.14, spacing: 2.2, angle: 1.2, layers: 2, lane: 1950 + side * 8 })
        p.contour(strap, { color: ink, alpha: 0.14, width: 1.2, passes: 1, lane: 1954 + side * 8 })
      }
      const bib: Pt[] = [
        { x: b.cx - b.neckW * 1.25, y: b.neckY + 30 },
        { x: b.cx + b.neckW * 1.25, y: b.neckY + 30 },
        { x: b.cx + b.neckW * 1.35, y: hemY },
        { x: b.cx - b.neckW * 1.35, y: hemY },
      ]
      p.hatch(bib, { color: alt, alpha: 0.1, spacing: 2.6, angle: 1.4, layers: 1, lane: 1958 })
      p.contour(bib, { color: ink, alpha: 0.12, width: 1.2, passes: 1, closed: false, lane: 1960 })
      break
    }
    case 'apron': {
      const bib: Pt[] = [
        { x: b.cx - b.headRx * 0.62, y: b.neckY + 26 },
        { x: b.cx + b.headRx * 0.62, y: b.neckY + 26 },
        { x: b.cx + b.headRx * 0.7, y: hemY },
        { x: b.cx - b.headRx * 0.7, y: hemY },
      ]
      p.hatch(bib, { color: tint(alt, 0.8), alpha: 0.11, spacing: 2.4, angle: 1.45, layers: 2, layerTurn: 14, lane: 1970 })
      p.contour(bib, { color: ink, alpha: 0.13, width: 1.2, passes: 1, lane: 1972 })
      // Neck strap.
      for (const side of [-1, 1] as const) {
        p.stroke(
          quad(
            { x: b.cx + side * b.headRx * 0.6, y: b.neckY + 26 },
            { x: b.cx + side * b.neckW * 1.3, y: b.neckY - 2 },
            { x: b.cx + side * b.neckW * 0.9, y: b.neckY - 12 },
            10,
          ),
          { color: ink, alpha: 0.13, width: 2, passes: 1, wobble: 0.5, lane: 1974 + side },
        )
      }
      break
    }
    case 'robe': {
      for (const side of [-1, 1] as const) {
        // Both panels wrap the same way and meet at the centre; mirrored
        // diagonals were crossing into a literal X.
        const panel: Pt[] = [
          { x: b.cx + side * b.neckW * 1.75, y: b.neckY - 2 },
          { x: b.cx + side * b.neckW * 0.1, y: hemY - 26 },
          { x: b.cx + side * b.neckW * 0.1, y: hemY },
          { x: b.cx + side * b.shoulderW * 0.9, y: hemY },
          { x: b.cx + side * b.shoulderW * 0.8, y: b.neckY + 14 },
        ]
        p.hatch(panel, { color: side < 0 ? alt : shade(alt, 0.6), alpha: 0.11, spacing: 2.4, angle: 1.2, layers: 2, lane: 1980 + side * 8 })
        p.contour(panel, { color: ink, alpha: 0.12, width: 1.2, passes: 1, lane: 1984 + side * 8 })
      }
      break
    }
    case 'hoodie': {
      const band = [...necklinePath(g, 20, 1.6), ...necklinePath(g, 32, 1.8).reverse()]
      p.hatch(band, { color: alt, alpha: 0.13, spacing: 2.2, angle: 0.8, layers: 2, lane: 1990 })
      p.contour(band, { color: ink, alpha: 0.13, width: 1.2, passes: 1, lane: 1992 })
      // Drawstrings.
      for (const side of [-1, 1] as const) {
        p.stroke(
          [{ x: b.cx + side * 8, y: b.neckY + 22 }, { x: b.cx + side * 11, y: hemY - 30 }],
          { color: tint(alt, 1.6), alpha: 0.2, width: 1.6, passes: 1, wobble: 1, lane: 1994 + side },
        )
      }
      break
    }
    case 'sailor': {
      const flap: Pt[] = [
        { x: b.cx - b.shoulderW * 0.62, y: b.shoulderY + 6 },
        { x: b.cx - b.neckW * 1.3, y: b.neckY + 2 },
        { x: b.cx + b.neckW * 1.3, y: b.neckY + 2 },
        { x: b.cx + b.shoulderW * 0.62, y: b.shoulderY + 6 },
        { x: b.cx + b.shoulderW * 0.4, y: b.shoulderY + 40 },
        { x: b.cx - b.shoulderW * 0.4, y: b.shoulderY + 40 },
      ]
      p.hatch(flap, { color: alt, alpha: 0.12, spacing: 2.4, angle: 1.1, layers: 2, lane: 2000 })
      for (let i = 0; i < 2; i++) {
        p.contour(
          flap.map((q) => ({ x: b.cx + (q.x - b.cx) * (0.92 - i * 0.06), y: q.y + i * 3 + 2 })),
          { color: tint(alt, 1.8), alpha: 0.16, width: 1.4, passes: 1, lane: 2004 + i },
        )
      }
      p.contour(flap, { color: ink, alpha: 0.13, width: 1.2, passes: 1, lane: 2008 })
      break
    }
    case 'ruffle': {
      const scallops = 7
      for (let i = 0; i < scallops; i++) {
        const t = i / (scallops - 1)
        const x = b.cx + (t - 0.5) * b.neckW * 4.2
        const y = b.neckY + 8 + Math.sin(t * Math.PI) * 10
        const r = 7 + Math.sin(t * Math.PI) * 3
        const petal = arc(x, y, r, r * 0.85, 0, Math.PI * 2, 14)
        p.hatch(petal, { color: alt, alpha: 0.1, spacing: 2.2, angle: 0.5 + i, layers: 1, lane: 2010 + i })
        p.contour(petal, { color: ink, alpha: 0.12, width: 1.1, passes: 1, lane: 2014 + i })
      }
      break
    }
    default:
      break
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

  if (g.garment.pocket) {
    const side = p.rng.sign()
    const x = b.cx + side * b.shoulderW * 0.52
    const y = b.shoulderY + 62
    const w = 14
    const h = 16
    const pocket: Pt[] = [
      { x: x - w, y }, { x: x + w, y: y - 1 },
      { x: x + w * 0.86, y: y + h }, { x: x - w * 0.86, y: y + h },
    ]
    p.contour(pocket, { color: adjust(pal.ink, 6), alpha: 0.13, width: 1.2, passes: 1, lane: 2110 })
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
  for (const [i, st] of c.stains.entries()) {
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
  for (let i = 0; i < Math.min(4, c.patches); i++) {
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

  p.base(torso, tint(pal.garment, 2.1), 0.97)

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
    alpha: 0.085,
    spacing: 2.6,
    angle: drape - 0.1,
    layers: 2,
    layerTurn: 30,
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
      alpha: 0.19,
      width: 1.5,
      passes: 2,
      wobble: 0.7,
      closed: false,
      taper: 0.25,
      lane: 2420 + i * 40,
    })
  }
}
