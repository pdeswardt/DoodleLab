/**
 * Everything worn, carried or accompanying.
 *
 * Split into three passes by depth: `behind` (the hood), `front` (headwear,
 * eyewear, jewellery) and `quirk` (the signature props). Quirk props are drawn
 * last and scale with their intensity — the same pencil behind the ear can be a
 * detail you notice second or the first thing you see.
 */

import { adjust, shade, tint, hsl, clamp } from '../../core/color'
import type { Genome, GlassesStyle, HatStyle } from '../../core/genome'
import type { Scene } from '../character'
import { ellipsoidShade } from '../character'
import type { Pencil } from '../pencil'
import { type Pt, arc, quad, blob, withClip } from '../shapes'
import { drawHood } from './garment'

/* ------------------------------------------------------------------- hats */

function drawHat(s: Scene): void {
  const { p, g } = s
  const style: HatStyle = g.extras.hat
  if (style === 'none') return
  const b = g.build
  const col = g.extras.hatColor
  const ink = adjust(g.palette.ink, 4, -4)
  const tilt = g.extras.hatTilt
  // Hats ride on the hair rather than on the skull — but only so far. Tall
  // hair used to push the hat clear of the head, leaving it floating.
  const lift = Math.min(b.headRy * 0.3, b.headRy * (0.06 + g.hair.crown * 0.42))
  const topY = b.cy - b.headRy - lift
  const shading = ellipsoidShade(b.cx, topY + 14, b.headRx * 1.1, b.headRy * 0.7, s.lx, s.ly, 1.2)

  const body = (region: Pt[], alpha = 0.12, smooth = true): void => {
    // Headwear is opaque cloth. Without a base the hair reads straight through
    // it and the hat looks like a ghost.
    p.base(region, tint(col, 1.7), 0.96, smooth)
    p.hatch(region, {
      color: col, alpha, spacing: 2.4, angle: 0.7 + tilt, layers: 2, layerTurn: 26,
      lane: 3000, pressure: (x, y) => 0.45 + shading(x, y) * 0.8,
    })
    p.contour(region, { color: ink, alpha: 0.14, width: 1.35, passes: 2, wobble: 0.7, lane: 3004 })
  }

  switch (style) {
    case 'beanie': {
      const region = blob(b.cx, topY + b.headRy * 0.3, b.headRx * 1.06, b.headRy * 0.56, p.noise, {
        n: 2.3, wobble: 0.06, lumps: 2.6, lane: 130, steps: 34,
      })
      body(region)
      // Turn-up.
      const cuff: Pt[] = [
        { x: b.cx - b.headRx * 1.06, y: topY + b.headRy * 0.62 },
        { x: b.cx + b.headRx * 1.06, y: topY + b.headRy * 0.62 },
        { x: b.cx + b.headRx * 1.02, y: topY + b.headRy * 0.9 },
        { x: b.cx - b.headRx * 1.02, y: topY + b.headRy * 0.9 },
      ]
      p.base(cuff, tint(col, 1.9), 0.96)
      p.hatch(cuff, { color: tint(col, 0.8), alpha: 0.14, spacing: 2, angle: 1.5, layers: 2, lane: 3008 })
      p.contour(cuff, { color: ink, alpha: 0.14, width: 1.3, passes: 1, lane: 3010 })
      // A bobble, sometimes.
      if (p.rng.bool(0.35)) {
        const bob = arc(b.cx + tilt * 20, topY - 4, 7, 6.4, 0, Math.PI * 2, 16)
        p.hatch(bob, { color: g.palette.accent, alpha: 0.14, spacing: 2, angle: 0.4, layers: 2, lane: 3012 })
        p.contour(bob, { color: ink, alpha: 0.13, width: 1.2, passes: 1, wobble: 1.8, lane: 3014 })
      }
      break
    }
    case 'beret': {
      const region = blob(b.cx + tilt * 14, topY + b.headRy * 0.28, b.headRx * 1.16, b.headRy * 0.42, p.noise, {
        n: 2.6, wobble: 0.08, lumps: 2.4, lane: 131, steps: 34,
        shape: (a) => 1 + 0.14 * Math.cos(a - tilt),
      })
      body(region)
      p.stroke(arc(b.cx + tilt * 26, topY + 2, 3, 3, 0, Math.PI * 2, 8), {
        color: ink, alpha: 0.22, width: 2, passes: 2, lane: 3016,
      })
      break
    }
    case 'cap': {
      const crown = blob(b.cx, topY + b.headRy * 0.34, b.headRx * 1.02, b.headRy * 0.44, p.noise, {
        n: 2.4, wobble: 0.05, lumps: 2, lane: 132, steps: 30,
      })
      body(crown)
      const dir = tilt >= 0 ? 1 : -1
      // A peak curves and tapers; a rectangle reads as a plank.
      const brim: Pt[] = [
        ...quad(
          { x: b.cx + dir * b.headRx * 0.15, y: topY + b.headRy * 0.64 },
          { x: b.cx + dir * b.headRx * 0.95, y: topY + b.headRy * 0.6 },
          { x: b.cx + dir * b.headRx * 1.42, y: topY + b.headRy * 0.78 }, 10,
        ),
        ...quad(
          { x: b.cx + dir * b.headRx * 1.42, y: topY + b.headRy * 0.78 },
          { x: b.cx + dir * b.headRx * 0.9, y: topY + b.headRy * 0.94 },
          { x: b.cx + dir * b.headRx * 0.15, y: topY + b.headRy * 0.88 }, 10,
        ).slice(1),
      ]
      p.base(brim, tint(col, 1.7), 0.96)
      p.hatch(brim, { color: shade(col, 0.7), alpha: 0.15, spacing: 2, angle: 0.2, layers: 2, lane: 3018 })
      p.contour(brim, { color: ink, alpha: 0.15, width: 1.3, passes: 1, lane: 3020 })
      break
    }
    case 'sunhat': {
      const brim = blob(b.cx, topY + b.headRy * 0.72, b.headRx * 1.85, b.headRy * 0.5, p.noise, {
        n: 2.1, wobble: 0.07, lumps: 3, lane: 133, steps: 40,
      })
      p.base(brim, tint(col, 1.7), 0.96)
      p.hatch(brim, {
        color: col, alpha: 0.1, spacing: 2.6, angle: 0.3, layers: 2, layerTurn: 40, lane: 3022,
        pressure: (_x, y) => clamp(0.3 + Math.abs(y - (topY + b.headRy * 0.72)) / (b.headRy * 0.5), 0, 1),
      })
      p.contour(brim, { color: ink, alpha: 0.13, width: 1.35, passes: 2, wobble: 1, lane: 3024 })
      const crown = blob(b.cx, topY + b.headRy * 0.34, b.headRx * 0.92, b.headRy * 0.42, p.noise, {
        n: 2.4, wobble: 0.06, lumps: 2, lane: 134, steps: 28,
      })
      body(crown, 0.11)
      // Hatband in the accent colour.
      p.stroke(arc(b.cx, topY + b.headRy * 0.6, b.headRx * 0.94, b.headRy * 0.14, Math.PI + 0.15, Math.PI * 2 - 0.15, 14), {
        color: g.palette.accent, alpha: 0.2, width: 5, passes: 1, wobble: 0.5, lane: 3026,
      })
      break
    }
    case 'band': {
      const band = arc(b.cx, b.cy - b.headRy * 0.62, b.headRx * 1.02, b.headRy * 0.5, Math.PI + 0.2, Math.PI * 2 - 0.2, 16)
      p.stroke(band, { color: col, alpha: 0.24, width: 7, passes: 2, wobble: 0.6, lane: 3028 })
      p.stroke(band, { color: shade(col, 1.4), alpha: 0.12, width: 1.2, passes: 1, wobble: 0.8, lane: 3030 })
      break
    }
    case 'kerchief': {
      const region = blob(b.cx, topY + b.headRy * 0.38, b.headRx * 1.04, b.headRy * 0.5, p.noise, {
        n: 2.2, wobble: 0.08, lumps: 2.6, lane: 135, steps: 30,
      })
      body(region)
      // The knot, off to one side.
      const dir = tilt >= 0 ? 1 : -1
      const knot = arc(b.cx + dir * b.headRx * 0.95, topY + b.headRy * 0.6, 6, 5, 0, Math.PI * 2, 12)
      p.hatch(knot, { color: col, alpha: 0.14, spacing: 2, angle: 0.9, layers: 1, lane: 3032 })
      p.contour(knot, { color: ink, alpha: 0.13, width: 1.2, passes: 1, wobble: 1.4, lane: 3034 })
      p.fleck(region, tint(col, 1.6), 30, 0.7)
      break
    }
    case 'crown': {
      // A band that follows the curve of the skull, with points rising from
      // it. The previous version closed straight across the bottom, which drew
      // a flat sawtooth strip lying on the head like a paper streamer.
      const halfW = b.headRx * 0.9
      const rimY = b.cy - b.headRy * 0.52
      const rimH = b.headRy * 0.17
      const peakH = b.headRy * 0.42
      const spikes = 5
      // The band dips at the temples, because it is wrapping a round head.
      const curveAt = (x: number): number =>
        rimY + ((x - b.cx) / b.headRx) ** 2 * b.headRy * 0.22

      const pts: Pt[] = [
        { x: b.cx - halfW, y: curveAt(b.cx - halfW) + rimH },
        { x: b.cx - halfW, y: curveAt(b.cx - halfW) },
      ]
      for (let i = 0; i < spikes; i++) {
        const t = (i + 0.5) / spikes
        const px = b.cx - halfW + t * halfW * 2
        const tall = peakH * (0.66 + 0.44 * Math.sin(t * Math.PI))
        pts.push({ x: px, y: curveAt(px) - tall })
        if (i < spikes - 1) {
          const vx = b.cx - halfW + ((i + 1) / spikes) * halfW * 2
          pts.push({ x: vx, y: curveAt(vx) })
        }
      }
      pts.push({ x: b.cx + halfW, y: curveAt(b.cx + halfW) })
      pts.push({ x: b.cx + halfW, y: curveAt(b.cx + halfW) + rimH })

      // Straight segments: the points are the whole shape, and smoothing
      // rounds them into scallops.
      body(pts, 0.13, false)

      // Jewels along the band.
      for (let i = 0; i < 3; i++) {
        const jx = b.cx + (i - 1) * halfW * 0.55
        p.stroke(arc(jx, curveAt(jx) + rimH * 0.5, 2.6, 2.6, 0, Math.PI * 2, 9), {
          color: g.palette.accent, alpha: 0.32, width: 2, passes: 2, lane: 3036 + i,
        })
      }
      break
    }
    case 'boat': {
      // Folded paper: a hull that sits down over the crown, with a peak and a
      // crease. Three points smoothed into a curve just read as a dart.
      const halfW = b.headRx * 1.18
      const sit = topY + b.headRy * 0.42
      const peak = topY - b.headRy * 0.18
      const pts: Pt[] = [
        { x: b.cx - halfW, y: sit },
        { x: b.cx - halfW * 0.42, y: peak + b.headRy * 0.06 },
        { x: b.cx, y: peak },
        { x: b.cx + halfW * 0.42, y: peak + b.headRy * 0.06 },
        { x: b.cx + halfW, y: sit },
        { x: b.cx + halfW * 0.62, y: sit + b.headRy * 0.12 },
        { x: b.cx - halfW * 0.62, y: sit + b.headRy * 0.12 },
      ]
      body(pts, 0.11, false)
      // The fold.
      p.stroke([{ x: b.cx, y: peak + 2 }, { x: b.cx + tilt * 6, y: sit + b.headRy * 0.1 }], {
        color: ink, alpha: 0.16, width: 1.2, passes: 1, wobble: 0.6, lane: 3038,
      })
      p.stroke([{ x: b.cx - halfW * 0.9, y: sit + 1 }, { x: b.cx + halfW * 0.9, y: sit + 1 }], {
        color: ink, alpha: 0.13, width: 1.2, passes: 1, wobble: 0.8, taper: 0.6, lane: 3039,
      })
      break
    }
    default:
      break
  }
}

/* ---------------------------------------------------------------- eyewear */

function lensRegion(style: GlassesStyle, cx: number, cy: number, r: number): Pt[] {
  switch (style) {
    case 'square':
      return [
        { x: cx - r * 1.15, y: cy - r * 0.85 }, { x: cx + r * 1.15, y: cy - r * 0.9 },
        { x: cx + r * 1.1, y: cy + r * 0.9 }, { x: cx - r * 1.1, y: cy + r * 0.85 },
      ]
    case 'halfmoon':
      return [
        { x: cx - r * 1.2, y: cy },
        ...arc(cx, cy, r * 1.2, r * 0.8, 0.1, Math.PI - 0.1, 12),
      ]
    case 'cateye':
      return [
        ...arc(cx, cy, r * 1.15, r * 0.9, 0.1, Math.PI * 1.75, 16),
        { x: cx + r * 1.5, y: cy - r * 1.15 },
      ]
    case 'goggles':
      return arc(cx, cy, r * 1.35, r * 1.1, 0, Math.PI * 2, 22)
    default:
      return arc(cx, cy, r * 1.2, r * 1.15, 0, Math.PI * 2, 22)
  }
}

function drawGlasses(s: Scene): void {
  const { p, g } = s
  const style = g.extras.glasses
  if (style === 'none') return
  const f = g.face
  const b = g.build
  const ink = adjust(g.palette.ink, -8, 8)
  const r = f.eyeR

  const sides: (-1 | 1)[] = style === 'monocle' ? [g.face.gazeX >= 0 ? 1 : -1] : [-1, 1]
  for (const side of sides) {
    const cx = b.cx + side * f.eyeSpacing
    const cy = f.eyeY + (side > 0 ? f.asym.eyeDY : 0)
    const region = lensRegion(style === 'monocle' ? 'round' : style, cx, cy, r)
    // A lens is glass: a couple of faint strokes, never a fill.
    p.hatch(region, {
      color: hsl(200, 18, 76), alpha: 0.035, spacing: 3.4, angle: -0.7, layers: 1, gaps: 0.4, lane: 3100,
    })
    p.contour(region, {
      color: ink, alpha: 0.26, width: style === 'goggles' ? 2.6 : 1.8, passes: 2, wobble: 0.4, lane: 3104 + side,
    })
    // Highlight streak — a gap left in the tone plus one bright stroke.
    p.stroke([{ x: cx - r * 0.7, y: cy + r * 0.35 }, { x: cx - r * 0.1, y: cy - r * 0.55 }], {
      color: hsl(200, 20, 92), alpha: 0.2, width: 1.6, passes: 1, taper: 0.8, lane: 3108 + side,
    })
  }

  if (style === 'monocle') {
    const side = sides[0]!
    const cx = b.cx + side * f.eyeSpacing
    p.stroke(
      quad({ x: cx + side * r * 1.2, y: f.eyeY + r * 0.6 },
        { x: cx + side * r * 2.4, y: f.eyeY + r * 3 },
        { x: b.cx + side * b.neckW * 1.2, y: b.neckY + 12 }, 14),
      { color: ink, alpha: 0.16, width: 1.1, passes: 1, wobble: 1, lane: 3112 },
    )
  } else {
    // Bridge.
    p.stroke(
      [{ x: b.cx - f.eyeSpacing + r * 1.1, y: f.eyeY - r * 0.2 },
        { x: b.cx + f.eyeSpacing - r * 1.1, y: f.eyeY - r * 0.2 }],
      { color: ink, alpha: 0.22, width: style === 'goggles' ? 3 : 1.6, passes: 1, wobble: 0.4, lane: 3116 },
    )
    // Arms, disappearing behind the head.
    for (const side of [-1, 1] as const) {
      p.stroke(
        [{ x: b.cx + side * (f.eyeSpacing + r * 1.2), y: f.eyeY - r * 0.3 },
          { x: b.cx + side * b.headRx * 1.02, y: f.eyeY - r * 0.1 }],
        { color: ink, alpha: 0.18, width: 1.4, passes: 1, taper: 0.5, lane: 3120 + side },
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

const QUIRK_DRAWERS: Record<string, QuirkDrawer> = {
  pencil: (s, k) => pencilAt(s.p, s.g, s.p.rng.sign() as -1 | 1, k, 3300),
  'two-pencils': (s, k) => {
    pencilAt(s.p, s.g, -1, k, 3300)
    pencilAt(s.p, s.g, 1, k, 3320)
  },

  flower: (s, k) => {
    const { p, g } = s
    const b = g.build
    const side = p.rng.sign()
    const x = b.cx + side * b.headRx * 0.94
    const y = g.face.eyeY - b.headRy * 0.12
    const r = 3.4 + k * 3
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2
      const petal = arc(x + Math.cos(a) * r, y + Math.sin(a) * r, r * 0.62, r * 0.5, 0, Math.PI * 2, 10)
      p.hatch(petal, { color: g.palette.accent, alpha: 0.13, spacing: 1.8, angle: a, layers: 1, lane: 3340 + i })
      p.contour(petal, { color: shade(g.palette.accent, 1.4), alpha: 0.12, width: 1, passes: 1, lane: 3346 + i })
    }
    p.stroke(arc(x, y, r * 0.5, r * 0.5, 0, Math.PI * 2, 8), {
      color: hsl(48, 70, 56), alpha: 0.3, width: 2, passes: 2, lane: 3352,
    })
  },

  leaf: (s, k) => {
    const { p, g } = s
    const b = g.build
    const side = p.rng.sign()
    const x = b.cx + side * b.headRx * 0.55
    const y = b.cy - b.headRy * (0.85 + g.hair.crown * 0.3)
    const len = 8 + k * 8
    const a = -0.6 * side
    const leaf: Pt[] = [
      { x, y },
      { x: x + Math.cos(a - 0.5) * len * 0.6, y: y + Math.sin(a - 0.5) * len * 0.6 },
      { x: x + Math.cos(a) * len, y: y + Math.sin(a) * len },
      { x: x + Math.cos(a + 0.5) * len * 0.6, y: y + Math.sin(a + 0.5) * len * 0.6 },
    ]
    p.hatch(leaf, { color: hsl(105, 40, 48), alpha: 0.15, spacing: 1.8, angle: a, layers: 2, lane: 3360 })
    p.contour(leaf, { color: hsl(105, 40, 30), alpha: 0.16, width: 1.1, passes: 1, lane: 3364 })
  },

  sprout: (s, k) => {
    const { p, g } = s
    const b = g.build
    const x = b.cx + p.rng.gauss(0, 5)
    const y = b.cy - b.headRy * (1 + g.hair.crown * 0.5)
    const h = 8 + k * 16
    p.stroke(quad({ x, y }, { x: x + 2, y: y - h * 0.6 }, { x: x - 1, y: y - h }, 10), {
      color: hsl(110, 42, 42), alpha: 0.26, width: 1.6, passes: 2, wobble: 0.4, lane: 3370,
    })
    for (const side of [-1, 1] as const) {
      const lx = x - 1 + side * 1
      const ly = y - h + 2
      const leaf = [
        { x: lx, y: ly },
        { x: lx + side * 6, y: ly - 4 },
        { x: lx + side * 9, y: ly + 1 },
        { x: lx + side * 4, y: ly + 3 },
      ]
      p.hatch(leaf, { color: hsl(112, 44, 50), alpha: 0.16, spacing: 1.6, angle: 0.4, layers: 1, lane: 3374 + side })
      p.contour(leaf, { color: hsl(112, 44, 32), alpha: 0.15, width: 1, passes: 1, lane: 3378 + side })
    }
  },

  snail: (s, k) => {
    const { p, g } = s
    const b = g.build
    const side = p.rng.sign()
    const x = b.cx + side * b.shoulderW * 0.72
    const y = b.shoulderY + 16
    const r = 5 + k * 4
    // Shell: a spiral, drawn as one continuous mark.
    const spiral: Pt[] = []
    for (let i = 0; i <= 42; i++) {
      const t = i / 42
      const a = t * Math.PI * 4.2
      const rr = r * (1 - t * 0.82)
      spiral.push({ x: x + Math.cos(a) * rr, y: y - r * 0.2 + Math.sin(a) * rr })
    }
    p.stroke(spiral, { color: hsl(32, 44, 44), alpha: 0.24, width: 1.4, passes: 2, wobble: 0.3, lane: 3390 })
    const bodyPts = [
      { x: x - r * 1.5, y: y + r * 0.7 }, { x: x + r * 0.9, y: y + r * 0.6 },
      { x: x + r * 0.6, y: y + r }, { x: x - r * 1.7, y: y + r * 1.05 },
    ]
    p.hatch(bodyPts, { color: hsl(38, 26, 66), alpha: 0.14, spacing: 1.6, angle: 0.2, layers: 1, lane: 3394 })
    p.contour(bodyPts, { color: hsl(30, 24, 40), alpha: 0.16, width: 1.1, passes: 1, lane: 3396 })
    for (const dx of [-0.4, -0.9]) {
      p.stroke([{ x: x - r * 1.5, y: y + r * 0.7 }, { x: x - r * (1.5 - dx), y: y - r * 0.4 }], {
        color: hsl(30, 24, 40), alpha: 0.2, width: 1, passes: 1, taper: 0.5, lane: 3398,
      })
    }
  },

  bird: (s, k) => {
    const { p, g } = s
    const b = g.build
    const side = p.rng.sign()
    const x = b.cx + side * b.shoulderW * 0.74
    const y = b.shoulderY + 6
    const r = 5 + k * 4
    const bodyPts = blob(x, y - r, r * 1.1, r * 1.25, p.noise, { wobble: 0.1, lumps: 2, lane: 141, steps: 18 })
    p.hatch(bodyPts, { color: g.palette.accent, alpha: 0.15, spacing: 1.7, angle: 0.9, layers: 2, lane: 3400 })
    p.contour(bodyPts, { color: shade(g.palette.accent, 1.6), alpha: 0.16, width: 1.1, passes: 1, lane: 3404 })
    const head = arc(x - side * r * 0.5, y - r * 2.1, r * 0.62, r * 0.62, 0, Math.PI * 2, 12)
    p.hatch(head, { color: g.palette.accent, alpha: 0.15, spacing: 1.5, angle: 0.5, layers: 1, lane: 3406 })
    p.contour(head, { color: shade(g.palette.accent, 1.6), alpha: 0.15, width: 1, passes: 1, lane: 3408 })
    p.stroke([{ x: x - side * r * 1.1, y: y - r * 2.1 }, { x: x - side * r * 1.7, y: y - r * 1.95 }], {
      color: hsl(38, 68, 52), alpha: 0.3, width: 1.6, passes: 1, taper: 0.4, lane: 3410,
    })
  },

  moth: (s, k) => {
    const { p, g } = s
    const b = g.build
    const x = b.cx + p.rng.gauss(0, 1) + p.rng.sign() * b.headRx * 1.25
    const y = b.cy - b.headRy * p.rng.range(0.3, 0.9)
    const r = 4 + k * 3.5
    for (const side of [-1, 1] as const) {
      const wing = blob(x + side * r * 0.8, y, r, r * 0.72, p.noise, {
        wobble: 0.14, lumps: 2, lane: 142 + side, steps: 16,
      })
      p.hatch(wing, { color: hsl(38, 18, 64), alpha: 0.12, spacing: 1.6, angle: 0.4 * side, layers: 1, lane: 3420 + side })
      p.contour(wing, { color: hsl(32, 20, 40), alpha: 0.14, width: 1, passes: 1, lane: 3424 + side })
    }
    p.stroke([{ x, y: y - r * 0.5 }, { x, y: y + r * 0.6 }], {
      color: hsl(30, 22, 34), alpha: 0.24, width: 1.6, passes: 1, lane: 3428,
    })
  },

  bubble: (s, k) => {
    const { p, g } = s
    const b = g.build
    const x = b.cx + p.rng.sign() * b.headRx * p.rng.range(1.05, 1.5)
    const y = b.cy - b.headRy * p.rng.range(0.2, 0.8)
    const r = 5 + k * 7
    p.stroke(arc(x, y, r, r, 0, Math.PI * 2, 24), {
      color: hsl(195, 34, 68), alpha: 0.2, width: 1.2, passes: 2, wobble: 0.3, gaps: 0.3, lane: 3440,
    })
    p.stroke(arc(x, y, r * 0.62, r * 0.62, Math.PI * 1.1, Math.PI * 1.5, 8), {
      color: hsl(195, 30, 88), alpha: 0.3, width: 1.6, passes: 1, taper: 0.8, lane: 3444,
    })
  },

  steam: (s, k) => {
    const { p, g } = s
    const b = g.build
    const side = p.rng.sign()
    const x = b.cx + side * b.shoulderW * 0.85
    const y = b.shoulderY + 46
    const h = 30 + k * 30
    for (let i = 0; i < 3; i++) {
      const pts: Pt[] = []
      for (let j = 0; j <= 10; j++) {
        const t = j / 10
        pts.push({ x: x + Math.sin(t * 5 + i * 1.7) * (4 + t * 6), y: y - t * h })
      }
      p.stroke(pts, {
        color: hsl(200, 12, 74), alpha: 0.11, width: 2.4, passes: 1,
        wobble: 1, gaps: 0.34, taper: 0.9, lane: 3460 + i,
      })
    }
  },

  star: (s, k) => {
    const { p, g } = s
    const b = g.build
    const count = 1 + Math.round(k * 2)
    for (let i = 0; i < count; i++) {
      const a = -Math.PI * p.rng.range(0.2, 0.9)
      const d = b.headRx * p.rng.range(1.15, 1.5)
      const x = b.cx + Math.cos(a) * d
      const y = b.cy + Math.sin(a) * d
      const r = 3.5 + k * 3
      for (let arm = 0; arm < 4; arm++) {
        const aa = (arm / 4) * Math.PI * 2
        p.stroke(
          [{ x: x - Math.cos(aa) * r, y: y - Math.sin(aa) * r },
            { x: x + Math.cos(aa) * r, y: y + Math.sin(aa) * r }],
          { color: g.palette.accent, alpha: 0.26, width: 1.4, passes: 1, taper: 0.9, lane: 3480 + i * 4 + arm },
        )
      }
    }
  },

  halo: (s, k) => {
    const { p, g } = s
    const b = g.build
    const y = b.cy - b.headRy * (1.2 + g.hair.crown * 0.5)
    const ring = arc(b.cx + k * 6, y, b.headRx * 0.62, b.headRx * 0.2, 0, Math.PI * 2, 26)
    p.stroke(ring, {
      color: hsl(48, 68, 58), alpha: 0.24, width: 2.2, passes: 2, wobble: 0.4, gaps: 0.2, lane: 3500,
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
    // Band over the crown.
    const band = arc(b.cx, b.cy - b.headRy * (0.5 + g.hair.crown * 0.4), b.headRx * 1.05, b.headRy * 0.95, Math.PI + 0.3, Math.PI * 2 - 0.3, 18)
    p.stroke(band, { color: col, alpha: 0.24, width: 5 + k * 2, passes: 2, wobble: 0.4, lane: 3540 })
    p.stroke(band, { color: shade(col, 1.5), alpha: 0.14, width: 1.2, passes: 1, lane: 3542 })
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
    const y = b.cy - b.headRy * 0.52
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
