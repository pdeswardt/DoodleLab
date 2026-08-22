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

export function drawCaption(
  ctx: CanvasRenderingContext2D, g: Genome, p: Pencil,
): void {
  const word = g.word
  if (!word) return

  const boxH = 40
  const boxY = ART.captionY - 26
  const scale = 2 // supersample, so the mask edge stays crisp when scaled back
  const off = document.createElement('canvas')
  off.width = Math.round(ART.w * scale)
  off.height = Math.round(boxH * scale)
  const octx = off.getContext('2d')!
  octx.scale(scale, scale)

  // Fit the word to the cell.
  let size = 26
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
  const top = boxH * 0.5 - size * 0.72
  const strip: Pt[] = [
    { x: ART.w / 2 - halfW, y: top }, { x: ART.w / 2 + halfW, y: top },
    { x: ART.w / 2 + halfW, y: top + size * 1.5 }, { x: ART.w / 2 - halfW, y: top + size * 1.5 },
  ]
  pen.hatch(strip, {
    color: ink,
    alpha: 0.5,
    spacing: 1.7,
    angle: -0.5,
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
  let x = ART.w / 2 - total / 2
  for (const [i, ch] of [...word].entries()) {
    const cw = widths[i]!
    mctx.save()
    mctx.translate(x + cw / 2, boxH / 2 + 1 + jitter.gauss(0, size * 0.045))
    mctx.rotate(jitter.gauss(0, 0.035))
    mctx.fillText(ch, 0, 0)
    mctx.restore()
    x += cw * jitter.range(0.94, 1.04)
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

  // 4. A short rule under the word, drawn by hand rather than masked.
  const half = halfW + 1
  const y = boxY + boxH * 0.5 + size * 0.42
  p.stroke(
    [{ x: ART.w / 2 - half, y }, { x: ART.w / 2 + half, y: y + p.rng.gauss(0, 1) }],
    {
      color: adjust(g.palette.accent, -8, 6),
      alpha: 0.16,
      width: 1.3,
      passes: 1,
      wobble: 0.6,
      gaps: 0.3,
      taper: 0.9,
      lane: 4100,
    },
  )
}
