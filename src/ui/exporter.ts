/**
 * PNG export.
 *
 * Exports re-render from the genome at the requested scale rather than
 * upscaling the thumbnails — the whole point of a procedural system is that
 * there is no fixed-resolution original.
 */

import { ART, type Genome } from '../core/genome'
import { drawCharacter } from '../render/character'
import { makePaper } from '../render/pencil'
import type { Hsl } from '../core/color'
import { STYLES, type StyleProfile } from '../core/style'

function save(canvas: HTMLCanvasElement, filename: string): void {
  canvas.toBlob((blob) => {
    if (!blob) return
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 4000)
  }, 'image/png')
}

export interface SheetExportOptions {
  characters: Genome[]
  cols: number
  seed: string
  paperTone: Hsl
  /** 1 gives 240x300 per character; 2 doubles it. */
  scale?: number
  detail?: number
  style?: StyleProfile
  onProgress?: (done: number, total: number) => void
}

/**
 * Render the whole sheet into one canvas. Yields between rows so a large
 * export does not lock the tab.
 */
export async function exportSheet(o: SheetExportOptions): Promise<void> {
  const scale = o.scale ?? 1
  const cellW = Math.round(ART.w * scale)
  const cellH = Math.round(ART.h * scale)
  const rows = Math.ceil(o.characters.length / o.cols)
  const pad = Math.round(18 * scale)

  const canvas = document.createElement('canvas')
  canvas.width = o.cols * cellW + pad * 2
  canvas.height = rows * cellH + pad * 2
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not create the export canvas')

  ctx.drawImage(makePaper(canvas.width, canvas.height, o.paperTone, o.seed), 0, 0)

  for (let i = 0; i < o.characters.length; i++) {
    const g = o.characters[i]!
    const col = i % o.cols
    const row = Math.floor(i / o.cols)
    ctx.save()
    ctx.translate(pad + col * cellW, pad + row * cellH)
    ctx.scale(scale, scale)
    drawCharacter(ctx, g, { detail: o.detail ?? 0.85, caption: true, paperTone: o.paperTone, style: o.style })
    ctx.restore()

    if (col === o.cols - 1) {
      o.onProgress?.(i + 1, o.characters.length)
      // Let the browser breathe between rows.
      await new Promise((r) => setTimeout(r, 0))
    }
  }

  save(canvas, `pencilfolk-${o.seed}.png`)
}

/** One character at print size, on its own sheet of paper. */
export function exportCharacter(
  g: Genome, paperTone: Hsl, width = 900, style: StyleProfile = STYLES.adult,
): void {
  const scale = width / ART.w
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(ART.w * scale)
  canvas.height = Math.round(ART.h * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.drawImage(makePaper(canvas.width, canvas.height, paperTone, `${g.seed}-${g.index}`), 0, 0)
  ctx.save()
  ctx.scale(scale, scale)
  drawCharacter(ctx, g, { detail: 1.25, caption: true, paperTone: paperTone, style })
  ctx.restore()
  save(canvas, `pencilfolk-${g.word.toLowerCase()}-${g.dna.fingerprint.slice(0, 8)}.png`)
}
