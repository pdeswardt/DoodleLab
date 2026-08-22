/**
 * The one-word caption.
 *
 * Canvas has no way to stroke along a glyph outline, so the word is built the
 * other way round: an offscreen buffer is hatched with pencil marks, then the
 * text is used as a mask (`destination-in`) to cut the word out of that
 * hatching. The result is lettering made of the same pigment as the drawing
 * rather than flat vector type sitting on top of it.
 */

import { adjust, shade } from '../core/color'
import { ART, type Genome } from '../core/genome'
import { Pencil } from './pencil'
import type { Pt } from './shapes'

const FONT_STACK =
  '"Caveat", "Segoe Script", "Bradley Hand", "Brush Script MT", "Comic Sans MS", cursive'

/**
 * How this character's hand writes.
 *
 * Every caption on a sheet was set at 26px with the same tracking, the same
 * baseline wobble and the same rule underneath it — 256 words in one hand, on
 * a page whose whole argument is that nothing repeats. These are drawn from
 * the character's own seed, so a caption belongs to its portrait.
 */
interface CaptionHand {
  size: number
  /** Multiplier on the natural advance width. Below 1 crowds, above 1 spaces out. */
  tracking: number
  /** How far each letter strays off the baseline, as a fraction of size. */
  drift: number
  /** Per-letter rotation, in radians. */
  waver: number
  /** A consistent lean across the whole word — the strongest handwriting cue. */
  slant: number
  /** Where the word sits across the cell, as a fraction of its width. */
  offset: number
  /** Baseline climb or fall across the word, as a fraction of size. */
  rake: number
  /** Direction of the pigment hatching behind the glyphs. */
  hatchAngle: number
  /** 0 = no rule under the word. */
  rule: number
  ruleWobble: number
  ruleDrop: number
}

function captionHand(p: Pencil): CaptionHand {
  const rng = p.rng.fork('caption-hand')
  // A rule under the word is a flourish, and a flourish is not universal.
  const rule = rng.bool(0.62) ? rng.range(0.75, 1.15) : 0
  return {
    size: rng.range(19, 28),
    tracking: rng.range(0.9, 1.12),
    drift: rng.range(0.02, 0.085),
    waver: rng.range(0.012, 0.07),
    slant: rng.gauss(0, 0.075),
    offset: rng.gauss(0, 0.035),
    rake: rng.gauss(0, 0.055),
    hatchAngle: rng.range(-1.1, 0.2),
    rule,
    ruleWobble: rng.range(0.3, 1.4),
    ruleDrop: rng.range(0.34, 0.52),
  }
}

export function drawCaption(
  ctx: CanvasRenderingContext2D, g: Genome, p: Pencil,
): void {
  const word = g.word
  if (!word) return

  const hand = captionHand(p)
  const boxH = 40
  const boxY = ART.captionY - 26
  const scale = 2 // supersample, so the mask edge stays crisp when scaled back
  const off = document.createElement('canvas')
  off.width = Math.round(ART.w * scale)
  off.height = Math.round(boxH * scale)
  const octx = off.getContext('2d')!
  octx.scale(scale, scale)

  // Fit the word to the cell.
  let size = hand.size
  octx.font = `${size}px ${FONT_STACK}`
  const maxW = ART.w * 0.78
  let width = octx.measureText(word).width
  if (width > maxW) {
    size = Math.max(12, size * (maxW / width))
    octx.font = `${size}px ${FONT_STACK}`
    width = octx.measureText(word).width
  }

  // 1. Lay down pigment across the whole strip.
  const ink = adjust(shade(g.palette.ink, 0.4), 0, 6)
  const pen = new Pencil(octx, p.rng.fork('caption'), p.noise, Math.max(0.8, p.detail))
  // Hatch only the box the word actually occupies. Covering the full strip and
  // masking it was costing more than the entire face.
  const halfW = Math.min(maxW, width) * 0.5 + 3
  const midX = ART.w / 2 + hand.offset * halfW
  const top = boxH * 0.5 - size * 0.72
  const strip: Pt[] = [
    { x: midX - halfW, y: top }, { x: midX + halfW, y: top },
    { x: midX + halfW, y: top + size * 1.5 }, { x: midX - halfW, y: top + size * 1.5 },
  ]
  pen.hatch(strip, {
    color: ink,
    alpha: 0.5,
    spacing: 1.7,
    angle: hand.hatchAngle,
    layers: 2,
    layerTurn: 34,
    curve: 1.2,
    gaps: 0.12,
    taper: 0.25,
    width: 1.6,
    lane: 4000,
  })

  // 2. Cut the word out of it.
  // The glyphs are drawn onto their own buffer first and the whole word is
  // then used as a single mask. Compositing each letter straight onto the
  // hatching with `destination-in` is destructive: the first glyph erases
  // everything that is not itself, and the second then intersects with what
  // is left of that — which is nothing, so the caption vanished entirely.
  const mask = document.createElement('canvas')
  mask.width = off.width
  mask.height = off.height
  const mctx = mask.getContext('2d')!
  mctx.scale(scale, scale)
  mctx.font = `${size}px ${FONT_STACK}`
  mctx.textAlign = 'center'
  mctx.textBaseline = 'middle'
  mctx.fillStyle = '#000'

  // Letter by letter, each nudged off the baseline and rotated a little.
  //
  // The handwriting face is a webfont, and when it fails to load the caption
  // falls back to a system serif — which renders perfectly level and evenly
  // spaced, and is then the most mechanical object on a page of hand-drawn
  // marks. Placing the glyphs individually means the line reads as written by
  // hand whichever face actually resolves.
  const jitter = p.rng.fork('caption-letters')
  const widths = [...word].map((ch) => mctx.measureText(ch).width)
  const total = widths.reduce((a, b) => a + b, 0)
  const spread = total * hand.tracking
  let x = midX - spread / 2
  const n = Math.max(1, word.length - 1)
  for (const [i, ch] of [...word].entries()) {
    const cw = widths[i]!
    // The rake tips the whole line, the drift is the hand shaking on each
    // letter. Both together are what a written line does; either alone reads
    // as a font effect.
    const t = i / n - 0.5
    mctx.save()
    mctx.translate(
      x + cw / 2,
      boxH / 2 + 1 + t * size * hand.rake + jitter.gauss(0, size * hand.drift),
    )
    mctx.rotate(hand.slant + jitter.gauss(0, hand.waver))
    mctx.fillText(ch, 0, 0)
    mctx.restore()
    x += cw * hand.tracking * jitter.range(0.95, 1.05)
  }

  octx.globalCompositeOperation = 'destination-in'
  octx.setTransform(1, 0, 0, 1, 0, 0)
  octx.drawImage(mask, 0, 0)
  octx.setTransform(scale, 0, 0, scale, 0, 0)

  // 3. Drop the result onto the sheet.
  ctx.save()
  ctx.globalCompositeOperation = 'multiply'
  ctx.globalAlpha = 0.92
  ctx.drawImage(off, 0, boxY, ART.w, boxH)
  ctx.restore()

  // 4. A short rule under the word, drawn by hand rather than masked — on the
  // captions whose hand underlines at all.
  if (hand.rule <= 0) return
  const half = (halfW + 1) * hand.rule
  const y = boxY + boxH * 0.5 + size * hand.ruleDrop
  p.stroke(
    [{ x: midX - half, y }, { x: midX + half, y: y + p.rng.gauss(0, 1.4) }],
    {
      color: adjust(g.palette.accent, -8, 6),
      alpha: 0.16,
      width: 1.3,
      passes: 1,
      wobble: hand.ruleWobble,
      gaps: 0.3,
      taper: 0.9,
      lane: 4100,
    },
  )
}
